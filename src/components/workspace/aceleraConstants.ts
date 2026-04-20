/**
 * A.C.E.L.E.R.A Method — Premium labels and plan definitions.
 * Internal keys match the existing pipeline_stage_key enum in the database.
 * Only the presentation layer changes.
 */

/* ─── Pipeline Stage Premium Labels ─── */

export const PIPELINE_STAGE_LABELS: Record<string, string> = {
  entrada: "Abertura Estratégica",
  diagnostico: "Diagnóstico Estrutural",
  estrutura_base: "Arquitetura Base da Operação",
  planejamento: "Plano Diretor de Implantação",
  producao: "Implantação e Construção",
  ativacao: "Ativação Assistida",
  otimizacao: "Otimização Guiada por Evidência",
  expansao: "Escala e Alavancagem",
};

export const PIPELINE_STAGES_ORDERED = [
  "entrada", "diagnostico", "estrutura_base", "planejamento",
  "producao", "ativacao", "otimizacao", "expansao",
] as const;

export function getStagePremiumLabel(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage] ?? stage;
}

/* ─── Plan Definitions ─── */

export type PlanKey = "starter" | "growth" | "enterprise";

export interface PlanDefinition {
  key: PlanKey;
  label: string;
  description: string;
  objective: string;
  depth: string;
}

export const PLAN_DEFINITIONS: Record<PlanKey, PlanDefinition> = {
  starter: {
    key: "starter",
    label: "Starter",
    description: "Fundação digital com entregáveis essenciais.",
    objective: "Estruturar presença digital básica e primeiros processos.",
    depth: "Operação guiada com escopo reduzido.",
  },
  growth: {
    key: "growth",
    label: "Growth",
    description: "Aceleração com estratégia e implantação completa.",
    objective: "Construir funil de aquisição, posicionamento e operação escalável.",
    depth: "Operação completa com planejamento estratégico e acompanhamento.",
  },
  enterprise: {
    key: "enterprise",
    label: "Enterprise",
    description: "Estruturação profunda com automação e escala.",
    objective: "Arquitetar operação integrada com IA, automação e processos avançados.",
    depth: "Operação profunda com consultoria, implantação técnica e expansão contínua.",
  },
};

export function getPlanDefinition(planName: string | null | undefined): PlanDefinition | null {
  if (!planName) return null;
  return PLAN_DEFINITIONS[planName as PlanKey] ?? null;
}

/* ─── Scope Classification ─── */

export type ScopeClassification =
  | "in_plan"
  | "conditional"
  | "addon"
  | "standalone"
  | "extra_cost";

export const SCOPE_LABELS: Record<ScopeClassification, string> = {
  in_plan: "Dentro do Plano",
  conditional: "Condicional",
  addon: "Add-on",
  standalone: "Avulso",
  extra_cost: "Custo Extra Operacional",
};

export const SCOPE_COLORS: Record<ScopeClassification, string> = {
  in_plan: "bg-muted/10 text-muted-foreground border-border",
  conditional: "bg-muted/10 text-muted-foreground border-border",
  addon: "bg-muted/10 text-muted-foreground border-border",
  standalone: "bg-muted/10 text-muted-foreground border-border",
  extra_cost: "bg-muted/10 text-muted-foreground border-border",
};

export function getScopeLabel(scope: ScopeClassification): string {
  return SCOPE_LABELS[scope] ?? scope;
}

export function getScopeColor(scope: ScopeClassification): string {
  return SCOPE_COLORS[scope] ?? "";
}

/* ─── Briefing Types ─── */

export type BriefingType =
  | "essential"
  | "sitebolt"
  | "enterprise_structuring"
  | "ai_automation";

export interface BriefingDefinition {
  key: BriefingType;
  label: string;
  description: string;
  contextType: string; // maps to context_entries.context_type = "briefing"
  importable: boolean;
}

export const BRIEFING_DEFINITIONS: Record<BriefingType, BriefingDefinition> = {
  essential: {
    key: "essential",
    label: "Briefing Essencial",
    description: "Briefing padrão de entrada para novos clientes.",
    contextType: "briefing",
    importable: true,
  },
  sitebolt: {
    key: "sitebolt",
    label: "Briefing SiteBolt",
    description: "Briefing especializado para projetos de site.",
    contextType: "briefing",
    importable: true,
  },
  enterprise_structuring: {
    key: "enterprise_structuring",
    label: "Briefing de Estruturação Empresarial",
    description: "Mapeamento profundo de estrutura, processos e operação da empresa.",
    contextType: "briefing",
    importable: false,
  },
  ai_automation: {
    key: "ai_automation",
    label: "Briefing de Automação e IA",
    description: "Levantamento de oportunidades de automação e inteligência artificial.",
    contextType: "briefing",
    importable: false,
  },
};

export function getBriefingLabel(key: string): string {
  return BRIEFING_DEFINITIONS[key as BriefingType]?.label ?? key;
}
