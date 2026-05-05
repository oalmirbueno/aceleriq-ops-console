import { useEffect, useState } from "react";
import { FolderKanban, Search, Layout, Trash2, ArrowRight, ChevronDown, Folder, FolderOpen, Plus, Archive, ArchiveRestore, Eye, EyeOff } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";
import { ACELERA_STAGES, type AceleraStageKey } from "@/components/workspace/canvasProjectTypes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface WorkspaceOption {
  id: string;
  name: string;
  client_id: string;
  current_stage: string;
  status: string;
  updated_at: string | null;
  clients: { id: string; name: string; company_name: string | null; logo_url?: string | null; status?: string | null } | null;
}

const STAGE_KEYS: AceleraStageKey[] = ACELERA_STAGES.map(s => s.key);

/**
 * Deriva a etapa "real" do workspace baseado nos nodes:
 * pega a etapa mais avançada que tenha pelo menos um node ativo/done.
 * Fallback para current_stage do workspace.
 */
function deriveStage(currentStage: string, stageHits: Record<string, { active: number; done: number; total: number }>): AceleraStageKey {
  // Procura a etapa mais avançada com atividade (active OU done)
  for (let i = STAGE_KEYS.length - 1; i >= 0; i--) {
    const k = STAGE_KEYS[i];
    const hit = stageHits[k];
    if (hit && (hit.active > 0 || hit.done > 0)) return k;
  }
  // Sem atividade → confia no current_stage
  return (STAGE_KEYS.includes(currentStage as AceleraStageKey) ? currentStage : "entrada") as AceleraStageKey;
}

function progressFromStage(stage: AceleraStageKey): number {
  const i = STAGE_KEYS.indexOf(stage);
  return Math.round(((i + 1) / STAGE_KEYS.length) * 100);
}

export default function CanvasPage() {
  const navigate = useNavigate();
  // Se veio com workspaceId na URL, abre direto no canvas fullscreen
  const [searchParams] = useSearchParams();
  const directWsId = searchParams.get("workspaceId");

  useEffect(() => {
    if (!directWsId) return;
    navigate(`/ops/workspaces/${directWsId}?tab=canvas`, { replace: true });
  }, [directWsId, navigate]);

  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [derivedStages, setDerivedStages] = useState<Record<string, AceleraStageKey>>({});
  const [nodeCounts, setNodeCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const fetchWorkspaces = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("workspaces")
      .select("id, name, client_id, current_stage, status, updated_at, clients(id, name, company_name, logo_url, status)")
      .order("updated_at", { ascending: false })
      .limit(200);
    const list = (data ?? []) as unknown as WorkspaceOption[];
    setWorkspaces(list);

    // Buscar nodes de todos os workspaces para derivar etapa real
    const ids = list.map(w => w.id);
    if (ids.length > 0) {
      const { data: nodes } = await supabase
        .from("canvas_nodes")
        .select("workspace_id, data")
        .in("workspace_id", ids);

      const counts: Record<string, number> = {};
      const perWsStage: Record<string, Record<string, { active: number; done: number; total: number }>> = {};
      (nodes ?? []).forEach((n: any) => {
        counts[n.workspace_id] = (counts[n.workspace_id] ?? 0) + 1;
        const stage = (n.data?.stage as string) ?? "entrada";
        const status = (n.data?.status as string) ?? "draft";
        perWsStage[n.workspace_id] ??= {};
        perWsStage[n.workspace_id][stage] ??= { active: 0, done: 0, total: 0 };
        perWsStage[n.workspace_id][stage].total++;
        if (status === "active") perWsStage[n.workspace_id][stage].active++;
        if (status === "done") perWsStage[n.workspace_id][stage].done++;
      });
      setNodeCounts(counts);
      const derived: Record<string, AceleraStageKey> = {};
      const toUpdate: Array<{ id: string; stage: AceleraStageKey }> = [];
      list.forEach(ws => {
        const d = deriveStage(ws.current_stage, perWsStage[ws.id] ?? {});
        derived[ws.id] = d;
        // Persiste avanço se etapa derivada for mais avançada que a salva
        const savedIdx = STAGE_KEYS.indexOf(ws.current_stage as AceleraStageKey);
        const newIdx = STAGE_KEYS.indexOf(d);
        if (newIdx > savedIdx) toUpdate.push({ id: ws.id, stage: d });
      });
      setDerivedStages(derived);
      // Sincroniza em background — não bloqueia render
      toUpdate.forEach(u => {
        supabase.from("workspaces").update({ current_stage: u.stage }).eq("id", u.id).then(() => {});
      });
    }
    setLoading(false);
  };

  useEffect(() => { fetchWorkspaces(); }, []);

  // Pastas recolhidas por padrão na primeira carga (mais limpo)
  useEffect(() => {
    if (collapsedInitialized || workspaces.length === 0) return;
    const init: Record<string, boolean> = {};
    workspaces.forEach(w => {
      const cId = w.clients?.id ?? w.client_id;
      init[cId] = true;
    });
    setCollapsed(init);
    setCollapsedInitialized(true);
  }, [workspaces, collapsedInitialized]);

  // Quando há busca ativa, expande automaticamente para mostrar resultados
  useEffect(() => {
    if (query.trim().length > 0) {
      setCollapsed({});
    }
  }, [query]);

  const filtered = workspaces.filter((ws) => {
    if (!showArchived) {
      if (ws.status === "archived") return false;
      if (ws.clients?.status === "archived") return false;
    }
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      ws.name.toLowerCase().includes(q) ||
      ws.clients?.name.toLowerCase().includes(q) ||
      ws.clients?.company_name?.toLowerCase().includes(q)
    );
  });

  const openCanvas = (ws: WorkspaceOption, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(`/ops/workspaces/${ws.id}?tab=canvas`);
  };

  const deleteWorkspace = async (ws: WorkspaceOption) => {
    try {
      await supabase.from("canvas_edges").delete().eq("workspace_id", ws.id);
      await supabase.from("canvas_nodes").delete().eq("workspace_id", ws.id);
      await supabase.from("timeline_events").delete().eq("workspace_id", ws.id);
      const { error } = await supabase.from("workspaces").delete().eq("id", ws.id);
      if (error) throw error;
      toast({ title: "Workspace removido" });
      // Update otimista — remove do estado sem refetch (evita "reinício" da página)
      setWorkspaces(prev => prev.filter(w => w.id !== ws.id));
      setNodeCounts(prev => {
        const next = { ...prev };
        delete next[ws.id];
        return next;
      });
      setDerivedStages(prev => {
        const next = { ...prev };
        delete next[ws.id];
        return next;
      });
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message, variant: "destructive" });
    }
  };

  const toggleArchiveWorkspace = async (ws: WorkspaceOption) => {
    const next = ws.status === "archived" ? "active" : "archived";
    try {
      const { error } = await supabase.from("workspaces").update({ status: next }).eq("id", ws.id);
      if (error) throw error;
      toast({ title: next === "archived" ? "Projeto arquivado" : "Projeto reativado" });
      setWorkspaces(prev => prev.map(w => w.id === ws.id ? { ...w, status: next } : w));
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err?.message, variant: "destructive" });
    }
  };

  // Agrupa por CLIENTE (pasta) — cada cliente vira uma pasta com seus projetos/workspaces
  const groupedByClient = (() => {
    const map = new Map<string, { client: WorkspaceOption["clients"] & { id: string }; items: WorkspaceOption[] }>();
    filtered.forEach(ws => {
      const cId = ws.clients?.id ?? ws.client_id;
      const cName = ws.clients?.name ?? "Cliente sem nome";
      const existing = map.get(cId);
      if (existing) existing.items.push(ws);
      else map.set(cId, {
        client: { id: cId, name: cName, company_name: ws.clients?.company_name ?? null, logo_url: ws.clients?.logo_url ?? null },
        items: [ws],
      });
    });
    return Array.from(map.values()).sort((a, b) => a.client.name.localeCompare(b.client.name));
  })();

  const toggleCollapse = (clientId: string) => setCollapsed(prev => ({ ...prev, [clientId]: !prev[clientId] }));

  return (
    <div className="min-h-screen bg-background p-8 page-enter">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm">
              <Layout className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Canvas operacional</h1>
              <p className="text-sm text-muted-foreground mt-1">Pastas por cliente — escolha o projeto para abrir o canvas</p>
            </div>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar projeto ou cliente..."
              className="pl-9 h-10"
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant={showArchived ? "default" : "outline"}
            className="h-10 gap-1.5"
            onClick={() => setShowArchived(v => !v)}
            title={showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          >
            {showArchived ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Button>
        </div>

        {loading ? (
          <LoadingState />
        ) : groupedByClient.length === 0 ? (
          <EmptyState icon={FolderKanban} title="Nenhum projeto disponível" description="Crie um workspace para acessar o canvas." />
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            {groupedByClient.map(({ client, items }) => {
              const isCollapsed = collapsed[client.id];
              return (
                <section key={client.id} className="rounded-xl border border-border bg-card/40 overflow-hidden transition-all hover:border-border self-start">
                  {/* Folder header */}
                  <button
                    type="button"
                    onClick={() => toggleCollapse(client.id)}
                    className="w-full flex items-center gap-4 px-6 py-5 hover:bg-card/80 transition-colors text-left"
                  >
                    <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    <div className="text-primary">
                      {isCollapsed ? <Folder className="h-6 w-6" /> : <FolderOpen className="h-6 w-6" />}
                    </div>
                    <ClientAvatar name={client.name} seed={client.id} logoUrl={client.logo_url} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-lg font-semibold text-foreground">{client.name}</p>
                      {client.company_name && <p className="truncate text-sm text-muted-foreground">{client.company_name}</p>}
                    </div>
                    <Badge variant="outline" className="text-xs uppercase tracking-wider">
                      {items.length} projeto{items.length > 1 ? "s" : ""}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-9 gap-1 text-sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/ops/clients/${client.id}`); }}
                    >
                      Gerir <ArrowRight className="h-4 w-4" />
                    </Button>
                  </button>

                  {/* Projects grid */}
                  {!isCollapsed && (
                    <div className="border-t border-border/50 bg-background/30 p-3">
                      <div className="flex flex-col gap-1.5">
                        {items.map(ws => {
                          const stage = derivedStages[ws.id] ?? (ws.current_stage as AceleraStageKey);
                          const stageMeta = ACELERA_STAGES.find(s => s.key === stage) ?? ACELERA_STAGES[0];
                          const progress = progressFromStage(stage);
                          const nodes = nodeCounts[ws.id] ?? 0;
                          return (
                            <div
                              key={ws.id}
                              className="group relative rounded-lg border border-border bg-card px-4 py-3.5 transition-all hover:border-primary/40 hover:shadow-sm cursor-pointer"
                              onClick={(e) => openCanvas(ws, e)}
                            >
                              <div className="flex items-center gap-3">
                                <FolderKanban className="h-5 w-5 text-primary/70 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="truncate text-base font-semibold text-foreground leading-tight">{ws.name}</p>
                                    <span
                                      className="hidden sm:inline-flex h-5 items-center gap-1 rounded border border-border bg-background/60 px-1.5 font-mono text-[10px] font-semibold text-muted-foreground shrink-0"
                                      title={getStagePremiumLabel(stage)}
                                    >
                                      <span className="text-foreground/80">{stageMeta.letter}</span>
                                      <span className="text-muted-foreground/70">·</span>
                                      <span className="truncate max-w-[110px]">{getStagePremiumLabel(stage)}</span>
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground/60 mt-1 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                                    {nodes} node{nodes !== 1 ? "s" : ""}
                                  </p>
                                </div>
                                <div className="hidden sm:flex flex-col items-end gap-1 w-20 shrink-0">
                                  <span className="text-[11px] font-semibold text-primary/80 tabular-nums opacity-60 group-hover:opacity-100 transition-opacity">{progress}%</span>
                                  <Progress value={progress} className="h-1 w-full" />
                                </div>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 hover:bg-secondary"
                                    title={ws.status === "archived" ? "Reativar projeto" : "Arquivar projeto"}
                                    onClick={(e) => { e.stopPropagation(); toggleArchiveWorkspace(ws); }}
                                  >
                                    {ws.status === "archived"
                                      ? <ArchiveRestore className="h-4 w-4 text-primary" />
                                      : <Archive className="h-4 w-4 text-muted-foreground" />}
                                  </Button>
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                        title="Remover projeto"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>Remover projeto?</AlertDialogTitle>
                                        <AlertDialogDescription>"{ws.name}" e todos os nodes/edges/timeline associados serão removidos. Ação irreversível.</AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => deleteWorkspace(ws)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                </div>
                                <ArrowRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors shrink-0" />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  {/* (compact list rendered above) */}
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
