/**
 * Constants for the Case MVP.
 *
 * `case_records` é a única entidade desta camada. Não criar tabela paralela.
 *
 * Vínculos leves vivem em `metadata`:
 *  - metadata.before_after_title_snapshot: string
 *  - metadata.asset_ids: string[]
 *  - metadata.asset_titles_snapshot: AssetSnapshotEntry[]
 *  - metadata.metric_snapshot_ids: string[]
 *  - metadata.metric_snapshot_summary: MetricSnapshotEntry[]
 *
 * Timeline: usamos `context_added` (já aceito no schema atual, mesmo padrão
 * adotado em Assets, Métricas e Before/After). Não inventar enums novos.
 */

import type { AssetSnapshotEntry, MetricSnapshotEntry } from "./beforeAfterConstants";

export type { AssetSnapshotEntry, MetricSnapshotEntry };

/** Subset enxuto do enum real para o MVP. */
export type CaseStatus = "draft" | "in_review" | "approved";

export const CASE_STATUS_OPTIONS: Array<{ value: CaseStatus; label: string; hint: string }> = [
  { value: "draft", label: "Rascunho", hint: "Em construção" },
  { value: "in_review", label: "Em revisão", hint: "Pronto para revisão interna" },
  { value: "approved", label: "Aprovado", hint: "Case interno aprovado" },
];

export const CASE_STATUS_COLORS: Record<CaseStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  in_review: "bg-muted/10 text-muted-foreground border-border",
  approved: "bg-muted/10 text-muted-foreground border-border",
};

export function getCaseStatusLabel(s: string): string {
  return CASE_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function getCaseStatusColor(s: string): string {
  return CASE_STATUS_COLORS[s as CaseStatus] ?? "";
}

/**
 * Timeline event_type compatível com o schema real atual.
 * Mantido alinhado a Assets/Métricas/Before/After.
 */
export const CASE_TIMELINE_EVENT_TYPE = "context_added" as const;

interface BuildCaseEventInput {
  action: "created" | "generated" | "in_review" | "approved" | "status_changed";
  caseTitle: string;
  newStatus?: string;
  basedOnTitle?: string | null;
}

export function buildCaseEventTitle(input: BuildCaseEventInput): string {
  const { action, caseTitle } = input;
  switch (action) {
    case "created":
      return `Case criado: ${caseTitle}`;
    case "generated":
      return `Case gerado a partir de Before/After: ${caseTitle}`;
    case "in_review":
      return `Case enviado para revisão: ${caseTitle}`;
    case "approved":
      return `Case aprovado: ${caseTitle}`;
    case "status_changed":
      return `Case atualizado: ${caseTitle}`;
  }
}

export function buildCaseEventDescription(input: BuildCaseEventInput): string {
  const parts: string[] = ["Camada: Case"];
  if (input.newStatus) parts.push(`Status: ${getCaseStatusLabel(input.newStatus)}`);
  if (input.basedOnTitle) parts.push(`Base: ${input.basedOnTitle}`);
  return parts.join(" · ");
}

/**
 * Pré-preenchimento determinístico a partir de um Before/After.
 * Sem IA. Sem provider externo. Apenas mapeamento conservador.
 */
export interface BeforeAfterSeed {
  id: string;
  title: string | null;
  status: string | null;
  before_summary: string | null;
  problem_summary: string | null;
  solution_summary: string | null;
  after_summary: string | null;
  evidence_notes: string | null;
  main_metric_summary: string | null;
  metadata: Record<string, unknown> | null;
}

export interface CaseDraftSeed {
  title: string;
  summary: string;
  problem: string;
  diagnosis: string;
  solution: string;
  deliverables: string;
  transformation: string;
  results: string;
  narrative: string;
  based_on_before_after_id: string;
  metadata: Record<string, unknown>;
}

export function seedCaseFromBeforeAfter(ba: BeforeAfterSeed): CaseDraftSeed {
  const baMd = (ba.metadata ?? {}) as Record<string, unknown>;
  const assetIds = Array.isArray(baMd.asset_ids) ? (baMd.asset_ids as string[]) : [];
  const assetSnap = Array.isArray(baMd.asset_titles_snapshot)
    ? (baMd.asset_titles_snapshot as AssetSnapshotEntry[])
    : [];
  const metricIds = Array.isArray(baMd.metric_snapshot_ids) ? (baMd.metric_snapshot_ids as string[]) : [];
  const metricSnap = Array.isArray(baMd.metric_snapshot_summary)
    ? (baMd.metric_snapshot_summary as MetricSnapshotEntry[])
    : [];

  const deliverables = assetSnap.length
    ? assetSnap.map((a) => `• ${a.title}`).join("\n")
    : "";

  const transformation = [ba.before_summary, ba.after_summary]
    .filter((v): v is string => Boolean(v?.trim()))
    .map((v, i) => (i === 0 ? `Antes: ${v}` : `Depois: ${v}`))
    .join("\n\n");

  const results = ba.main_metric_summary?.trim() || (metricSnap.length
    ? metricSnap.map((m) => `• ${m.label}: ${m.value ?? "-"}${m.unit ? ` ${m.unit}` : ""}${m.period ? ` (${m.period})` : ""}`).join("\n")
    : "");

  const narrative = [
    ba.problem_summary && `**Problema.** ${ba.problem_summary}`,
    ba.solution_summary && `**Solução.** ${ba.solution_summary}`,
    transformation && `**Transformação.**\n${transformation}`,
    results && `**Resultado.**\n${results}`,
    ba.evidence_notes && `**Evidências.** ${ba.evidence_notes}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    title: ba.title ? `Case — ${ba.title}` : "Novo case",
    summary: ba.after_summary?.trim() || ba.problem_summary?.trim() || "",
    problem: ba.problem_summary ?? "",
    diagnosis: ba.evidence_notes ?? "",
    solution: ba.solution_summary ?? "",
    deliverables,
    transformation,
    results,
    narrative,
    based_on_before_after_id: ba.id,
    metadata: {
      before_after_title_snapshot: ba.title ?? null,
      asset_ids: assetIds,
      asset_titles_snapshot: assetSnap,
      metric_snapshot_ids: metricIds,
      metric_snapshot_summary: metricSnap,
    },
  };
}
