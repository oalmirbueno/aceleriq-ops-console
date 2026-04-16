export interface PlanConfig {
  label: string;
  monthly: number;
  extras: string[];
}

export type PlanKey = "starter" | "growth" | "enterprise";

const STORAGE_KEY = "aceleriq_plan_config";

const DEFAULT_CONFIG: Record<PlanKey, PlanConfig> = {
  starter: { label: "Starter", monthly: 1497, extras: [] },
  growth: { label: "Growth", monthly: 2997, extras: ["Automações básicas", "Suporte prioritário"] },
  enterprise: { label: "Enterprise", monthly: 5997, extras: ["Automações avançadas", "Suporte dedicado", "Consultoria estratégica", "IA personalizada"] },
};

export function getPlanConfig(): Record<PlanKey, PlanConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function savePlanConfig(config: Record<PlanKey, PlanConfig>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getDefaultConfig(): Record<PlanKey, PlanConfig> {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}
