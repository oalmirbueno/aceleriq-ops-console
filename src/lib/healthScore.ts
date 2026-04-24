/**
 * healthScore — saúde operacional do cliente (0-100).
 *
 * USO INTERNO APENAS — nunca deve aparecer no portal do cliente.
 * É um sinal privado para o time detectar risco de churn antes.
 *
 * Combina 4 dimensões:
 *  - Atividade operacional (35%): nodes concluídos, tasks em andamento
 *  - Engajamento (25%): eventos recentes, cadência de atualizações
 *  - Contexto (20%): completude de briefing, entradas de contexto
 *  - Progresso (20%): avanço de etapa ACELERA, métricas capturadas
 *
 * Thresholds:
 *  - 80+ → saudável (verde)
 *  - 50-79 → atenção (amarelo, agendar check-in)
 *  - 25-49 → risco (laranja, ação urgente)
 *  - <25 → crítico (vermelho, intervenção imediata)
 */

export interface HealthSignals {
  // Nodes & tasks
  totalNodes: number;
  doneNodes: number;
  activeNodes: number;
  blockedNodes: number;
  overdueNodes: number;

  totalTasks: number;
  doneTasks: number;
  blockedTasks: number;

  // Engagement
  eventsLast7d: number;
  eventsLast30d: number;
  daysSinceLastEvent: number;

  // Context
  essentialBriefingPct: number; // 0-100
  contextEntries: number;
  briefingsCount: number;

  // Progress
  currentStageIndex: number; // 0-7
  totalStages: number;       // 8
  metricSnapshotsLast30d: number;
}

export interface HealthScore {
  score: number;
  level: "critical" | "at_risk" | "attention" | "healthy" | "no_data";
  dimensions: {
    activity: number;      // 0-100
    engagement: number;    // 0-100
    context: number;       // 0-100
    progress: number;      // 0-100
  };
  insights: string[]; // Pontos positivos e preocupações
  warnings: string[]; // Alertas vermelhos específicos
}

export function calculateHealthScore(s: HealthSignals): HealthScore {
  // ═══ ATIVIDADE (35%) ═══
  // Nodes concluídos, ausência de overdue/blocked
  const nodeProgress = s.totalNodes > 0 ? (s.doneNodes / s.totalNodes) : 0;
  const overduePenalty = s.totalNodes > 0 ? (s.overdueNodes / s.totalNodes) : 0;
  const blockedPenalty = s.totalNodes > 0 ? (s.blockedNodes / s.totalNodes) : 0;
  const taskActivity = s.totalTasks > 0 ? (s.doneTasks / s.totalTasks) : 0;

  let activity = (nodeProgress * 50) + (taskActivity * 50);
  activity -= overduePenalty * 30;   // overdue pune 30pts max
  activity -= blockedPenalty * 20;   // blocked pune 20pts max
  activity = Math.max(0, Math.min(100, activity));

  // ═══ ENGAJAMENTO (25%) ═══
  // Eventos recentes, cadência
  let engagement = 0;
  if (s.eventsLast7d >= 5) engagement += 40;
  else if (s.eventsLast7d >= 2) engagement += 25;
  else if (s.eventsLast7d >= 1) engagement += 10;
  // else: 0pts — silencioso é mau sinal

  if (s.eventsLast30d >= 20) engagement += 35;
  else if (s.eventsLast30d >= 10) engagement += 25;
  else if (s.eventsLast30d >= 5) engagement += 15;

  // Penalidade por tempo sem atividade
  if (s.daysSinceLastEvent > 14) engagement -= 30;
  else if (s.daysSinceLastEvent > 7) engagement -= 15;
  else if (s.daysSinceLastEvent <= 2) engagement += 25; // bônus por atividade muito recente

  engagement = Math.max(0, Math.min(100, engagement));

  // ═══ CONTEXTO (20%) ═══
  // Briefing completo + entradas de contexto suficientes
  let context = 0;
  context += s.essentialBriefingPct * 0.5;  // até 50pts
  if (s.contextEntries >= 10) context += 30;
  else if (s.contextEntries >= 5) context += 20;
  else if (s.contextEntries >= 2) context += 10;
  if (s.briefingsCount >= 2) context += 20;
  else if (s.briefingsCount >= 1) context += 10;
  context = Math.max(0, Math.min(100, context));

  // ═══ PROGRESSO (20%) ═══
  // Avanço no método ACELERA + métricas captadas
  let progress = 0;
  progress += (s.currentStageIndex / Math.max(s.totalStages - 1, 1)) * 60; // até 60pts
  if (s.metricSnapshotsLast30d >= 5) progress += 40;
  else if (s.metricSnapshotsLast30d >= 2) progress += 25;
  else if (s.metricSnapshotsLast30d >= 1) progress += 10;
  progress = Math.max(0, Math.min(100, progress));

  // ═══ FINAL SCORE (weighted) ═══
  const score = Math.round(
    activity * 0.35 +
    engagement * 0.25 +
    context * 0.20 +
    progress * 0.20
  );

  // No data check
  const hasData = s.totalNodes > 0 || s.totalTasks > 0 || s.contextEntries > 0;
  if (!hasData) {
    return {
      score: 0,
      level: "no_data",
      dimensions: { activity: 0, engagement: 0, context: 0, progress: 0 },
      insights: ["Cliente sem dados operacionais ainda — provavelmente recém-onboarding"],
      warnings: [],
    };
  }

  // Level
  const level: HealthScore["level"] =
    score >= 80 ? "healthy"
    : score >= 50 ? "attention"
    : score >= 25 ? "at_risk"
    : "critical";

  // ═══ INSIGHTS & WARNINGS ═══
  const insights: string[] = [];
  const warnings: string[] = [];

  if (activity >= 70) insights.push(`Atividade saudável — ${s.doneNodes}/${s.totalNodes} nodes concluídos`);
  if (engagement >= 70) insights.push(`Engajamento alto — ${s.eventsLast7d} eventos nos últimos 7 dias`);
  if (context >= 80) insights.push(`Contexto bem documentado (briefing ${Math.round(s.essentialBriefingPct)}%)`);
  if (progress >= 70) insights.push(`Avançando bem no método ACELERA`);

  if (s.overdueNodes > 0) warnings.push(`${s.overdueNodes} node${s.overdueNodes > 1 ? "s" : ""} com prazo vencido`);
  if (s.blockedNodes > 2) warnings.push(`${s.blockedNodes} nodes bloqueados — remover bloqueios`);
  if (s.daysSinceLastEvent > 14) warnings.push(`${s.daysSinceLastEvent} dias sem atividade — possível churn`);
  else if (s.daysSinceLastEvent > 7) warnings.push(`${s.daysSinceLastEvent} dias sem evento — agendar check-in`);
  if (s.essentialBriefingPct < 40) warnings.push(`Briefing Essencial incompleto (${Math.round(s.essentialBriefingPct)}%)`);
  if (s.metricSnapshotsLast30d === 0 && s.currentStageIndex >= 4) warnings.push(`Nenhum snapshot de métrica em 30d — sem dados de resultado`);

  return { score, level, dimensions: { activity, engagement, context, progress }, insights, warnings };
}

export function getHealthLevelColor(level: HealthScore["level"]): string {
  return {
    no_data: "#6B7280",
    critical: "#DC2626",
    at_risk: "#F97316",
    attention: "#F59E0B",
    healthy: "#10B981",
  }[level];
}

export function getHealthLevelLabel(level: HealthScore["level"]): string {
  return {
    no_data: "Sem dados",
    critical: "Crítico",
    at_risk: "Em risco",
    attention: "Atenção",
    healthy: "Saudável",
  }[level];
}
