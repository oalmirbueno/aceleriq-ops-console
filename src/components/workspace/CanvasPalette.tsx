import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { CANVAS_NODE_TYPES, type CanvasNodeType } from "./canvasConstants";

interface Props {
  onAdd: (type: CanvasNodeType) => void;
  onOpenDialog: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function CanvasPaletteComp({ onAdd, onOpenDialog, collapsed, onToggleCollapse }: Props) {
  if (collapsed) {
    return (
      <div className="w-7 shrink-0 border-r border-border bg-card/40 backdrop-blur-sm flex items-start justify-center pt-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleCollapse}
              className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Expandir paleta"
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
      <div className="flex flex-col items-center gap-1 p-2 border-r border-border bg-card/40 backdrop-blur-sm w-12 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onToggleCollapse}
              className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Recolher paleta"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Recolher</TooltipContent>
        </Tooltip>
        <div className="h-px w-6 bg-border my-1" />
        <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-0.5">Tipos</p>
        {CANVAS_NODE_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onAdd(t.value)}
                  className={`h-9 w-9 rounded-md border ${t.color} ${t.bg} hover:scale-110 active:scale-95 transition-transform flex items-center justify-center`}
                  aria-label={`Adicionar ${t.label}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-xs">
                <span>Adicionar <strong>{t.label}</strong></span>
              </TooltipContent>
            </Tooltip>
          );
        })}
        <div className="h-px w-6 bg-border my-1" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onOpenDialog}>
              <Plus className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Formulário completo</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

export default memo(CanvasPaletteComp);
