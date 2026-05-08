import { useState } from "react";
import { Filter, X } from "lucide-react";
import type { PortalTaskStatus } from "@/v2/data/portalClient";

const ALL: PortalTaskStatus[] = ["todo", "in_progress", "blocked", "done", "archived"];
const LABEL: Record<PortalTaskStatus, string> = {
  todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueadas", done: "Concluídas", archived: "Arquivadas",
};
const COLOR: Record<PortalTaskStatus, string> = {
  todo: "hsl(220 9% 60%)", in_progress: "hsl(145 100% 50%)", blocked: "hsl(0 84% 60%)",
  done: "hsl(145 70% 45%)", archived: "hsl(220 9% 40%)",
};

/**
 * Filtros locais por status. Apenas oculta nodes do Canvas (read-only).
 * Não chama Portal / não persiste / não muda dados.
 */
export default function CanvasFiltersV2({
  hidden, onChange,
}: { hidden: Set<PortalTaskStatus>; onChange: (next: Set<PortalTaskStatus>) => void }) {
  const [open, setOpen] = useState(false);
  const active = ALL.length - hidden.size;

  const toggle = (s: PortalTaskStatus) => {
    const next = new Set(hidden);
    if (next.has(s)) next.delete(s); else next.add(s);
    onChange(next);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
        title="Filtrar por status"
      >
        <Filter className="h-3.5 w-3.5" />
        <span>Filtros</span>
        {hidden.size > 0 && (
          <span className="ml-1 inline-flex items-center justify-center rounded-full bg-primary/15 text-primary text-[9px] font-mono px-1.5 h-4 min-w-4">
            {active}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-50 w-[220px] rounded-lg border border-border bg-card shadow-2xl p-2">
            <div className="flex items-center justify-between px-1.5 pb-1.5 mb-1 border-b border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Status</p>
              {hidden.size > 0 && (
                <button
                  onClick={() => onChange(new Set())}
                  className="text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                >
                  <X className="h-2.5 w-2.5" /> Limpar
                </button>
              )}
            </div>
            {ALL.map((s) => {
              const checked = !hidden.has(s);
              return (
                <label
                  key={s}
                  className="flex items-center gap-2 px-1.5 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  <span className="h-2 w-2 rounded-full" style={{ background: COLOR[s] }} />
                  <span className="text-xs text-foreground">{LABEL[s]}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}