/**
 * beforeAfter — lógica de comparação automática de métricas ao longo do tempo.
 *
 * Usa metric_snapshots (tabela existente) para derivar deltas automáticos:
 *  - Primeiro snapshot de cada métrica = baseline (o "antes")
 *  - Último snapshot = estado atual (o "depois")
 *  - Delta = current - baseline (com % e categorização)
 *
 * Essa lib NÃO escreve nada — só transforma snapshots em visão comparativa.
 */

export interface MetricSnapshot {
  id: string;
  metric_name: string;
  value: number;
  unit: string | null;
  notes: string | null;
  captured_at: string;
}

export interface BeforeAfterMetric {
  metric_name: string;
  unit: string | null;
  baseline: MetricSnapshot;
  current: MetricSnapshot;
  history: MetricSnapshot[];
  /** Diferença absoluta (current - baseline) */
  delta: number;
  /** Diferença percentual ((current - baseline) / baseline * 100) */
  deltaPct: number | null;
  /** Classificação do delta */
  status: "improved" | "stable" | "regressed" | "no_baseline";
  /** Dias entre baseline e current */
  daysBetween: number;
}

/**
 * Heurística: para algumas métricas, "menor é melhor" (ex: tempo, custo).
 * Deixo a decisão pro usuário via inverted flag. Por default assumo "maior é melhor".
 */
const INVERTED_HINTS = [
  "custo", "cost", "cpl", "cpa", "cpc", "tempo", "time",
  "ciclo", "churn", "bounce", "abandono", "spend por",
];

function isInverted(metricName: string): boolean {
  const lower = metricName.toLowerCase();
  return INVERTED_HINTS.some(h => lower.includes(h));
}

export function computeBeforeAfter(snapshots: MetricSnapshot[]): BeforeAfterMetric[] {
  // Agrupar por metric_name (case insensitive, trim)
  const byMetric = new Map<string, MetricSnapshot[]>();
  for (const s of snapshots) {
    const key = s.metric_name.trim().toLowerCase();
    if (!byMetric.has(key)) byMetric.set(key, []);
    byMetric.get(key)!.push(s);
  }

  const result: BeforeAfterMetric[] = [];

  for (const [_key, list] of byMetric) {
    if (list.length < 1) continue;

    // Ordenar por data asc
    const sorted = list.slice().sort((a, b) =>
      new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );

    const baseline = sorted[0];
    const current = sorted[sorted.length - 1];

    // Se só há 1 snapshot, não tem before/after ainda
    if (sorted.length < 2) {
      result.push({
        metric_name: baseline.metric_name,
        unit: baseline.unit,
        baseline,
        current: baseline,
        history: sorted,
        delta: 0,
        deltaPct: null,
        status: "no_baseline",
        daysBetween: 0,
      });
      continue;
    }

    const delta = current.value - baseline.value;
    const deltaPct = baseline.value !== 0 ? (delta / Math.abs(baseline.value)) * 100 : null;
    const daysBetween = Math.round(
      (new Date(current.captured_at).getTime() - new Date(baseline.captured_at).getTime()) / 86400000
    );

    // Status considera se métrica é invertida (ex: custo, menor é melhor)
    const inverted = isInverted(current.metric_name);
    let status: BeforeAfterMetric["status"];
    if (Math.abs(deltaPct ?? 0) < 2) {
      status = "stable";
    } else if ((delta > 0 && !inverted) || (delta < 0 && inverted)) {
      status = "improved";
    } else {
      status = "regressed";
    }

    result.push({
      metric_name: current.metric_name,
      unit: current.unit,
      baseline, current, history: sorted,
      delta, deltaPct, status, daysBetween,
    });
  }

  // Ordena: improved primeiro (pra destacar ganhos), depois stable, depois regressed
  const order = { improved: 0, stable: 1, no_baseline: 2, regressed: 3 };
  result.sort((a, b) => order[a.status] - order[b.status]);

  return result;
}

export function formatDeltaValue(m: BeforeAfterMetric): string {
  const sign = m.delta > 0 ? "+" : "";
  const unit = m.unit ? ` ${m.unit}` : "";
  return `${sign}${m.delta.toFixed(2).replace(/\.?0+$/, "")}${unit}`;
}

export function formatDeltaPct(m: BeforeAfterMetric): string | null {
  if (m.deltaPct === null) return null;
  const sign = m.deltaPct > 0 ? "+" : "";
  return `${sign}${m.deltaPct.toFixed(1)}%`;
}

export function getBeforeAfterStatusColor(status: BeforeAfterMetric["status"]): string {
  return {
    improved: "#10B981",
    stable: "#60A5FA",
    regressed: "#EF4444",
    no_baseline: "#6B7280",
  }[status];
}

export function getBeforeAfterStatusLabel(status: BeforeAfterMetric["status"]): string {
  return {
    improved: "Melhorou",
    stable: "Estável",
    regressed: "Piorou",
    no_baseline: "Sem baseline",
  }[status];
}
