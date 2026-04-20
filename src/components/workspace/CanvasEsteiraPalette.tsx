import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACELERA_STAGES, PROJECT_TYPE_GROUPS, getProjectTypeMeta, getStageMeta, type ProjectNodeKind, type AceleraStageKey } from "./canvasProjectTypes";

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAdd: (kind: ProjectNodeKind, stage: AceleraStageKey) => void;
  onAddClient: () => void;
  onOpenAdvanced: () => void;
}

export default function CanvasEsteiraPalette({
  collapsed, onToggleCollapse, onAdd, onAddClient, onOpenAdvanced,
}: Props) {
  const [openStage, setOpenStage] = useState<AceleraStageKey | null>("producao");

  if (collapsed) {
    return (
      <div className="w-7 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex items-start justify-center pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleCollapse}
              className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Mostrar paleta"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Mostrar paleta</TooltipContent>
        </Tooltip>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <aside className="w-60 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex flex-col">
        {/* Header */}
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esteira</p>
          <button
            onClick={onToggleCollapse}
            className="h-6 w-6 rounded hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Recolher"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="p-2 space-y-1.5 border-b border-border">
          <Button
            size="sm"
            variant="outline"
            className="w-full justify-start h-8"
            onClick={onAddClient}
          >
            <Building2 className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
            <span className="text-xs">Adicionar cliente</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="w-full justify-start h-8 text-muted-foreground"
            onClick={onOpenAdvanced}
          >
            <Plus className="h-3.5 w-3.5 mr-2" />
            <span className="text-xs">Criar avançado…</span>
          </Button>
        </div>

        {/* Stage groups */}
        <ScrollArea className="flex-1">
          <div className="p-1.5 space-y-1">
            {PROJECT_TYPE_GROUPS.map((g) => {
              const stage = getStageMeta(g.stage);
              const isOpen = openStage === g.stage;
              return (
                <div key={g.stage} className={`rounded-md border ${isOpen ? "border-border" : "border-transparent"} overflow-hidden`}>
                  <button
                    onClick={() => setOpenStage(isOpen ? null : g.stage)}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors ${
                      isOpen ? "bg-muted/40" : "hover:bg-muted/20"
                    }`}
                  >
                    <div className={`h-5 w-5 rounded border ${stage.color} flex items-center justify-center text-[10px] font-bold`}>
                      {stage.letter}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-[11px] font-semibold leading-tight ${stage.color.split(" ")[0]}`}>{stage.short}</p>
                    </div>
                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="px-1.5 pb-2 pt-1 grid grid-cols-2 gap-1">
                      {g.types.map((kind) => {
                        const meta = getProjectTypeMeta(kind);
                        if (!meta) return null;
                        const Icon = meta.icon;
                        return (
                          <Tooltip key={kind}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => onAdd(kind, g.stage)}
                                className={`flex flex-col items-center justify-center gap-1 p-2 rounded-md border ${meta.color} ${meta.bg} hover:scale-[1.04] active:scale-95 transition-transform`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                                <span className="text-[9px] font-medium leading-tight text-center line-clamp-1">
                                  {meta.shortLabel}
                                </span>
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="text-xs">
                              Adicionar <strong>{meta.label}</strong> em {stage.short}
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </aside>
    </TooltipProvider>
  );
}
