/**
 * Constants for operational fronts — bucket_status and execution_status.
 */

export type BucketStatus = "active" | "conditional" | "future" | "out_of_scope";
export type ExecutionStatus = "not_started" | "in_progress" | "blocked" | "paused" | "in_validation" | "done" | "reopened";

export const BUCKET_STATUS_OPTIONS: Array<{ value: BucketStatus; label: string; hint?: string }> = [
  { value: "active", label: "Ativa", hint: "Em execução agora — inclusa no plano" },
  { value: "conditional", label: "Condicional", hint: "Aguardando confirmação do operador para executar" },
  { value: "future", label: "Futura", hint: "Postergada para fase posterior com critério explícito" },
  { value: "out_of_scope", label: "Fora do Plano", hint: "Add-on, avulso ou custo extra — não incluído na execução automática" },
];

export const EXECUTION_STATUS_OPTIONS: Array<{ value: ExecutionStatus; label: string }> = [
  { value: "not_started", label: "Não Iniciada" },
  { value: "in_progress", label: "Em Andamento" },
  { value: "blocked", label: "Bloqueada" },
  { value: "paused", label: "Pausada" },
  { value: "in_validation", label: "Em Validação" },
  { value: "done", label: "Concluída" },
  { value: "reopened", label: "Reaberta" },
];

export const BUCKET_COLORS: Record<BucketStatus, string> = {
  active: "bg-muted/10 text-muted-foreground border-border",
  conditional: "bg-muted/10 text-muted-foreground border-border",
  future: "bg-muted/10 text-muted-foreground border-border",
  out_of_scope: "bg-muted text-muted-foreground border-border",
};

export const EXECUTION_COLORS: Record<ExecutionStatus, string> = {
  not_started: "text-muted-foreground",
  in_progress: "text-muted-foreground",
  blocked: "text-muted-foreground",
  paused: "text-muted-foreground",
  in_validation: "text-muted-foreground",
  done: "text-muted-foreground",
  reopened: "text-muted-foreground",
};

export function getBucketLabel(s: BucketStatus | string): string {
  return BUCKET_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function getExecutionLabel(s: ExecutionStatus | string): string {
  return EXECUTION_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function getExecutionColor(s: ExecutionStatus | string): string {
  return EXECUTION_COLORS[s as ExecutionStatus] ?? "";
}

export function getBucketColor(s: BucketStatus | string): string {
  return BUCKET_COLORS[s as BucketStatus] ?? "";
}

export const PRIORITY_OPTIONS = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Média" },
  { value: "low", label: "Baixa" },
];
