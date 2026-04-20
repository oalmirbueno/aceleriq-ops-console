/**
 * Constants for the Before/After MVP.
 *
 * `before_after_records` is the single entity for this layer. No parallel storage.
 *
 * Vínculos leves vivem em `metadata`:
 *  - metadata.asset_ids: string[]
 *  - metadata.asset_titles_snapshot: Array<{ id, title, asset_type, validation_status }>
 *  - metadata.metric_snapshot_ids: string[]
 *  - metadata.metric_snapshot_summary: Array<{ id, label, value, unit, period }>
 *
 * Timeline: usamos `context_added` (já aceito no schema atual, mesmo padrão dos Assets/Métricas).
 * Não inventar enums novos. Quando `before_after_updated` for aceito no enum real,
 * basta trocar o valor desta constante.
 */

export type BeforeAfterStatus = "draft" | "in_progress" | "completed";

export const BEFORE_AFTER_STATUS_OPTIONS: Array<{ value: BeforeAfterStatus; label: string; hint: string }> = [
  { value: "draft", label: "Rascunho", hint: "Registro iniciado" },
  { value: "in_progress", label: "Em consolidação", hint: "Sendo estruturado" },
  { value: "completed", label: "Concluído", hint: "Prova estruturada pronta" },
];

export const BEFORE_AFTER_STATUS_COLORS: Record<BeforeAfterStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-muted/10 text-muted-foreground border-border",
  completed: "bg-muted/10 text-muted-foreground border-border",
};

export function getBeforeAfterStatusLabel(s: string): string {
  return BEFORE_AFTER_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function getBeforeAfterStatusColor(s: string): string {
  return BEFORE_AFTER_STATUS_COLORS[s as BeforeAfterStatus] ?? "";
}

/**
 * Timeline event type compatível com o schema real atual.
 * Mantido alinhado ao mesmo valor usado por Assets/Métricas.
 */
export const BEFORE_AFTER_TIMELINE_EVENT_TYPE = "context_added" as const;

interface BuildBaEventInput {
  action: "created" | "completed" | "status_changed";
  recordTitle: string;
  newStatus?: string;
}

export function buildBeforeAfterEventTitle(input: BuildBaEventInput): string {
  switch (input.action) {
    case "created":
      return `Before/After criado: ${input.recordTitle}`;
    case "completed":
      return `Before/After concluído: ${input.recordTitle}`;
    case "status_changed":
      return `Before/After atualizado: ${input.recordTitle}`;
  }
}

export function buildBeforeAfterEventDescription(input: BuildBaEventInput): string {
  const parts: string[] = ["Camada: Before/After"];
  if (input.newStatus) parts.push(`Status: ${getBeforeAfterStatusLabel(input.newStatus)}`);
  return parts.join(" · ");
}

export interface AssetSnapshotEntry {
  id: string;
  title: string;
  asset_type: string;
  validation_status: string;
}

export interface MetricSnapshotEntry {
  id: string;
  label: string;
  value: number | null;
  unit: string | null;
  period: string | null;
}
