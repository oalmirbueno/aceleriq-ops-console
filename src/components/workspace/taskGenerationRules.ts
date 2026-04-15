/**
 * Task generation rules from context entries.
 *
 * Rules are explicit, auditable, and type-driven.
 * Generic types (anotacao, reuniao, transcricao) are excluded by default.
 */

import type { ContextType } from "./contextTypes";

export interface GeneratedTaskSuggestion {
  title: string;
  description: string;
  priority: string;
  stage: string;
  sourceContextId: string;
  relatedContextIds: string[];
  ruleKey: string;
  generatedFrom: string; // context_type that triggered this
}

interface ContextEntry {
  id: string;
  context_type: string;
  title: string;
  content: string;
  is_key_decision: boolean;
}

/** Types that generate tasks by default */
const GENERATIVE_TYPES: ContextType[] = [
  "decisao",
  "diagnostico",
  "dor",
  "objetivo",
  "briefing",
  "acesso",
];

/** Types that are generic and only generate if explicitly included */
const GENERIC_TYPES: ContextType[] = ["anotacao", "reuniao", "transcricao"];

/** Priority order for choosing source_id when multiple contexts are selected */
const SOURCE_PRIORITY: ContextType[] = [
  "decisao",
  "diagnostico",
  "dor",
  "objetivo",
  "briefing",
  "acesso",
];

interface RuleDef {
  ruleKey: string;
  titleTemplate: (ctx: ContextEntry) => string;
  descriptionTemplate: (ctx: ContextEntry) => string;
  priority: string;
  stage: string;
}

const RULES_BY_TYPE: Partial<Record<ContextType, RuleDef>> = {
  decisao: {
    ruleKey: "decisao_action",
    titleTemplate: (ctx) => `Executar decisão: ${ctx.title}`,
    descriptionTemplate: (ctx) => `Ação derivada da decisão "${ctx.title}". ${ctx.content.slice(0, 200)}`,
    priority: "high",
    stage: "",
  },
  diagnostico: {
    ruleKey: "diagnostico_fix",
    titleTemplate: (ctx) => `Resolver: ${ctx.title}`,
    descriptionTemplate: (ctx) => `Correção baseada no diagnóstico "${ctx.title}". ${ctx.content.slice(0, 200)}`,
    priority: "high",
    stage: "diagnostico",
  },
  dor: {
    ruleKey: "dor_resolve",
    titleTemplate: (ctx) => `Tratar dor: ${ctx.title}`,
    descriptionTemplate: (ctx) => `Ação para resolver a dor "${ctx.title}". ${ctx.content.slice(0, 200)}`,
    priority: "medium",
    stage: "",
  },
  objetivo: {
    ruleKey: "objetivo_plan",
    titleTemplate: (ctx) => `Planejar: ${ctx.title}`,
    descriptionTemplate: (ctx) => `Planejamento do objetivo "${ctx.title}". ${ctx.content.slice(0, 200)}`,
    priority: "medium",
    stage: "planejamento",
  },
  briefing: {
    ruleKey: "briefing_setup",
    titleTemplate: (ctx) => `Configurar a partir do briefing: ${ctx.title}`,
    descriptionTemplate: (ctx) => `Setup baseado no briefing "${ctx.title}". ${ctx.content.slice(0, 200)}`,
    priority: "medium",
    stage: "entrada",
  },
  acesso: {
    ruleKey: "acesso_verify",
    titleTemplate: (ctx) => `Verificar acesso: ${ctx.title}`,
    descriptionTemplate: (ctx) => `Validar e documentar o acesso "${ctx.title}". ${ctx.content.slice(0, 200)}`,
    priority: "low",
    stage: "",
  },
};

/** Generic rule for anotacao/reuniao/transcricao (opt-in only) */
const GENERIC_RULE: RuleDef = {
  ruleKey: "generic_followup",
  titleTemplate: (ctx) => `Acompanhar: ${ctx.title}`,
  descriptionTemplate: (ctx) => `Follow-up de "${ctx.title}". ${ctx.content.slice(0, 200)}`,
  priority: "low",
  stage: "",
};

/**
 * Determine the primary source_id from a list of contexts, using priority order.
 * Returns { sourceId, relatedIds }.
 */
export function resolveSourceIds(contexts: ContextEntry[]): {
  sourceId: string;
  relatedIds: string[];
} {
  if (contexts.length === 1) {
    return { sourceId: contexts[0].id, relatedIds: [] };
  }

  // Sort by priority
  const sorted = [...contexts].sort((a, b) => {
    const ai = SOURCE_PRIORITY.indexOf(a.context_type as ContextType);
    const bi = SOURCE_PRIORITY.indexOf(b.context_type as ContextType);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });

  const sourceId = sorted[0].id;
  const relatedIds = sorted.slice(1).map((c) => c.id);
  return { sourceId, relatedIds };
}

/**
 * Generate task suggestions from selected context entries.
 * @param contexts - selected context entries
 * @param includeGeneric - whether to include anotacao/reuniao/transcricao
 */
export function generateTaskSuggestions(
  contexts: ContextEntry[],
  includeGeneric: boolean = false
): GeneratedTaskSuggestion[] {
  const { sourceId, relatedIds } = resolveSourceIds(contexts);
  const suggestions: GeneratedTaskSuggestion[] = [];

  for (const ctx of contexts) {
    const ctxType = ctx.context_type as ContextType;

    // Skip generic types unless explicitly included
    if (GENERIC_TYPES.includes(ctxType) && !includeGeneric) {
      continue;
    }

    const rule = RULES_BY_TYPE[ctxType] ?? (includeGeneric ? GENERIC_RULE : null);
    if (!rule) continue;

    suggestions.push({
      title: rule.titleTemplate(ctx),
      description: rule.descriptionTemplate(ctx),
      priority: rule.priority,
      stage: rule.stage,
      sourceContextId: sourceId,
      relatedContextIds: relatedIds,
      ruleKey: rule.ruleKey,
      generatedFrom: ctx.context_type,
    });
  }

  return suggestions;
}

export { GENERATIVE_TYPES, GENERIC_TYPES };
