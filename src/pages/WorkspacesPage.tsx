import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Columns3, FolderKanban, Grid3X3, List, Network, Search } from "lucide-react";
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
  } | null;
}

const STAGES = ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"];
const STAGE_LETTERS = ["A", "C", "E", "L", "E", "R", "A", "+"];

type ViewMode = "line" | "cards" | "list";

function progressFor(stage: string) {
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.round(((index + 1) / STAGES.length) * 100);
}

function canvasUrl(workspace: WorkspaceHubItem) {
  const params = new URLSearchParams({ workspaceId: workspace.id, clientId: workspace.clients?.id ?? "", clientName: workspace.clients?.name ?? workspace.name });
  return `/ops/canvas?${params.toString()}`;
}

function WorkspaceMiniCard({ workspace, nodeCount, onOpen, onCanvas }: { workspace: WorkspaceHubItem; nodeCount: number; onOpen: () => void; onCanvas: () => void }) {
  const client = workspace.clients;
  const progress = progressFor(workspace.current_stage);
  return (
    <article className="workspace-hub-card accent-border-left">
      <div className="flex items-start gap-3">
        <ClientAvatar name={client?.name ?? workspace.name} seed={client?.id ?? workspace.id} logoUrl={client?.logo_url} size="md" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-foreground">{client?.name ?? workspace.name}</h2>
          <p className="truncate text-xs text-muted-foreground">{client?.company_name ?? workspace.name}</p>
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
  const [viewMode, setViewMode] = useState<ViewMode>("line");

  useEffect(() => {
    async function fetchWorkspaces() {
      setLoading(true);
      const { data, error } = await supabase
        .from("workspaces")
        .select("id, name, status, current_stage, summary, updated_at, created_at, clients(id, name, company_name, segment, plan_name, logo_url)")
        .order("updated_at", { ascending: false });

      if (!error && data) {
        const rows = data as unknown as WorkspaceHubItem[];
        setWorkspaces(rows);
        const ids = rows.map((w) => w.id);
        if (ids.length > 0) {
          const { data: nodes } = await supabase.from("canvas_nodes").select("workspace_id").in("workspace_id", ids);
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return workspaces.filter((workspace) => {
      const client = workspace.clients;
      const matchesSearch = !q || workspace.name.toLowerCase().includes(q) || client?.name.toLowerCase().includes(q) || client?.company_name?.toLowerCase().includes(q);
      const matchesStage = stageFilter === "__all__" || workspace.current_stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [workspaces, search, stageFilter]);

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
            {[{ id: "line", icon: Columns3 }, { id: "cards", icon: Grid3X3 }, { id: "list", icon: List }].map((item) => {
              const Icon = item.icon;
              return <button key={item.id} onClick={() => setViewMode(item.id as ViewMode)} className={cn("h-8 w-8 rounded text-muted-foreground transition-colors hover:text-foreground", viewMode === item.id && "bg-primary/10 text-primary")}><Icon className="mx-auto h-4 w-4" /></button>;
            })}
          </div>
          <Button variant="outline" onClick={() => navigate("/ops/clients")}>+ Novo cliente</Button>
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title={workspaces.length === 0 ? "Nenhum workspace criado" : "Nenhum workspace encontrado"} description={workspaces.length === 0 ? "Crie ou selecione clientes para iniciar os hubs de projeto." : "Ajuste busca ou filtro de etapa."} />
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
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-foreground">{workspace.clients?.name ?? workspace.name}</p><p className="text-xs text-muted-foreground">{getStagePremiumLabel(workspace.current_stage)} · {nodeCounts[workspace.id] ?? 0} nodes</p></div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
