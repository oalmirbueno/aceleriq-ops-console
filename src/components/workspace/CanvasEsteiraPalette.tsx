import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Building2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACELERA_STAGES, PROJECT_TYPE_GROUPS, getProjectTypeMeta, getStageMeta, getNodeFamily, type ProjectNodeKind, type AceleraStageKey } from "./canvasProjectTypes";

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
      <div className="w-7 shrink-0 border-r border-border bg-background flex items-start justify-center pt-3">
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
      <aside className="w-60 shrink-0 border-r border-border/70 bg-background/95 flex flex-col">
        {/* Header */}
        <div className="px-3 py-2 border-b border-border/70 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Esteira</p>
            <p className="text-[11px] text-muted-foreground/80 leading-tight">Execução → prova</p>
          </div>
          <button
            onClick={onToggleCollapse}
            className="h-6 w-6 rounded hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Recolher"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Quick actions */}
        <div className="p-2 space-y-1.5 border-b border-border/70">
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
            {PROJECT_TYPE_GROUPS.filter((g) => g.types.length > 0).map((g) => {
              const stage = getStageMeta(g.stage);
              const isOpen = openStage === g.stage;
              return (
                <div key={g.stage} className={`rounded-md border ${isOpen ? "border-border" : "border-transparent"} overflow-hidden`}>
                  <button
                    onClick={() => setOpenStage(isOpen ? null : g.stage)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 text-left transition-colors ${
                      isOpen ? "bg-muted/40" : "hover:bg-muted/20"
                    }`}
                  >
                    <div className={`h-5 w-5 rounded border ${stage.color} flex items-center justify-center text-[10px] font-bold`}>
                      {stage.letter}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold leading-tight ${stage.color.split(" ")[0]}`}>{stage.short}</p>
                      <p className="text-[10px] text-muted-foreground/70 leading-tight">{g.types.length} tipos</p>
                    </div>
                    <ChevronRight className={`h-3 w-3 text-muted-foreground transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  </button>

                  {isOpen && (
                    <div className="px-1.5 pb-2 pt-1 grid grid-cols-1 gap-1">
                      {g.types.map((kind) => {
                        const meta = getProjectTypeMeta(kind);
                        if (!meta) return null;
                        const Icon = meta.icon;
                        const isProof = getNodeFamily(kind) === "proof";
                        return (
                          <Tooltip key={kind}>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => onAdd(kind, g.stage)}
                                  className={`flex items-center gap-2 p-2 rounded-md border ${isProof ? "border-primary/35 bg-primary/5 text-foreground" : `${meta.color} ${meta.bg}`} hover:bg-muted/30 active:scale-[0.99] transition-transform text-left min-h-9`}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <span className="text-[11px] font-medium leading-tight line-clamp-2">
                                  {meta.shortLabel}
                                </span>
                                {isProof && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary/70" />}
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
