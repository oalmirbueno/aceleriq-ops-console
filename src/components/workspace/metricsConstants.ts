/**
 * Constants for the Métricas MVP (snapshot-based).
 *
 * `metric_snapshots` is the single entity for this layer. No parallel storage.
 * Frente vinculada é opcional e vive em metadata.operational_front_id /
 * metadata.operational_front_name_snapshot — sem nova tabela.
 */

export type MetricKey =
  | "leads"
  | "meetings"
  | "sales"
  | "revenue"
  | "traffic"
  | "conversion_rate"
  | "cpl"
  | "followers"
  | "other";

export const METRIC_KEY_OPTIONS: Array<{
  value: MetricKey;
  label: string;
  defaultUnit: string;
  hint: string;
}> = [
  { value: "leads", label: "Leads", defaultUnit: "leads", hint: "Volume de leads captados" },
  { value: "meetings", label: "Reuniões", defaultUnit: "reuniões", hint: "Reuniões agendadas/realizadas" },
  { value: "sales", label: "Vendas", defaultUnit: "vendas", hint: "Vendas fechadas no período" },
  { value: "revenue", label: "Receita", defaultUnit: "BRL", hint: "Receita gerada" },
  { value: "traffic", label: "Tráfego", defaultUnit: "sessões", hint: "Visitas / sessões" },
  { value: "conversion_rate", label: "Taxa de conversão", defaultUnit: "%", hint: "Conversão de etapa" },
  { value: "cpl", label: "CPL", defaultUnit: "BRL", hint: "Custo por lead" },
  { value: "followers", label: "Seguidores", defaultUnit: "seguidores", hint: "Base social" },
  { value: "other", label: "Outra", defaultUnit: "", hint: "Métrica customizada" },
];

export const METRIC_SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "manual", label: "Manual / Operador" },
  { value: "client_report", label: "Relatório do cliente" },
  { value: "platform_export", label: "Export de plataforma" },
  { value: "screenshot", label: "Print / Screenshot" },
  { value: "other", label: "Outra" },
];

export function getMetricKeyLabel(k: string): string {
  return METRIC_KEY_OPTIONS.find((o) => o.value === k)?.label ?? k;
}

export function getMetricSourceLabel(s: string | null | undefined): string {
  if (!s) return "—";
  return METRIC_SOURCE_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function getDefaultUnitFor(k: string): string {
  return METRIC_KEY_OPTIONS.find((o) => o.value === k)?.defaultUnit ?? "";
}

/** Format value compactly for list display. */
export function formatMetricValue(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  let formatted: string;
  if (abs >= 1_000_000) formatted = (value / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  else if (abs >= 10_000) formatted = (value / 1_000).toFixed(1).replace(/\.?0+$/, "") + "k";
  else if (Number.isInteger(value)) formatted = value.toLocaleString("pt-BR");
  else formatted = value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  if (!unit) return formatted;
  if (unit === "%") return `${formatted}%`;
  if (unit === "BRL") return `R$ ${formatted}`;
  return `${formatted} ${unit}`;
}

/**
 * Compare last vs previous snapshot for the same metric_key.
 * Returns null when there is no comparable previous value.
 */
export interface MetricComparison {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
}

export function compareSnapshots(current: number | null, previous: number | null): MetricComparison | null {
  if (current === null || previous === null || current === undefined || previous === undefined) return null;
  const delta = current - previous;
  const deltaPct = previous === 0 ? null : (delta / Math.abs(previous)) * 100;
  const direction: MetricComparison["direction"] = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return { current, previous, delta, deltaPct, direction };
}
