import { useReactFlow } from "@xyflow/react";
import { Link } from "react-router-dom";
import {
  MousePointer2, LayoutGrid, Maximize, ZoomIn, ZoomOut, Plus, Sparkles, Settings, ExternalLink, Lock,
  Eye, SlidersHorizontal, Filter, ShieldCheck, Database,
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
  renderer: "legacy" | "task-v2";
  density: "comfortable" | "compact";
  nodeSize: "sm" | "md" | "lg";
  tasksCount: number;
  milestoneTitle?: string;
}

export default function CanvasDockV2({
  onOrganize, onAddBlocked, onToggleIAHub, iaHubOpen, iaHubEnabled,
  hiddenStatuses, onChangeFilters, portalUrl,
  renderer = "legacy",
  density = "comfortable",
  nodeSize = "md",
  tasksCount = 0,
  milestoneTitle,
}: Props) {
  const rf = useReactFlow();

  return (
    <TooltipProvider delayDuration={150}>
      <div className="pointer-events-auto max-w-[min(96vw,1120px)] rounded-2xl border border-border bg-card/95 backdrop-blur-xl shadow-2xl shadow-background/50 px-2 py-2 animate-fade-in">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-thin">
          <DockGroup label="Navegação">
            <DockBtn label="Selecionar / mover nodes" icon={MousePointer2} active />
            <DockBtn label="Centralizar sem salvar layout" icon={Maximize} onClick={() => rf.fitView({ padding: 0.22, duration: 320, maxZoom: renderer === "task-v2" ? 0.92 : 0.98 })} />
            <DockBtn label="Aproximar" icon={ZoomIn} onClick={() => rf.zoomIn({ duration: 200 })} />
            <DockBtn label="Afastar" icon={ZoomOut} onClick={() => rf.zoomOut({ duration: 200 })} />
          </DockGroup>

          <Sep />

          <DockGroup label="Visual">
            <DockBtn label="Reorganizar visualmente (local, não persiste)" icon={LayoutGrid} onClick={onOrganize} />
            <StatePill icon={Eye} label={renderer === "legacy" ? "Legacy" : "Task V2"} tone={renderer === "legacy" ? "default" : "primary"} />
            <StatePill icon={SlidersHorizontal} label={`${(nodeSize ?? "md").toUpperCase()} · ${density === "compact" ? "compacto" : "confortável"}`} />
          </DockGroup>

          <Sep />

          <DockGroup label="Filtros">
            <CanvasFiltersV2 hidden={hiddenStatuses} onChange={onChangeFilters} />
            <StatePill icon={Filter} label={hiddenStatuses.size ? `${hiddenStatuses.size} oculto(s)` : `${tasksCount} nodes`} />
          </DockGroup>

          <Sep />

          <DockGroup label="IA">
            {iaHubEnabled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onToggleIAHub}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 h-8 text-xs transition-colors whitespace-nowrap ${
                      iaHubOpen
                        ? "border-primary/40 bg-primary/15 text-primary"
                        : "border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> IA Hub
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">Abrir análise operacional read-only</TooltipContent>
              </Tooltip>
            ) : (
              <StatePill icon={Sparkles} label="IA off" />
            )}
          </DockGroup>

          <Sep />

          <DockGroup label="Ações bloqueadas">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onAddBlocked}
                  className="relative inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-8 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" /> Criar task
                  <Lock className="h-2.5 w-2.5 ml-0.5 text-muted-foreground/60" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">Bloqueado até Fase 3 — nenhuma mutation</TooltipContent>
            </Tooltip>
            <StatePill icon={ShieldCheck} label="read-only" tone="primary" />
          </DockGroup>

          <Sep />

          <DockGroup label="Portal">
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
              <TooltipContent side="top" className="text-xs">Abrir Portal em nova aba</TooltipContent>
            </Tooltip>
            <StatePill icon={Database} label={milestoneTitle ? "Portal" : "sem milestone"} />
          </DockGroup>
        </div>
      </div>
    </TooltipProvider>
  );
}

function DockGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className="hidden lg:inline text-[9px] uppercase tracking-wider text-muted-foreground/70 px-1 whitespace-nowrap">{label}</span>
      {children}
    </div>
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

function StatePill({ icon: Icon, label, tone = "default" }: { icon: typeof Eye; label: string; tone?: "default" | "primary" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-md border px-2 h-8 text-[10px] uppercase tracking-wider whitespace-nowrap ${
      tone === "primary" ? "border-primary/35 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"
    }`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

function Sep() {
  return <span className="mx-0.5 h-6 w-px bg-border shrink-0" />;
}
