import { useReactFlow } from "@xyflow/react";
import { Link } from "react-router-dom";
import {
  MousePointer2, LayoutGrid, Maximize, ZoomIn, ZoomOut, Plus, Sparkles, Settings, ExternalLink, Lock,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import CanvasFiltersV2 from "./CanvasFiltersV2";
import type { PortalTaskStatus } from "@/v2/data/portalClient";

interface Props {
  onOrganize: () => void;
  onAddBlocked: () => void;
  onToggleIAHub: () => void;
  iaHubOpen: boolean;
  iaHubEnabled: boolean;
  hiddenStatuses: Set<PortalTaskStatus>;
  onChangeFilters: (s: Set<PortalTaskStatus>) => void;
  portalUrl: string;
}

export default function CanvasDockV2({
  onOrganize, onAddBlocked, onToggleIAHub, iaHubOpen, iaHubEnabled,
  hiddenStatuses, onChangeFilters, portalUrl,
}: Props) {
  const rf = useReactFlow();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="pointer-events-auto inline-flex items-center gap-1 rounded-xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-background/50 px-2 py-1.5 animate-fade-in">
        <DockBtn label="Selecionar / mover" icon={MousePointer2} active />
        <Sep />
        <DockBtn label="Organizar layout" icon={LayoutGrid} onClick={onOrganize} />
        <DockBtn label="Centralizar (Fit view)" icon={Maximize} onClick={() => rf.fitView({ padding: 0.3, duration: 320 })} />
        <DockBtn label="Aproximar" icon={ZoomIn} onClick={() => rf.zoomIn({ duration: 200 })} />
        <DockBtn label="Afastar" icon={ZoomOut} onClick={() => rf.zoomOut({ duration: 200 })} />
        <Sep />
        <CanvasFiltersV2 hidden={hiddenStatuses} onChange={onChangeFilters} />
        <Sep />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onAddBlocked}
              className="relative inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar
              <Lock className="h-2.5 w-2.5 ml-0.5 text-muted-foreground/60" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Disponível na Fase 3</TooltipContent>
        </Tooltip>
        {iaHubEnabled && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleIAHub}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 h-8 text-xs transition-colors ${
                  iaHubOpen
                    ? "border-primary/40 bg-primary/15 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" /> IA Hub
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">Abrir IA Hub</TooltipContent>
          </Tooltip>
        )}
        <Sep />
        <Tooltip>
          <TooltipTrigger asChild>
            <Link
              to="/ops-v2/configuracoes"
              className="h-8 w-8 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
            >
              <Settings className="h-3.5 w-3.5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Configurações do Canvas</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="h-8 w-8 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">Abrir Portal</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

function DockBtn({
  label, icon: Icon, onClick, active,
}: { label: string; icon: typeof Plus; onClick?: () => void; active?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={`h-8 w-8 grid place-items-center rounded-md border transition-colors ${
            active
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
          }`}
        >
          <Icon className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px bg-border" />;
}