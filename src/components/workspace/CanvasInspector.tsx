import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Search, Link2, Filter } from "lucide-react";
import {
  CANVAS_NODE_TYPES, CANVAS_STATUS_OPTIONS,
  getCanvasTypeConfig, getCanvasStatusConfig,
} from "./canvasConstants";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface Props {
  nodes: CanvasNodeRecord[];
  edges: number;
  search: string;
  onSearch: (v: string) => void;
  typeFilter: string | null;
  onTypeFilter: (v: string | null) => void;
  statusFilter: string | null;
  onStatusFilter: (v: string | null) => void;
  onPick: (n: CanvasNodeRecord) => void;
  selectedId: string | null;
}

export default function CanvasInspector({
  nodes, edges, search, onSearch,
  typeFilter, onTypeFilter, statusFilter, onStatusFilter,
  onPick, selectedId,
}: Props) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes.filter((n) => {
      if (typeFilter && n.node_type !== typeFilter) return false;
      if (statusFilter && n.status !== statusFilter) return false;
      if (q && !n.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [nodes, search, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    nodes.forEach((n) => { map[n.node_type] = (map[n.node_type] ?? 0) + 1; });
    return map;
  }, [nodes]);

  const linkedCount = nodes.filter((n) => n.linked_entity_id).length;

  return (
    <aside className="w-72 shrink-0 border-l border-border bg-card/40 backdrop-blur-sm flex flex-col">
      <div className="p-3 border-b border-border space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inspector</p>
          <Badge variant="outline" className="text-[10px]">{filtered.length}/{nodes.length}</Badge>
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
          {CANVAS_NODE_TYPES.map((t) => {
            const active = typeFilter === t.value;
            const c = counts[t.value] ?? 0;
            return (
              <button
                key={t.value}
                onClick={() => onTypeFilter(active ? null : t.value)}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                  active ? `${t.color} ${t.bg}` : "border-border text-muted-foreground hover:bg-muted/60"
                }`}
              >
                {t.label} {c > 0 && <span className="opacity-60">({c})</span>}
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
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filtered.length === 0 ? (
            <p className="text-[11px] text-muted-foreground text-center p-4">Nenhum node encontrado</p>
          ) : (
            filtered.map((n) => {
              const tc = getCanvasTypeConfig(n.node_type);
              const sc = getCanvasStatusConfig(n.status);
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
                    <span className="text-[9px] uppercase tracking-wide text-muted-foreground">{tc.label}</span>
                    {n.linked_entity_id && <Link2 className="h-2.5 w-2.5 ml-auto text-primary" />}
                  </div>
                  <p className="text-xs font-medium truncate text-foreground">{n.title}</p>
                  <Badge variant="outline" className={`text-[9px] mt-1 ${sc.color}`}>{sc.label}</Badge>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
