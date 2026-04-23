import type { ConnectionValidation } from "./aiOrbEngine";

const INPUT_KINDS = new Set(["contexto_ops", "briefing", "documento", "reuniao", "ideia", "objetivo", "acessos", "contato", "asset"]);
const INSTRUCTION_KINDS = new Set(["instrucao", "funil", "checklist"]);
const RESULT_KINDS = new Set(["resultado", "landing_page", "site", "conteudo", "video", "imagem", "trafego", "email_mkt", "social", "crm", "lancamento", "metrica", "before_after", "case"]);
const PROOF_KINDS = new Set(["metrica", "before_after", "case"]);

export function isAiOrbKind(kind: string) {
  return kind === "ai_orb";
}

export function validateOrbConnection(sourceKind: string, targetKind: string, targetOrbType?: string): ConnectionValidation | null {
  const sourceIsOrb = isAiOrbKind(sourceKind);
  const targetIsOrb = isAiOrbKind(targetKind);

  if (sourceIsOrb && targetIsOrb) return { allowed: true, label: "orquestra", reason: null };

  if (targetIsOrb) {
    if (INPUT_KINDS.has(sourceKind) || INSTRUCTION_KINDS.has(sourceKind)) return { allowed: true, label: "alimenta IA", reason: null };
    if (PROOF_KINDS.has(sourceKind) || sourceKind === "metrica") return { allowed: true, label: targetOrbType === "proof" ? "evidência" : "refinar", reason: null };
    if (RESULT_KINDS.has(sourceKind)) return { allowed: true, label: "refinar", reason: null };
    return { allowed: false, label: null, reason: "AI Orbs recebem contexto, briefing, instruções, resultados ou evidências como entrada." };
  }

  if (sourceIsOrb) return { allowed: true, label: "gerado por IA", reason: null };

  return null;
}

export function generatedNodePosition(orbX: number, orbY: number, index: number, total: number) {
  const spread = Math.min(Math.max(total, 3), 8);
  const angle = -42 + (84 / Math.max(spread - 1, 1)) * (index % spread);
  const radiusX = 420 + Math.floor(index / spread) * 280;
  const radiusY = 210;
  return {
    x: orbX + radiusX,
    y: orbY + Math.sin((angle * Math.PI) / 180) * radiusY + Math.floor(index / spread) * 120,
  };
}