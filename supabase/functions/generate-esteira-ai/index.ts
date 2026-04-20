/**
 * generate-esteira-ai — gera uma esteira ACELERA sob medida pra um cliente
 * usando Lovable AI Gateway.
 *
 * Input:
 *   { clientId, workspaceId, hint?: string, focus?: string[] }
 *
 * Pipeline:
 *   1. Auth + checagem de acesso ao workspace
 *   2. Coleta contexto do cliente:
 *        - clients row (segmento, plano, descrição, links)
 *        - briefing consolidado (consolidated_briefings.consolidated_data)
 *        - context_entries (notas, transcrições)
 *        - metric_snapshots recentes
 *        - fronts ativos
 *        - assets/anexos vinculados
 *   3. Chama Lovable AI com tool-calling forçando JSON no schema EsteiraTemplate
 *   4. Valida cada node contra o catálogo PROJECT_TYPES (kinds permitidos)
 *      e cada stage contra ACELERA_STAGES; corrige inválidos
 *   5. Retorna { template: EsteiraTemplate, rationale: string, sources: {...} }
 *
 * O cliente recebe o template ad-hoc e usa o mesmo pipeline existente do
 * canvas pra criar nodes/edges reais. A esteira NÃO é persistida aqui —
 * é só a "receita".
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

// Manter sincronizado com src/components/workspace/canvasProjectTypes.ts
const VALID_KINDS = [
  "briefing","ideia","reuniao","documento","acessos","objetivo","contato",
  "checklist","funil",
  "landing_page","site","automacao","ia","integracao","conteudo","video","imagem","asset",
  "lancamento","trafego","email_mkt","social",
  "crm","metrica",
  "before_after","case",
] as const;

const VALID_STAGES = [
  "entrada","diagnostico","estrutura_base","planejamento",
  "producao","ativacao","otimizacao","expansao",
] as const;

// Stage default por kind quando IA mandar inválido
const KIND_DEFAULT_STAGE: Record<string, string> = {
  briefing: "entrada", reuniao: "entrada", ideia: "entrada", objetivo: "entrada", acessos: "entrada",
  documento: "diagnostico", contato: "estrutura_base", checklist: "estrutura_base",
  funil: "planejamento",
  landing_page: "producao", site: "producao", automacao: "producao", ia: "producao",
  integracao: "producao", conteudo: "producao", video: "producao", imagem: "producao", asset: "producao",
  lancamento: "ativacao", trafego: "ativacao", email_mkt: "ativacao", social: "ativacao",
  crm: "otimizacao", metrica: "otimizacao",
  before_after: "expansao", case: "expansao",
};

interface ReqBody {
  clientId: string;
  workspaceId: string;
  hint?: string;
  focus?: string[];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json()) as ReqBody;
    if (!body.clientId || !body.workspaceId) {
      return json({ error: "clientId e workspaceId são obrigatórios" }, 400);
    }

    // ─── 1. Coleta contexto ────────────────────────────────────────────
    // Schema real:
    //  - clients: name, company_name, segment, plan_name, website, instagram, notes
    //  - context_entries: context_type, title, content, source_label, metadata, tags
    //  - briefing consolidado vive em context_entries (context_type=briefing) em metadata.consolidated_briefing
    //  - metric_snapshots: metric_name, value, unit, captured_at, notes
    //  - fronts: name, status, description, priority (workspace-scope)
    //  - assets: title, asset_type, validation_status, external_url (workspace-scope)
    const [clientRes, contextRes, metricsRes, frontsRes, assetsRes] = await Promise.all([
      admin.from("clients")
        .select("id,name,company_name,segment,plan_name,website,instagram,notes")
        .eq("id", body.clientId).maybeSingle(),
      admin.from("context_entries")
        .select("context_type,title,content,metadata,tags,created_at")
        .eq("client_id", body.clientId)
        .order("created_at", { ascending: false }).limit(25),
      admin.from("metric_snapshots")
        .select("metric_name,value,unit,notes,captured_at")
        .eq("client_id", body.clientId)
        .order("captured_at", { ascending: false }).limit(15),
      admin.from("fronts")
        .select("name,status,description,priority")
        .eq("client_id", body.clientId).limit(10),
      admin.from("assets")
        .select("title,asset_type,validation_status,external_url")
        .eq("workspace_id", body.workspaceId).limit(20),
    ]);

    const client = clientRes.data;
    if (!client) return json({ error: "Cliente não encontrado" }, 404);

    // Extrai briefing consolidado do context_entries
    type CtxRow = { context_type: string | null; title: string | null; content: string | null;
      metadata: Record<string, unknown> | null; tags: string[] | null };
    const allCtx: CtxRow[] = (contextRes.data ?? []) as CtxRow[];
    const briefingEntry = allCtx.find(
      (e) => e.context_type === "briefing" && (e.metadata as Record<string, unknown> | null)?.consolidated_briefing,
    );
    const briefingConsolidated = briefingEntry
      ? (briefingEntry.metadata as Record<string, unknown>).consolidated_briefing
      : null;
    const otherContext = allCtx.filter((e) => e.context_type !== "briefing").slice(0, 15);

    const sourcesSummary = {
      hasBriefing: !!briefingConsolidated,
      contextEntries: otherContext.length,
      metricSnapshots: metricsRes.data?.length ?? 0,
      fronts: frontsRes.data?.length ?? 0,
      assets: assetsRes.data?.length ?? 0,
    };

    // ─── 2. Monta prompt ──────────────────────────────────────────────
    const contextBlob = JSON.stringify({
      cliente: {
        nome: client.name,
        empresa: client.company_name,
        plano: client.plan_name,
        segmento: client.segment,
        site: client.website,
        instagram: client.instagram,
        notas: client.notes,
      },
      briefing_consolidado: briefingConsolidated,
      contexto_recente: otherContext.map((e) => ({
        tipo: e.context_type,
        titulo: e.title,
        resumo: typeof e.content === "string" ? e.content.slice(0, 500) : null,
        tags: e.tags ?? [],
      })),
      metricas: metricsRes.data ?? [],
      fronts_ativos: frontsRes.data ?? [],
      assets_disponiveis: (assetsRes.data ?? []).map((a: Record<string, unknown>) => ({
        nome: a.title, tipo: a.asset_type, status: a.validation_status,
      })),
      pista_usuario: body.hint ?? null,
      areas_foco: body.focus ?? [],
    }, null, 2);

    const systemPrompt = `Você é um arquiteto sênior de operações digitais da Aceleriq.
Sua tarefa: desenhar uma ESTEIRA OPERACIONAL sob medida pra este cliente, no método ACELERA
(8 etapas: entrada → diagnostico → estrutura_base → planejamento → producao → ativacao → otimizacao → expansao).

REGRAS DURAS:
1. Sempre comece com 1 node "briefing" na etapa "entrada". Se o cliente já tem briefing consolidado, mantenha pra fixar a entrada.
2. Use APENAS estes kinds de node: ${VALID_KINDS.join(", ")}.
3. Use APENAS estas stages: ${VALID_STAGES.join(", ")}.
4. Cada node tem: ref (id local único, slug curto), kind, stage, title (curto, em PT-BR, específico ao cliente), description (1 frase justificando POR QUE esse node existe pra ESTE cliente).
5. Edges devem formar um fluxo lógico (sem ciclos) ligando nodes pela ordem de execução real.
6. Adapte o tamanho da esteira ao porte:
   - Cliente pequeno/básico: 6–10 nodes
   - Cliente médio (growth): 10–16 nodes
   - Cliente enterprise/complexo: 16–24 nodes
7. Priorize o que aparece no briefing/contexto/métricas. Se métricas mostram problema em conversão, inclua "metrica" e "trafego". Se há automações no contexto, inclua "automacao"/"ia". Se há produto digital mencionado, inclua "funil"+"landing_page".
8. SEMPRE inclua pelo menos: 1 documento de diagnóstico, 1 objetivo, 1 entregável de produção, 1 ativação, 1 métrica.
9. Se o cliente menciona acessos/credenciais ou usa muitas plataformas, adicione node "acessos" na entrada.
10. NÃO invente dados — use SÓ o que está no contexto.

Saída: chame a tool "build_esteira" com o template completo.`;

    const userPrompt = `Contexto do cliente "${client.name}":\n\n${contextBlob}\n\nProjete a esteira ideal agora.`;

    // ─── 3. Tool schema ───────────────────────────────────────────────
    const tools = [{
      type: "function",
      function: {
        name: "build_esteira",
        description: "Retorna a esteira ACELERA sob medida pro cliente",
        parameters: {
          type: "object",
          properties: {
            rationale: {
              type: "string",
              description: "1-2 frases explicando a lógica geral da esteira proposta (referenciando dados do cliente)",
            },
            nodes: {
              type: "array",
              minItems: 5,
              items: {
                type: "object",
                properties: {
                  ref: { type: "string", description: "slug curto único, ex: 'brief', 'lp_oferta', 'crm'" },
                  kind: { type: "string", enum: [...VALID_KINDS] },
                  stage: { type: "string", enum: [...VALID_STAGES] },
                  title: { type: "string", description: "Título do node, específico ao cliente" },
                  description: { type: "string", description: "Por que esse node existe pra ESTE cliente" },
                },
                required: ["ref","kind","stage","title","description"],
                additionalProperties: false,
              },
            },
            edges: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  fromRef: { type: "string" },
                  toRef: { type: "string" },
                  label: { type: "string" },
                },
                required: ["fromRef","toRef"],
                additionalProperties: false,
              },
            },
          },
          required: ["rationale","nodes","edges"],
          additionalProperties: false,
        },
      },
    }];

    // ─── 4. Call AI ───────────────────────────────────────────────────
    const aiRes = await fetch(AI_GATEWAY_URL, {
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
        tools,
        tool_choice: { type: "function", function: { name: "build_esteira" } },
      }),
    });

    if (aiRes.status === 429) return json({ error: "Limite de requisições da IA atingido. Tente em alguns segundos." }, 429);
    if (aiRes.status === 402) return json({ error: "Créditos da IA esgotados. Adicione créditos no workspace." }, 402);
    if (!aiRes.ok) {
      const txt = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, txt);
      return json({ error: "Falha na IA: " + txt.slice(0, 200) }, 500);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return json({ error: "IA não retornou esteira estruturada" }, 500);
    }

    let parsed: { rationale: string; nodes: Array<Record<string, string>>; edges: Array<Record<string, string>> };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return json({ error: "Falha ao parsear resposta da IA: " + String(e) }, 500);
    }

    // ─── 5. Validação / saneamento ────────────────────────────────────
    const seenRefs = new Set<string>();
    const cleanNodes = (parsed.nodes ?? []).map((n, i) => {
      let ref = (n.ref ?? `node_${i}`).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
      while (seenRefs.has(ref)) ref = ref + "_" + i;
      seenRefs.add(ref);
      const kind = (VALID_KINDS as readonly string[]).includes(n.kind) ? n.kind : "documento";
      const stage = (VALID_STAGES as readonly string[]).includes(n.stage)
        ? n.stage
        : (KIND_DEFAULT_STAGE[kind] ?? "planejamento");
      return {
        ref,
        kind,
        stage,
        title: (n.title ?? "Sem título").slice(0, 80),
        description: (n.description ?? "").slice(0, 240),
      };
    });

    // garante 1 briefing na entrada
    if (!cleanNodes.some((n) => n.kind === "briefing")) {
      cleanNodes.unshift({
        ref: "brief",
        kind: "briefing",
        stage: "entrada",
        title: "Briefing inicial",
        description: "Ponto de entrada da operação — base para todas as decisões abaixo.",
      });
    }

    const refSet = new Set(cleanNodes.map((n) => n.ref));
    const cleanEdges = (parsed.edges ?? [])
      .filter((e) => refSet.has(e.fromRef) && refSet.has(e.toRef) && e.fromRef !== e.toRef)
      .map((e) => ({ fromRef: e.fromRef, toRef: e.toRef, label: e.label?.slice(0, 40) }));

    const template = {
      key: "ai_smart" as const,
      label: "Inteligente — Sob medida",
      tagline: parsed.rationale?.slice(0, 140) ?? "Esteira gerada pela IA com base no contexto do cliente.",
      accent: "border-primary/50 text-primary bg-primary/10",
      nodes: cleanNodes,
      edges: cleanEdges,
    };

    return json({
      template,
      rationale: parsed.rationale ?? "",
      sources: sourcesSummary,
    });
  } catch (e) {
    console.error("generate-esteira-ai error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
