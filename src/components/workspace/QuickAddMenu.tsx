import { useState, useMemo } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";
import { PROJECT_TYPES, getProjectTypeMeta, getStageMeta, type ProjectNodeKind, type AceleraStageKey } from "./canvasProjectTypes";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (kind: ProjectNodeKind) => void;
  /** Anchor element rect (canvas-space px) used to position the popover via portal */
  anchor?: { x: number; y: number };
  defaultStage?: AceleraStageKey;
}

/**
 * Floating quick-pick used after clicking inline "+" on a node.
 * Shows a search + grid of all project types, badged with their stage.
 */
export default function QuickAddMenu({ open, onOpenChange, onPick, defaultStage }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return PROJECT_TYPES;
    return PROJECT_TYPES.filter((p) =>
      p.label.toLowerCase().includes(query) ||
      p.shortLabel.toLowerCase().includes(query) ||
      p.kind.toLowerCase().includes(query),
    );
  }, [q]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <span aria-hidden="true" className="sr-only" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start" side="bottom">
        <div className="p-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar tipo de node…"
              className="h-8 pl-7 text-xs"
              autoFocus
            />
          </div>
          {defaultStage && (
            <p className="text-[10px] text-muted-foreground mt-1">
              Será criado em <strong>{getStageMeta(defaultStage).short}</strong>
            </p>
          )}
        </div>
        <ScrollArea className="max-h-72">
          <div className="p-1.5 grid grid-cols-2 gap-1">
            {filtered.map((p) => {
              const Icon = p.icon;
              const stage = getStageMeta(p.defaultStage);
              return (
                <button
                  key={p.kind}
                  onClick={() => { onPick(p.kind); onOpenChange(false); }}
                  className={`flex items-start gap-1.5 p-2 rounded-md border ${p.color} ${p.bg} hover:scale-[1.02] active:scale-95 transition-transform text-left`}
                >
                  <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold leading-tight truncate">{p.shortLabel}</p>
                    <p className={`text-[9px] leading-tight ${stage.color.split(" ")[0]} opacity-70`}>{stage.letter} · {stage.short}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

export { getProjectTypeMeta };
