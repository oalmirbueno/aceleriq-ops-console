import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { getProjectTypeMeta, type ProjectNodeKind } from "./canvasProjectTypes";

interface CanvasQuickDockProps {
  activeKind?: string | null;
  onCreate: (kind: ProjectNodeKind) => void;
}

const QUICK_DOCK_ITEMS: Array<{ label: string; tooltip: string; kind: ProjectNodeKind }> = [
  { label: "Contexto", tooltip: "Base, referência ou briefing operacional", kind: "contexto_ops" },
  { label: "Instrução", tooltip: "SOP, regra ou orientação de execução", kind: "instrucao" },
  { label: "Engine", tooltip: "Orquestração que transforma inputs em ação", kind: "engine" },
  { label: "Resultado", tooltip: "Output, entrega ou evidência produzida", kind: "resultado" },
  { label: "Decisão", tooltip: "Aprovação, revisão ou próximo passo", kind: "decisao" },
  { label: "Agente", tooltip: "Executor operacional conectado ao fluxo", kind: "agente" },
];

export default function CanvasQuickDock({ activeKind, onCreate }: CanvasQuickDockProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex items-center gap-1 rounded-lg border border-border bg-card/90 p-1.5 shadow-2xl shadow-background/50 backdrop-blur-xl animate-fade-in">
        {QUICK_DOCK_ITEMS.map((item) => {
          const meta = getProjectTypeMeta(item.kind);
          const Icon = meta?.icon;
          const active = activeKind === item.kind;

          return (
            <Tooltip key={item.kind}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onCreate(item.kind)}
                  className={cn(
                    "group flex h-10 min-w-10 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-all duration-200",
                    "border-transparent text-muted-foreground hover:-translate-y-0.5 hover:border-border hover:bg-secondary hover:text-foreground hover:shadow-md",
                    active && "border-primary/40 bg-primary/10 text-primary shadow-md",
                  )}
                  aria-label={`Criar ${item.label}`}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" /> : null}
                  <span className="hidden sm:inline">{item.label}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {item.tooltip}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}