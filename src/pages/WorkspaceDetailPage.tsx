import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, CalendarIcon, CheckCircle2, FolderKanban, ListChecks, Loader2, Lock, RefreshCw, Search, Sparkles, Target, X } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceTabResumo from "@/components/workspace/WorkspaceTabResumo";
import WorkspaceTabTimeline from "@/components/workspace/WorkspaceTabTimeline";
import WorkspaceTabContexto from "@/components/workspace/WorkspaceTabContexto";
import WorkspaceTabTasks from "@/components/workspace/WorkspaceTabTasks";
import WorkspaceTabDossie from "@/components/workspace/WorkspaceTabDossie";
import WorkspaceTabProducao from "@/components/workspace/WorkspaceTabProducao";
import WorkspaceTabAssets from "@/components/workspace/WorkspaceTabAssets";
import WorkspaceTabMetricas from "@/components/workspace/WorkspaceTabMetricas";
import WorkspaceTabBeforeAfter from "@/components/workspace/WorkspaceTabBeforeAfter";
import WorkspaceTabCase from "@/components/workspace/WorkspaceTabCase";
import WorkspaceTabCanvas from "@/components/workspace/WorkspaceTabCanvas";
import WorkspaceTabConteudo from "@/components/workspace/WorkspaceTabConteudo";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";
import { cn } from "@/lib/utils";

interface Workspace {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  primary_owner_id: string | null;
  client_id: string;
  summary: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
  clients: { id: string; name: string; company_name: string | null; segment: string | null; plan_name: string | null; logo_url?: string | null; metadata: Record<string, unknown> | null } | null;
  profiles: { full_name: string | null; email: string } | null;
}

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  happened_at: string;
  created_at: string;
}

interface WorkspaceNodeProgress {
  id: string;
  status: string | null;
}

interface WorkspaceTaskSignal {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  stage: string | null;
  due_date: string | null;
}

interface LeanChecklistItem {
  title: string;
  detail: string;
  size: "grande" | "media" | "pequena";
  source: "task" | "engine";
  taskId?: string;
  completed?: boolean;
}

const STAGES = ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"];
const MOVEMENTS_PAGE_SIZE = 20;
const TIMELINE_FETCH_PAGE_SIZE = 500;

function workspaceProgress(stage: string) {
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.round(((index + 1) / STAGES.length) * 100);
}

function calculateRealProgress(stage: string, nodes: WorkspaceNodeProgress[]) {
  if (nodes.length === 0) return workspaceProgress(stage);
  const done = nodes.filter((node) => node.status === "done" || node.status === "concluido").length;
  return Math.round((done / nodes.length) * 100);
}

function introCopy(stage: string) {
  if (stage === "entrada") return { done: "Workspace aberto para organizar briefing, contexto e objetivos do cliente.", need: "Capturar dores, metas, restrições, acessos e critérios claros de sucesso.", next: "Estruturar os primeiros nodes e avançar para diagnóstico." };
  if (stage === "diagnostico") return { done: "Entrada consolidada e sinais iniciais prontos para leitura operacional.", need: "Validar evidências, mapear gargalos e separar hipótese de fato.", next: "Transformar diagnóstico em arquitetura base da operação." };
  if (stage === "estrutura_base") return { done: "Diagnóstico traduzido em fundações, assets, acessos e desenho operacional.", need: "Garantir que o setup mínimo esteja íntegro antes de planejar execução.", next: "Montar o plano diretor com entregáveis, donos e sequência." };
  if (stage === "planejamento") return { done: "Base operacional definida e pronta para virar cronograma de implantação.", need: "Quebrar estratégia em tarefas, marcos, dependências e prioridades.", next: "Iniciar produção sem perder rastreabilidade do que foi decidido." };
  if (stage === "producao") return { done: "Plano em execução com frentes de produção ativas no workspace.", need: "Monitorar bloqueios, qualidade dos assets e prazos críticos.", next: "Preparar ativação com CRM, tráfego, pixel e lançamento." };
  if (stage === "ativacao") return { done: "Entrega conectada aos canais que colocam a operação em campo.", need: "Acompanhar sinais diários de tráfego, CRM e timeline T-7 → T+1.", next: "Entrar em otimização guiada por evidência." };
  if (stage === "otimizacao") return { done: "Métricas e aprendizados prontos para orientar melhoria contínua.", need: "Comparar antes/depois, priorizar experimentos e registrar decisões.", next: "Empacotar o que funcionou para expansão." };
  return { done: "Aprendizados consolidados em ativos comerciais e operacionais.", need: "Fechar case, before/after e playbook replicável.", next: "Escalar padrões vencedores para novos ciclos e clientes." };
}

function buildActionPlan(stage: string, tasks: WorkspaceTaskSignal[], nodes: WorkspaceNodeProgress[]) {
  const activeTasks = tasks.filter((task) => task.status !== "done" && task.status !== "canceled");
  const blocked = tasks.filter((task) => task.status === "blocked");
  const currentStageTasks = activeTasks.filter((task) => task.stage === stage);
  const urgent = activeTasks.filter((task) => task.priority === "urgent" || task.priority === "high");
  const done = tasks.filter((task) => task.status === "done").length;
  const plan = [];

  if (blocked.length > 0) {
    plan.push({ title: `Desbloquear ${blocked.length} tarefa${blocked.length > 1 ? "s" : ""} crítica${blocked.length > 1 ? "s" : ""}`, detail: blocked.slice(0, 2).map((task) => task.title).join(" · ") });
  }
  if (urgent.length > 0) {
    plan.push({ title: `Priorizar ${urgent.length} entrega${urgent.length > 1 ? "s" : ""} de alta prioridade`, detail: urgent.slice(0, 2).map((task) => task.title).join(" · ") });
  }
  if (currentStageTasks.length > 0) {
    plan.push({ title: `Executar pendências da etapa ${getStagePremiumLabel(stage)}`, detail: `${currentStageTasks.length} task${currentStageTasks.length > 1 ? "s" : ""} aberta${currentStageTasks.length > 1 ? "s" : ""} nesta etapa.` });
  }
  if (plan.length < 3) {
    plan.push({ title: `Consolidar avanço real: ${done}/${tasks.length} tasks concluídas`, detail: nodes.length > 0 ? `${nodes.length} nodes no canvas sustentam o progresso atual.` : "Canvas ainda sem nodes suficientes para leitura operacional." });
  }
  if (plan.length < 3) {
    plan.push({ title: "Gerar próximas tasks a partir do plano operacional", detail: `Use a aba completa para criar entregáveis conectados à etapa ${getStagePremiumLabel(stage)}.` });
  }

  return plan.slice(0, 3);
}

function buildLeanChecklist(stage: string, tasks: WorkspaceTaskSignal[], nodes: WorkspaceNodeProgress[]): LeanChecklistItem[] {
  const active = tasks.filter((task) => task.status !== "done" && task.status !== "canceled");
  const completedStageTasks = tasks.filter((task) => task.status === "done" && task.stage === stage);
  const blocked = active.filter((task) => task.status === "blocked");
  const stageTasks = active.filter((task) => task.stage === stage);
  const priorityTasks = active
    .filter((task) => task.priority === "urgent" || task.priority === "high")
    .sort((a, b) => (a.status === "blocked" ? -1 : 0) - (b.status === "blocked" ? -1 : 0));
  const checklist: LeanChecklistItem[] = [];

  completedStageTasks.slice(0, 2).forEach((task) => checklist.push({
    title: task.title,
    detail: "Concluída neste ciclo de pré-entrada.",
    size: "pequena",
    source: "task",
    taskId: task.id,
    completed: true,
  }));

  blocked.filter((task) => !checklist.some((item) => item.taskId === task.id)).slice(0, 2).forEach((task) => checklist.push({
    title: task.title,
    detail: "Maior alavanca: destravar antes de criar trabalho novo. Resolver, delegar ou cortar o bloqueio.",
    size: "grande",
    source: "task",
    taskId: task.id,
  }));

  priorityTasks.filter((task) => !blocked.some((b) => b.id === task.id) && !checklist.some((item) => item.taskId === task.id)).slice(0, 2).forEach((task) => checklist.push({
    title: task.title,
    detail: "Entrega pesada primeiro: só entra se mover o cliente de etapa ou remover risco real.",
    size: "grande",
    source: "task",
    taskId: task.id,
  }));

  stageTasks.filter((task) => !checklist.some((item) => item.taskId === task.id)).slice(0, 2).forEach((task) => checklist.push({
    title: task.title,
    detail: `Tarefa da etapa atual (${getStagePremiumLabel(stage)}). Executar em bloco, não como rotina diária.`,
    size: "media",
    source: "task",
    taskId: task.id,
  }));

  if (checklist.length < 5) checklist.push({
    title: "Fechar um único avanço verificável do workspace",
    detail: nodes.length > 0 ? `Escolher 1 node ativo e levar até conclusão antes de abrir novas frentes.` : "Criar apenas o node mínimo que destrava a próxima decisão.",
    size: "media",
    source: "engine",
  });

  if (checklist.length < 6) checklist.push({
    title: "Registrar decisão e próxima ação em 5 minutos",
    detail: "Micro-ação final: deixar claro o que foi decidido, quem depende disso e qual é o próximo passo.",
    size: "pequena",
    source: "engine",
  });

  return checklist.slice(0, 6);
}

function triageItemKey(item: LeanChecklistItem, index: number) {
  return item.taskId ?? `${item.source}:${index}:${item.title}`;
}

function sameDay(a: Date, iso: string) {
  const b = new Date(iso);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMovementDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function formatMovementDay(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(new Date(iso));
}

function movementDayKey(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

async function fetchAllTimelineEvents(workspaceId: string) {
  const all: TimelineEvent[] = [];
  let total = 0;
  let from = 0;

  while (true) {
    const to = from + TIMELINE_FETCH_PAGE_SIZE - 1;
    const { data, count, error } = await supabase
      .from("timeline_events")
      .select("id, event_type, title, description, happened_at, created_at", { count: from === 0 ? "exact" : undefined })
      .eq("workspace_id", workspaceId)
      .order("happened_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    if (from === 0) total = count ?? data?.length ?? 0;
    all.push(...((data ?? []) as TimelineEvent[]));
    if (!data || data.length < TIMELINE_FETCH_PAGE_SIZE || all.length >= total) break;
    from += TIMELINE_FETCH_PAGE_SIZE;
  }

  return { events: all, total };
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [nodesProgress, setNodesProgress] = useState<WorkspaceNodeProgress[]>([]);
  const [taskSignals, setTaskSignals] = useState<WorkspaceTaskSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);
  const [refreshingProgress, setRefreshingProgress] = useState(false);
  const [showFullWorkspace, setShowFullWorkspace] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState("__all__");
  const [movementDate, setMovementDate] = useState<Date | undefined>();
  const [movementSearch, setMovementSearch] = useState("");
  const [visibleMovements, setVisibleMovements] = useState(MOVEMENTS_PAGE_SIZE);
  const [activeTab, setActiveTab] = useState("resumo");
  const [canvasStatusShortcut, setCanvasStatusShortcut] = useState<string | null>(null);
  const [completedTriageKeys, setCompletedTriageKeys] = useState<string[]>([]);

  const fetchWorkspace = async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, status, current_stage, primary_owner_id, client_id, summary, created_at, metadata, clients(id, name, company_name, segment, plan_name, logo_url, metadata), profiles:primary_owner_id(full_name, email)")
      .eq("id", workspaceId)
      .single();

    if (!error && data) setWs(data as unknown as Workspace);

    const { events, total } = await fetchAllTimelineEvents(workspaceId);
    setTimeline(events);
    setTimelineTotal(total);

    const { data: nodes } = await supabase
      .from("canvas_nodes")
      .select("id, status")
      .eq("workspace_id", workspaceId);

    if (nodes) setNodesProgress(nodes as WorkspaceNodeProgress[]);

    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, title, status, priority, stage, due_date")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (tasks) setTaskSignals(tasks as WorkspaceTaskSignal[]);
    setLoading(false);
  };

  useEffect(() => { fetchWorkspace(); }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;

    const channel = supabase
      .channel(`workspace-node-progress:${workspaceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "canvas_nodes", filter: `workspace_id=eq.${workspaceId}` },
        async () => {
          const { data: nodes } = await supabase
            .from("canvas_nodes")
            .select("id, status")
            .eq("workspace_id", workspaceId);

          if (nodes) setNodesProgress(nodes as WorkspaceNodeProgress[]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId]);

  useEffect(() => {
    setShowFullWorkspace(false);
  }, [workspaceId]);

  const setWorkspaceMode = (mode: "preview" | "full") => {
    setShowFullWorkspace(mode === "full");
  };

  const refreshNodeProgress = async () => {
    if (!workspaceId) return;
    setRefreshingProgress(true);
    const { data: nodes, error } = await supabase
      .from("canvas_nodes")
      .select("id, status")
      .eq("workspace_id", workspaceId);

    if (error) toast({ title: "Erro ao atualizar progresso", description: error.message, variant: "destructive" });
    if (nodes) setNodesProgress(nodes as WorkspaceNodeProgress[]);
    setRefreshingProgress(false);
  };

  const openCanvasByStatus = (status: string) => {
    if (!showFullWorkspace) {
      toast({ title: "Entre no workspace completo", description: "Use o botão de entrada para abrir as abas e navegar pelos nodes." });
      return;
    }
    setWorkspaceMode("full");
    setCanvasStatusShortcut(status);
    setActiveTab("canvas");
  };

  const completeChecklistTask = async (item: LeanChecklistItem) => {
    if (!item.taskId) return;
    const { error } = await supabase
      .from("tasks")
      .update({ status: "done" })
      .eq("id", item.taskId);

    if (error) {
      toast({ title: "Erro ao concluir task", description: error.message, variant: "destructive" });
      return;
    }

    setTaskSignals((current) => current.map((task) => task.id === item.taskId ? { ...task, status: "done" } : task));
    toast({ title: "Task concluída", description: item.title });
  };

  const toggleTriageItem = (item: LeanChecklistItem, index: number) => {
    const key = triageItemKey(item, index);
    if (item.taskId && !item.completed) {
      completeChecklistTask(item);
      return;
    }
    setCompletedTriageKeys((current) => current.includes(key) ? current.filter((value) => value !== key) : [...current, key]);
  };

  useEffect(() => {
    setVisibleMovements(MOVEMENTS_PAGE_SIZE);
  }, [movementsOpen, eventTypeFilter, movementDate, movementSearch]);

  const handleStageChange = async (newStage: string) => {
    if (!ws || newStage === ws.current_stage) return;
    setChangingStage(true);
    const oldStage = ws.current_stage;

    const { error } = await supabase
      .from("workspaces")
      .update({ current_stage: newStage })
      .eq("id", ws.id);

    if (error) {
      toast({ title: "Erro ao mudar etapa", description: error.message, variant: "destructive" });
      setChangingStage(false);
      return;
    }

    await supabase.from("timeline_events").insert({
      workspace_id: ws.id,
      client_id: ws.client_id,
      event_type: "stage_changed",
      title: "Etapa alterada",
      description: `De "${getStagePremiumLabel(oldStage)}" para "${getStagePremiumLabel(newStage)}"`,
      happened_at: new Date().toISOString(),
    });

    toast({ title: "Etapa atualizada", description: `Movido para "${getStagePremiumLabel(newStage)}"` });
    setWs({ ...ws, current_stage: newStage });
    await fetchWorkspace();
    setChangingStage(false);
  };

  if (loading) return (
    <>
      <AppHeader title="Workspace" subtitle="Carregando..." />
      <LoadingState />
    </>
  );

  if (!ws) return (
    <>
      <AppHeader title="Workspace" subtitle="Não encontrado" />
      <EmptyState icon={FolderKanban} title="Workspace não encontrado" description="Este workspace não existe ou foi removido. Volte à lista de clientes para continuar." />
      <div className="flex justify-center -mt-12">
        <Button variant="outline" onClick={() => navigate("/ops/clients")}>
          Ir para Clientes
        </Button>
      </div>
    </>
  );

  const clientName = ws.clients?.name ?? "Cliente";
  const ownerName = ws.profiles?.full_name ?? ws.profiles?.email ?? null;
  const planName = ws.clients?.plan_name ?? null;
  const progress = calculateRealProgress(ws.current_stage, nodesProgress);
  const stageProgress = workspaceProgress(ws.current_stage);
  const finishedNodes = nodesProgress.filter((node) => node.status === "done" || node.status === "concluido").length;
  const activeNodes = nodesProgress.filter((node) => node.status === "active" || node.status === "ativo").length;
  const blockedNodes = nodesProgress.filter((node) => node.status === "blocked" || node.status === "bloqueado").length;
  const otherNodes = Math.max(0, nodesProgress.length - finishedNodes - activeNodes - blockedNodes);
  const intro = introCopy(ws.current_stage);
  const actionPlan = buildActionPlan(ws.current_stage, taskSignals, nodesProgress);
  const leanChecklist = buildLeanChecklist(ws.current_stage, taskSignals, nodesProgress);
  const lockedChecklist = leanChecklist.map((item, index) => ({
    ...item,
    key: triageItemKey(item, index),
    lockedDone: Boolean(item.completed || completedTriageKeys.includes(triageItemKey(item, index))),
  }));
  const triageComplete = lockedChecklist.length > 0 && lockedChecklist.every((item) => item.lockedDone);
  const triageProgress = lockedChecklist.length > 0 ? Math.round((lockedChecklist.filter((item) => item.lockedDone).length / lockedChecklist.length) * 100) : 0;
  const movementTypes = Array.from(new Set(timeline.map((event) => event.event_type))).sort();
  const movementQuery = movementSearch.trim().toLowerCase();
  const filteredMovements = timeline.filter((event) => {
    const matchesType = eventTypeFilter === "__all__" || event.event_type === eventTypeFilter;
    const matchesDate = !movementDate || sameDay(movementDate, event.happened_at);
    const matchesSearch = !movementQuery
      || event.title.toLowerCase().includes(movementQuery)
      || event.description?.toLowerCase().includes(movementQuery);
    return matchesType && matchesDate && matchesSearch;
  });
  const paginatedMovements = filteredMovements.slice(0, visibleMovements);
  const hasMoreMovements = visibleMovements < filteredMovements.length;
  const groupedMovements = paginatedMovements.reduce<Array<{ key: string; label: string; events: TimelineEvent[] }>>((groups, event) => {
    const key = movementDayKey(event.happened_at);
    const current = groups.find((group) => group.key === key);
    if (current) current.events.push(event);
    else groups.push({ key, label: formatMovementDay(event.happened_at), events: [event] });
    return groups;
  }, []);

  return (
    <>
      <AppHeader title={clientName} subtitle={ws.name} />

      <div className="p-6 animate-fade-in space-y-5">
        <Breadcrumb className="rounded-lg border border-border bg-card/70 px-4 py-3 shadow-sm">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/ops/workspaces">Hub de Workspaces</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={`/ops/clients/${ws.client_id}/vault`}>{clientName}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{ws.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <section className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="label-sm mb-2">Resumo operacional</p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-foreground">{getStagePremiumLabel(ws.current_stage)}</h2>
                <span className="rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  {ws.status}
                </span>
                <Button variant="outline" size="sm" className="gap-2" onClick={refreshNodeProgress} disabled={refreshingProgress}>
                  <RefreshCw className={cn("h-4 w-4", refreshingProgress && "animate-spin")} />
                  Atualizar progresso
                </Button>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Progresso real calculado por nodes concluídos sobre o total do canvas; fallback pela etapa quando ainda não há nodes.
              </p>
            </div>

            <div className="w-full max-w-xl rounded-md border border-border bg-secondary/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Avanço real</p>
                  <p className="text-2xl font-semibold text-foreground">{progress}%</p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{finishedNodes}/{nodesProgress.length} nodes concluídos</p>
                  <p>Etapa base: {stageProgress}%</p>
                </div>
              </div>
              <Progress value={progress} className="h-2" />
              <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                Como calculamos: progresso = <strong className="font-medium text-foreground">nodes done/concluido</strong> ÷
                <strong className="font-medium text-foreground"> total de nodes</strong>. Nodes ativos, bloqueados e demais statuses entram no total, mas não contam como concluídos. Sem nodes, usamos a etapa atual como base.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                <button type="button" onClick={() => openCanvasByStatus("concluido")} className="rounded-md border border-border bg-card/60 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:text-primary">
                  <p className="text-muted-foreground">Concluídos</p>
                  <p className="mt-0.5 font-semibold text-foreground">{finishedNodes}</p>
                </button>
                <button type="button" onClick={() => openCanvasByStatus("ativo")} className="rounded-md border border-border bg-card/60 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:text-primary">
                  <p className="text-muted-foreground">Ativos</p>
                  <p className="mt-0.5 font-semibold text-foreground">{activeNodes}</p>
                </button>
                <button type="button" onClick={() => openCanvasByStatus("bloqueado")} className="rounded-md border border-border bg-card/60 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:text-primary">
                  <p className="text-muted-foreground">Bloqueados</p>
                  <p className="mt-0.5 font-semibold text-foreground">{blockedNodes}</p>
                </button>
                <div className="rounded-md border border-border bg-card/60 px-2.5 py-2 text-left">
                  <p className="text-muted-foreground">Outros</p>
                  <p className="mt-0.5 font-semibold text-foreground">{otherNodes}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="relative border-b border-border bg-secondary/40 p-6">
            <div className="absolute inset-0 tech-grid-bg opacity-60" aria-hidden />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(var(--primary)/0.18),_transparent_58%)]" aria-hidden />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center rounded-lg border border-border bg-card/80 shadow-lg backdrop-blur">
                  <ClientAvatar
                    name={clientName}
                    seed={ws.client_id}
                    logoUrl={ws.clients?.logo_url}
                    size="lg"
                    className="h-16 w-16 text-xl"
                  />
                </div>
                <div className="min-w-0">
                  <p className="label-sm mb-2">Hub operacional do cliente</p>
                  <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">{clientName}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">{ws.clients?.company_name ?? ws.name}</p>
                </div>
              </div>

              <div className="min-w-[260px] rounded-lg border border-border bg-card/70 p-4 backdrop-blur">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium uppercase text-muted-foreground">Processo</span>
                  <span className="font-semibold text-primary">{progress}%</span>
                </div>
                <p className="mb-3 text-base font-semibold text-foreground">{getStagePremiumLabel(ws.current_stage)}</p>
                <Progress value={progress} className="h-2" />
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-3">
            <div className="rounded-md border border-border bg-secondary/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                O que foi feito
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{intro.done}</p>
            </div>
            <div className="rounded-md border border-border bg-secondary/30 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Target className="h-4 w-4 text-primary" />
                O que precisa
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{intro.need}</p>
            </div>
            <div className="rounded-md border border-primary/30 bg-primary/10 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" />
                Recomendação
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground">{intro.next}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="label-sm mb-2">Pré-entrada operacional</p>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">Triagem completa, contexto e plano gradual de produção</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                    Este bloco organiza contexto, prioridades e próximas ações antes de abrir o workspace completo, para evitar perda de tempo e manter o avanço visível.
                  </p>
                </div>
                <div className="hidden h-10 w-10 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary md:flex">
                  <ListChecks className="h-5 w-5" />
                </div>
              </div>

              <div className="space-y-3">
                {actionPlan.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex gap-3 rounded-md border border-border bg-secondary/30 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {item.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-lg border border-primary/30 bg-primary/10 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="label-sm mb-1">Checklist lean de execução</p>
                    <h3 className="text-base font-semibold text-foreground">Maiores primeiro, menores só para fechar ciclo</h3>
                  </div>
                  <span className="rounded-md border border-border bg-card/70 px-2 py-1 text-[11px] text-muted-foreground">
                    {leanChecklist.length} ações · não diário
                  </span>
                </div>

                <div className="grid gap-2">
                  {leanChecklist.map((item, index) => (
                    <div key={`${item.title}-${index}`} className={cn("flex items-start gap-3 rounded-md border border-border bg-card/70 p-3", item.completed && "border-primary/30 bg-primary/10")}>
                      <button
                        type="button"
                        onClick={() => completeChecklistTask(item)}
                        disabled={!item.taskId || item.completed}
                        className={cn("mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-primary/40 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed", (!item.taskId || item.completed) && "disabled:border-border disabled:text-muted-foreground", item.completed && "border-primary bg-primary text-primary-foreground")}
                        aria-label={item.completed ? `${item.title} concluída` : item.taskId ? `Concluir ${item.title}` : item.title}
                      >
                        {item.taskId || item.completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="text-[10px] font-semibold">{index + 1}</span>}
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={cn("text-sm font-medium text-foreground", item.completed && "text-muted-foreground line-through")}>{item.title}</p>
                          <span className="rounded border border-border bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {item.size}
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <aside className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="rounded-md border border-border bg-secondary/30 p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CalendarDays className="h-4 w-4 text-primary" />
                    Últimos movimentos
                  </div>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setMovementsOpen(true)}>
                    Ver todos
                  </Button>
                </div>
                <div className="space-y-3">
                  {timeline.slice(0, 4).map((event) => (
                    <div key={event.id} className="border-l border-primary/30 pl-3">
                      <p className="text-xs font-medium text-foreground">{event.title}</p>
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">{event.description ?? "Registro operacional"}</p>
                    </div>
                  ))}
                  {timeline.length === 0 && <p className="text-xs text-muted-foreground">Ainda sem eventos registrados.</p>}
                </div>
              </div>

              <Button onClick={() => setWorkspaceMode("full")} className="h-11 w-full gap-2" disabled={showFullWorkspace}>
                Entrar no workspace completo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </aside>
          </section>

        <Dialog open={movementsOpen} onOpenChange={setMovementsOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Últimos movimentos</DialogTitle>
              <DialogDescription>Histórico operacional completo deste workspace.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[260px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={movementSearch}
                  onChange={(event) => setMovementSearch(event.target.value)}
                  placeholder="Buscar por título ou descrição..."
                  className="pl-9"
                />
              </div>

              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Tipo de evento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todos os tipos</SelectItem>
                  {movementTypes.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-[220px] justify-start gap-2 text-left font-normal", !movementDate && "text-muted-foreground")}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {movementDate ? movementDate.toLocaleDateString("pt-BR") : "Filtrar por data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={movementDate}
                    onSelect={setMovementDate}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>

              {(eventTypeFilter !== "__all__" || movementDate || movementSearch) && (
                <Button variant="ghost" className="gap-2" onClick={() => { setEventTypeFilter("__all__"); setMovementDate(undefined); setMovementSearch(""); }}>
                  <X className="h-4 w-4" />
                  Limpar filtros
                </Button>
              )}
            </div>

            <div className="max-h-[56vh] overflow-y-auto rounded-lg border border-border bg-secondary/20 p-3">
              {filteredMovements.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Nenhum movimento encontrado.</div>
              ) : (
                <div className="space-y-4">
                  {groupedMovements.map((group) => (
                    <section key={group.key} className="rounded-lg border border-border bg-card/70 p-3">
                      <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2">
                        <h3 className="text-sm font-semibold capitalize text-foreground">{group.label}</h3>
                        <span className="text-[11px] text-muted-foreground">{group.events.length} movimento{group.events.length > 1 ? "s" : ""}</span>
                      </div>
                      <div className="space-y-3">
                        {group.events.map((event) => (
                          <div key={event.id} className="rounded-md border border-border bg-secondary/30 p-4">
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="font-medium text-foreground">{event.title}</p>
                              <span className="text-xs text-muted-foreground">{formatMovementDate(event.happened_at)}</span>
                            </div>
                            <p className="text-sm leading-relaxed text-muted-foreground">{event.description ?? "Registro operacional sem descrição."}</p>
                            <span className="mt-3 inline-flex rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
                              {event.event_type}
                            </span>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </div>
            {filteredMovements.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  Mostrando {paginatedMovements.length} de {filteredMovements.length} filtrados · {timelineTotal} no total
                </span>
                {hasMoreMovements && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleMovements((current) => current + MOVEMENTS_PAGE_SIZE)}
                  >
                    Carregar mais {Math.min(MOVEMENTS_PAGE_SIZE, filteredMovements.length - visibleMovements)}
                  </Button>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {showFullWorkspace && (
          <div className="space-y-3">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setWorkspaceMode("preview")}>Voltar para prévia</Button>
            </div>
            <WorkspaceHeader
              clientName={clientName}
              ownerName={ownerName}
              status={ws.status}
              currentStage={ws.current_stage}
              changingStage={changingStage}
              onStageChange={handleStageChange}
              planName={planName}
            />
          </div>
        )}

        {showFullWorkspace && <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="dossie">Dossiê</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="contexto">Contexto</TabsTrigger>
            <TabsTrigger value="producao">Produção</TabsTrigger>
            <TabsTrigger value="tasks">Tasks</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
            <TabsTrigger value="conteudo">Conteúdo</TabsTrigger>
            <TabsTrigger value="metricas">Métricas</TabsTrigger>
            <TabsTrigger value="before-after">Before/After</TabsTrigger>
            <TabsTrigger value="case">Case</TabsTrigger>
            <TabsTrigger value="canvas">Canvas</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <WorkspaceTabResumo
              clientName={clientName}
              companyName={ws.clients?.company_name ?? null}
              workspaceName={ws.name}
              status={ws.status}
              currentStage={ws.current_stage}
              ownerName={ownerName}
              planName={planName}
              segment={ws.clients?.segment ?? null}
              createdAt={ws.created_at}
              focusAreas={(ws.clients?.metadata as any)?.focus_areas ?? null}
              summary={ws.summary ?? null}
              recentEvents={timeline}
              workspaceId={ws.id}
            />
          </TabsContent>

          <TabsContent value="dossie">
            <WorkspaceTabDossie
              workspaceId={ws.id}
              clientId={ws.client_id}
              planName={planName}
              clientMetadata={ws.clients?.metadata as Record<string, unknown> | null}
              workspaceMetadata={ws.metadata}
            />
          </TabsContent>

          <TabsContent value="timeline">
            <WorkspaceTabTimeline events={timeline} />
          </TabsContent>

          <TabsContent value="contexto">
            <WorkspaceTabContexto workspaceId={ws.id} clientId={ws.client_id} clientName={clientName} />
          </TabsContent>

          <TabsContent value="tasks">
            <WorkspaceTabTasks workspaceId={ws.id} clientId={ws.client_id} planName={ws.clients?.plan_name} />
          </TabsContent>

          <TabsContent value="producao">
            <WorkspaceTabProducao workspaceId={ws.id} clientId={ws.client_id} planName={ws.clients?.plan_name} />
          </TabsContent>

          <TabsContent value="assets">
            <WorkspaceTabAssets workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={fetchWorkspace} />
          </TabsContent>

          <TabsContent value="conteudo">
            <WorkspaceTabConteudo workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={fetchWorkspace} />
          </TabsContent>

          <TabsContent value="metricas">
            <WorkspaceTabMetricas workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={fetchWorkspace} />
          </TabsContent>

          <TabsContent value="before-after">
            <WorkspaceTabBeforeAfter workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={fetchWorkspace} />
          </TabsContent>

          <TabsContent value="case">
            <WorkspaceTabCase workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={fetchWorkspace} />
          </TabsContent>

          <TabsContent value="canvas">
            <WorkspaceTabCanvas
              workspaceId={ws.id}
              clientId={ws.client_id}
              clientName={clientName}
              onTimelineRefresh={fetchWorkspace}
              initialStatusFilter={canvasStatusShortcut}
            />
          </TabsContent>
        </Tabs>}
      </div>
    </>
  );
}
