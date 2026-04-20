/**
 * Status premium para nodes da esteira (substituem CANVAS_STATUS_OPTIONS no novo fluxo)
 */
export const ESTEIRA_STATUSES = [
  { value: "ideia",       label: "Ideia",        color: "bg-muted text-muted-foreground border-border" },
  { value: "planejado",   label: "Planejado",    color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  { value: "em_producao", label: "Em produção",  color: "bg-violet-500/15 text-violet-300 border-violet-500/30" },
  { value: "revisao",     label: "Revisão",      color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  { value: "ativo",       label: "Ativo",        color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  { value: "bloqueado",   label: "Bloqueado",    color: "bg-red-500/15 text-red-300 border-red-500/30" },
  { value: "concluido",   label: "Concluído",    color: "bg-primary/15 text-primary border-primary/30" },
] as const;

export type EsteiraStatus = typeof ESTEIRA_STATUSES[number]["value"];

export function getEsteiraStatus(value: string) {
  return ESTEIRA_STATUSES.find((s) => s.value === value) ?? ESTEIRA_STATUSES[0];
}

/** Mapeia status legados (canvas_nodes.status enum) para o premium */
export function mapLegacyStatus(legacy: string): EsteiraStatus {
  switch (legacy) {
    case "draft":   return "ideia";
    case "active":  return "ativo";
    case "blocked": return "bloqueado";
    case "done":    return "concluido";
    default: {
      const found = ESTEIRA_STATUSES.find((s) => s.value === legacy);
      return (found?.value ?? "ideia") as EsteiraStatus;
    }
  }
}

/** Reverso: status premium → enum legado salvo no banco */
export function premiumStatusToDb(s: string): string {
  switch (s) {
    case "ideia":       return "draft";
    case "planejado":   return "draft";
    case "em_producao": return "active";
    case "revisao":     return "active";
    case "ativo":       return "active";
    case "bloqueado":   return "blocked";
    case "concluido":   return "done";
    default: return "draft";
  }
}
