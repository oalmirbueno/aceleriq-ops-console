/**
 * caseGenerator — gera draft de case automaticamente agregando
 * sinais já existentes no workspace:
 *  - essential_briefing (contexto inicial do cliente)
 *  - before/after automático de métricas (ganhos)
 *  - canvas_nodes concluídos (o que foi entregue)
 *  - timeline_events significativos (marcos)
 *
 * Sem IA — 100% template-based. Rápido, barato, editável depois.
 */
import { supabase } from "@/integrations/supabase/client";
import { computeBeforeAfter, type MetricSnapshot, type BeforeAfterMetric } from "./beforeAfter";

export interface CaseDraft {
  title: string;
  summary: string;       // 1-2 frases
  problem: string;       // contexto antes, dores
  diagnosis: string;     // o que foi identificado
  solution: string;      // o que foi construído
  deliverables: string;  // lista de entregáveis
  transformation: string; // before/after numérico
  results: string;       // métricas finais
  narrative: string;     // narrativa consolidada (markdown)
  metadata: {
    generated_at: string;
    metrics_analyzed: number;
    nodes_delivered: number;
    days_in_journey: number;
    source: "auto_generator";
  };
}

interface AggregatedSignals {
  clientName: string;
  companyName: string | null;
  planName: string | null;
  essentialBriefing: Record<string, string>;
  beforeAfter: BeforeAfterMetric[];
  deliveredNodes: Array<{ title: string; kind: string; description: string | null }>;
  firstEventDate: string | null;
  lastEventDate: string | null;
}

// ═══ Fetch all signals ═══════════════════════════════════════

export async function gatherCaseSignals(workspaceId: string, clientId: string): Promise<AggregatedSignals> {
  const [clientRes, nodesRes, snapshotsRes, eventsRes] = await Promise.all([
    supabase.from("clients").select("name, company_name, plan_name, metadata").eq("id", clientId).maybeSingle(),
    supabase.from("canvas_nodes")
      .select("title, node_type, description, data, status")
      .eq("workspace_id", workspaceId)
      .in("status", ["done", "concluido"])
      .order("updated_at", { ascending: true }),
    supabase.from("metric_snapshots")
      .select("id, metric_name, value, unit, notes, captured_at")
      .eq("workspace_id", workspaceId)
      .order("captured_at", { ascending: true }),
    supabase.from("timeline_events")
      .select("happened_at")
      .eq("workspace_id", workspaceId)
      .order("happened_at", { ascending: true }),
  ]);

  const client = clientRes.data;
  const eb = ((client?.metadata as Record<string, unknown> | null)?.essential_briefing as Record<string, string> | undefined) ?? {};
  const snapshots = (snapshotsRes.data ?? []) as MetricSnapshot[];
  const events = eventsRes.data ?? [];
  const rawNodes = nodesRes.data ?? [];

  const deliveredNodes = rawNodes.map((n: any) => ({
    title: n.title as string,
    kind: (((n.data as Record<string, unknown> | null) ?? {}).kind as string) ?? n.node_type,
    description: n.description as string | null,
  }));

  return {
    clientName: client?.name ?? "Cliente",
    companyName: (client?.company_name as string | null) ?? null,
    planName: (client?.plan_name as string | null) ?? null,
    essentialBriefing: eb,
    beforeAfter: computeBeforeAfter(snapshots),
    deliveredNodes,
    firstEventDate: events[0]?.happened_at as string | undefined ?? null,
    lastEventDate: events[events.length - 1]?.happened_at as string | undefined ?? null,
  };
}

// ═══ Build case draft ════════════════════════════════════════

export function buildCaseDraft(signals: AggregatedSignals): CaseDraft {
  const {
    clientName, companyName, planName, essentialBriefing,
    beforeAfter, deliveredNodes, firstEventDate, lastEventDate,
  } = signals;

  const displayName = companyName ?? clientName;
  const daysInJourney = firstEventDate && lastEventDate
    ? Math.round((new Date(lastEventDate).getTime() - new Date(firstEventDate).getTime()) / 86400000)
    : 0;

  const improved = beforeAfter.filter(m => m.status === "improved");
  const stable = beforeAfter.filter(m => m.status === "stable");

  // ── Title
  const title = `Case: ${displayName} — Transformação AI-First`;

  // ── Summary (1-2 frases punchy)
  const summary = improved.length > 0
    ? `${displayName} completou sua jornada de transformação digital com ${improved.length} métricas-chave em ganho${improved.length > 1 ? "s" : ""} confirmado${improved.length > 1 ? "s" : ""}${daysInJourney > 0 ? ` em ${daysInJourney} dias` : ""}, entregando ${deliveredNodes.length} marcos operacionais.`
    : `${displayName} concluiu ${deliveredNodes.length} marcos operacionais da jornada Aceleriq em seu plano ${planName ?? ""}.`;

  // ── Problem (contexto antes)
  const problemParts: string[] = [];
  if (essentialBriefing.positioning) problemParts.push(`**Posicionamento inicial:** ${essentialBriefing.positioning}`);
  if (essentialBriefing.main_pains) problemParts.push(`**Principais dores:** ${essentialBriefing.main_pains}`);
  if (essentialBriefing.maturity_digital === "baixa") problemParts.push("**Maturidade digital inicial:** Baixa — começando do zero.");
  else if (essentialBriefing.maturity_digital === "media") problemParts.push("**Maturidade digital inicial:** Média — presença sem método.");
  if (essentialBriefing.ai_readiness === "baixa") problemParts.push("**Prontidão IA inicial:** Nunca havia usado IA no negócio.");
  const problem = problemParts.length > 0 ? problemParts.join("\n\n") : `${displayName} iniciou a jornada com necessidade de estruturar sua operação.`;

  // ── Diagnosis
  const diagnosisParts: string[] = [];
  if (essentialBriefing.icp) diagnosisParts.push(`**ICP identificado:** ${essentialBriefing.icp}`);
  if (essentialBriefing.differential) diagnosisParts.push(`**Diferencial real:** ${essentialBriefing.differential}`);
  if (essentialBriefing.goals_12m) diagnosisParts.push(`**Objetivo 12 meses:** ${essentialBriefing.goals_12m}`);
  const diagnosis = diagnosisParts.length > 0
    ? diagnosisParts.join("\n\n")
    : "Aceleriq conduziu diagnóstico estrutural para mapear gargalos e priorizar frentes.";

  // ── Solution (o que foi construído)
  const kindCount: Record<string, number> = {};
  deliveredNodes.forEach(n => { kindCount[n.kind] = (kindCount[n.kind] ?? 0) + 1; });
  const solutionParts: string[] = [];
  if (kindCount.ia || kindCount.agente) solutionParts.push(`${(kindCount.ia ?? 0) + (kindCount.agente ?? 0)} agente${((kindCount.ia ?? 0) + (kindCount.agente ?? 0)) > 1 ? "s" : ""} IA`);
  if (kindCount.automacao) solutionParts.push(`${kindCount.automacao} automação${kindCount.automacao > 1 ? "ões" : ""}`);
  if (kindCount.crm) solutionParts.push(`CRM estruturado`);
  if (kindCount.funil) solutionParts.push(`funil de vendas desenhado`);
  if (kindCount.landing_page) solutionParts.push(`${kindCount.landing_page} landing page${kindCount.landing_page > 1 ? "s" : ""}`);
  if (kindCount.site) solutionParts.push(`site ${kindCount.site > 1 ? "s " : ""}institucional`);
  if (kindCount.conteudo) solutionParts.push(`estratégia de conteúdo com ${kindCount.conteudo} peça${kindCount.conteudo > 1 ? "s" : ""}`);
  if (kindCount.trafego) solutionParts.push(`${kindCount.trafego} campanha${kindCount.trafego > 1 ? "s" : ""} de tráfego`);
  if (kindCount.metrica) solutionParts.push(`dashboard com ${kindCount.metrica} métrica${kindCount.metrica > 1 ? "s" : ""} instrumentada${kindCount.metrica > 1 ? "s" : ""}`);

  const solution = solutionParts.length > 0
    ? `Através do método ACELERA, construímos para ${displayName}:\n\n- ${solutionParts.join("\n- ")}`
    : `Foram construídos ${deliveredNodes.length} entregáveis ao longo do método ACELERA.`;

  // ── Deliverables (lista completa)
  const deliverables = deliveredNodes.length > 0
    ? deliveredNodes.map(n => `- **${n.title}** (${n.kind})${n.description ? `: ${n.description}` : ""}`).join("\n")
    : "Nenhum entregável marcado como concluído ainda.";

  // ── Transformation (before/after numérico)
  let transformation: string;
  if (improved.length > 0 || stable.length > 0) {
    const tParts: string[] = [];
    if (improved.length > 0) {
      tParts.push("**Ganhos confirmados:**");
      improved.forEach(m => {
        const unit = m.unit ? ` ${m.unit}` : "";
        const pct = m.deltaPct !== null ? ` (${m.deltaPct > 0 ? "+" : ""}${m.deltaPct.toFixed(1)}%)` : "";
        tParts.push(`- ${m.metric_name}: ${m.baseline.value}${unit} → ${m.current.value}${unit}${pct}`);
      });
    }
    if (stable.length > 0) {
      tParts.push("\n**Métricas mantidas estáveis:**");
      stable.forEach(m => {
        const unit = m.unit ? ` ${m.unit}` : "";
        tParts.push(`- ${m.metric_name}: ${m.current.value}${unit}`);
      });
    }
    transformation = tParts.join("\n");
  } else {
    transformation = "Métricas em captura — registrar snapshots antes/depois para confirmar ganhos numéricos.";
  }

  // ── Results
  const topImproved = improved.slice(0, 3);
  const results = topImproved.length > 0
    ? topImproved.map(m => {
        const unit = m.unit ? ` ${m.unit}` : "";
        const pct = m.deltaPct !== null ? ` (${m.deltaPct > 0 ? "+" : ""}${m.deltaPct.toFixed(1)}%)` : "";
        return `**${m.metric_name}**: ${m.baseline.value}${unit} → ${m.current.value}${unit}${pct}`;
      }).join("\n\n")
    : `Entrega completa de ${deliveredNodes.length} marcos operacionais ao longo de ${daysInJourney} dias.`;

  // ── Narrative (markdown completo)
  const narrative = [
    `# ${title}\n`,
    `> ${summary}\n`,
    daysInJourney > 0 ? `**Duração da jornada:** ${daysInJourney} dias\n` : "",
    planName ? `**Plano Aceleriq:** ${planName}\n` : "",
    `\n## Contexto Inicial\n\n${problem}`,
    `\n## Diagnóstico e Estratégia\n\n${diagnosis}`,
    `\n## Solução Construída\n\n${solution}`,
    `\n## Entregáveis\n\n${deliverables}`,
    `\n## Transformação Mensurada\n\n${transformation}`,
    `\n## Principais Resultados\n\n${results}`,
    `\n---\n\n_Depoimento do cliente: [ a preencher ]_`,
  ].filter(Boolean).join("\n");

  return {
    title,
    summary,
    problem,
    diagnosis,
    solution,
    deliverables,
    transformation,
    results,
    narrative,
    metadata: {
      generated_at: new Date().toISOString(),
      metrics_analyzed: beforeAfter.length,
      nodes_delivered: deliveredNodes.length,
      days_in_journey: daysInJourney,
      source: "auto_generator",
    },
  };
}

/** Save draft como case_record */
export async function saveCaseDraft(
  workspaceId: string, clientId: string, draft: CaseDraft,
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.from("case_records").insert({
    workspace_id: workspaceId,
    client_id: clientId,
    title: draft.title,
    status: "draft",
    summary: draft.summary,
    problem: draft.problem,
    diagnosis: draft.diagnosis,
    solution: draft.solution,
    deliverables: draft.deliverables,
    transformation: draft.transformation,
    results: draft.results,
    narrative: draft.narrative,
    metadata: draft.metadata,
    version: 1,
  }).select("id").single();

  if (error) return { id: null, error: error.message };
  return { id: (data as { id: string } | null)?.id ?? null, error: null };
}

/** Export como markdown file download */
export function exportCaseDraftMarkdown(draft: CaseDraft, clientName: string) {
  const blob = new Blob([draft.narrative], { type: "text/markdown" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `case-${clientName.toLowerCase().replace(/\s+/g, "-")}.md`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 100);
}
