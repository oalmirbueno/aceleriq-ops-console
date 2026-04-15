/**
 * Task Planning Engine — generates task suggestions from combined context signals.
 *
 * Uses deterministic, auditable rules based on:
 * - Selected context entries (types + content)
 * - Gap analysis answers
 * - Selected A.C.E.L.E.R.A stage
 *
 * No AI dependency. All rules are explicit.
 */

import { resolveSourceIds } from "./taskGenerationRules";
import type { ContextType } from "./contextTypes";

/* ─── Types ─── */

export interface PlanningContext {
  id: string;
  context_type: string;
  title: string;
  content: string;
  is_key_decision: boolean;
  happened_at: string | null;
  tags: string[];
  metadata?: Record<string, unknown> | null;
}

export interface GapAnswers {
  missingAccess: boolean;
  unclearObjective: boolean;
  mainBottleneck: boolean;
  pendingDecision: boolean;
  diagnosticGap: boolean;
  needsStructure: boolean;
  commercialUrgency: boolean;
  technicalSetup: boolean;
}

export const GAP_QUESTIONS: { key: keyof GapAnswers; label: string }[] = [
  { key: "missingAccess", label: "Faltam acessos importantes?" },
  { key: "unclearObjective", label: "Falta clareza de objetivo?" },
  { key: "mainBottleneck", label: "Existe gargalo principal identificado?" },
  { key: "pendingDecision", label: "Existe decisão importante pendente de execução?" },
  { key: "diagnosticGap", label: "Existe lacuna de diagnóstico?" },
  { key: "needsStructure", label: "Existe necessidade de estruturação inicial?" },
  { key: "commercialUrgency", label: "Existe urgência comercial?" },
  { key: "technicalSetup", label: "Existe necessidade de implantação técnica?" },
];

export const DEFAULT_GAPS: GapAnswers = {
  missingAccess: false,
  unclearObjective: false,
  mainBottleneck: false,
  pendingDecision: false,
  diagnosticGap: false,
  needsStructure: false,
  commercialUrgency: false,
  technicalSetup: false,
};

export const ACELERA_STAGES = [
  { key: "A", label: "A — Abertura Estratégica", stage: "entrada" },
  { key: "C", label: "C — Diagnóstico Estrutural", stage: "diagnostico" },
  { key: "E1", label: "E — Arquitetura Base da Operação", stage: "estrutura_base" },
  { key: "L", label: "L — Plano Diretor de Implantação", stage: "planejamento" },
  { key: "E2", label: "E — Implantação e Construção", stage: "producao" },
  { key: "R", label: "R — Ativação Assistida", stage: "ativacao" },
  { key: "A2", label: "A — Otimização e Escala", stage: "otimizacao" },
] as const;

export type AceleraStageKey = (typeof ACELERA_STAGES)[number]["key"];

/* ─── Synthesis builder ─── */

export interface SynthesisBlock {
  label: string;
  items: string[];
}

export function buildSynthesis(contexts: PlanningContext[]): SynthesisBlock[] {
  const blocks: SynthesisBlock[] = [];

  const byType = (type: string) => contexts.filter((c) => c.context_type === type);

  const briefings = byType("briefing");
  const dores = byType("dor");
  const objetivos = byType("objetivo");
  const decisoes = byType("decisao");
  const acessos = byType("acesso");
  const diagnosticos = byType("diagnostico");
  const outros = contexts.filter((c) =>
    !["briefing", "dor", "objetivo", "decisao", "acesso", "diagnostico"].includes(c.context_type)
  );

  if (briefings.length > 0) {
    blocks.push({ label: "Visão geral", items: briefings.map((c) => c.title + (c.content ? ` — ${c.content.slice(0, 120)}` : "")) });
  }
  if (dores.length > 0) {
    blocks.push({ label: "Dores principais", items: dores.map((c) => c.title) });
  }
  if (objetivos.length > 0) {
    blocks.push({ label: "Objetivos", items: objetivos.map((c) => c.title) });
  }
  if (decisoes.length > 0) {
    blocks.push({ label: "Decisões tomadas", items: decisoes.map((c) => c.title) });
  }
  if (acessos.length > 0) {
    blocks.push({ label: "Acessos", items: acessos.map((c) => c.title) });
  }
  if (diagnosticos.length > 0) {
    blocks.push({ label: "Diagnóstico", items: diagnosticos.map((c) => c.title + (c.content ? ` — ${c.content.slice(0, 120)}` : "")) });
  }
  if (outros.length > 0) {
    blocks.push({ label: "Outras anotações", items: outros.map((c) => `[${c.context_type}] ${c.title}`) });
  }

  return blocks;
}

/* ─── Task suggestion ─── */

export interface PlannedTaskSuggestion {
  title: string;
  description: string;
  priority: string;
  stage: string;
  ruleKeys: string[];
  generatedFrom: string;
}

interface RuleInput {
  contexts: PlanningContext[];
  gaps: GapAnswers;
  aceleraStage: AceleraStageKey;
}

/**
 * Combination rules — each checks conditions and emits 0-1 task.
 * All rules are explicit and auditable.
 */
const COMBINATION_RULES: Array<{
  key: string;
  test: (input: RuleInput) => boolean;
  emit: (input: RuleInput) => Omit<PlannedTaskSuggestion, "ruleKeys">;
}> = [
  // briefing + objetivo → alinhamento estratégico
  {
    key: "briefing_objetivo_align",
    test: ({ contexts }) => has(contexts, "briefing") && has(contexts, "objetivo"),
    emit: ({ contexts }) => ({
      title: "Alinhamento estratégico inicial",
      description: `Alinhar briefing e objetivos: ${titles(contexts, "briefing")} + ${titles(contexts, "objetivo")}`,
      priority: "high",
      stage: "planejamento",
      generatedFrom: "briefing+objetivo",
    }),
  },
  // diagnostico + dor → ataque ao gargalo
  {
    key: "diagnostico_dor_bottleneck",
    test: ({ contexts }) => has(contexts, "diagnostico") && has(contexts, "dor"),
    emit: ({ contexts }) => ({
      title: "Atacar gargalo principal",
      description: `Resolver dor com base no diagnóstico: ${titles(contexts, "dor")} | Diagnóstico: ${titles(contexts, "diagnostico")}`,
      priority: "high",
      stage: "diagnostico",
      generatedFrom: "diagnostico+dor",
    }),
  },
  // decisao + acesso → execução dependente de acesso
  {
    key: "decisao_acesso_exec",
    test: ({ contexts }) => has(contexts, "decisao") && has(contexts, "acesso"),
    emit: ({ contexts }) => ({
      title: "Executar decisão com acesso pendente",
      description: `Decisão: ${titles(contexts, "decisao")} | Acessos: ${titles(contexts, "acesso")}`,
      priority: "high",
      stage: "",
      generatedFrom: "decisao+acesso",
    }),
  },
  // briefing + diagnostico + objetivo → estruturação inicial
  {
    key: "briefing_diag_obj_structure",
    test: ({ contexts }) => has(contexts, "briefing") && has(contexts, "diagnostico") && has(contexts, "objetivo"),
    emit: () => ({
      title: "Estruturação inicial do projeto",
      description: "Montar estrutura base com base no briefing, diagnóstico e objetivos definidos.",
      priority: "high",
      stage: "estrutura_base",
      generatedFrom: "briefing+diagnostico+objetivo",
    }),
  },
  // Single decisao → executar decisão
  {
    key: "decisao_single",
    test: ({ contexts }) => has(contexts, "decisao") && !has(contexts, "acesso"),
    emit: ({ contexts }) => ({
      title: `Executar: ${first(contexts, "decisao")?.title ?? "decisão"}`,
      description: `Ação derivada da decisão: ${titles(contexts, "decisao")}`,
      priority: "high",
      stage: "",
      generatedFrom: "decisao",
    }),
  },
  // Single diagnostico → resolver diagnóstico
  {
    key: "diagnostico_single",
    test: ({ contexts }) => has(contexts, "diagnostico") && !has(contexts, "dor"),
    emit: ({ contexts }) => ({
      title: `Resolver: ${first(contexts, "diagnostico")?.title ?? "diagnóstico"}`,
      description: `Correção baseada no diagnóstico: ${titles(contexts, "diagnostico")}`,
      priority: "high",
      stage: "diagnostico",
      generatedFrom: "diagnostico",
    }),
  },
  // Single dor → tratar dor
  {
    key: "dor_single",
    test: ({ contexts }) => has(contexts, "dor") && !has(contexts, "diagnostico"),
    emit: ({ contexts }) => ({
      title: `Tratar: ${first(contexts, "dor")?.title ?? "dor"}`,
      description: `Ação para resolver: ${titles(contexts, "dor")}`,
      priority: "medium",
      stage: "",
      generatedFrom: "dor",
    }),
  },
  // Single objetivo → planejar
  {
    key: "objetivo_single",
    test: ({ contexts }) => has(contexts, "objetivo") && !has(contexts, "briefing"),
    emit: ({ contexts }) => ({
      title: `Planejar: ${first(contexts, "objetivo")?.title ?? "objetivo"}`,
      description: `Planejamento: ${titles(contexts, "objetivo")}`,
      priority: "medium",
      stage: "planejamento",
      generatedFrom: "objetivo",
    }),
  },
  // Gap: missing access
  {
    key: "gap_missing_access",
    test: ({ gaps }) => gaps.missingAccess,
    emit: () => ({
      title: "Coletar e validar acessos pendentes",
      description: "Identificar e obter todos os acessos necessários para prosseguir com o projeto.",
      priority: "high",
      stage: "entrada",
      generatedFrom: "gap_analysis",
    }),
  },
  // Gap: unclear objective
  {
    key: "gap_unclear_objective",
    test: ({ gaps }) => gaps.unclearObjective,
    emit: () => ({
      title: "Alinhar objetivos e direcionamento estratégico",
      description: "Definir claramente metas, oferta e funil do projeto.",
      priority: "high",
      stage: "planejamento",
      generatedFrom: "gap_analysis",
    }),
  },
  // Gap: main bottleneck
  {
    key: "gap_bottleneck",
    test: ({ gaps }) => gaps.mainBottleneck,
    emit: () => ({
      title: "Resolver gargalo principal identificado",
      description: "Priorizar e remover o bloqueio mais crítico do projeto.",
      priority: "urgent",
      stage: "diagnostico",
      generatedFrom: "gap_analysis",
    }),
  },
  // Gap: pending decision
  {
    key: "gap_pending_decision",
    test: ({ gaps }) => gaps.pendingDecision,
    emit: () => ({
      title: "Executar decisão pendente prioritária",
      description: "Implementar decisão importante que aguarda execução.",
      priority: "high",
      stage: "",
      generatedFrom: "gap_analysis",
    }),
  },
  // Gap: diagnostic gap
  {
    key: "gap_diagnostic",
    test: ({ gaps }) => gaps.diagnosticGap,
    emit: () => ({
      title: "Completar diagnóstico do projeto",
      description: "Investigar lacunas no diagnóstico antes de planejar próximos passos.",
      priority: "medium",
      stage: "diagnostico",
      generatedFrom: "gap_analysis",
    }),
  },
  // Gap: needs structure
  {
    key: "gap_structure",
    test: ({ gaps }) => gaps.needsStructure,
    emit: () => ({
      title: "Montar estruturação base do projeto",
      description: "Criar fundação operacional antes de avançar para produção.",
      priority: "medium",
      stage: "estrutura_base",
      generatedFrom: "gap_analysis",
    }),
  },
  // Gap: commercial urgency
  {
    key: "gap_commercial",
    test: ({ gaps }) => gaps.commercialUrgency,
    emit: () => ({
      title: "Ação comercial urgente",
      description: "Priorizar entrega de impacto comercial imediato.",
      priority: "urgent",
      stage: "ativacao",
      generatedFrom: "gap_analysis",
    }),
  },
  // Gap: technical setup
  {
    key: "gap_technical",
    test: ({ gaps }) => gaps.technicalSetup,
    emit: () => ({
      title: "Implantação técnica necessária",
      description: "Configurar ferramentas, integrações ou infraestrutura técnica.",
      priority: "medium",
      stage: "estrutura_base",
      generatedFrom: "gap_analysis",
    }),
  },
];

/* ─── Helpers ─── */

function has(contexts: PlanningContext[], type: string): boolean {
  return contexts.some((c) => c.context_type === type);
}

function first(contexts: PlanningContext[], type: string): PlanningContext | undefined {
  return contexts.find((c) => c.context_type === type);
}

function titles(contexts: PlanningContext[], type: string): string {
  return contexts
    .filter((c) => c.context_type === type)
    .map((c) => c.title)
    .join(", ");
}

/* ─── Main generation function ─── */

export function generatePlannedTasks(
  contexts: PlanningContext[],
  gaps: GapAnswers,
  aceleraStage: AceleraStageKey
): PlannedTaskSuggestion[] {
  const input: RuleInput = { contexts, gaps, aceleraStage };
  const suggestions: PlannedTaskSuggestion[] = [];
  const usedKeys = new Set<string>();

  // Find the pipeline stage for the chosen ACELERA stage
  const aceleraInfo = ACELERA_STAGES.find((s) => s.key === aceleraStage);
  const defaultStage = aceleraInfo?.stage ?? "";

  for (const rule of COMBINATION_RULES) {
    if (rule.test(input)) {
      const suggestion = rule.emit(input);
      // Deduplicate by key
      if (!usedKeys.has(rule.key)) {
        usedKeys.add(rule.key);
        suggestions.push({
          ...suggestion,
          stage: suggestion.stage || defaultStage,
          ruleKeys: [rule.key],
        });
      }
    }
  }

  // Boost priority for tasks matching the ACELERA stage
  if (aceleraInfo) {
    for (const s of suggestions) {
      if (s.stage === aceleraInfo.stage && s.priority === "medium") {
        s.priority = "high";
      }
    }
  }

  // Sort: urgent > high > medium > low
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  suggestions.sort((a, b) => (priorityOrder[a.priority] ?? 9) - (priorityOrder[b.priority] ?? 9));

  return suggestions;
}

/* ─── Source resolution (reuses existing logic) ─── */

export function resolveSourceForPlanning(contexts: PlanningContext[]) {
  return resolveSourceIds(contexts as any);
}
