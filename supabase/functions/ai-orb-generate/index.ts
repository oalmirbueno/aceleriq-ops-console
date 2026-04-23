import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-2.5-flash";

const VALID_KINDS = ["briefing","ideia","reuniao","documento","acessos","objetivo","contato","checklist","funil","landing_page","site","automacao","ia","integracao","conteudo","video","imagem","asset","lancamento","trafego","email_mkt","social","crm","metrica","before_after","case","resultado","decisao","agente","instrucao","contexto_ops"] as const;
const VALID_STAGES = ["entrada","diagnostico","estrutura_base","planejamento","producao","ativacao","otimizacao","expansao"] as const;
const KIND_DEFAULT_STAGE: Record<string, string> = { briefing:"entrada", contexto_ops:"entrada", objetivo:"entrada", acessos:"entrada", documento:"diagnostico", checklist:"estrutura_base", instrucao:"planejamento", funil:"planejamento", landing_page:"producao", site:"producao", automacao:"producao", ia:"producao", integracao:"producao", agente:"producao", resultado:"producao", conteudo:"producao", video:"producao", imagem:"producao", trafego:"ativacao", email_mkt:"ativacao", social:"ativacao", lancamento:"ativacao", decisao:"ativacao", crm:"otimizacao", metrica:"otimizacao", before_after:"expansao", case:"expansao" };

type OrbType = "planner" | "docs" | "content" | "tech" | "proof" | "full";
type Body = { orbId: string; workspaceId: string; clientId: string; orbType: OrbType; aiEngine?: string; customPrompt?: string; focusAreas?: string[]; deterministic?: boolean };

const ORB_PROMPTS: Record<OrbType, { hint: string; system: string; fallback: { nodes: Array<Record<string, string>>; edges: Array<Record<string, string>>; insights: string[] } }> = {
  planner: { hint: "OKRs, roadmap 90 dias, priorização por impacto × esforço", system: "Consultor sênior de estratégia e operações. Gere objetivos SMART, plano 90 dias, frentes priorizadas e checkpoints.", fallback: { nodes: [{ ref:"okr", kind:"objetivo", stage:"entrada", title:"OKRs operacionais", description:"Objetivos SMART e resultados-chave da operação." },{ ref:"plan", kind:"documento", stage:"planejamento", title:"Plano Operacional 90 dias", description:"Roadmap em sprints 0-30, 30-60 e 60-90 dias." },{ ref:"sprint", kind:"checklist", stage:"planejamento", title:"Sprint 1 — Fundação", description:"Primeiros passos e quick wins." }], edges: [{ fromRef:"okr", toRef:"plan", label:"orienta" },{ fromRef:"plan", toRef:"sprint", label:"executa" }], insights: ["Plano estruturado em objetivos, roadmap e execução inicial."] } },
  docs: { hint: "BMC, ICP, Persona, SOP e mapa de processos", system: "Especialista em documentação operacional. Gere documentos autocontidos usando contexto real, lacunas e processos.", fallback: { nodes: [{ ref:"bmc", kind:"documento", stage:"diagnostico", title:"Business Model Canvas", description:"Modelo de negócio estruturado." },{ ref:"icp", kind:"documento", stage:"diagnostico", title:"ICP — Cliente Ideal", description:"Perfil ideal, dores, objeções e canais." },{ ref:"sop", kind:"documento", stage:"estrutura_base", title:"SOP — Processos Padrão", description:"Processos com trigger, passos, responsáveis e exceções." }], edges: [{ fromRef:"bmc", toRef:"icp", label:"segmenta" },{ fromRef:"icp", toRef:"sop", label:"estrutura" }], insights: ["Documentação base organizada para reduzir lacunas operacionais."] } },
  content: { hint: "pilares, calendário editorial, copy, headlines e CTAs", system: "Diretor de conteúdo e growth. Gere calendário, pilares e peças com hook, corpo e CTA específico.", fallback: { nodes: [{ ref:"pillars", kind:"conteudo", stage:"planejamento", title:"Pilares de Conteúdo", description:"Temas centrais conectados ao posicionamento." },{ ref:"calendar", kind:"conteudo", stage:"producao", title:"Calendário Editorial — Mês 1", description:"Plano de publicações do primeiro ciclo." },{ ref:"social", kind:"social", stage:"ativacao", title:"Estratégia Instagram", description:"Distribuição social com formatos e CTAs." }], edges: [{ fromRef:"pillars", toRef:"calendar", label:"desdobra" },{ fromRef:"calendar", toRef:"social", label:"ativa" }], insights: ["Conteúdo organizado em pilares e distribuição inicial."] } },
  tech: { hint: "n8n, integrações, agentes IA, CRM e ROI", system: "Arquiteto de automação. Cada automação precisa de trigger, flow, output, fallback e ROI operacional.", fallback: { nodes: [{ ref:"onboarding", kind:"automacao", stage:"producao", title:"Fluxo de Onboarding Automático", description:"Reduz handoffs manuais no início da operação." },{ ref:"agent", kind:"ia", stage:"producao", title:"Agente de Atendimento", description:"Agente com base, escalação e métricas." },{ ref:"crm", kind:"crm", stage:"otimizacao", title:"Pipeline Comercial", description:"Etapas, campos e follow-ups." }], edges: [{ fromRef:"onboarding", toRef:"agent", label:"aciona" },{ fromRef:"agent", toRef:"crm", label:"registra" }], insights: ["Automação priorizada por redução de trabalho manual."] } },
  proof: { hint: "North Star, KPIs, baseline, before/after e case", system: "Analista de dados e growth. Toda métrica precisa de fórmula, fonte, frequência, meta e baseline.", fallback: { nodes: [{ ref:"baseline", kind:"metrica", stage:"diagnostico", title:"Baseline — Estado Atual", description:"Ponto de partida antes das intervenções." },{ ref:"kpis", kind:"metrica", stage:"otimizacao", title:"North Star + KPIs Primários", description:"Árvore de métricas conectada aos objetivos." },{ ref:"case", kind:"case", stage:"expansao", title:"Case de Sucesso — Template", description:"Narrativa baseada em evidência real." }], edges: [{ fromRef:"baseline", toRef:"kpis", label:"mede" },{ fromRef:"kpis", toRef:"case", label:"comprova" }], insights: ["Prova estruturada em baseline, KPIs e narrativa de case."] } },
  full: { hint: "esteira completa: fundação, estratégia, construção, conteúdo, ativação e prova", system: "COO virtual da Aceleriq. Gere sequência executável sem ciclos, com checkpoints e prova final.", fallback: { nodes: [{ ref:"brief", kind:"briefing", stage:"entrada", title:"Briefing operacional", description:"Entrada central de contexto e restrições." },{ ref:"plan", kind:"documento", stage:"planejamento", title:"Resumo Operacional", description:"Overview da esteira completa." },{ ref:"build", kind:"resultado", stage:"producao", title:"Entrega principal", description:"Primeiro output operacional de impacto." },{ ref:"proof", kind:"case", stage:"expansao", title:"Case de sucesso", description:"Prova reutilizável de resultado." }], edges: [{ fromRef:"brief", toRef:"plan", label:"base" },{ fromRef:"plan", toRef:"build", label:"executa" },{ fromRef:"build", toRef:"proof", label:"prova" }], insights: ["Esteira completa organizada da entrada à prova final."] } },
};

function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }

function sanitize(raw: { rationale?: string; nodes?: Array<Record<string, string>>; edges?: Array<Record<string, string>>; insights?: string[] }) {
  const seen = new Set<string>();
  const nodes = (raw.nodes ?? []).map((node, index) => {
    let ref = (node.ref ?? `node_${index}`).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 32);
    while (seen.has(ref)) ref = `${ref}_${index}`;
    seen.add(ref);
    const kind = (VALID_KINDS as readonly string[]).includes(node.kind) ? node.kind : "documento";
    const stage = (VALID_STAGES as readonly string[]).includes(node.stage) ? node.stage : KIND_DEFAULT_STAGE[kind] ?? "planejamento";
    return { ref, kind, stage, title: (node.title ?? "Node gerado").slice(0, 90), description: (node.description ?? "Gerado pelo AI Orb.").slice(0, 260) };
  }).slice(0, 28);
  const refs = new Set(nodes.map((node) => node.ref));
  const edges = (raw.edges ?? []).filter((edge) => refs.has(edge.fromRef) && refs.has(edge.toRef) && edge.fromRef !== edge.toRef).map((edge) => ({ fromRef: edge.fromRef, toRef: edge.toRef, label: edge.label?.slice(0, 40) ?? null })).slice(0, 40);
  return { nodes, edges, rationale: raw.rationale ?? "Geração operacional do AI Orb.", insights: (raw.insights ?? []).slice(0, 6) };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);
    const body = await req.json() as Body;
    if (!body.orbId || !body.workspaceId || !body.clientId || !body.orbType) return json({ error: "orbId, workspaceId, clientId e orbType são obrigatórios" }, 400);
    const def = ORB_PROMPTS[body.orbType] ?? ORB_PROMPTS.planner;
    if (body.deterministic) return json({ ...def.fallback, rationale: `Fallback determinístico: ${def.hint}` });

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const [clientRes, contextRes, metricsRes, nodesRes, edgesRes] = await Promise.all([
      admin.from("clients").select("id,name,company_name,segment,plan_name,website,instagram,notes").eq("id", body.clientId).maybeSingle(),
      admin.from("context_entries").select("context_type,title,content,metadata,tags,created_at").eq("client_id", body.clientId).order("created_at", { ascending: false }).limit(25),
      admin.from("metric_snapshots").select("metric_name,value,unit,notes,captured_at").eq("client_id", body.clientId).order("captured_at", { ascending: false }).limit(20),
      admin.from("canvas_nodes").select("id,title,node_type,description,data,parent_node_id").eq("workspace_id", body.workspaceId).limit(60),
      admin.from("canvas_edges").select("source_node_id,target_node_id,label").eq("workspace_id", body.workspaceId).limit(100),
    ]);

    const contextPayload = { cliente: clientRes.data, contextos: contextRes.data, metricas: metricsRes.data, canvas_nodes: nodesRes.data, canvas_edges: edgesRes.data, foco: body.focusAreas, memoria_orb: (nodesRes.data ?? []).find((n: Record<string, unknown>) => n.id === body.orbId)?.data, pista: def.hint };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY || body.aiEngine !== "internal") return json({ ...def.fallback, rationale: `Fallback seguro: ${def.hint}` });

    const tool = { type: "function", function: { name: "build_orb_output", description: "Nodes e edges gerados por AI Orb", parameters: { type: "object", properties: { rationale: { type: "string" }, insights: { type: "array", items: { type: "string" } }, nodes: { type: "array", items: { type: "object", properties: { ref: { type: "string" }, kind: { type: "string", enum: [...VALID_KINDS] }, stage: { type: "string", enum: [...VALID_STAGES] }, title: { type: "string" }, description: { type: "string" } }, required: ["ref","kind","stage","title","description"], additionalProperties: false } }, edges: { type: "array", items: { type: "object", properties: { fromRef: { type: "string" }, toRef: { type: "string" }, label: { type: "string" } }, required: ["fromRef","toRef"], additionalProperties: false } } }, required: ["rationale","insights","nodes","edges"], additionalProperties: false } } };
    const aiRes = await fetch(AI_GATEWAY_URL, { method: "POST", headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: AI_MODEL, temperature: 0.3, messages: [{ role: "system", content: `${def.system}\n${body.customPrompt ?? ""}\nUse apenas kinds/stages permitidos. Não invente números. Retorne saída executável.` }, { role: "user", content: JSON.stringify(contextPayload).slice(0, 24000) }], tools: [tool], tool_choice: { type: "function", function: { name: "build_orb_output" } } }) });
    if (!aiRes.ok) return json({ ...def.fallback, rationale: `Fallback por falha da IA: ${def.hint}` });
    const aiData = await aiRes.json();
    const args = aiData?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return json({ ...def.fallback, rationale: `Fallback por resposta incompleta: ${def.hint}` });
    return json(sanitize(JSON.parse(args)));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Erro inesperado" }, 500);
  }
});