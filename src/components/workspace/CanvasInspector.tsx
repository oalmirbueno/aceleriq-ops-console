import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertTriangle, GitBranch, Search, Link2, Filter, ChevronRight, ChevronLeft, PanelRight } from "lucide-react";
import {
  CANVAS_STATUS_OPTIONS, getCanvasTypeConfig, getCanvasStatusConfig,
} from "./canvasConstants";
import { PROJECT_TYPES, getProjectTypeMeta } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import { isCanvasNodeBlocked, readCanvasOperationalMeta, type ApprovalStatus } from "./canvasOperationalMeta";

interface Props {
  nodes: CanvasNodeRecord[];
  edges: number;
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string | null;
  onTypeFilter: (v: string | null) => void;
  statusFilter: string | null;
  onStatusFilter: (v: string | null) => void;
  approvalFilter?: ApprovalStatus | "all" | null;
  onApprovalFilter?: (v: ApprovalStatus | "all" | null) => void;
  blockedFilter?: "all" | "blocked" | "clear";
  onBlockedFilter?: (v: "all" | "blocked" | "clear") => void;
  ownerFilter?: string | null;
  onOwnerFilter?: (v: string | null) => void;
  onOpenDependencies?: (n: CanvasNodeRecord) => void;
  onPick: (n: CanvasNodeRecord) => void;
  selectedId: string | null;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function CanvasInspector({
  nodes, edges, search, onSearch,
  typeFilter, onTypeFilter, statusFilter, onStatusFilter,
  approvalFilter = "all", onApprovalFilter, blockedFilter = "all", onBlockedFilter, ownerFilter, onOwnerFilter, onOpenDependencies,
  onPick, selectedId,
  collapsed, onToggleCollapse,
}: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes.filter((n) => {
      const kind = ((n.data as Record<string, unknown> | null)?.kind as string | undefined) ?? n.node_type;
      const meta = readCanvasOperationalMeta(n.data as Record<string, unknown> | null);
      if (typeFilter && kind !== typeFilter && n.node_type !== typeFilter) return false;
      if (statusFilter && n.status !== statusFilter) return false;
      if (approvalFilter && approvalFilter !== "all" && meta.approvalStatus !== approvalFilter) return false;
      if (blockedFilter === "blocked" && !isCanvasNodeBlocked(n.status, meta)) return false;
      if (blockedFilter === "clear" && isCanvasNodeBlocked(n.status, meta)) return false;
      if (ownerFilter && meta.ownerName !== ownerFilter) return false;
      if (q && !n.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [nodes, search, typeFilter, statusFilter, approvalFilter, blockedFilter, ownerFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    nodes.forEach((n) => {
      const kind = ((n.data as Record<string, unknown> | null)?.kind as string | undefined) ?? n.node_type;
      map[kind] = (map[kind] ?? 0) + 1;
    });
    return map;
  }, [nodes]);

  const linkedCount = nodes.filter((n) => n.linked_entity_id).length;
  const owners = useMemo(() => Array.from(new Set(nodes.map((n) => readCanvasOperationalMeta(n.data as Record<string, unknown> | null).ownerName).filter(Boolean))) as string[], [nodes]);

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={200}>
        <aside className="w-7 shrink-0 border-l border-border bg-card/40 backdrop-blur-sm flex items-start justify-center pt-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggleCollapse}
                className="h-7 w-7 rounded-md hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Mostrar inspector"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left" className="text-xs">Mostrar inspector</TooltipContent>
          </Tooltip>
        </aside>
      </TooltipProvider>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-l border-border bg-card/40 backdrop-blur-sm flex flex-col">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <PanelRight className="h-3 w-3 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inspector</p>
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="text-[10px]">{filtered.length}/{nodes.length}</Badge>
            <button
              onClick={onToggleCollapse}
              className="h-5 w-5 rounded hover:bg-muted/60 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Recolher inspector"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Nodes</p>
            <p className="text-sm font-bold text-foreground">{nodes.length}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Edges</p>
            <p className="text-sm font-bold text-foreground">{edges}</p>
          </div>
          <div className="rounded-md bg-muted/40 p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Vínculos</p>
            <p className="text-sm font-bold text-primary">{linkedCount}</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar node..."
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center gap-1.5">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tipo</p>
          {typeFilter && (
            <Button size="sm" variant="ghost" className="ml-auto h-5 px-1.5 text-[10px]" onClick={() => onTypeFilter(null)}>
              limpar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {PROJECT_TYPES.map((t) => {
            const active = typeFilter === t.kind;
            const c = counts[t.kind] ?? 0;
            const Icon = t.icon;
            return (
              <button
                key={t.kind}
                onClick={() => onTypeFilter(active ? null : t.kind)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  active ? `${t.color} ${t.bg}` : "border-border text-muted-foreground hover:bg-muted/60"
                }`}
              >
                <Icon className="inline h-2.5 w-2.5 mr-1" />{t.shortLabel} {c > 0 && <span className="opacity-60">({c})</span>}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5 pt-1">
          <Filter className="h-3 w-3 text-muted-foreground" />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</p>
          {statusFilter && (
            <Button size="sm" variant="ghost" className="ml-auto h-5 px-1.5 text-[10px]" onClick={() => onStatusFilter(null)}>
              limpar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {CANVAS_STATUS_OPTIONS.map((s) => {
            const active = statusFilter === s.value;
            return (
              <button
                key={s.value}
                onClick={() => onStatusFilter(active ? null : s.value)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  active ? s.color : "border-border text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-1.5 pt-1">
          <select
            value={approvalFilter ?? "all"}
            onChange={(e) => onApprovalFilter?.(e.target.value as ApprovalStatus | "all")}
            className="h-7 rounded-md border border-border bg-background px-2 text-[10px] text-foreground"
          >
            <option value="all">Aprovação</option>
            <option value="pending">Pendente</option>
            <option value="approved">Aprovado</option>
            <option value="rejected">Reprovado</option>
            <option value="not_required">Sem aprovação</option>
          </select>
          <select
            value={blockedFilter}
            onChange={(e) => onBlockedFilter?.(e.target.value as "all" | "blocked" | "clear")}
            className="h-7 rounded-md border border-border bg-background px-2 text-[10px] text-foreground"
          >
            <option value="all">Bloqueio</option>
            <option value="blocked">Bloqueados</option>
            <option value="clear">Sem bloqueio</option>
          </select>
        </div>
        {owners.length > 0 && (
          <select
            value={ownerFilter ?? ""}
            onChange={(e) => onOwnerFilter?.(e.target.value || null)}
            className="h-7 w-full rounded-md border border-border bg-background px-2 text-[10px] text-foreground"
          >
            <option value="">Owner</option>
            {owners.map((owner) => <option key={owner} value={owner}>{owner}</option>)}
          </select>
        )}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center p-4">Nenhum node encontrado</p>
          ) : (
            filtered.map((n) => {
              const kind = ((n.data as Record<string, unknown> | null)?.kind as string | undefined) ?? n.node_type;
              const tc = getProjectTypeMeta(kind) ?? getCanvasTypeConfig(n.node_type);
              const sc = getCanvasStatusConfig(n.status);
              const opMeta = readCanvasOperationalMeta(n.data as Record<string, unknown> | null);
              const dependencyCount = opMeta.dependencyNodeIds?.filter(Boolean).length ?? 0;
              const blocked = isCanvasNodeBlocked(n.status, opMeta);
              const Icon = tc.icon;
              const active = selectedId === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => onPick(n)}
                  className={`w-full text-left rounded-md border p-2 transition-colors ${
                    active ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <Icon className={`h-3 w-3 ${tc.color.split(" ")[1] ?? ""}`} />
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{"shortLabel" in tc ? tc.shortLabel : tc.label}</span>
                    <span className="ml-auto inline-flex items-center gap-1">
                      {blocked && <AlertTriangle className="h-2.5 w-2.5 text-destructive" />}
                      {dependencyCount > 0 && <GitBranch className="h-2.5 w-2.5 text-muted-foreground" />}
                      {n.linked_entity_id && <Link2 className="h-2.5 w-2.5 text-primary" />}
                    </span>
                  </div>
                  <p className="text-xs font-medium truncate text-foreground">{n.title}</p>
                  <div className="mt-1 flex items-center gap-1">
                    <Badge variant="outline" className={`text-[9px] ${sc.color}`}>{sc.label}</Badge>
                    {dependencyCount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onOpenDependencies?.(n); }}
                        className="rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-muted/60"
                      >
                        deps {dependencyCount}
                      </button>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
