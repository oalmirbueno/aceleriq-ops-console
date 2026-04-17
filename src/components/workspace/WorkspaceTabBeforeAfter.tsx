import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, LineChart, PackageCheck, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import BeforeAfterRecordDialog, { type BeforeAfterRecord } from "./BeforeAfterRecordDialog";
import {
  BEFORE_AFTER_STATUS_OPTIONS,
  getBeforeAfterStatusColor,
  getBeforeAfterStatusLabel,
  type AssetSnapshotEntry,
  type MetricSnapshotEntry,
} from "./beforeAfterConstants";

interface Props {
  workspaceId: string;
  clientId: string;
  onTimelineRefresh?: () => Promise<void> | void;
}

export default function WorkspaceTabBeforeAfter({ workspaceId, clientId, onTimelineRefresh }: Props) {
  const [records, setRecords] = useState<BeforeAfterRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BeforeAfterRecord | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("before_after_records")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") q = q.eq("status", statusFilter);

    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar registros", description: error.message, variant: "destructive" });
    }
    setRecords((data ?? []) as BeforeAfterRecord[]);
    setLoading(false);
  }, [workspaceId, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Apagar registro "${title}"?`)) return;
    const { error } = await supabase.from("before_after_records").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Registro removido" });
      await fetchData();
    }
  };

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: BeforeAfterRecord) => { setEditing(r); setDialogOpen(true); };

  const counts = useMemo(() => {
    const map: Record<string, number> = { draft: 0, in_progress: 0, completed: 0 };
    records.forEach((r) => { map[r.status] = (map[r.status] ?? 0) + 1; });
    return map;
  }, [records]);

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando registros...</p>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Provas de transformação</p>
          <p className="text-xs text-muted-foreground">
            {records.length} {records.length === 1 ? "registro" : "registros"}
            {" · "}base estruturada para Case futuro
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> Novo registro
        </Button>
      </div>

      {/* Status counts + filter */}
      <div className="flex items-center gap-2 flex-wrap border-t border-border pt-3">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {BEFORE_AFTER_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 ml-auto">
          {BEFORE_AFTER_STATUS_OPTIONS.map((o) => (
            <Badge
              key={o.value}
              variant="outline"
              className={`text-[10px] ${getBeforeAfterStatusColor(o.value)}`}
            >
              {o.label}: {counts[o.value] ?? 0}
            </Badge>
          ))}
        </div>
      </div>

      {/* Empty / list */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <Sparkles className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhum Before/After registrado</p>
          <p className="text-xs text-muted-foreground max-w-md text-center">
            Estruture provas de transformação combinando antes, problema, solução e depois — sustentadas por Assets e Métricas já capturadas.
          </p>
          <Button size="sm" variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Criar primeiro registro
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const md = (r.metadata ?? {}) as Record<string, unknown>;
            const assetSnap = (md.asset_titles_snapshot as AssetSnapshotEntry[] | undefined) ?? [];
            const metricSnap = (md.metric_snapshot_summary as MetricSnapshotEntry[] | undefined) ?? [];
            const assetCount = Array.isArray(md.asset_ids) ? (md.asset_ids as string[]).length : assetSnap.length;
            const metricCount = Array.isArray(md.metric_snapshot_ids) ? (md.metric_snapshot_ids as string[]).length : metricSnap.length;
            const updated = r.updated_at ?? r.created_at;
            return (
              <Card
                key={r.id}
                className="hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => openEdit(r)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{r.title}</span>
                        <Badge variant="outline" className={`text-[10px] ${getBeforeAfterStatusColor(r.status)}`}>
                          {getBeforeAfterStatusLabel(r.status)}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Atualizado em {new Date(updated).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleDelete(r.id, r.title); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Antes → Depois preview */}
                  {(r.before_summary || r.after_summary) && (
                    <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-2 items-start">
                      <div className="rounded-md border border-border bg-secondary/30 p-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Antes</p>
                        <p className="text-xs text-foreground line-clamp-3">
                          {r.before_summary?.trim() || <span className="italic text-muted-foreground">Sem registro</span>}
                        </p>
                      </div>
                      <div className="hidden sm:flex items-center justify-center pt-6">
                        <ArrowRight className="h-4 w-4 text-primary" />
                      </div>
                      <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
                        <p className="text-[10px] uppercase tracking-wide text-primary mb-1">Depois</p>
                        <p className="text-xs text-foreground line-clamp-3">
                          {r.after_summary?.trim() || <span className="italic text-muted-foreground">Sem registro</span>}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Métrica principal */}
                  {r.main_metric_summary && (
                    <div className="flex items-start gap-2 rounded-md border border-border bg-card p-2">
                      <LineChart className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                      <p className="text-xs text-foreground leading-relaxed">{r.main_metric_summary}</p>
                    </div>
                  )}

                  {/* Vínculos */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                    <span className="inline-flex items-center gap-1">
                      <PackageCheck className="h-3 w-3" /> {assetCount} {assetCount === 1 ? "asset" : "assets"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <LineChart className="h-3 w-3" /> {metricCount} {metricCount === 1 ? "snapshot" : "snapshots"}
                    </span>
                    {r.evidence_notes && <span>· evidências registradas</span>}
                  </div>

                  {/* Snapshot legível dos vínculos */}
                  {(assetSnap.length > 0 || metricSnap.length > 0) && (
                    <div className="flex flex-wrap gap-1 pt-1 border-t border-border">
                      {assetSnap.slice(0, 3).map((a) => (
                        <Badge key={a.id} variant="outline" className="text-[10px] inline-flex items-center gap-1">
                          <PackageCheck className="h-2.5 w-2.5" />
                          <span className="max-w-[140px] truncate">{a.title}</span>
                        </Badge>
                      ))}
                      {assetSnap.length > 3 && (
                        <Badge variant="outline" className="text-[10px]">+{assetSnap.length - 3}</Badge>
                      )}
                      {metricSnap.slice(0, 2).map((m) => (
                        <Badge key={m.id} variant="outline" className="text-[10px] inline-flex items-center gap-1">
                          <LineChart className="h-2.5 w-2.5" />
                          <span className="max-w-[160px] truncate">{m.label}</span>
                        </Badge>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <BeforeAfterRecordDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        record={editing}
        onSaved={fetchData}
        onTimelineRefresh={onTimelineRefresh}
      />
    </div>
  );
}
