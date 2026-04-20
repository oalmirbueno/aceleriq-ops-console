/**
 * Status premium para nodes da esteira — outline-only, monocromático
 */
export const ESTEIRA_STATUSES = [
  { value: "ideia",       label: "Ideia",        color: "bg-transparent text-muted-foreground border-border" },
  { value: "planejado",   label: "Planejado",    color: "bg-transparent text-muted-foreground border-border" },
  { value: "em_producao", label: "Em produção",  color: "bg-transparent text-foreground/70 border-foreground/20" },
  { value: "revisao",     label: "Revisão",      color: "bg-transparent text-foreground/70 border-foreground/20" },
  { value: "ativo",       label: "Ativo",        color: "bg-primary/10 text-primary border-primary/30" },
  { value: "bloqueado",   label: "Bloqueado",    color: "bg-transparent text-destructive border-destructive/30" },
  { value: "concluido",   label: "Concluído",    color: "bg-primary/10 text-primary border-primary/30" },
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
