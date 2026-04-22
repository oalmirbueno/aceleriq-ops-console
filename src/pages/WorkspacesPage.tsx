import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Filter, FolderKanban, Search, Sparkles, Target } from "lucide-react";
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

const STAGES = [
  "entrada",
  "diagnostico",
  "estrutura_base",
  "planejamento",
  "producao",
  "ativacao",
  "otimizacao",
  "expansao",
];

const statusLabel: Record<string, string> = {
  setup: "Setup",
  active: "Ativo",
  paused: "Pausado",
  completed: "Concluído",
  archived: "Arquivado",
};

function progressFor(stage: string) {
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.round(((index + 1) / STAGES.length) * 100);
}

function recommendationFor(stage: string, nodeCount: number) {
  if (nodeCount === 0) return "Criar os primeiros nodes do canvas para materializar o plano de ação.";
  if (stage === "entrada") return "Consolidar briefing, objetivos e critérios de sucesso antes de avançar.";
  if (stage === "diagnostico") return "Fechar hipóteses, evidências e gargalos prioritários do cliente.";
  if (stage === "estrutura_base") return "Validar arquitetura operacional, acessos e assets base.";
  if (stage === "planejamento") return "Converter plano diretor em tarefas com donos e prazos.";
  if (stage === "producao") return "Acompanhar entregáveis críticos e remover bloqueios de produção.";
  if (stage === "ativacao") return "Monitorar tráfego, CRM, pixel e timeline de lançamento diariamente.";
  if (stage === "otimizacao") return "Comparar métricas, priorizar experimentos e registrar aprendizados.";
  return "Empacotar cases, before/after e playbooks para replicar o que vingou.";
}

function completedNarrative(stage: string, nodeCount: number) {
  if (nodeCount === 0) return "Workspace criado; canvas ainda não estruturado.";
  if (stage === "entrada") return "Entrada aberta com primeiros insumos organizados.";
  if (stage === "diagnostico") return "Briefing e sinais iniciais reunidos para diagnóstico.";
  if (stage === "estrutura_base") return "Diagnóstico convertido em arquitetura operacional.";
  if (stage === "planejamento") return "Base definida; plano diretor em montagem.";
  if (stage === "producao") return "Plano aprovado e execução em andamento.";
  if (stage === "ativacao") return "Produção conectada à ativação comercial.";
  if (stage === "otimizacao") return "Dados de ativação prontos para melhoria contínua.";
  return "Evidências consolidadas para escala e replicação.";
}

export default function WorkspacesPage() {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<WorkspaceHubItem[]>([]);
  const [nodeCounts, setNodeCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("__all__");

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
          const { data: nodes } = await supabase
            .from("canvas_nodes")
            .select("workspace_id")
            .in("workspace_id", ids);

          const counts = (nodes ?? []).reduce<Record<string, number>>((acc, node: any) => {
            acc[node.workspace_id] = (acc[node.workspace_id] ?? 0) + 1;
            return acc;
          }, {});
          setNodeCounts(counts);
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
      const matchesSearch = !q
        || workspace.name.toLowerCase().includes(q)
        || client?.name.toLowerCase().includes(q)
        || client?.company_name?.toLowerCase().includes(q);
      const matchesStage = stageFilter === "__all__" || workspace.current_stage === stageFilter;
      return matchesSearch && matchesStage;
    });
  }, [workspaces, search, stageFilter]);

  return (
    <>
      <AppHeader title="Hub de Workspaces" subtitle="Projetos dos clientes, etapa atual, recomendação e avanço operacional" />

      <div className="p-6 animate-fade-in">
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente ou workspace..."
              className="pl-9"
            />
          </div>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[230px] gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas as etapas</SelectItem>
              {STAGES.map((stage) => (
                <SelectItem key={stage} value={stage}>{getStagePremiumLabel(stage)}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={() => navigate("/ops/clients")} className="ml-auto">
            Gerenciar clientes
          </Button>
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={workspaces.length === 0 ? "Nenhum workspace criado" : "Nenhum workspace encontrado"}
            description={workspaces.length === 0 ? "Crie ou selecione clientes para iniciar os hubs de projeto." : "Ajuste busca ou filtro de etapa."}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((workspace) => {
              const client = workspace.clients;
              const progress = progressFor(workspace.current_stage);
              const nodeCount = nodeCounts[workspace.id] ?? 0;

              return (
                <button
                  key={workspace.id}
                  type="button"
                  onClick={() => navigate(`/ops/workspaces/${workspace.id}`)}
                  className="group relative flex min-h-[390px] overflow-hidden rounded-lg border border-border bg-card text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <div className="flex w-full flex-col">
                    <div className="relative h-28 border-b border-border bg-secondary/40">
                      <div className="absolute inset-0 tech-grid-bg opacity-70" aria-hidden />
                      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.16),_transparent_58%)]" aria-hidden />
                      <div className="absolute left-5 top-5 flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-card/80 shadow-lg backdrop-blur">
                        <ClientAvatar
                          name={client?.name ?? workspace.name}
                          seed={client?.id ?? workspace.id}
                          logoUrl={client?.logo_url}
                          size="lg"
                          className="h-12 w-12 text-base"
                        />
                      </div>
                      <Badge variant="outline" className="absolute right-5 top-5 border-primary/30 bg-primary/10 text-primary backdrop-blur">
                        {statusLabel[workspace.status] ?? workspace.status}
                      </Badge>
                    </div>

                    <div className="flex flex-1 flex-col p-5">
                      <div className="mb-5 min-w-0">
                        <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">{client?.name ?? workspace.name}</h2>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{client?.company_name ?? workspace.name}</p>
                      </div>

                      <div className="space-y-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-xs font-medium uppercase text-muted-foreground">Estamos em</span>
                        <span className="text-xs font-semibold text-primary">{progress}%</span>
                      </div>
                      <p className="text-lg font-semibold leading-tight text-foreground">{getStagePremiumLabel(workspace.current_stage)}</p>
                      <Progress value={progress} className="mt-3 h-2" />
                    </div>

                    <div className="grid gap-2">
                      <div className="rounded-md border border-border bg-secondary/30 p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                          O que já foi feito
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {completedNarrative(workspace.current_stage, nodeCount)}
                        </p>
                      </div>

                      <div className="rounded-md border border-border bg-secondary/30 p-3">
                        <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-foreground">
                          <Target className="h-3.5 w-3.5 text-primary" />
                          Próximo movimento
                        </div>
                        <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {recommendationFor(workspace.current_stage, nodeCount)}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-md border border-border bg-secondary/40 p-3">
                        <p className="text-[10px] uppercase text-muted-foreground">Nodes</p>
                        <p className="mt-1 text-lg font-semibold text-foreground">{nodeCount}</p>
                      </div>
                      <div className="rounded-md border border-border bg-secondary/40 p-3">
                        <p className="text-[10px] uppercase text-muted-foreground">Plano</p>
                        <p className="mt-1 truncate text-sm font-semibold capitalize text-foreground">{client?.plan_name ?? "—"}</p>
                      </div>
                      <div className="rounded-md border border-border bg-secondary/40 p-3">
                        <p className="text-[10px] uppercase text-muted-foreground">Segmento</p>
                        <p className="mt-1 truncate text-sm font-semibold text-foreground">{client?.segment ?? "—"}</p>
                      </div>
                    </div>

                    <div className="hidden rounded-md border border-border bg-secondary/30 p-3">
                      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-foreground">
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Recomendação
                      </div>
                      <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {recommendationFor(workspace.current_stage, nodeCount)}
                      </p>
                    </div>
                      </div>

                  <div className="mt-auto flex items-center justify-between pt-5">
                    <span className={cn("text-xs text-muted-foreground", workspace.summary && "truncate pr-4")}>
                      {workspace.summary ?? "Abrir hub operacional"}
                    </span>
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary text-foreground transition-colors group-hover:border-primary/40 group-hover:text-primary">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
