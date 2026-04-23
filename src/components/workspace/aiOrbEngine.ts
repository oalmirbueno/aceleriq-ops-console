import { supabase } from "@/integrations/supabase/client";
import type { AiOrbType } from "./AiOrbNode";
import { AI_ORB_DEFINITIONS, type AiEngine, type AiOrbData, type AiOrbGeneratedEdgeSpec, type AiOrbGeneratedNodeSpec } from "./aiOrbConstants";

export type ConnectionValidation = { allowed: boolean; label: string | null; reason: string | null };

export interface AiOrbGenerateResult {
  nodes: AiOrbGeneratedNodeSpec[];
  edges: AiOrbGeneratedEdgeSpec[];
  rationale: string;
  insights: string[];
}

export function readAiOrbData(data: Record<string, unknown> | null | undefined, fallbackType: AiOrbType = "planner"): AiOrbData {
  const raw = data ?? {};
  const orbType = (raw.orbType as AiOrbType | undefined) ?? fallbackType;
  const def = AI_ORB_DEFINITIONS[orbType] ?? AI_ORB_DEFINITIONS.planner;
  return {
    kind: "ai_orb",
    orbType,
    orbLabel: (raw.orbLabel as string | undefined) ?? def.label,
    specialization: (raw.specialization as string | undefined) ?? def.specialization,
    aiEngine: ((raw.aiEngine as AiEngine | undefined) ?? (raw.aiModel === "gpt" ? "gpt_external" : raw.aiModel === "claude" ? "claude_api" : "internal")),
    aiModel: (raw.aiModel as string | undefined) ?? "internal",
    gptEndpoint: raw.gptEndpoint as string | undefined,
    customWebhookUrl: raw.customWebhookUrl as string | undefined,
    isGenerating: Boolean(raw.isGenerating),
    lastGeneratedAt: raw.lastGeneratedAt as string | undefined,
    generationCount: Number(raw.generationCount ?? 0),
    lastError: raw.lastError as string | undefined,
    systemPrompt: raw.systemPrompt as string | undefined,
    temperature: Number(raw.temperature ?? 0.3),
    focusAreas: Array.isArray(raw.focusAreas) ? raw.focusAreas as string[] : def.focusAreas,
    contextSources: Array.isArray(raw.contextSources) ? raw.contextSources as AiOrbData["contextSources"] : def.contextSources,
    generatedNodeIds: Array.isArray(raw.generatedNodeIds) ? raw.generatedNodeIds as string[] : [],
    memory: Array.isArray(raw.memory) ? raw.memory as AiOrbData["memory"] : [],
  };
}

export async function invokeAiOrbGenerate(input: {
  orbId: string;
  workspaceId: string;
  clientId: string;
  orbType: AiOrbType;
  aiEngine: AiEngine;
  customPrompt?: string;
  focusAreas?: string[];
  deterministic?: boolean;
}): Promise<AiOrbGenerateResult> {
  const { data, error } = await supabase.functions.invoke("ai-orb-generate", { body: input });
  if (error) throw error;
  return data as AiOrbGenerateResult;
}

export function nextOrbDataAfterGeneration(current: AiOrbData, result: AiOrbGenerateResult, generatedNodeIds: string[]): AiOrbData {
  const stamp = new Date().toISOString();
  return {
    ...current,
    isGenerating: false,
    lastGeneratedAt: stamp,
    generationCount: (current.generationCount ?? 0) + 1,
    lastError: undefined,
    generatedNodeIds: Array.from(new Set([...(current.generatedNodeIds ?? []), ...generatedNodeIds])),
    memory: [
      ...(current.memory ?? []).slice(-12),
      ...result.insights.slice(0, 4).map((insight) => ({ timestamp: stamp, action: "generated" as const, insight })),
    ],
  };
}