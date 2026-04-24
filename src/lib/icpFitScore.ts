/**
 * icpFitScore — pontuação de qualificação do cliente (ICP fit).
 *
 * USO INTERNO APENAS — nunca expor ao cliente.
 * Avalia se o cliente tem perfil alinhado com a proposta Aceleriq (AI-first):
 *
 *  - Faturamento (30%): plano certo? capacidade de investimento?
 *  - Maturidade digital (20%): vai implementar rápido ou vai travar?
 *  - Prontidão para IA (20%): vai abraçar a proposta ou resistir?
 *  - Time/recursos (15%): tem quem execute do lado dele?
 *  - Contexto completo (15%): cliente engajado e disposto a colaborar?
 *
 * Gera score 0-100 + insights + flags vermelhas se houver.
 * Também identifica se o cliente está no PLANO CERTO para o perfil.
 */
import type { PlanKey } from "./planConfig";

export interface ICPSignals {
  revenue_range?: string;    // "Até R$ 20k/mês" ... "R$ 5M+/mês"
  team_size?: string;        // "Solo (1 pessoa)" ... "200+"
  maturity_digital?: string; // "baixa" | "media" | "alta"
  ai_readiness?: string;     // "baixa" | "media" | "alta"
  positioning?: string;
  differential?: string;
  icp?: string;
  main_pains?: string;
  goals_12m?: string;
  success_metric?: string;
  currentPlan?: PlanKey | null;
}

export interface ICPFitScore {
  score: number;
  level: "ideal" | "good" | "moderate" | "red_flag" | "no_data";
  dimensions: {
    revenue: number;
    maturity: number;
    ai: number;
    team: number;
    commitment: number;
  };
  insights: string[];
  redFlags: string[];
  /** Plano recomendado baseado no perfil */
  recommendedPlan: PlanKey | null;
  /** Está no plano certo? */
  planMatchStatus: "match" | "upgrade_available" | "downgrade_needed" | "unknown";
}

// ═══ Scoring das faixas ═══

const REVENUE_SCORE: Record<string, number> = {
  "Até R$ 20k/mês": 20,
  "R$ 20k-50k/mês": 35,
  "R$ 50k-200k/mês": 55,
  "R$ 200k-500k/mês": 75,
  "R$ 500k-1M/mês": 85,
  "R$ 1M-5M/mês": 95,
  "R$ 5M+/mês": 100,
};

const TEAM_SCORE: Record<string, number> = {
  "Solo (1 pessoa)": 30,
  "2-5 pessoas": 50,
  "6-15 pessoas": 75,
  "16-50 pessoas": 90,
  "51-200 pessoas": 95,
  "200+": 100,
};

const LEVEL_SCORE: Record<string, number> = {
  baixa: 30,
  media: 65,
  alta: 95,
};

// ═══ Plano recomendado por faturamento ═══

function recommendPlanByRevenue(revenue: string | undefined): PlanKey | null {
  if (!revenue) return null;
  if (revenue.includes("Até R$ 20k") || revenue.includes("20k-50k") || revenue.includes("50k-200k")) {
    return "starter";
  }
  if (revenue.includes("200k-500k") || revenue.includes("500k-1M")) {
    return "growth";
  }
  if (revenue.includes("1M-5M") || revenue.includes("5M+")) {
    return "enterprise";
  }
  return null;
}

const PLAN_ORDER: PlanKey[] = ["starter", "growth", "enterprise"];

function comparePlans(current: PlanKey | null | undefined, recommended: PlanKey | null): ICPFitScore["planMatchStatus"] {
  if (!current || !recommended) return "unknown";
  if (current === recommended) return "match";
  const currentIdx = PLAN_ORDER.indexOf(current);
  const recommendedIdx = PLAN_ORDER.indexOf(recommended);
  if (currentIdx < recommendedIdx) return "upgrade_available"; // cliente poderia pagar plano maior
  return "downgrade_needed"; // cliente num plano caro demais pro perfil
}

// ═══ Cálculo principal ═══

export function calculateICPFitScore(signals: ICPSignals): ICPFitScore {
  const dimensions = {
    revenue: 0, maturity: 0, ai: 0, team: 0, commitment: 0,
  };

  const insights: string[] = [];
  const redFlags: string[] = [];

  // ── Revenue (30%) ──
  if (signals.revenue_range) {
    dimensions.revenue = REVENUE_SCORE[signals.revenue_range] ?? 40;
    if (dimensions.revenue >= 80) insights.push(`Faturamento robusto (${signals.revenue_range}) — capacidade de investimento alta`);
    else if (dimensions.revenue < 40) redFlags.push(`Faturamento baixo (${signals.revenue_range}) — capacidade de pagamento limitada`);
  } else {
    redFlags.push("Faixa de faturamento não informada");
  }

  // ── Maturity (20%) ──
  if (signals.maturity_digital) {
    dimensions.maturity = LEVEL_SCORE[signals.maturity_digital] ?? 50;
    if (signals.maturity_digital === "alta") insights.push("Maturidade digital alta — implementação rápida");
    else if (signals.maturity_digital === "baixa") redFlags.push("Maturidade digital baixa — implementação tende a ser lenta, muito hand-holding");
  }

  // ── AI readiness (20%) ──
  if (signals.ai_readiness) {
    dimensions.ai = LEVEL_SCORE[signals.ai_readiness] ?? 50;
    if (signals.ai_readiness === "alta") insights.push("Já usa IA no negócio — ideal para proposta AI-first");
    else if (signals.ai_readiness === "baixa") redFlags.push("Nunca usou IA — pode resistir à proposta AI-first, exigir educação");
  }

  // ── Team (15%) ──
  if (signals.team_size) {
    dimensions.team = TEAM_SCORE[signals.team_size] ?? 50;
    if (dimensions.team >= 80) insights.push(`Time estruturado (${signals.team_size}) — tem quem execute internamente`);
    else if (signals.team_size === "Solo (1 pessoa)") redFlags.push("Cliente solo — risco de sobrecarga e implementação inconsistente");
  }

  // ── Commitment (15%) — completude do briefing ──
  const commitmentFields = [
    signals.positioning, signals.differential, signals.icp,
    signals.main_pains, signals.goals_12m, signals.success_metric,
  ].filter(f => f && f.toString().trim().length > 20);
  dimensions.commitment = (commitmentFields.length / 6) * 100;
  if (dimensions.commitment >= 80) insights.push("Briefing bem preenchido — cliente engajado e com clareza estratégica");
  else if (dimensions.commitment < 50) redFlags.push("Briefing incompleto — pouca clareza estratégica pode causar retrabalho");

  // ═══ Score final ponderado ═══
  const score = Math.round(
    dimensions.revenue * 0.30 +
    dimensions.maturity * 0.20 +
    dimensions.ai * 0.20 +
    dimensions.team * 0.15 +
    dimensions.commitment * 0.15
  );

  // No data check
  const hasMinimal = !!(signals.revenue_range || signals.team_size || signals.maturity_digital);
  if (!hasMinimal) {
    return {
      score: 0,
      level: "no_data",
      dimensions, insights,
      redFlags: ["Preencha o Briefing Essencial do cliente para calcular o ICP-fit."],
      recommendedPlan: null,
      planMatchStatus: "unknown",
    };
  }

  const level: ICPFitScore["level"] =
    score >= 80 ? "ideal"
    : score >= 60 ? "good"
    : score >= 40 ? "moderate"
    : "red_flag";

  const recommendedPlan = recommendPlanByRevenue(signals.revenue_range);
  const planMatchStatus = comparePlans(signals.currentPlan, recommendedPlan);

  // Adiciona insight sobre plano
  if (planMatchStatus === "match") {
    insights.push("Cliente no plano adequado para seu perfil");
  } else if (planMatchStatus === "upgrade_available") {
    insights.push(`Perfil suporta upgrade para ${recommendedPlan === "growth" ? "Aceleração" : "Escala IA-First"} — oportunidade de upsell`);
  } else if (planMatchStatus === "downgrade_needed") {
    redFlags.push(`Cliente em plano ${signals.currentPlan} mas perfil sugere ${recommendedPlan} — pode churnar por achar caro`);
  }

  return { score, level, dimensions, insights, redFlags, recommendedPlan, planMatchStatus };
}

export function getICPLevelLabel(level: ICPFitScore["level"]): string {
  return {
    no_data: "Sem dados",
    red_flag: "Perfil ruim",
    moderate: "Perfil moderado",
    good: "Bom perfil",
    ideal: "Cliente ideal",
  }[level];
}

export function getICPLevelColor(level: ICPFitScore["level"]): string {
  return {
    no_data: "#6B7280",
    red_flag: "#DC2626",
    moderate: "#F59E0B",
    good: "#60A5FA",
    ideal: "#10B981",
  }[level];
}

export function getPlanDisplayName(plan: PlanKey | null): string {
  if (!plan) return "—";
  return { starter: "Fundação", growth: "Aceleração", enterprise: "Escala IA-First" }[plan];
}
