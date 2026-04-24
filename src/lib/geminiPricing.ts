/**
 * geminiPricing — preços reais e metadados dos modelos Gemini (abril 2026).
 *
 * Fonte: https://ai.google.dev/pricing — validado em 24/04/2026.
 *
 * Preços em USD por 1 milhão de tokens.
 * Free tier indica os limites gratuitos (RPM = requests/minuto, RPD = requests/dia).
 */

export interface GeminiModelPricing {
  id: string;
  displayName: string;
  tier: "pro" | "flash" | "lite" | "exp";
  /** Geração (3.x, 2.5, etc) */
  generation: string;
  /** Preço input em USD por 1M tokens */
  inputPrice: number;
  /** Preço output em USD por 1M tokens */
  outputPrice: number;
  /** Disponível no free tier */
  freeTier: boolean;
  /** Requests por minuto no free tier (null = não disponível) */
  freeRpm: number | null;
  /** Requests por dia no free tier */
  freeRpd: number | null;
  /** Recomendado como default pro Aceleriq */
  recommended: boolean;
  /** Descrição curta do uso ideal */
  bestFor: string;
  /** Se está deprecated */
  deprecated: boolean;
}

/**
 * Lista curada de modelos estáveis e confirmados no abril/2026.
 * Preços em USD por 1M tokens.
 */
export const GEMINI_MODELS: GeminiModelPricing[] = [
  // ═══ Geração 2.5 — ESTÁVEL + FREE TIER ═══
  {
    id: "gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash-Lite",
    tier: "lite",
    generation: "2.5",
    inputPrice: 0.10,
    outputPrice: 0.40,
    freeTier: true,
    freeRpm: 15,
    freeRpd: 1000,
    recommended: false,
    bestFor: "Tarefas simples em volume alto",
    deprecated: false,
  },
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    tier: "flash",
    generation: "2.5",
    inputPrice: 0.30,
    outputPrice: 2.50,
    freeTier: true,
    freeRpm: 10,
    freeRpd: 250,
    recommended: true, // ⭐ Default pra chat do dia-a-dia
    bestFor: "Equilíbrio entre qualidade e velocidade",
    deprecated: false,
  },
  {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    tier: "pro",
    generation: "2.5",
    inputPrice: 1.25,
    outputPrice: 10.00,
    freeTier: true,
    freeRpm: 5,
    freeRpd: 100,
    recommended: false,
    bestFor: "Análise profunda e raciocínio complexo",
    deprecated: false,
  },

  // ═══ Geração 3.x — PREVIEW ═══
  {
    id: "gemini-3-flash-preview",
    displayName: "Gemini 3 Flash Preview",
    tier: "flash",
    generation: "3",
    inputPrice: 0.50,
    outputPrice: 3.00,
    freeTier: false, // Preview precisa pagamento
    freeRpm: null,
    freeRpd: null,
    recommended: false,
    bestFor: "Frontier + velocidade (requer billing ativado)",
    deprecated: false,
  },
  {
    id: "gemini-3.1-pro-preview",
    displayName: "Gemini 3.1 Pro Preview",
    tier: "pro",
    generation: "3.1",
    inputPrice: 2.00,
    outputPrice: 12.00,
    freeTier: false,
    freeRpm: null,
    freeRpd: null,
    recommended: false,
    bestFor: "Reasoning top de linha (requer billing ativado)",
    deprecated: false,
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    displayName: "Gemini 3.1 Flash-Lite Preview",
    tier: "lite",
    generation: "3.1",
    inputPrice: 0.10,
    outputPrice: 0.40,
    freeTier: false,
    freeRpm: null,
    freeRpd: null,
    recommended: false,
    bestFor: "Volume alto (requer billing ativado)",
    deprecated: false,
  },

  // ═══ DEPRECATED — alertar usuário ═══
  {
    id: "gemini-2.0-flash",
    displayName: "Gemini 2.0 Flash (DEPRECATED)",
    tier: "flash",
    generation: "2.0",
    inputPrice: 0.10,
    outputPrice: 0.40,
    freeTier: false,
    freeRpm: null,
    freeRpd: null,
    recommended: false,
    bestFor: "⚠️ DEPRECATED em março/2026, desligado em setembro/2026",
    deprecated: true,
  },
];

export function getModelPricing(modelId: string): GeminiModelPricing | undefined {
  // Normaliza (remove "models/" prefix se vier da API)
  const clean = modelId.replace(/^models\//, "");
  return GEMINI_MODELS.find((m) => m.id === clean);
}

/**
 * Calcula custo em USD baseado em tokens de input e output.
 */
export function calculateCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): { cost: number; currency: "USD" } {
  const model = getModelPricing(modelId);
  if (!model) return { cost: 0, currency: "USD" };

  const inputCost = (inputTokens / 1_000_000) * model.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * model.outputPrice;
  return { cost: inputCost + outputCost, currency: "USD" };
}

/**
 * Converte USD para BRL (taxa aproximada — usar como referência).
 * Atualizar manualmente quando taxa oscilar muito.
 */
export const USD_TO_BRL = 5.10;

export function formatCostBRL(costUSD: number): string {
  const brl = costUSD * USD_TO_BRL;
  if (brl < 0.01) return "< R$ 0,01";
  return `R$ ${brl.toFixed(brl < 1 ? 4 : 2)}`;
}

export function formatCostUSD(costUSD: number): string {
  if (costUSD < 0.001) return "< $0.001";
  return `$${costUSD.toFixed(costUSD < 0.01 ? 5 : 4)}`;
}

/**
 * Estima quantos clientes ativos uma única chave free tier suporta
 * antes de bater no RPD do modelo.
 */
export function estimateClientCapacity(modelId: string, avgRequestsPerClientPerDay = 50): number {
  const m = getModelPricing(modelId);
  if (!m?.freeTier || !m.freeRpd) return 0;
  return Math.floor(m.freeRpd / avgRequestsPerClientPerDay);
}
