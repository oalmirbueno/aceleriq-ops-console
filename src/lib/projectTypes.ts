/**
 * projectTypes — define os 6 tipos de projeto/cliente.
 *
 * Cada tipo determina:
 *   - Label e cor visual
 *   - Quais scores são visíveis (AI-First, Health, ICP-Fit)
 *   - Qual playbook de canvas é aplicado
 *   - Se exige plano recorrente ou não
 */

export type ProjectType =
  | "ai_first"
  | "marketing_service"
  | "legacy_marketing"
  | "one_shot_site"
  | "one_shot_automation"
  | "one_shot_agent";

export interface ProjectTypeMeta {
  key: ProjectType;
  label: string;
  shortLabel: string;
  description: string;
  color: string;        // Hex accent
  icon: string;         // Lucide icon name
  /** Scores que aparecem no workspace deste tipo */
  showAiFirstScore: boolean;
  showHealthScore: boolean;
  showIcpFitScore: boolean;
  /** Playbook automático no canvas ao criar workspace */
  hasAutoPlaybook: boolean;
  /** Exige plano recorrente */
  recurring: boolean;
  /** Planos compatíveis (se recurring=true) */
  compatiblePlans?: string[];
}

export const PROJECT_TYPES: Record<ProjectType, ProjectTypeMeta> = {
  ai_first: {
    key: "ai_first",
    label: "AI-First — Método ACELERA",
    shortLabel: "AI-First",
    description: "Cliente no método completo de transformação AI-First. Fundação, Aceleração ou Escala.",
    color: "#00FF88",
    icon: "Sparkles",
    showAiFirstScore: true,
    showHealthScore: true,
    showIcpFitScore: true,
    hasAutoPlaybook: true,
    recurring: true,
    compatiblePlans: ["starter", "growth", "enterprise"],
  },
  marketing_service: {
    key: "marketing_service",
    label: "Marketing Recorrente",
    shortLabel: "Marketing",
    description: "Cliente contratou plano Marketing. Pode migrar para AI-First depois.",
    color: "#F472B6",
    icon: "Megaphone",
    showAiFirstScore: false, // Oculta pra não parecer "mal"
    showHealthScore: true,
    showIcpFitScore: true,
    hasAutoPlaybook: true,
    recurring: true,
    compatiblePlans: ["marketing"],
  },
  legacy_marketing: {
    key: "legacy_marketing",
    label: "Cliente Legado",
    shortLabel: "Legado",
    description: "Cliente antigo da era Aceleriq Marketing. Mantemos relacionamento, sem métricas AI-First.",
    color: "#94A3B8",
    icon: "Archive",
    showAiFirstScore: false,
    showHealthScore: true,
    showIcpFitScore: false,
    hasAutoPlaybook: false,
    recurring: true,
    compatiblePlans: ["marketing"],
  },
  one_shot_site: {
    key: "one_shot_site",
    label: "Site (entrega única)",
    shortLabel: "Site",
    description: "Entrega pontual de site institucional. Sem plano recorrente.",
    color: "#60A5FA",
    icon: "Globe",
    showAiFirstScore: false,
    showHealthScore: false,
    showIcpFitScore: false,
    hasAutoPlaybook: true,
    recurring: false,
  },
  one_shot_automation: {
    key: "one_shot_automation",
    label: "Automação (entrega única)",
    shortLabel: "Automação",
    description: "Entrega pontual de automação. Sem plano recorrente.",
    color: "#FB923C",
    icon: "Workflow",
    showAiFirstScore: false,
    showHealthScore: false,
    showIcpFitScore: false,
    hasAutoPlaybook: true,
    recurring: false,
  },
  one_shot_agent: {
    key: "one_shot_agent",
    label: "Agente IA (entrega única)",
    shortLabel: "Agente IA",
    description: "Entrega pontual de agente IA conversacional. Sem plano recorrente.",
    color: "#06B6D4",
    icon: "Bot",
    showAiFirstScore: true, // Este sim mostra porque é sobre IA
    showHealthScore: false,
    showIcpFitScore: false,
    hasAutoPlaybook: true,
    recurring: false,
  },
};

export function getProjectTypeMeta(type: string | null | undefined): ProjectTypeMeta {
  if (!type) return PROJECT_TYPES.ai_first;
  return PROJECT_TYPES[type as ProjectType] ?? PROJECT_TYPES.ai_first;
}

export const PROJECT_TYPE_OPTIONS: ProjectTypeMeta[] = Object.values(PROJECT_TYPES);

/** Infere tipo a partir do project_type do portal */
export function inferTypeFromPortal(portalProjectType: string | null | undefined): ProjectType {
  if (!portalProjectType) return "ai_first";
  const lower = portalProjectType.toLowerCase();
  if (lower.includes("site") || lower.includes("website")) return "one_shot_site";
  if (lower.includes("auto")) return "one_shot_automation";
  if (lower.includes("agent") || lower.includes("bot") || lower.includes("ia")) return "one_shot_agent";
  if (lower.includes("market") || lower.includes("ads") || lower.includes("trafego")) return "marketing_service";
  if (lower.includes("legacy") || lower.includes("legado")) return "legacy_marketing";
  return "ai_first";
}

/** Resolve o valor mensal efetivo (custom ou do plano) */
export function resolveMonthlyValue(
  customValue: number | null | undefined,
  planMonthly: number | null | undefined,
): number {
  if (typeof customValue === "number" && customValue > 0) return customValue;
  return planMonthly ?? 0;
}
