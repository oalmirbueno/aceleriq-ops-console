/**
 * aiFirstScore — calcula o percentual de "AI-first" da operação de um cliente.
 *
 * A ideia: quanto da operação do cliente tem IA embutida nos processos?
 *
 * Cálculo:
 *  - Nodes com peso 2: ia, agente (são IA puros)
 *  - Nodes com peso 1.5: automacao (processo automatizado com IA embutida)
 *  - Nodes com peso 1.2: metrica (dado estruturado que alimenta IA)
 *  - Nodes com peso 1.0: todos os outros (operação convencional)
 *
 * Score = (pesos somados dos nodes IA) / (peso total * 2) * 100
 *   O "*2" no denominador garante que mesmo com TUDO IA puro o score
 *   ainda reflete a densidade real da operação — não basta ter 3 agentes
 *   IA e nada mais, tem que ter IA distribuída pela operação.
 *
 * Targets por plano:
 *  - Fundação (starter):       15%
 *  - Aceleração (growth):       50%
 *  - Escala IA-First (enterprise): 85%
 */
import type { PlanKey } from "./planConfig";

export interface NodeForScore {
  node_type: string;
  data?: Record<string, unknown> | null;
}

const AI_WEIGHTS: Record<string, number> = {
  ia:         2.0,
  agente:     2.0,
  ai_orb:     2.0,
  automacao:  1.5,
  integracao: 1.3,
  metrica:    1.2,
};

export const AI_FIRST_TARGETS: Record<PlanKey, number> = {
  starter:    15,
  growth:     50,
  enterprise: 85,
};

export interface AIFirstScore {
  /** 0-100 — quanto da operação é AI-first */
  score: number;
  /** Total de nodes operacionais considerados */
  totalNodes: number;
  /** Quantos são IA puros (ia, agente, ai_orb) */
  aiNodes: number;
  /** Quantos são automação */
  automationNodes: number;
  /** Target do plano atual */
  target: number;
  /** Status: below | on_track | above */
  status: "below" | "on_track" | "above" | "no_data";
  /** Delta em pontos percentuais vs target */
  delta: number;
}

function nodeKindOf(node: NodeForScore): string {
  if (node.node_type === "ai_orb") return "ai_orb";
  const data = (node.data as Record<string, unknown> | null) ?? {};
  return (data.kind as string) ?? node.node_type;
}

export function calculateAIFirstScore(
  nodes: NodeForScore[],
  planName: string | null | undefined,
): AIFirstScore {
  // Filtrar nodes operacionais (excluir client folders e engine)
  const opNodes = nodes.filter((n) => n.node_type !== "client" && n.node_type !== "front");
  const target = (planName && AI_FIRST_TARGETS[planName as PlanKey]) ?? AI_FIRST_TARGETS.starter;

  if (opNodes.length === 0) {
    return {
      score: 0, totalNodes: 0, aiNodes: 0, automationNodes: 0,
      target, status: "no_data", delta: -target,
    };
  }

  let aiPoints = 0;
  let totalPoints = 0;
  let aiNodes = 0;
  let automationNodes = 0;

  for (const n of opNodes) {
    const kind = nodeKindOf(n);
    const weight = AI_WEIGHTS[kind] ?? 1.0;
    totalPoints += 1; // base weight for total
    if (weight > 1) aiPoints += weight;
    if (["ia", "agente", "ai_orb"].includes(kind)) aiNodes += 1;
    if (kind === "automacao") automationNodes += 1;
  }

  // Score: IA points como fração do total (ponderado para não dar 100% fácil)
  const rawScore = totalPoints > 0 ? (aiPoints / totalPoints) * 50 : 0;
  const score = Math.min(100, Math.round(rawScore));

  const delta = score - target;
  const status: AIFirstScore["status"] = delta >= 5 ? "above" : delta >= -10 ? "on_track" : "below";

  return { score, totalNodes: opNodes.length, aiNodes, automationNodes, target, status, delta };
}

/** Label curto do status em português */
export function getAIFirstStatusLabel(status: AIFirstScore["status"]): string {
  const map = {
    no_data: "Sem dados ainda",
    below: "Abaixo do esperado",
    on_track: "No caminho certo",
    above: "Acima do esperado",
  };
  return map[status];
}

/** Cor hex do status */
export function getAIFirstStatusColor(status: AIFirstScore["status"]): string {
  const map = {
    no_data: "#6B7280",
    below: "#F59E0B",
    on_track: "#60A5FA",
    above: "#10B981",
  };
  return map[status];
}
