import { useState, useEffect, useCallback } from "react";
import { Plus, PackageCheck, ExternalLink, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CreateAssetDialog from "./CreateAssetDialog";
import {
  ASSET_TYPE_OPTIONS, VALIDATION_STATUS_OPTIONS,
  getAssetTypeLabel, getAssetTypeColor,
  getValidationLabel, getValidationColor,
  type AssetType, type ValidationStatus,
} from "./assetConstants";

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

interface Front {
  id: string;
  name: string;
}

interface Props {
  workspaceId: string;
  clientId: string;
  onTimelineRefresh?: () => Promise<void> | void;
}

export default function WorkspaceTabAssets({ workspaceId, clientId, onTimelineRefresh }: Props) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [fronts, setFronts] = useState<Front[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Filters
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frontFilter, setFrontFilter] = useState("all");

  // Selected asset for status change
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
      if (frontFilter === "none") {
        q = q.is("operational_front_id", null);
      } else {
        q = q.eq("operational_front_id", frontFilter);
      }
    }

    const [{ data }, { data: frontData }] = await Promise.all([
      q,
      supabase.from("operational_fronts").select("id, name").eq("workspace_id", workspaceId).order("name"),
    ]);

    setAssets((data ?? []) as Asset[]);
    setFronts((frontData ?? []) as Front[]);
    setLoading(false);
  }, [workspaceId, typeFilter, statusFilter, frontFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStatusChange = async (assetId: string, newStatus: string, assetTitle: string) => {
    setChangingId(assetId);
    const { error } = await supabase
      .from("assets")
      .update({ validation_status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", assetId);

    if (error) {
      toast({ title: "Erro ao atualizar status", description: error.message, variant: "destructive" });
    } else {
      if (newStatus === "validated" || newStatus === "case_ready") {
        const eventTitle = newStatus === "validated"
          ? `Asset validado: ${assetTitle}`
          : `Asset pronto p/ case: ${assetTitle}`;
        const { error: timelineError } = await supabase.from("timeline_events").insert({
          workspace_id: workspaceId,
          client_id: clientId,
          event_type: "context_added",
          title: eventTitle,
          description: `Status: ${newStatus === "validated" ? "Validado" : "Pronto p/ Case"}`,
          happened_at: new Date().toISOString(),
        });

        if (timelineError) {
          toast({ title: "Status atualizado, mas timeline falhou", description: timelineError.message, variant: "destructive" });
        }
      }

      toast({ title: "Status atualizado" });
      await fetchData();
      await onTimelineRefresh?.();
    }
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

  const frontName = (id: string | null) => {
    if (!id) return null;
    return fronts.find(f => f.id === id)?.name ?? null;
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando assets...</p>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
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
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Novo Asset
        </Button>
      </div>

      {/* List */}
      {assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <PackageCheck className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhum asset registrado</p>
          <p className="text-xs text-muted-foreground max-w-sm text-center">
            Registre entregáveis, provas operacionais, evidências de resultado e materiais de case vinculados às frentes.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {assets.map(a => {
            const fName = frontName(a.operational_front_id);
            return (
              <Card key={a.id} className="hover:border-primary/30 transition-colors">
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
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                        {fName && <span>Frente: {fName}</span>}
                        {a.primary_use && <span>• {a.primary_use}</span>}
                        {a.happened_at && <span>• {new Date(a.happened_at).toLocaleDateString("pt-BR")}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {a.external_url && (
                        <a href={a.external_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Select
                        value={a.validation_status}
                        onValueChange={(v) => handleStatusChange(a.id, v, a.title)}
                        disabled={changingId === a.id}
                      >
                        <SelectTrigger className="h-7 w-[120px] text-[10px]"><SelectValue /></SelectTrigger>
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
                        onClick={() => handleDelete(a.id, a.title)}
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
    </div>
  );
}
