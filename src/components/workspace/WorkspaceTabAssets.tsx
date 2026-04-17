import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, PackageCheck, ExternalLink, Trash2, FolderKanban, ListChecks, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CreateAssetDialog from "./CreateAssetDialog";
import AssetDetailDialog, { type AssetDetailRecord } from "./AssetDetailDialog";
import {
  ASSET_TYPE_OPTIONS, VALIDATION_STATUS_OPTIONS,
  getAssetTypeLabel, getAssetTypeColor,
  getValidationLabel, getValidationColor,
  type ValidationStatus,
} from "./assetConstants";
import {
  ASSET_TIMELINE_EVENT_TYPE,
  buildAssetEventDescription,
  buildAssetEventTitle,
} from "./assetTimeline";

interface Asset {
  id: string;
  workspace_id: string;
  client_id: string;
  operational_front_id: string | null;
  task_id: string | null;
  asset_type: string;
  title: string;
  description: string | null;
  external_url: string | null;
  validation_status: string;
  primary_use: string | null;
  observation: string | null;
  happened_at: string | null;
  created_at: string;
}

interface Front { id: string; name: string }
interface TaskLite { id: string; title: string }

interface Props {
  workspaceId: string;
  clientId: string;
  onTimelineRefresh?: () => Promise<void> | void;
}

/* ─── Maturity grouping (case-ready first) ─── */
const MATURITY_ORDER: Array<{
  key: ValidationStatus;
  label: string;
  hint: string;
  accent: string;
  icon: typeof Sparkles;
}> = [
  { key: "case_ready", label: "Pronto p/ Case", hint: "Material pronto para uso em case ou portfólio", accent: "text-violet-400", icon: Sparkles },
  { key: "validated", label: "Validado", hint: "Prova confirmada como evidência sólida", accent: "text-emerald-400", icon: PackageCheck },
  { key: "registered", label: "Registrado", hint: "Asset registrado e em uso operacional", accent: "text-blue-400", icon: PackageCheck },
  { key: "draft", label: "Rascunho", hint: "Em construção, ainda não validado", accent: "text-muted-foreground", icon: PackageCheck },
];

export default function WorkspaceTabAssets({ workspaceId, clientId, onTimelineRefresh }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [fronts, setFronts] = useState<Front[]>([]);
  const [tasks, setTasks] = useState<TaskLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailAsset, setDetailAsset] = useState<AssetDetailRecord | null>(null);

  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frontFilter, setFrontFilter] = useState("all");

  const [changingId, setChangingId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    let q = supabase
      .from("assets")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (typeFilter !== "all") q = q.eq("asset_type", typeFilter);
    if (statusFilter !== "all") q = q.eq("validation_status", statusFilter);
    if (frontFilter !== "all") {
      if (frontFilter === "none") q = q.is("operational_front_id", null);
      else q = q.eq("operational_front_id", frontFilter);
    }

    const [{ data }, { data: frontData }, { data: taskData }] = await Promise.all([
      q,
      supabase.from("operational_fronts").select("id, name").eq("workspace_id", workspaceId).order("name"),
      supabase.from("tasks").select("id, title").eq("workspace_id", workspaceId).limit(500),
    ]);

    setAssets((data ?? []) as Asset[]);
    setFronts((frontData ?? []) as Front[]);
    setTasks((taskData ?? []) as TaskLite[]);
    setLoading(false);
  }, [workspaceId, typeFilter, statusFilter, frontFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const frontName = useCallback(
    (id: string | null) => (id ? fronts.find(f => f.id === id)?.name ?? null : null),
    [fronts],
  );
  const taskTitle = useCallback(
    (id: string | null) => (id ? tasks.find(t => t.id === id)?.title ?? null : null),
    [tasks],
  );

  const handleStatusChange = async (asset: Asset, newStatus: string) => {
    if (newStatus === asset.validation_status) return;
    setChangingId(asset.id);
    const { error } = await supabase
      .from("assets")
      .update({ validation_status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", asset.id);

    if (error) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
      setChangingId(null);
      return;
    }

    if (newStatus === "validated" || newStatus === "case_ready") {
      const action = newStatus === "validated" ? "validated" : "case_ready";
      const { error: tlError } = await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: ASSET_TIMELINE_EVENT_TYPE,
        title: buildAssetEventTitle({ action, assetTitle: asset.title, assetType: asset.asset_type }),
        description: buildAssetEventDescription({
          action,
          assetTitle: asset.title,
          assetType: asset.asset_type,
          newStatus,
          frontName: frontName(asset.operational_front_id),
          taskTitle: taskTitle(asset.task_id),
          primaryUse: asset.primary_use,
        }),
        happened_at: new Date().toISOString(),
      });
      if (tlError) {
        toast({ title: "Status salvo, mas timeline falhou", description: tlError.message, variant: "destructive" });
      }
    }

    toast({ title: "Status atualizado" });
    await fetchData();
    await onTimelineRefresh?.();
    setChangingId(null);
  };

  const handleDelete = async (assetId: string, assetTitle: string) => {
    if (!confirm(`Apagar asset "${assetTitle}"?`)) return;
    const { error } = await supabase.from("assets").delete().eq("id", assetId);
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Asset apagado" });
      await fetchData();
      await onTimelineRefresh?.();
    }
  };

  /* ─── Group by maturity ─── */
  const grouped = useMemo(() => {
    const map = new Map<string, Asset[]>();
    for (const stage of MATURITY_ORDER) map.set(stage.key, []);
    for (const a of assets) {
      const bucket = map.get(a.validation_status) ?? map.get("draft")!;
      bucket.push(a);
    }
    return map;
  }, [assets]);

  const totalCount = assets.length;
  const caseReadyCount = grouped.get("case_ready")?.length ?? 0;
  const validatedCount = grouped.get("validated")?.length ?? 0;

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando assets...</p>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header summary */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Provas operacionais</p>
          <p className="text-xs text-muted-foreground">
            {totalCount} {totalCount === 1 ? "asset" : "assets"} ·{" "}
            <span className="text-emerald-400">{validatedCount} validados</span> ·{" "}
            <span className="text-violet-400">{caseReadyCount} prontos p/ case</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Asset
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap border-t border-border pt-3">
        <PackageCheck className="h-4 w-4 text-muted-foreground" />
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            {ASSET_TYPE_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {VALIDATION_STATUS_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={frontFilter} onValueChange={setFrontFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Frente" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as frentes</SelectItem>
            <SelectItem value="none">Sem frente</SelectItem>
            {fronts.map(f => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Empty */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <PackageCheck className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhum asset registrado</p>
          <p className="text-xs text-muted-foreground max-w-sm text-center">
            Registre entregáveis, provas operacionais, evidências de resultado e materiais de case vinculados às frentes.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {MATURITY_ORDER.map(stage => {
            const items = grouped.get(stage.key) ?? [];
            if (items.length === 0) return null;
            const Icon = stage.icon;
            return (
              <section key={stage.key} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Icon className={`h-3.5 w-3.5 ${stage.accent}`} />
                  <span className={`text-xs font-medium ${stage.accent}`}>{stage.label}</span>
                  <span className="text-[10px] text-muted-foreground">· {items.length}</span>
                  <span className="text-[10px] text-muted-foreground italic ml-1">{stage.hint}</span>
                </div>
                <div className="space-y-2">
                  {items.map(a => {
                    const fName = frontName(a.operational_front_id);
                    const tName = taskTitle(a.task_id);
                    return (
                      <Card
                        key={a.id}
                        className="hover:border-primary/40 transition-colors cursor-pointer"
                        onClick={() => setDetailAsset(a as AssetDetailRecord)}
                      >
                        <CardContent className="p-3 space-y-1.5">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium truncate">{a.title}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getAssetTypeColor(a.asset_type)}`}>
                                  {getAssetTypeLabel(a.asset_type)}
                                </Badge>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getValidationColor(a.validation_status)}`}>
                                  {getValidationLabel(a.validation_status)}
                                </Badge>
                              </div>
                              {a.description && (
                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{a.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                                {fName ? (
                                  <span className="inline-flex items-center gap-1">
                                    <FolderKanban className="h-3 w-3 text-primary/70" />
                                    <span className="text-foreground/80">{fName}</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 italic">
                                    <FolderKanban className="h-3 w-3" /> Sem frente
                                  </span>
                                )}
                                {tName && (
                                  <span className="inline-flex items-center gap-1">
                                    <ListChecks className="h-3 w-3" />
                                    <span className="truncate max-w-[180px]">{tName}</span>
                                  </span>
                                )}
                                {a.primary_use && <span>• {a.primary_use}</span>}
                                {a.happened_at && <span>• {new Date(a.happened_at).toLocaleDateString("pt-BR")}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                              {a.external_url && (
                                <a
                                  href={a.external_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/80"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                              <Select
                                value={a.validation_status}
                                onValueChange={(v) => handleStatusChange(a, v)}
                                disabled={changingId === a.id}
                              >
                                <SelectTrigger
                                  className="h-7 w-[120px] text-[10px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {VALIDATION_STATUS_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); handleDelete(a.id, a.title); }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <CreateAssetDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        onCreated={async () => {
          await fetchData();
          await onTimelineRefresh?.();
        }}
      />

      <AssetDetailDialog
        asset={detailAsset}
        open={!!detailAsset}
        onOpenChange={(o) => !o && setDetailAsset(null)}
        frontName={frontName(detailAsset?.operational_front_id ?? null)}
        taskName={taskTitle(detailAsset?.task_id ?? null)}
      />
    </div>
  );
}
