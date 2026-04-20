import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, LineChart, ArrowUp, ArrowDown, Minus, FolderKanban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CreateMetricSnapshotDialog from "./CreateMetricSnapshotDialog";
import {
  METRIC_KEY_OPTIONS,
  compareSnapshots,
  formatMetricValue,
  getMetricKeyLabel,
  getMetricSourceLabel,
} from "./metricsConstants";

interface Snapshot {
  id: string;
  workspace_id: string;
  client_id: string;
  metric_key: string;
  metric_label: string | null;
  metric_value: number | null;
  metric_unit: string | null;
  period_label: string | null;
  captured_at: string;
  source_type: string | null;
  source_label: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  workspaceId: string;
  clientId: string;
  onTimelineRefresh?: () => Promise<void> | void;
}

export default function WorkspaceTabMetricas({ workspaceId, clientId, onTimelineRefresh }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [keyFilter, setKeyFilter] = useState<string>("all");

  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("metric_snapshots")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("captured_at", { ascending: false });
    if (keyFilter !== "all") q = q.eq("metric_key", keyFilter);
    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar métricas", description: error.message, variant: "destructive" });
    }
    setSnapshots((data ?? []) as Snapshot[]);
    setLoading(false);
  }, [workspaceId, keyFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Apagar snapshot "${label}"?`)) return;
    const { error } = await supabase.from("metric_snapshots").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Snapshot removido" });
      await fetchData();
    }
  };

  /* ─── Group snapshots by metric_key for simple comparison ─── */
  const groups = useMemo(() => {
    const map = new Map<string, Snapshot[]>();
    for (const s of snapshots) {
      const arr = map.get(s.metric_key) ?? [];
      arr.push(s);
      map.set(s.metric_key, arr);
    }
    // each group is already sorted desc by captured_at thanks to the query
    return Array.from(map.entries()).map(([key, items]) => {
      const last = items[0];
      const prev = items[1] ?? null;
      const comparison = compareSnapshots(
        last?.metric_value ?? null,
        prev?.metric_value ?? null,
      );
      return { key, items, last, prev, comparison };
    });
  }, [snapshots]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando métricas...</p>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Snapshots de métricas</p>
          <p className="text-xs text-muted-foreground">
            {snapshots.length} {snapshots.length === 1 ? "snapshot registrado" : "snapshots registrados"}
            {" · "}base factual para Before/After futuro
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo snapshot
        </Button>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2 flex-wrap border-t border-border pt-3">
        <LineChart className="h-4 w-4 text-muted-foreground" />
        <Select value={keyFilter} onValueChange={setKeyFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Métrica" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as métricas</SelectItem>
            {METRIC_KEY_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Comparison summary (last vs previous per metric_key) */}
      {groups.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(g => {
            const label = g.last.metric_label || getMetricKeyLabel(g.key);
            const cmp = g.comparison;
            const Icon = cmp?.direction === "up" ? ArrowUp : cmp?.direction === "down" ? ArrowDown : Minus;
            const accent =
              !cmp ? "text-muted-foreground"
              : cmp.direction === "up" ? "text-muted-foreground"
              : cmp.direction === "down" ? "text-muted-foreground"
              : "text-muted-foreground";
            return (
              <Card key={g.key} className="border-border bg-card">
                <CardContent className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{getMetricKeyLabel(g.key)}</p>
                      <p className="text-base font-semibold text-foreground truncate">{label}</p>
                      <p className="text-lg font-bold text-foreground mt-1">
                        {formatMetricValue(g.last.metric_value, g.last.metric_unit)}
                      </p>
                      {g.last.period_label && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Período: {g.last.period_label}</p>
                      )}
                    </div>
                    <div className={`flex flex-col items-end gap-0.5 ${accent}`}>
                      <Icon className="h-4 w-4" />
                      {cmp ? (
                        <>
                          <span className="text-xs font-medium">
                            {cmp.delta > 0 ? "+" : ""}{formatMetricValue(cmp.delta, g.last.metric_unit)}
                          </span>
                          {cmp.deltaPct !== null && (
                            <span className="text-[10px]">
                              {cmp.deltaPct > 0 ? "+" : ""}{cmp.deltaPct.toFixed(1)}%
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-[10px] italic">sem comparação</span>
                      )}
                    </div>
                  </div>
                  {g.prev && (
                    <p className="text-[10px] text-muted-foreground mt-2 border-t border-border pt-1.5">
                      Anterior: {formatMetricValue(g.prev.metric_value, g.prev.metric_unit)}
                      {g.prev.period_label && ` · ${g.prev.period_label}`}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* List of snapshots */}
      {snapshots.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <LineChart className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhum snapshot registrado</p>
          <p className="text-xs text-muted-foreground max-w-sm text-center">
            Registre snapshots manuais de leads, vendas, tráfego e outras métricas. Eles servem como base factual rastreável.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Histórico — mais recentes primeiro</p>
          {snapshots.map(s => {
            const label = s.metric_label || getMetricKeyLabel(s.metric_key);
            const front = (s.metadata as Record<string, unknown> | null)?.operational_front_name_snapshot as string | undefined;
            return (
              <Card key={s.id} className="hover:border-primary/30 transition-colors">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{label}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {getMetricKeyLabel(s.metric_key)}
                        </Badge>
                        {front && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 inline-flex items-center gap-1">
                            <FolderKanban className="h-2.5 w-2.5" /> {front}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-base font-semibold text-foreground">
                          {formatMetricValue(s.metric_value, s.metric_unit)}
                        </span>
                        {s.period_label && (
                          <span className="text-[10px] text-muted-foreground">· {s.period_label}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                        <span>{new Date(s.captured_at).toLocaleDateString("pt-BR")}</span>
                        <span>· Fonte: {getMetricSourceLabel(s.source_type)}</span>
                        {s.source_label && <span>· {s.source_label}</span>}
                      </div>
                      {s.notes && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.notes}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => handleDelete(s.id, label)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CreateMetricSnapshotDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        onCreated={async () => {
          await fetchData();
          await onTimelineRefresh?.();
        }}
      />
    </div>
  );
}
