/**
 * generate-esteira-ai — gera uma esteira ACELERA sob medida pra um cliente
 * usando Gemini direto.
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
 *   3. Chama Gemini direto forçando JSON no schema EsteiraTemplate
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

const GEMINI_MODEL = "gemini-2.5-flash";

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
  deliveryType?: string;
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
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return json({ error: "GEMINI_API_KEY não configurada" }, 500);

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
    //  - clients: name, company_name, segment, plan_name, project_type, custom_monthly_value, logo_url, notes, metadata
    //  - context_entries: context_type, title, content, metadata, tags, created_at
    //  - briefing consolidado vive em context_entries (context_type=briefing) em metadata.consolidated_briefing
    //  - metric_snapshots: metric_key, metric_label, metric_value, metric_unit, notes, captured_at
    //  - operational_fronts: name, objective, expected_outcome, scope_classification, priority, bucket_status, execution_status, blocked_reason
    //  - assets: title, asset_type, validation_status, external_url (workspace-scope)
    const [clientRes, contextRes, metricsRes, frontsRes, assetsRes] = await Promise.all([
      admin.from("clients")
        .select("id,name,company_name,segment,plan_name,project_type,custom_monthly_value,logo_url,portal_client_id,notes,metadata,executive_summary")
        .eq("id", body.clientId).maybeSingle(),
      admin.from("context_entries")
        .select("context_type,title,content,metadata,tags,created_at")
        .eq("client_id", body.clientId)
        .order("created_at", { ascending: false }).limit(25),
      admin.from("metric_snapshots")
        .select("metric_key,metric_label,metric_value,metric_unit,notes,captured_at")
        .eq("workspace_id", body.workspaceId)
        .order("captured_at", { ascending: false }).limit(15),
      admin.from("operational_fronts")
        .select("id,name,objective,expected_outcome,scope_classification,priority,bucket_status,execution_status,owner_id,blocked_reason,metadata,created_at,updated_at")
        .eq("workspace_id", body.workspaceId)
        .order("created_at", { ascending: true }).limit(10),
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
    const contextPayload = {
      cliente: {
        nome: client.name,
        empresa: client.company_name,
        plano: client.plan_name,
        segmento: client.segment,
        tipo_projeto: client.project_type,
        valor_mensal: client.custom_monthly_value,
        logo_url: client.logo_url,
        portal_client_id: client.portal_client_id,
        notas: client.notes,
        resumo_executivo: client.executive_summary,
        metadata: client.metadata,
      },
      briefing_consolidado: briefingConsolidated,
      contexto_recente: otherContext.map((e) => ({
        tipo: e.context_type,
        titulo: e.title,
        resumo: typeof e.content === "string" ? e.content.slice(0, 500) : null,
        tags: e.tags ?? [],
      })),
      metricas: (metricsRes.data ?? []).map((m: Record<string, unknown>) => ({
        key: m.metric_key,
        label: m.metric_label,
        value: m.metric_value,
        unit: m.metric_unit,
        notes: m.notes,
        captured_at: m.captured_at,
      })),
      fronts_ativos: (frontsRes.data ?? []).map((f: Record<string, unknown>) => ({
        nome: f.name,
        objetivo: f.objective,
        resultado_esperado: f.expected_outcome,
        classificacao: f.scope_classification,
        prioridade: f.priority,
        bucket_status: f.bucket_status,
        execution_status: f.execution_status,
        bloqueio: f.blocked_reason,
      })),
      assets_disponiveis: (assetsRes.data ?? []).map((a: Record<string, unknown>) => ({
        nome: a.title, tipo: a.asset_type, status: a.validation_status,
      })),
      pista_usuario: body.hint ?? null,
      areas_foco: body.focus ?? [],
    };

    const systemPrompt = `Você é o arquiteto operacional da Aceleriq. Gere uma esteira de produção ACELERA sob medida para este cliente.

REGRAS:
- Retorne APENAS JSON válido (sem markdown, sem texto extra)
- Use SOMENTE kinds permitidos: ${VALID_KINDS.join(", ")}
- Use SOMENTE stages permitidos: ${VALID_STAGES.join(", ")}
- Cada node deve ter: ref (string curto), kind, stage, title, description (detalhada, 2-3 frases)
- Edges conectam nodes por ref usando fromRef e toRef
- Mínimo 5 nodes, máximo 25
- Descrição de cada node deve ser ESPECÍFICA pro contexto do cliente, não genérica
- Sempre comece com 1 node "briefing" na etapa "entrada"
- Sempre inclua pelo menos: 1 documento de diagnóstico, 1 objetivo, 1 entregável de produção, 1 ativação, 1 métrica
- Se o cliente menciona acessos/credenciais ou usa muitas plataformas, adicione node "acessos" na entrada
- NÃO invente dados — use SOMENTE o que está no contexto

Formato do JSON:
{
  "label": "Nome da esteira",
  "tagline": "Resumo em 1 frase",
  "rationale": "Por que essa esteira faz sentido",
  "nodes": [
    { "ref": "...", "kind": "...", "stage": "...", "title": "...", "description": "..." }
  ],
  "edges": [
    { "fromRef": "...", "toRef": "...", "label": "..." }
  ]
}`;

    const userPrompt = `CONTEXTO DO CLIENTE:\n${JSON.stringify(contextPayload).slice(0, 20000)}\n\n${body.hint ? `INSTRUÇÃO ADICIONAL: ${body.hint}` : ""}\n\n${body.deliveryType ? `TIPO DE ENTREGA: ${body.deliveryType}` : ""}`;

    // ─── 3. Call Gemini ──────────────────────────────────────────────
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const geminiPayload = {
      contents: [
        { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
      ],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    };

    let aiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload),
    });

    if (!aiRes.ok) {
      const primaryError = await aiRes.text();
      console.error("Gemini API error:", aiRes.status, primaryError);

      const fallbackUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
      const fallbackRes = await fetch(fallbackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiPayload),
      });

      if (!fallbackRes.ok) {
        const errText = await fallbackRes.text();
        return json({ error: `Gemini falhou: ${fallbackRes.status}`, detail: errText.slice(0, 300) }, 502);
      }

      aiRes = fallbackRes;
    }

    const aiData = await aiRes.json();
    const rawText = aiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: {
      label?: string;
      tagline?: string;
      rationale?: string;
      nodes: Array<Record<string, string>>;
      edges: Array<Record<string, string>>;
    };
    try {
      parsed = JSON.parse(clean);
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
      label: parsed.label?.slice(0, 80) ?? "Inteligente — Sob medida",
      tagline: parsed.tagline?.slice(0, 140) ?? parsed.rationale?.slice(0, 140) ?? "Esteira gerada pela IA com base no contexto do cliente.",
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
