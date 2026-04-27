/**
 * WorkspaceDetailPage — hub operacional de um workspace.
 * Visual elegante, tipografia limpa, lógica real.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, RefreshCw, Sparkles, Target,
  FolderKanban, Network, Circle, Dot, MessageSquare,
} from "lucide-react";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import ClientDrive from "@/components/workspace/ClientDrive";
import AIFirstScoreCard from "@/components/workspace/AIFirstScoreCard";
import HealthScoreCard from "@/components/workspace/HealthScoreCard";
import ICPFitScoreCard from "@/components/workspace/ICPFitScoreCard";
import PromptLibraryDialog from "@/components/workspace/PromptLibraryDialog";
import ProjectTypeBadge from "@/components/workspace/ProjectTypeBadge";
import WorkspaceChatDrawer from "@/components/workspace/WorkspaceChatDrawer";
import { getProjectTypeMeta } from "@/lib/projectTypes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStagePremiumLabel, PIPELINE_STAGES_ORDERED } from "@/components/workspace/aceleraConstants";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Workspace {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  primary_owner_id: string | null;
  client_id: string;
  summary: string | null;
  created_at: string;
  portal_project_id: string | null;
  metadata: Record<string, unknown> | null;
  clients: {
    id: string;
    name: string;
    company_name: string | null;
    segment: string | null;
    plan_name: string | null;
    project_type: string | null;
    custom_monthly_value: number | null;
    logo_url?: string | null;
    portal_client_id: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
  profiles: { full_name: string | null; email: string } | null;
}

interface TimelineEvent {
  id: string; event_type: string; title: string;
  description: string | null; happened_at: string; created_at: string;
}

interface NodeProgress { id: string; status: string | null; }

// ─── Helpers ────────────────────────────────────────────────────────────────

const STAGES = [...PIPELINE_STAGES_ORDERED] as string[];

function stageIdx(stage: string) { return Math.max(0, STAGES.indexOf(stage)); }
function stageProgressPct(stage: string) { return Math.round(((stageIdx(stage) + 1) / STAGES.length) * 100); }

function realProgress(stage: string, nodes: NodeProgress[]) {
  if (!nodes.length) return stageProgressPct(stage);
  const done = nodes.filter((n) => n.status === "done" || n.status === "concluido").length;
  return Math.round((done / nodes.length) * 100);
}

const STAGE_CONTEXT: Record<string, { done: string; need: string; next: string }> = {
  entrada:        { done: "Workspace aberto para captura de contexto e objetivos do cliente.",           need: "Consolidar dores, metas, restrições e critérios de sucesso.",       next: "Estruturar nodes e avançar para diagnóstico." },
  diagnostico:    { done: "Sinais iniciais capturados e contexto operacional consolidado.",               need: "Validar evidências, mapear gargalos e separar hipótese de fato.",   next: "Transformar diagnóstico em arquitetura base." },
  estrutura_base: { done: "Diagnóstico traduzido em fundações e acessos operacionais.",                   need: "Garantir setup mínimo íntegro antes de planejar execução.",          next: "Montar plano diretor com entregáveis e sequência." },
  planejamento:   { done: "Base operacional definida e pronta para virar cronograma.",                    need: "Quebrar estratégia em tasks, marcos e prioridades.",                 next: "Iniciar produção com rastreabilidade total." },
  producao:       { done: "Plano em execução com frentes de construção ativas.",                          need: "Monitorar bloqueios, qualidade dos entregáveis e prazos críticos.",  next: "Preparar ativação com CRM, tráfego e pixel." },
  ativacao:       { done: "Entregáveis conectados aos canais de ativação do cliente.",                    need: "Acompanhar sinais diários de tráfego, CRM e conversão.",             next: "Entrar em otimização guiada por evidência." },
  otimizacao:     { done: "Métricas e aprendizados prontos para orientar melhoria contínua.",             need: "Comparar antes e depois, priorizar experimentos e registrar decisões.", next: "Empacotar o que funcionou para expansão." },
  expansao:       { done: "Aprendizados consolidados em ativos comerciais e operacionais replicáveis.",   need: "Fechar case, before/after e playbook.",                              next: "Escalar padrões vencedores para novos ciclos." },
};

const STATUS_LABEL: Record<string, string> = {
  setup: "Setup", active: "Ativo", paused: "Pausado",
  completed: "Concluído", archived: "Arquivado",
};

async function fetchTimeline(workspaceId: string): Promise<TimelineEvent[]> {
  const PAGE = 500;
  const all: TimelineEvent[] = [];
  let total = 0;
  let from = 0;
  while (true) {
    const to = from + PAGE - 1;
    const { data, count, error } = await supabase
      .from("timeline_events")
      .select("id, event_type, title, description, happened_at, created_at", { count: from === 0 ? "exact" : undefined })
      .eq("workspace_id", workspaceId)
      .order("happened_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error || !data) break;
    if (from === 0) total = count ?? data.length;
    all.push(...(data as TimelineEvent[]));
    if (data.length < PAGE || all.length >= total) break;
    from += PAGE;
  }
  return all;
}

// ─── Tab config ──────────────────────────────────────────────────────────────

const TABS = [
  { group: "Visão geral",  value: "resumo",       label: "Resumo" },
  { group: "Visão geral",  value: "dossie",        label: "Dossiê" },
  { group: "Visão geral",  value: "timeline",      label: "Timeline" },
  { group: "Execução",     value: "contexto",      label: "Contexto" },
  { group: "Execução",     value: "tasks",         label: "Tasks" },
  { group: "Execução",     value: "producao",      label: "Produção" },
  { group: "Execução",     value: "assets",        label: "Assets" },
  { group: "Execução",     value: "conteudo",      label: "Conteúdo" },
  { group: "Execução",     value: "drive",         label: "Drive" },
  { group: "Resultado",    value: "metricas",      label: "Métricas" },
  { group: "Resultado",    value: "before-after",  label: "Before / After" },
  { group: "Resultado",    value: "case",          label: "Case" },
  { group: "Canvas",       value: "canvas",        label: "Canvas" },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [ws, setWs] = useState<Workspace | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [nodes, setNodes] = useState<NodeProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "resumo");
  const [promptLibraryOpen, setPromptLibraryOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [canvasStatus] = useState<string | null>(searchParams.get("status"));

  const load = async () => {
    if (!workspaceId) return;
    const { data } = await supabase
      .from("workspaces")
      .select("id, name, status, current_stage, primary_owner_id, client_id, summary, created_at, portal_project_id, metadata, clients(id, name, company_name, segment, plan_name, project_type, custom_monthly_value, logo_url, portal_client_id, metadata), profiles:primary_owner_id(full_name, email)")
      .eq("id", workspaceId)
      .single();
    if (data) setWs(data as unknown as Workspace);
    const events = await fetchTimeline(workspaceId);
    setTimeline(events);
    const { data: nd } = await supabase.from("canvas_nodes").select("id, status").eq("workspace_id", workspaceId);
    if (nd) setNodes(nd as NodeProgress[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`ws-nodes:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_nodes", filter: `workspace_id=eq.${workspaceId}` }, async () => {
        const { data } = await supabase.from("canvas_nodes").select("id, status").eq("workspace_id", workspaceId);
        if (data) setNodes(data as NodeProgress[]);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId]);

  useEffect(() => { setActiveTab(searchParams.get("tab") ?? "resumo"); }, [searchParams]);

  const handleStageChange = async (newStage: string) => {
    if (!ws || newStage === ws.current_stage) return;
    setChangingStage(true);
    const prev = ws.current_stage;
    const { error } = await supabase.from("workspaces").update({ current_stage: newStage }).eq("id", ws.id);
    if (error) { toast({ title: "Erro ao mudar etapa", description: error.message, variant: "destructive" }); setChangingStage(false); return; }
    await supabase.from("timeline_events").insert({
      workspace_id: ws.id, client_id: ws.client_id,
      event_type: "stage_changed", title: "Etapa alterada",
      description: `De ${getStagePremiumLabel(prev)} para ${getStagePremiumLabel(newStage)}`,
      happened_at: new Date().toISOString(),
    });
    void supabase.functions.invoke("sync-to-portal", { body: { event: "stage_advanced", workspaceId: ws.id, clientId: ws.client_id, stage: newStage } });
    toast({ title: "Etapa atualizada", description: getStagePremiumLabel(newStage) });
    setWs({ ...ws, current_stage: newStage });
    setChangingStage(false);
    await load();
  };

  if (loading) return <div className="p-8"><LoadingState /></div>;
  if (!ws) return (
    <div className="p-8 space-y-4">
      <EmptyState icon={FolderKanban} title="Workspace não encontrado" description="Este workspace foi removido ou não existe." />
      <div className="flex justify-center">
        <Button variant="outline" size="sm" onClick={() => navigate("/ops/workspaces")}>
          <ArrowLeft className="h-3.5 w-3.5 mr-2" /> Voltar
        </Button>
      </div>
    </div>
  );

  // Derived values
  const clientName     = ws.clients?.name ?? "Cliente";
  const ownerName      = ws.profiles?.full_name ?? ws.profiles?.email ?? null;
  const planName       = ws.clients?.plan_name ?? null;
  const progress       = realProgress(ws.current_stage, nodes);
  const done           = nodes.filter((n) => n.status === "done" || n.status === "concluido").length;
  const active         = nodes.filter((n) => n.status === "active" || n.status === "ativo").length;
  const blocked        = nodes.filter((n) => n.status === "blocked" || n.status === "bloqueado").length;
  const ctx            = STAGE_CONTEXT[ws.current_stage] ?? STAGE_CONTEXT.expansao;
  const currentStageI  = stageIdx(ws.current_stage);
  const portalProjectId = ws.portal_project_id ?? null;
  const portalClientId  = ws.clients?.portal_client_id ?? null;

  const openCanvas = () => {
    const p = new URLSearchParams({ workspaceId: ws.id, clientId: ws.client_id, clientName });
    navigate(`/ops/canvas/open?${p.toString()}`);
  };

  // Group tabs for rendering
  const groups = TABS.reduce<Record<string, typeof TABS>>((acc, tab) => {
    if (!acc[tab.group]) acc[tab.group] = [];
    acc[tab.group].push(tab);
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      {/* ═══════════════════════════════════════════════════════════
          HEADER — client identity + progress + actions
      ═══════════════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden border-b border-border bg-card">
        {/* Background texture */}
        <div className="absolute inset-0 tech-grid-bg opacity-30 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent pointer-events-none" />

        <div className="relative px-6 pt-5 pb-0">
          {/* Breadcrumb */}
          <button
            type="button"
            onClick={() => navigate("/ops/workspaces")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="h-3 w-3" />
            Workspaces
          </button>

          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between pb-5">
            {/* Left: avatar + identity */}
            <div className="flex items-start gap-4 min-w-0">
              <div className="rounded-xl border border-border bg-background/60 p-2 shadow-sm shrink-0 backdrop-blur">
                <ClientAvatar
                  name={clientName}
                  seed={ws.client_id}
                  logoUrl={ws.clients?.logo_url}
                  size="lg"
                  className="h-14 w-14 text-lg"
                />
              </div>
              <div className="min-w-0 pt-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-primary/60">
                    Hub operacional
                  </span>
                  <Badge
                    variant="outline"
                    className="text-[10px] h-4 px-1.5 font-normal"
                  >
                    {STATUS_LABEL[ws.status] ?? ws.status}
                  </Badge>
                  {planName && (
                    <Badge className="text-[10px] h-4 px-1.5 bg-primary/10 text-primary border-primary/25 font-normal">
                      {planName}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-semibold tracking-tight text-foreground leading-tight">
                    {clientName}
                  </h1>
                  {ws.clients?.project_type && (
                    <ProjectTypeBadge type={ws.clients.project_type} variant="compact" />
                  )}
                </div>
                {ws.clients?.company_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">{ws.clients.company_name}</p>
                )}
              </div>
            </div>

            {/* Right: actions */}
            <div className="flex flex-wrap items-center gap-2 lg:shrink-0">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={async () => {
                  setRefreshing(true);
                  const { data } = await supabase.from("canvas_nodes").select("id, status").eq("workspace_id", ws.id);
                  if (data) setNodes(data as NodeProgress[]);
                  setRefreshing(false);
                }}
                disabled={refreshing}
              >
                <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
                Atualizar progresso
              </Button>
              {portalClientId ? (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 border border-emerald-400/25 bg-emerald-400/5 rounded-md px-2 py-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Portal vinculado
                </span>
              ) : (
                <button type="button" onClick={() => navigate("/ops/clients")}
                  className="text-xs text-amber-400 border border-amber-400/25 bg-amber-400/5 rounded-md px-2 py-1 hover:bg-amber-400/10 transition-colors">
                  Vincule o cliente ao portal →
                </button>
              )}
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                style={{
                  background: "hsl(var(--primary)/0.18)",
                  color: "hsl(var(--primary))",
                  border: "1px solid hsl(var(--primary)/0.35)",
                }}
                onClick={() => setChatOpen(true)}
                title="Chat IA contextual com todo o workspace carregado"
              >
                <MessageSquare className="h-3 w-3" />
                Chat IA
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setPromptLibraryOpen(true)}
                title="Biblioteca de prompts IA calibrados"
              >
                <Sparkles className="h-3 w-3" />
                Prompts IA
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                style={{ background: "hsl(var(--primary)/0.15)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary)/0.3)" }}
                onClick={openCanvas}
              >
                <Network className="h-3 w-3" />
                Abrir Canvas
              </Button>
            </div>
          </div>

          {/* Progress area */}
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] pb-5 border-t border-border/60 pt-4">
            <div className="min-w-0 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">
                  {getStagePremiumLabel(ws.current_stage)}
                </p>
                <span className="text-sm font-bold text-primary tabular-nums">{progress}%</span>
              </div>
              <Progress value={progress} className="h-1" />

              {/* ACELERA stepper */}
              <div className="flex items-center gap-0 overflow-x-auto pb-1">
                {STAGES.map((s, i) => {
                  const past    = i < currentStageI;
                  const current = i === currentStageI;
                  const future  = i > currentStageI;
                  return (
                    <div key={s} className="flex items-center gap-0 shrink-0">
                      <div className="flex flex-col items-center gap-1">
                        <div className={cn(
                          "h-2.5 w-2.5 rounded-full border transition-all duration-300",
                          current ? "border-primary bg-primary scale-125 shadow-[0_0_6px_hsl(var(--primary)/0.5)]" :
                          past    ? "border-primary/50 bg-primary/40" :
                                    "border-border bg-transparent"
                        )} />
                        <span className={cn(
                          "text-[8px] uppercase tracking-wider font-medium hidden sm:block",
                          current ? "text-primary" : past ? "text-primary/40" : "text-border"
                        )}>
                          {s.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      {i < STAGES.length - 1 && (
                        <div className={cn(
                          "h-px w-6 sm:w-8 mb-4 transition-colors",
                          past ? "bg-primary/30" : "bg-border"
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Node counters */}
            <div className="flex gap-2 items-start">
              {[
                { label: "Concluídos", value: done,    accent: "#10B981" },
                { label: "Ativos",     value: active,  accent: "hsl(var(--primary))" },
                { label: "Bloqueados", value: blocked, accent: "#F59E0B" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="flex flex-col items-center justify-center rounded-lg border border-border bg-background/60 px-3 py-2.5 min-w-[60px] text-center"
                >
                  <span className="text-xl font-bold tabular-nums" style={{ color: s.accent }}>
                    {s.value}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          STAGE CONTEXT — o que foi feito, precisa e recomenda
      ═══════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 border-b border-border bg-background/50">
        {[
          { icon: CheckCircle2, label: "O que foi feito",  text: ctx.done, color: "#10B981" },
          { icon: Target,       label: "O que precisa",    text: ctx.need, color: "#F59E0B" },
          { icon: Sparkles,     label: "Próximo passo",    text: ctx.next, color: "hsl(var(--primary))" },
        ].map((card, i) => (
          <div
            key={i}
            className={cn(
              "px-5 py-4",
              i < 2 && "border-r border-border"
            )}
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className="h-3.5 w-3.5 shrink-0" style={{ color: card.color }} />
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: card.color }}>
                {card.label}
              </p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{card.text}</p>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
          WORKSPACE HEADER — stage selector + owner + AI-First Score
      ═══════════════════════════════════════════════════════════ */}
      <div className="px-6 py-3 border-b border-border/60 bg-card/40">
        <WorkspaceHeader
          clientName={clientName}
          projectName={ws.name}
          ownerName={ownerName}
          status={ws.status}
          currentStage={ws.current_stage}
          changingStage={changingStage}
          onStageChange={handleStageChange}
          planName={planName}
        />
      </div>

      {/* Score cards — visibilidade conforme tipo de projeto do cliente */}
      {(() => {
        const typeMeta = getProjectTypeMeta(ws.clients?.project_type as string | null);
        const visibleScores = [
          typeMeta.showAiFirstScore,
          typeMeta.showHealthScore,
          typeMeta.showIcpFitScore,
        ].filter(Boolean).length;

        if (visibleScores === 0) return null;

        const gridCols = visibleScores === 1 ? "lg:grid-cols-1"
                       : visibleScores === 2 ? "lg:grid-cols-2"
                       : "lg:grid-cols-3";

        return (
          <div className={`grid gap-3 px-6 py-3 ${gridCols}`}>
            {typeMeta.showAiFirstScore && (
              <AIFirstScoreCard clientId={ws.client_id} planName={planName} variant="full" />
            )}
            {typeMeta.showHealthScore && (
              <HealthScoreCard
                clientId={ws.client_id}
                workspaceId={ws.id}
                clientMetadata={ws.clients?.metadata as Record<string, unknown> | null}
                currentStage={ws.current_stage}
                variant="full"
              />
            )}
            {typeMeta.showIcpFitScore && (
              <ICPFitScoreCard
                clientMetadata={ws.clients?.metadata as Record<string, unknown> | null}
                currentPlan={planName}
                variant="full"
              />
            )}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════════════════════
          TABS
      ═══════════════════════════════════════════════════════════ */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="border-b border-border bg-card/30 sticky top-0 z-20">
          <div className="px-4 overflow-x-auto">
            <TabsList className="flex w-max gap-0 h-auto p-0 bg-transparent rounded-none">
              {Object.entries(groups).map(([groupName, groupTabs], gi) => (
                <div key={groupName} className={cn("flex items-center", gi > 0 && "border-l border-border/50 ml-2 pl-2")}>
                  <span className="text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40 px-2 hidden xl:inline whitespace-nowrap">
                    {groupName}
                  </span>
                  {groupTabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className={cn(
                        "relative h-10 px-3.5 text-xs font-medium rounded-none",
                        "text-muted-foreground hover:text-foreground",
                        "border-b-2 border-transparent",
                        "data-[state=active]:text-primary data-[state=active]:border-primary data-[state=active]:bg-primary/5",
                        "transition-all duration-150 whitespace-nowrap"
                      )}
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </div>
              ))}
            </TabsList>
          </div>
        </div>

        <div className="p-4 sm:p-6">
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
            <WorkspaceTabDossie workspaceId={ws.id} clientId={ws.client_id} planName={planName} clientMetadata={ws.clients?.metadata as Record<string, unknown> | null} workspaceMetadata={ws.metadata} />
          </TabsContent>
          <TabsContent value="timeline">
            <WorkspaceTabTimeline events={timeline} />
          </TabsContent>
          <TabsContent value="contexto">
            <WorkspaceTabContexto workspaceId={ws.id} clientId={ws.client_id} clientName={clientName} />
          </TabsContent>
          <TabsContent value="tasks">
            <WorkspaceTabTasks workspaceId={ws.id} clientId={ws.client_id} planName={planName} />
          </TabsContent>
          <TabsContent value="producao">
            <WorkspaceTabProducao workspaceId={ws.id} clientId={ws.client_id} planName={planName} />
          </TabsContent>
          <TabsContent value="assets">
            <WorkspaceTabAssets workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={load} />
          </TabsContent>
          <TabsContent value="conteudo">
            <WorkspaceTabConteudo workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={load} />
          </TabsContent>
          <TabsContent value="drive">
            <ClientDrive workspaceId={ws.id} clientId={ws.client_id} clientName={clientName} />
          </TabsContent>
          <TabsContent value="metricas">
            <WorkspaceTabMetricas workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={load} />
          </TabsContent>
          <TabsContent value="before-after">
            <WorkspaceTabBeforeAfter workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={load} />
          </TabsContent>
          <TabsContent value="case">
            <WorkspaceTabCase workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={load} />
          </TabsContent>
          <TabsContent value="canvas">
            <WorkspaceTabCanvas workspaceId={ws.id} clientId={ws.client_id} clientName={clientName} onTimelineRefresh={load} initialStatusFilter={canvasStatus} />
          </TabsContent>
        </div>
      </Tabs>

      <PromptLibraryDialog
        open={promptLibraryOpen}
        onOpenChange={setPromptLibraryOpen}
        clientId={ws.client_id}
      />

      <WorkspaceChatDrawer
        open={chatOpen}
        onOpenChange={setChatOpen}
        workspaceId={ws.id}
        workspaceName={ws.name}
        clientId={ws.client_id}
        clientName={clientName}
      />
    </div>
  );
}
