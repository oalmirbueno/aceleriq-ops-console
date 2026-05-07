import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Columns3, Eye, EyeOff, Folder, FolderKanban, FolderOpen, Grid3X3, List, Network, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface WorkspaceHubItem {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  summary: string | null;
  updated_at: string | null;
  created_at: string;
  clients: {
    id: string;
    name: string;
    company_name: string | null;
    segment: string | null;
    plan_name: string | null;
    logo_url?: string | null;
    status?: string | null;
  } | null;
}

const STAGES = ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"];
const STAGE_LETTERS = ["A", "C", "E", "L", "E", "R", "A", "+"];

type ViewMode = "folders" | "line" | "cards" | "list";

function progressFor(stage: string) {
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.round(((index + 1) / STAGES.length) * 100);
}

function canvasUrl(workspace: WorkspaceHubItem) {
  return `/ops/workspaces/${workspace.id}?tab=canvas`;
}

function WorkspaceMiniCard({ workspace, nodeCount, onOpen, onCanvas }: { workspace: WorkspaceHubItem; nodeCount: number; onOpen: () => void; onCanvas: () => void }) {
  const client = workspace.clients;
  const progress = progressFor(workspace.current_stage);
  // Mostra projeto como título principal e cliente como contexto.
  // Se nome do projeto == nome do cliente, evita duplicação ocultando o subtítulo.
  const projectTitle = workspace.name;
  const clientLabel = client?.name ?? "—";
  const companyLabel = client?.company_name ?? null;
  const isSameAsClient = projectTitle.trim().toLowerCase() === clientLabel.trim().toLowerCase();
  return (
    <article className="workspace-hub-card accent-border-left">
      <div className="flex items-start gap-3">
        <ClientAvatar name={clientLabel} seed={client?.id ?? workspace.id} logoUrl={client?.logo_url} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{projectTitle}</h2>
          <p className="truncate text-[11px] text-muted-foreground">
            <span className="text-foreground/70">{clientLabel}</span>
            {!isSameAsClient && companyLabel && <span className="text-muted-foreground/70"> · {companyLabel}</span>}
          </p>
        </div>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">{client?.plan_name ?? workspace.status}</Badge>
      </div>
      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-xs">
          <span className="text-foreground/70">{getStagePremiumLabel(workspace.current_stage)}</span>
          <span className="font-semibold text-primary">{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{nodeCount} nodes ativos</span>
        <span>{workspace.updated_at ? new Date(workspace.updated_at).toLocaleDateString("pt-BR") : "sem movimento"}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="secondary" className="h-8 flex-1" onClick={onOpen}>Abrir <ArrowRight className="h-3.5 w-3.5" /></Button>
        <Button size="sm" variant="outline" className="h-8" onClick={onCanvas}><Network className="h-3.5 w-3.5" /> Canvas</Button>
      </div>
    </article>
  );
}

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceHubItem[]>([]);
  const [nodeCounts, setNodeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("__all__");
  const [viewMode, setViewMode] = useState<ViewMode>("folders");
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [collapsedInitialized, setCollapsedInitialized] = useState(false);

  useEffect(() => {
    async function fetchWorkspaces() {
      setLoading(true);
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, status, current_stage, summary, updated_at, created_at, clients(id, name, company_name, segment, plan_name, logo_url, status)")
        .is("deleted_at", null)
        .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)")
        .order("updated_at", { ascending: false });

      if (!error && data) {
        const rows = data as unknown as WorkspaceHubItem[];
        setWorkspaces(rows);
        const ids = rows.map((w) => w.id);
        if (ids.length > 0) {
          const { data: nodes } = await supabase
            .from("canvas_nodes")
            .select("workspace_id")
            .in("workspace_id", ids)
            .is("deleted_at", null)
            .is("archived_at", null)
            .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)");
          setNodeCounts((nodes ?? []).reduce<Record<string, number>>((acc, node: any) => {
            acc[node.workspace_id] = (acc[node.workspace_id] ?? 0) + 1;
            return acc;
          }, {}));
        }
      }
      setLoading(false);
    }
    fetchWorkspaces();
  }, []);

  // Pastas recolhidas por padrão (visão limpa)
  useEffect(() => {
    if (collapsedInitialized || workspaces.length === 0) return;
    const init: Record<string, boolean> = {};
    workspaces.forEach((w) => {
      const cId = w.clients?.id ?? w.id;
      init[cId] = true;
    });
    setCollapsed(init);
    setCollapsedInitialized(true);
  }, [workspaces, collapsedInitialized]);

  // Busca ativa expande automaticamente
  useEffect(() => {
    if (search.trim().length > 0) setCollapsed({});
  }, [search]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspaces.filter((workspace) => {
      const client = workspace.clients;
      if (!showArchived) {
        if (workspace.status === "archived") return false;
        if (client?.status === "archived") return false;
      }
      const matchesSearch = !q || workspace.name.toLowerCase().includes(q) || client?.name.toLowerCase().includes(q) || client?.company_name?.toLowerCase().includes(q);
      const matchesStage = stageFilter === "__all__" || workspace.current_stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [workspaces, search, stageFilter, showArchived]);

  // Agrupa por cliente — mesma estrutura do CanvasPage
  const groupedByClient = useMemo(() => {
    const map = new Map<string, { client: { id: string; name: string; company_name: string | null; logo_url: string | null; plan_name: string | null }; items: WorkspaceHubItem[] }>();
    filtered.forEach((ws) => {
      const cId = ws.clients?.id ?? ws.id;
      const cName = ws.clients?.name ?? "Cliente sem nome";
      const existing = map.get(cId);
      if (existing) existing.items.push(ws);
      else map.set(cId, {
        client: {
          id: cId,
          name: cName,
          company_name: ws.clients?.company_name ?? null,
          logo_url: ws.clients?.logo_url ?? null,
          plan_name: ws.clients?.plan_name ?? null,
        },
        items: [ws],
      });
    });
    return Array.from(map.values()).sort((a, b) => a.client.name.localeCompare(b.client.name));
  }, [filtered]);

  const toggleCollapse = (clientId: string) => setCollapsed((prev) => ({ ...prev, [clientId]: !prev[clientId] }));

  const byStage = useMemo(() => {
    const map: Record<string, WorkspaceHubItem[]> = Object.fromEntries(STAGES.map((stage) => [stage, []]));
    filtered.forEach((workspace) => (map[workspace.current_stage] ??= []).push(workspace));
    return map;
  }, [filtered]);

  const openWorkspace = (workspace: WorkspaceHubItem) => navigate(`/ops/workspaces/${workspace.id}`);
  const openCanvas = (workspace: WorkspaceHubItem) => navigate(canvasUrl(workspace));

  return (
    <>
      <AppHeader title="Hub de Workspaces" subtitle="Linha de produção operacional por cliente, etapa e avanço" />
      <div className="p-6 page-enter space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou workspace..." className="pl-9" />
          </div>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as etapas</SelectItem>
              {STAGES.map((stage) => <SelectItem key={stage} value={stage}>{getStagePremiumLabel(stage)}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex rounded-md border border-border bg-card p-1">
            {[{ id: "folders", icon: Folder }, { id: "line", icon: Columns3 }, { id: "cards", icon: Grid3X3 }, { id: "list", icon: List }].map((item) => {
              const Icon = item.icon;
              return <button key={item.id} onClick={() => setViewMode(item.id as ViewMode)} className={cn("h-8 w-8 rounded text-muted-foreground transition-colors hover:text-foreground", viewMode === item.id && "bg-primary/10 text-primary")}><Icon className="mx-auto h-4 w-4" /></button>;
            })}
          </div>
          <Button
            type="button"
            size="sm"
            variant={showArchived ? "default" : "outline"}
            className="h-9 gap-1.5"
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          >
            {showArchived ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Button>
          <Button variant="outline" onClick={() => navigate("/ops/clients")}>+ Novo cliente</Button>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title={workspaces.length === 0 ? "Nenhum workspace criado" : "Nenhum workspace encontrado"} description={workspaces.length === 0 ? "Crie ou selecione clientes para iniciar os hubs de projeto." : "Ajuste busca ou filtro de etapa."} />
        ) : viewMode === "folders" ? (
          <div className="space-y-5">
            {groupedByClient.map(({ client, items }) => {
              const isCollapsed = collapsed[client.id];
              return (
                <section key={client.id} className="rounded-xl border border-border bg-card/40 overflow-hidden transition-all hover:border-border">
                  {/* Folder header */}
                  <button
                    type="button"
                    onClick={() => toggleCollapse(client.id)}
                    className="w-full flex items-center gap-4 px-5 py-4 hover:bg-card/80 transition-colors text-left"
                  >
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                    <div className="text-primary">
                      {isCollapsed ? <Folder className="h-5 w-5" /> : <FolderOpen className="h-5 w-5" />}
                    </div>
                    <ClientAvatar name={client.name} seed={client.id} logoUrl={client.logo_url} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-foreground">{client.name}</p>
                      {client.company_name && <p className="truncate text-xs text-muted-foreground">{client.company_name}</p>}
                    </div>
                    {client.plan_name && (
                      <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary text-[10px] uppercase tracking-wider">
                        {client.plan_name}
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                      {items.length} projeto{items.length > 1 ? "s" : ""}
                    </Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 gap-1 text-xs"
                      onClick={(e) => { e.stopPropagation(); navigate(`/ops/clients/${client.id}`); }}
                    >
                      Gerir <ArrowRight className="h-3 w-3" />
                    </Button>
                  </button>

                  {/* Projects grid */}
                  {!isCollapsed && (
                    <div className="border-t border-border/50 bg-background/30 p-4">
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {items.map((ws) => {
                          const progress = progressFor(ws.current_stage);
                          const nodes = nodeCounts[ws.id] ?? 0;
                          return (
                            <div
                              key={ws.id}
                              className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md cursor-pointer"
                              onClick={() => openWorkspace(ws)}
                            >
                              <div className="flex items-start gap-2 pr-7">
                                <FolderKanban className="h-4 w-4 text-primary/70 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-foreground">{ws.name}</p>
                                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                    {ws.status} · {nodes} node{nodes !== 1 ? "s" : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-[11px]">
                                  <span className="truncate text-foreground/80 font-medium">{getStagePremiumLabel(ws.current_stage)}</span>
                                  <span className="font-semibold text-primary/80 tabular-nums opacity-60 group-hover:opacity-100 transition-opacity">{progress}%</span>
                                </div>
                                <Progress value={progress} className="h-1" />
                              </div>
                              <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground/70 min-h-[16px]">
                                <span className="opacity-0 group-hover:opacity-100 transition-opacity">{ws.updated_at ? new Date(ws.updated_at).toLocaleDateString("pt-BR") : "—"}</span>
                                <span className="inline-flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); openCanvas(ws); }}
                                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-primary font-medium"
                                    title="Abrir canvas"
                                  >
                                    <Network className="h-3 w-3" /> Canvas
                                  </button>
                                  <span className="inline-flex items-center gap-1 text-primary font-medium">
                                    Abrir <ArrowRight className="h-3 w-3" />
                                  </span>
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : viewMode === "line" ? (
          <section className="production-line-wrap surface-2">
            <div className="production-line">
              {STAGES.map((stage, index) => {
                const items = byStage[stage] ?? [];
                return (
                  <div key={stage} className={cn("production-column", items.length > 0 && "is-active") }>
                    <div className="production-column-header">
                      <span className="production-stage-letter">{STAGE_LETTERS[index]}</span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{getStagePremiumLabel(stage)}</p>
                        <p className="text-xs text-muted-foreground">{items.length} cliente{items.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      {items.length === 0 ? <p className="rounded-md border border-border/60 p-4 text-xs text-muted-foreground">Nenhum cliente nesta etapa</p> : items.map((workspace) => (
                        <WorkspaceMiniCard key={workspace.id} workspace={workspace} nodeCount={nodeCounts[workspace.id] ?? 0} onOpen={() => openWorkspace(workspace)} onCanvas={() => openCanvas(workspace)} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : viewMode === "cards" ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((workspace) => <WorkspaceMiniCard key={workspace.id} workspace={workspace} nodeCount={nodeCounts[workspace.id] ?? 0} onOpen={() => openWorkspace(workspace)} onCanvas={() => openCanvas(workspace)} />)}
          </div>
        ) : (
          <div className="surface-2 overflow-hidden rounded-lg">
            {filtered.map((workspace) => (
              <button key={workspace.id} onClick={() => openWorkspace(workspace)} className="flex w-full items-center gap-3 border-b border-border/60 p-4 text-left transition-colors last:border-0 hover:bg-secondary/50">
                <ClientAvatar name={workspace.clients?.name ?? workspace.name} seed={workspace.clients?.id ?? workspace.id} logoUrl={workspace.clients?.logo_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{workspace.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="text-foreground/70">{workspace.clients?.name ?? "—"}</span>
                    <span className="text-muted-foreground/60"> · {getStagePremiumLabel(workspace.current_stage)} · {nodeCounts[workspace.id] ?? 0} nodes</span>
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
