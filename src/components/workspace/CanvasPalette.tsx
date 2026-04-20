import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CANVAS_NODE_TYPES, type CanvasNodeType } from "./canvasConstants";

interface Props {
  onAdd: (type: CanvasNodeType) => void;
  onOpenDialog: () => void;
}

export default function CanvasPalette({ onAdd, onOpenDialog }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col items-center gap-1.5 p-2 border-r border-border bg-card/40 backdrop-blur-sm w-12 shrink-0">
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Tipos</p>
        {CANVAS_NODE_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <Tooltip key={t.value}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onAdd(t.value)}
                  className={`h-9 w-9 rounded-md border ${t.color} ${t.bg} hover:scale-110 transition-transform flex items-center justify-center`}
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
        <div className="h-px w-6 bg-border my-1.5" />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" className="h-9 w-9" onClick={onOpenDialog}>
              <span className="text-base leading-none">+</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right" className="text-xs">Criar com formulário completo</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
