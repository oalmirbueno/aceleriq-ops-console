import { getStagePremiumLabel } from "./aceleraConstants";

export const TASK_STATUS_OPTIONS = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "To Do" },
  { value: "in_progress", label: "Em progresso" },
  { value: "blocked", label: "Bloqueado" },
  { value: "review", label: "Revisão" },
  { value: "done", label: "Concluído" },
  { value: "canceled", label: "Cancelado" },
] as const;

export const TASK_PRIORITY_OPTIONS = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "urgent", label: "Urgente" },
] as const;

export const PIPELINE_STAGE_OPTIONS = [
  { value: "entrada", label: "Abertura Estratégica" },
  { value: "diagnostico", label: "Diagnóstico Estrutural" },
  { value: "estrutura_base", label: "Arquitetura Base da Operação" },
  { value: "planejamento", label: "Plano Diretor de Implantação" },
  { value: "producao", label: "Implantação e Construção" },
  { value: "ativacao", label: "Ativação Assistida" },
  { value: "otimizacao", label: "Otimização Guiada por Evidência" },
  { value: "expansao", label: "Escala e Alavancagem" },
] as const;

export function getStatusLabel(status: string): string {
  return TASK_STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status;
}

export function getPriorityLabel(priority: string): string {
  return TASK_PRIORITY_OPTIONS.find((p) => p.value === priority)?.label ?? priority;
}

export function getStageLabel(stage: string | null): string | null {
  if (!stage) return null;
  return getStagePremiumLabel(stage);
}

export function getStatusColor(status: string): string {
  switch (status) {
    case "done": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
    case "in_progress": return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "blocked": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "review": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    case "todo": return "bg-violet-500/20 text-violet-400 border-violet-500/30";
    case "canceled": return "bg-muted text-muted-foreground border-border";
    default: return "bg-secondary text-secondary-foreground border-border";
  }
}

export function getPriorityColor(priority: string): string {
  switch (priority) {
    case "urgent": return "text-red-400";
    case "high": return "text-amber-400";
    case "medium": return "text-foreground";
    default: return "text-muted-foreground";
  }
}
