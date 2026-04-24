/**
 * aiUsageCalc — agregação e formatação de consumo de IA.
 * Usado na aba "IA Management" pra mostrar custo por cliente, modelo, etc.
 */
import { calculateCost, formatCostUSD, formatCostBRL, type GeminiModelPricing } from "./geminiPricing";

export interface UsageLogEntry {
  id: string;
  client_id: string | null;
  workspace_id: string | null;
  feature: string;
  model_used: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  status: string;
  created_at: string;
}

export interface UsageAggregated {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { requests: number; tokens: number; costUsd: number }>;
  byClient: Record<string, { clientId: string | null; requests: number; tokens: number; costUsd: number }>;
  byFeature: Record<string, { requests: number; tokens: number; costUsd: number }>;
  errorRate: number;
}

export function aggregateUsage(entries: UsageLogEntry[]): UsageAggregated {
  const agg: UsageAggregated = {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0,
    byModel: {},
    byClient: {},
    byFeature: {},
    errorRate: 0,
  };

  let errors = 0;
  for (const e of entries) {
    agg.totalRequests++;
    agg.totalInputTokens += e.input_tokens ?? 0;
    agg.totalOutputTokens += e.output_tokens ?? 0;
    agg.totalCostUsd += e.cost_usd ?? 0;
    if (e.status === "error") errors++;

    const tokens = (e.input_tokens ?? 0) + (e.output_tokens ?? 0);

    // Por modelo
    if (!agg.byModel[e.model_used]) agg.byModel[e.model_used] = { requests: 0, tokens: 0, costUsd: 0 };
    agg.byModel[e.model_used].requests++;
    agg.byModel[e.model_used].tokens += tokens;
    agg.byModel[e.model_used].costUsd += e.cost_usd ?? 0;

    // Por cliente
    const ck = e.client_id ?? "unassigned";
    if (!agg.byClient[ck]) agg.byClient[ck] = { clientId: e.client_id, requests: 0, tokens: 0, costUsd: 0 };
    agg.byClient[ck].requests++;
    agg.byClient[ck].tokens += tokens;
    agg.byClient[ck].costUsd += e.cost_usd ?? 0;

    // Por feature
    if (!agg.byFeature[e.feature]) agg.byFeature[e.feature] = { requests: 0, tokens: 0, costUsd: 0 };
    agg.byFeature[e.feature].requests++;
    agg.byFeature[e.feature].tokens += tokens;
    agg.byFeature[e.feature].costUsd += e.cost_usd ?? 0;
  }

  agg.errorRate = agg.totalRequests > 0 ? errors / agg.totalRequests : 0;
  return agg;
}

/** Estima custo mensal baseado em consumo de X dias */
export function estimateMonthlyCost(costUsdForDays: number, days: number): number {
  if (days === 0) return 0;
  const dailyAvg = costUsdForDays / days;
  return dailyAvg * 30;
}

export { formatCostUSD, formatCostBRL };
