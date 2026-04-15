/** Centralized context type labels for UI display */

export const CONTEXT_TYPES = [
  "briefing", "dor", "objetivo", "reuniao", "transcricao",
  "decisao", "acesso", "anotacao", "diagnostico",
] as const;

export type ContextType = (typeof CONTEXT_TYPES)[number];

export const CONTEXT_TYPE_LABELS: Record<ContextType, string> = {
  briefing: "📋 Briefing",
  dor: "🔥 Dor / Problema",
  objetivo: "🎯 Objetivo",
  reuniao: "🤝 Reunião",
  transcricao: "🎙️ Transcrição",
  decisao: "⚖️ Decisão",
  acesso: "🔑 Acesso",
  anotacao: "📝 Anotação",
  diagnostico: "🔍 Diagnóstico",
};

export function getContextLabel(type: string): string {
  return CONTEXT_TYPE_LABELS[type as ContextType] ?? type;
}
