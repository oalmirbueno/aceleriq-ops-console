/**
 * consolidate-briefing — generates a structured, consolidated briefing for a client
 * using all available context: client form responses, imported contexts, attachments
 * (extracted text from metadata), client record, metrics snapshots and fronts.
 *
 * Redeploy trigger: 2026-04-30 (function was missing on edge runtime).
 *
 * Flow:
 *  1. Auth: validate JWT and access to workspace.
 *  2. Collect all signals from DB.
 *  3. Build system + user prompt for Lovable AI Gateway.
 *  4. Use tool-calling to force structured JSON output (sections + answers).
 *  5. Persist result inside context_entries.metadata.consolidated_briefing
 *     (or create one if no briefing entry exists yet) so future calls can return cached
 *     versions instantly when force=false.
 *  6. Return the structured payload to the client.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

interface ConsolidatedSection {
  title: string;
  description: string;
  answers: Array<{
    question: string;
    answer: string;
    /** "client" = literal from client; "ai_inferred" = AI filled gap; "to_define" = missing */
    source: "client" | "ai_inferred" | "to_define" | "data";
    confidence: "high" | "medium" | "low";
    citation?: string;
  }>;
}

interface ConsolidatedBriefing {
  client_summary: string;
  generated_at: string;
  ai_model: string;
  sections: ConsolidatedSection[];
  next_actions: string[];
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Autenticação obrigatória" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return jsonResponse({ error: "LOVABLE_API_KEY não configurada" }, 500);
    }

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return jsonResponse({ error: "Token inválido" }, 401);
    }

    const body = await req.json().catch(() => null);
    const workspaceId = body?.workspaceId as string | undefined;
    const clientId = body?.clientId as string | undefined;
    const force = body?.force === true;
    const cacheOnly = body?.cacheOnly === true;

    if (!workspaceId || !clientId) {
      return jsonResponse({ error: "workspaceId e clientId obrigatórios" }, 400);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── 1. Confirm user can access this workspace via RLS-protected query
    const { data: wsCheck, error: wsErr } = await userClient
      .from("workspaces")
      .select("id, name")
      .eq("id", workspaceId)
      .maybeSingle();
    if (wsErr || !wsCheck) {
      return jsonResponse({ error: "Workspace inacessível" }, 403);
    }

    // ── 2. Look for existing consolidated cache (most recent context_entries with metadata.consolidated_briefing)
    const { data: cacheEntry } = await admin
      .from("context_entries")
      .select("id, metadata, updated_at")
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .eq("context_type", "briefing")
      .order("updated_at", { ascending: false })
      .limit(20);

    const cached = (cacheEntry ?? []).find(
      (e) => (e.metadata as Record<string, unknown> | null)?.consolidated_briefing,
    );

    if (cached && (cacheOnly || !force)) {
      const meta = cached.metadata as Record<string, unknown>;
      const consolidated = meta.consolidated_briefing as ConsolidatedBriefing;
      return jsonResponse({
        consolidated,
        cached: true,
        entry_id: cached.id,
      });
    }

    if (cacheOnly) {
      return jsonResponse({ consolidated: null, cached: false });
    }

    // ── 3. Gather all signals
    const [
      contextEntriesRes,
      clientRes,
      metricsRes,
      frontsRes,
      attachmentsRes,
    ] = await Promise.all([
      admin
        .from("context_entries")
        .select("id, context_type, title, content, source_label, source_url, happened_at, is_key_decision, tags, metadata, created_at")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .order("created_at", { ascending: true }),
      admin
        .from("clients")
        .select("id, name, company_name, segment, plan_name, status, logo_url, website, instagram, notes, metadata")
        .eq("id", clientId)
        .maybeSingle(),
      admin
        .from("metric_snapshots")
        .select("metric_name, value, unit, captured_at, notes")
        .eq("workspace_id", workspaceId)
        .order("captured_at", { ascending: false })
        .limit(20),
      admin
        .from("fronts")
        .select("title, status, description, priority")
        .eq("workspace_id", workspaceId)
        .limit(30),
      admin
        .from("canvas_nodes")
        .select("title, node_type, description, data")
        .eq("workspace_id", workspaceId)
        .eq("node_type", "briefing")
        .limit(10),
    ]);

    const contextEntries = contextEntriesRes.data ?? [];
    const client = clientRes.data;
    const metrics = metricsRes.data ?? [];
    const fronts = frontsRes.data ?? [];
    const briefingNodes = attachmentsRes.data ?? [];

    // Pull attachments from briefing canvas nodes (data.attachments)
    const attachments: Array<{ label: string; type?: string; url?: string }> = [];
    for (const n of briefingNodes) {
      const list = (n.data as Record<string, unknown> | null)?.attachments;
      if (Array.isArray(list)) {
        for (const a of list as Array<Record<string, unknown>>) {
          attachments.push({
            label: String(a.label ?? "anexo"),
            type: a.type as string | undefined,
            url: a.url as string | undefined,
          });
        }
      }
    }

    // ── 4. Build prompt with explicit, structured context blocks
    const promptParts: string[] = [];
    promptParts.push(`# CLIENTE\n`);
    promptParts.push(
      `Nome: ${client?.name ?? "—"}\nEmpresa: ${client?.company_name ?? "—"}\nSegmento: ${client?.segment ?? "—"}\nPlano: ${client?.plan_name ?? "—"}\nWebsite: ${client?.website ?? "—"}\nInstagram: ${client?.instagram ?? "—"}\nNotas: ${client?.notes ?? "—"}`,
    );

    // Essential briefing (client-level perennial context) — base de identidade do cliente
    const clientMeta = (client?.metadata as Record<string, unknown> | null) ?? {};
    const essentialBriefing = clientMeta.essential_briefing as Record<string, string> | undefined;
    if (essentialBriefing && Object.keys(essentialBriefing).length > 0) {
      promptParts.push(`\n# BRIEFING ESSENCIAL DO CLIENTE (identidade perene)`);
      if (essentialBriefing.positioning)    promptParts.push(`Posicionamento: ${essentialBriefing.positioning}`);
      if (essentialBriefing.differential)   promptParts.push(`Diferencial real: ${essentialBriefing.differential}`);
      if (essentialBriefing.icp)            promptParts.push(`ICP: ${essentialBriefing.icp}`);
      if (essentialBriefing.main_pains)     promptParts.push(`Dores que resolve: ${essentialBriefing.main_pains}`);
      if (essentialBriefing.goals_12m)      promptParts.push(`Objetivo 12m: ${essentialBriefing.goals_12m}`);
      if (essentialBriefing.success_metric) promptParts.push(`Métrica de sucesso: ${essentialBriefing.success_metric}`);
      if (essentialBriefing.revenue_range)  promptParts.push(`Faturamento: ${essentialBriefing.revenue_range}`);
      if (essentialBriefing.team_size)      promptParts.push(`Time: ${essentialBriefing.team_size}`);
      if (essentialBriefing.maturity_digital) promptParts.push(`Maturidade digital: ${essentialBriefing.maturity_digital}`);
      if (essentialBriefing.ai_readiness)   promptParts.push(`Prontidão IA: ${essentialBriefing.ai_readiness}`);
    }

    promptParts.push(`\n# CONTEXTOS REGISTRADOS (${contextEntries.length})`);
    for (const e of contextEntries) {
      const meta = (e.metadata as Record<string, unknown> | null) ?? {};
      const kind = (meta.briefing_kind as string) ?? e.context_type;
      promptParts.push(
        `\n--- [${kind}] ${e.title}\nFonte: ${e.source_label ?? "—"}\nConteúdo:\n${e.content ?? "—"}`,
      );
    }

    if (metrics.length > 0) {
      promptParts.push(`\n# MÉTRICAS RECENTES`);
      for (const m of metrics) {
        promptParts.push(`- ${m.metric_name}: ${m.value} ${m.unit ?? ""} (${m.captured_at})`);
      }
    }

    if (fronts.length > 0) {
      promptParts.push(`\n# FRENTES DE TRABALHO`);
      for (const f of fronts) {
        promptParts.push(`- [${f.status}] ${f.title}: ${f.description ?? "—"}`);
      }
    }

    if (attachments.length > 0) {
      promptParts.push(`\n# ANEXOS REFERENCIADOS`);
      for (const a of attachments) {
        promptParts.push(`- ${a.label} (${a.type ?? "?"})`);
      }
    }

    const userPrompt = promptParts.join("\n");

    const systemPrompt = `Você é o assistente de briefings da Aceleriq, uma operação que entrega marketing, IA e automação para empresas.

Sua tarefa: consolidar TODAS as informações fornecidas em um briefing profissional, organizado por seções, em português do Brasil.

Regras OBRIGATÓRIAS:
- Reescreva as respostas existentes com tom profissional, claro e direto. NUNCA invente fatos.
- Quando uma resposta vier literal do cliente, mantenha sua intenção mas melhore a redação. Marque source="client".
- Quando você inferir uma resposta a partir do contexto disponível (anexos, métricas, segmento, contexto importado), marque source="ai_inferred" e confidence="medium" ou "low".
- Quando faltar dado, marque source="to_define" e escreva uma sugestão entre colchetes.
- Quando a informação vier diretamente do registro do cliente (nome, plano, segmento), marque source="data".
- Cite a origem (qual contexto, anexo ou métrica) no campo "citation" quando aplicável.

SEÇÕES OBRIGATÓRIAS (nesta ordem):
1. Identificação e contexto da empresa
2. Objetivos e metas
3. Público-alvo
4. Produto/serviço
5. Diferenciais e posicionamento
6. Concorrência e referências
7. Canais e ativos digitais existentes
8. Histórico de marketing/vendas
9. Métricas atuais e baseline
10. Restrições, riscos e bloqueios
11. Próximos passos sugeridos

next_actions: liste 3-7 ações concretas que o operador deve executar imediatamente, na ordem de prioridade.

client_summary: 2-3 frases que resumem quem é o cliente, momento atual e foco do trabalho.`;

    // ── 5. Call Lovable AI Gateway with tool-calling for structured output
    const aiResponse = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_consolidated_briefing",
              description: "Submit the structured consolidated briefing.",
              parameters: {
                type: "object",
                properties: {
                  client_summary: { type: "string" },
                  sections: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        answers: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              question: { type: "string" },
                              answer: { type: "string" },
                              source: {
                                type: "string",
                                enum: ["client", "ai_inferred", "to_define", "data"],
                              },
                              confidence: {
                                type: "string",
                                enum: ["high", "medium", "low"],
                              },
                              citation: { type: "string" },
                            },
                            required: ["question", "answer", "source", "confidence"],
                          },
                        },
                      },
                      required: ["title", "description", "answers"],
                    },
                  },
                  next_actions: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["client_summary", "sections", "next_actions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_consolidated_briefing" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return jsonResponse({ error: "Limite de requisições atingido. Tente novamente em alguns segundos." }, 429);
      }
      if (aiResponse.status === 402) {
        return jsonResponse({ error: "Créditos de IA esgotados. Adicione créditos em Settings > Workspace > Usage." }, 402);
      }
      const errText = await aiResponse.text();
      console.error("[consolidate-briefing] AI gateway error:", aiResponse.status, errText);
      return jsonResponse({ error: "Falha na geração com IA" }, 502);
    }

    const aiJson = await aiResponse.json();
    const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      console.error("[consolidate-briefing] sem tool_call:", JSON.stringify(aiJson).slice(0, 500));
      return jsonResponse({ error: "IA retornou resposta sem estrutura esperada" }, 502);
    }

    let parsed: Omit<ConsolidatedBriefing, "generated_at" | "ai_model">;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      console.error("[consolidate-briefing] erro parse args:", e);
      return jsonResponse({ error: "JSON inválido da IA" }, 502);
    }

    const consolidated: ConsolidatedBriefing = {
      ...parsed,
      generated_at: new Date().toISOString(),
      ai_model: AI_MODEL,
    };

    // ── 6. Persist as a context_entry (or update existing consolidated entry)
    const { data: existing } = await admin
      .from("context_entries")
      .select("id, metadata")
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .eq("context_type", "briefing")
      .contains("metadata", { briefing_kind: "consolidated" } as Record<string, unknown>)
      .maybeSingle();

    if (existing) {
      await admin
        .from("context_entries")
        .update({
          content: consolidated.client_summary,
          metadata: { ...((existing.metadata as Record<string, unknown>) ?? {}), briefing_kind: "consolidated", consolidated_briefing: consolidated },
        })
        .eq("id", existing.id);
    } else {
      await admin.from("context_entries").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        context_type: "briefing",
        title: "Briefing consolidado (IA)",
        content: consolidated.client_summary,
        source_label: "Aceleriq AI",
        is_key_decision: true,
        tags: ["briefing", "consolidado", "ia"],
        metadata: { briefing_kind: "consolidated", consolidated_briefing: consolidated },
      });
    }

    return jsonResponse({ consolidated, cached: false });
  } catch (e) {
    console.error("[consolidate-briefing] erro:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
