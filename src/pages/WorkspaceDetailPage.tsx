/**
 * WorkspaceDetailPage — hub operacional de um workspace.
 *
 * Limpo: sem mode prop, sem triagem morta, sem showFullWorkspace hardcoded.
 * Tabs organizadas em grupos com Drive e PortalLinkButton integrados.
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, RefreshCw, Sparkles, Target,
  FolderKanban, Loader2, Network,
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
import PortalLinkButton from "@/components/workspace/PortalLinkButton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

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
    logo_url?: string | null;
    portal_client_id: string | null;
    metadata: Record<string, unknown> | null;
  } | null;
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

interface NodeProgress { id: string; status: string | null; }

// ─── Constants ────────────────────────────────────────────────

const STAGES = ["entrada","diagnostico","estrutura_base","planejamento","producao","ativacao","otimizacao","expansao"];
const TIMELINE_PAGE = 500;

// ─── Helpers ──────────────────────────────────────────────────

function stageProgress(stage: string) {
  return Math.round(((Math.max(0, STAGES.indexOf(stage)) + 1) / STAGES.length) * 100);
}

function realProgress(stage: string, nodes: NodeProgress[]) {
  if (!nodes.length) return stageProgress(stage);
  const done = nodes.filter((n) => n.status === "done" || n.status === "concluido").length;
  return Math.round((done / nodes.length) * 100);
}

function introCopy(stage: string) {
  const map: Record<string, { done: string; need: string; next: string }> = {
    entrada:        { done: "Workspace aberto para organizar briefing, contexto e objetivos.", need: "Capturar dores, metas, restrições e acessos.", next: "Estruturar nodes e avançar para diagnóstico." },
    diagnostico:    { done: "Entrada consolidada e sinais iniciais prontos.", need: "Validar evidências e mapear gargalos.", next: "Transformar diagnóstico em arquitetura base." },
    estrutura_base: { done: "Diagnóstico traduzido em fundações e desenho operacional.", need: "Garantir setup mínimo íntegro.", next: "Montar plano diretor com entregáveis e sequência." },
    planejamento:   { done: "Base operacional definida e pronta.", need: "Quebrar estratégia em tarefas e prioridades.", next: "Iniciar produção com rastreabilidade." },
    producao:       { done: "Plano em execução com frentes ativas.", need: "Monitorar bloqueios e qualidade dos assets.", next: "Preparar ativação com CRM, tráfego e pixel." },
    ativacao:       { done: "Entrega conectada aos canais.", need: "Acompanhar sinais diários de tráfego e CRM.", next: "Entrar em otimização guiada por evidência." },
    otimizacao:     { done: "Métricas e aprendizados prontos.", need: "Comparar antes/depois e priorizar experimentos.", next: "Empacotar o que funcionou para expansão." },
    expansao:       { done: "Aprendizados consolidados em ativos comerciais.", need: "Fechar case, before/after e playbook.", next: "Escalar padrões vencedores para novos ciclos." },
  };
  return map[stage] ?? map.expansao;
}

async function fetchTimeline(workspaceId: string): Promise<{ events: TimelineEvent[]; total: number }> {
  const all: TimelineEvent[] = [];
  let total = 0;
  let from = 0;
  while (true) {
    const to = from + TIMELINE_PAGE - 1;
    const { data, count, error } = await supabase
      .from("timeline_events")
      .select("id, event_type, title, description, happened_at, created_at", { count: from === 0 ? "exact" : undefined })
      .eq("workspace_id", workspaceId)
      .order("happened_at", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) break;
    if (from === 0) total = count ?? data?.length ?? 0;
    all.push(...((data ?? []) as TimelineEvent[]));
    if (!data || data.length < TIMELINE_PAGE || all.length >= total) break;
    from += TIMELINE_PAGE;
  }
  return { events: all, total };
}

// ─── Tab groups ───────────────────────────────────────────────

const TAB_GROUPS = [
  {
    label: "Visão Geral",
    tabs: [
      { value: "resumo",    label: "Resumo" },
      { value: "dossie",    label: "Dossiê" },
      { value: "timeline",  label: "Timeline" },
    ],
  },
  {
    label: "Execução",
    tabs: [
      { value: "contexto",  label: "Contexto" },
      { value: "tasks",     label: "Tasks" },
      { value: "producao",  label: "Produção" },
      { value: "assets",    label: "Assets" },
      { value: "conteudo",  label: "Conteúdo" },
      { value: "drive",     label: "Drive 📁" },
    ],
  },
  {
    label: "Resultado",
    tabs: [
      { value: "metricas",     label: "Métricas" },
      { value: "before-after", label: "Before/After" },
      { value: "case",         label: "Case" },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [nodes, setNodes] = useState<NodeProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);
  const [refreshingProgress, setRefreshingProgress] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") ?? "resumo");
  const [canvasStatus, setCanvasStatus] = useState<string | null>(searchParams.get("status"));

  // ── Data fetching ──
  const fetchWorkspace = async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, status, current_stage, primary_owner_id, client_id, summary, created_at, portal_project_id, metadata, clients(id, name, company_name, segment, plan_name, logo_url, portal_client_id, metadata), profiles:primary_owner_id(full_name, email)")
      .eq("id", workspaceId)
      .single();
    if (!error && data) setWs(data as unknown as Workspace);
    const { events } = await fetchTimeline(workspaceId);
    setTimeline(events);
    const { data: nodeData } = await supabase
      .from("canvas_nodes")
      .select("id, status")
      .eq("workspace_id", workspaceId);
    if (nodeData) setNodes(nodeData as NodeProgress[]);
    setLoading(false);
  };

  useEffect(() => { fetchWorkspace(); }, [workspaceId]);

  // Realtime: node progress
  useEffect(() => {
    if (!workspaceId) return;
    const ch = supabase
      .channel(`ws-nodes:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_nodes", filter: `workspace_id=eq.${workspaceId}` }, async () => {
        const { data } = await supabase.from("canvas_nodes").select("id, status").eq("workspace_id", workspaceId);
        if (data) setNodes(data as NodeProgress[]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId]);

  // Sync tab from URL
  useEffect(() => {
    setActiveTab(searchParams.get("tab") ?? "resumo");
    setCanvasStatus(searchParams.get("status"));
  }, [searchParams]);

  // ── Handlers ──
  const refreshProgress = async () => {
    if (!workspaceId) return;
    setRefreshingProgress(true);
    const { data } = await supabase.from("canvas_nodes").select("id, status").eq("workspace_id", workspaceId);
    if (data) setNodes(data as NodeProgress[]);
    setRefreshingProgress(false);
  };

  const handleStageChange = async (newStage: string) => {
    if (!ws || newStage === ws.current_stage) return;
    setChangingStage(true);
    const old = ws.current_stage;
    const { error } = await supabase.from("workspaces").update({ current_stage: newStage }).eq("id", ws.id);
    if (error) {
      toast({ title: "Erro ao mudar etapa", description: error.message, variant: "destructive" });
      setChangingStage(false);
      return;
    }
    await supabase.from("timeline_events").insert({
      workspace_id: ws.id, client_id: ws.client_id,
      event_type: "stage_changed", title: "Etapa alterada",
      description: `De "${getStagePremiumLabel(old)}" para "${getStagePremiumLabel(newStage)}"`,
      happened_at: new Date().toISOString(),
    });
    // Sync to portal
    void supabase.functions.invoke("sync-to-portal", {
      body: { event: "stage_advanced", workspaceId: ws.id, clientId: ws.client_id, stage: newStage },
    });
    toast({ title: "Etapa atualizada", description: getStagePremiumLabel(newStage) });
    setWs({ ...ws, current_stage: newStage });
    setChangingStage(false);
    await fetchWorkspace();
  };

  // ── States ──
  if (loading) return <div className="p-8"><LoadingState /></div>;
  if (!ws) return (
    <div className="p-8">
      <EmptyState icon={FolderKanban} title="Workspace não encontrado" description="Este workspace foi removido ou não existe." />
      <div className="flex justify-center mt-4">
        <Button variant="outline" onClick={() => navigate("/ops/workspaces")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Workspaces
        </Button>
      </div>
    </div>
  );

  const clientName = ws.clients?.name ?? "Cliente";
  const ownerName = ws.profiles?.full_name ?? ws.profiles?.email ?? null;
  const planName = ws.clients?.plan_name ?? null;
  const progress = realProgress(ws.current_stage, nodes);
  const finishedNodes = nodes.filter((n) => n.status === "done" || n.status === "concluido").length;
  const activeNodes = nodes.filter((n) => n.status === "active" || n.status === "ativo").length;
  const blockedNodes = nodes.filter((n) => n.status === "blocked" || n.status === "bloqueado").length;
  const intro = introCopy(ws.current_stage);
  const portalProjectId = ws.portal_project_id ?? null;
  const portalClientId = ws.clients?.portal_client_id ?? null;

  return (
    <div className="space-y-4 p-4 page-enter">

      {/* ── Breadcrumb + back ───────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button type="button" onClick={() => navigate("/ops/workspaces")} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Workspaces
        </button>
        <span>/</span>
        <span className="text-foreground">{clientName}</span>
      </div>

      {/* ── Client hero ─────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="relative border-b border-border bg-secondary/30 p-5">
          <div className="absolute inset-0 tech-grid-bg opacity-40" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,hsl(var(--primary)/0.12),transparent_60%)]" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: avatar + name */}
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-card/80 shadow shrink-0">
                <ClientAvatar name={clientName} seed={ws.client_id} logoUrl={ws.clients?.logo_url} size="lg" className="h-12 w-12 text-lg" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/70 mb-1">Hub operacional</p>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground truncate">{clientName}</h1>
                <p className="text-sm text-muted-foreground">{ws.clients?.company_name ?? ws.name}</p>
              </div>
            </div>

            {/* Right: progress ring + actions */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">{ws.status}</Badge>
                {planName && <Badge className="text-xs bg-primary/10 text-primary border-primary/30">{planName}</Badge>}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={refreshProgress} disabled={refreshingProgress}>
                  <RefreshCw className={cn("h-3 w-3", refreshingProgress && "animate-spin")} />
                  Atualizar
                </Button>
                <PortalLinkButton
                  workspaceId={ws.id}
                  clientId={ws.client_id}
                  portalProjectId={portalProjectId}
                  portalClientId={portalClientId}
                  onLinked={fetchWorkspace}
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  onClick={() => {
                    const params = new URLSearchParams({ workspaceId: ws.id, clientId: ws.client_id, clientName });
                    navigate(`/ops/canvas/open?${params.toString()}`);
                  }}
                >
                  <Network className="h-3 w-3" /> Canvas ↗
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress bar + stage context */}
        <div className="p-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-foreground">{getStagePremiumLabel(ws.current_stage)}</span>
              <span className="font-semibold text-primary">{progress}%</span>
            </div>
            <Progress value={progress} className="h-1.5" />
            {/* Stage stepper */}
            <div className="flex items-center gap-1 mt-1 overflow-x-auto pb-1">
              {STAGES.map((s, i) => {
                const currentIdx = STAGES.indexOf(ws.current_stage);
                const isPast = i < currentIdx;
                const isCurrent = i === currentIdx;
                return (
                  <div key={s} className="flex items-center gap-1 shrink-0">
                    <div className={cn(
                      "h-2 w-2 rounded-full transition-colors",
                      isCurrent ? "bg-primary scale-125" : isPast ? "bg-primary/40" : "bg-border"
                    )} />
                    {i < STAGES.length - 1 && <div className={cn("h-px w-4", isPast ? "bg-primary/30" : "bg-border")} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Node counters */}
          <div className="flex gap-2 text-xs shrink-0">
            {[
              { label: "Concluídos", value: finishedNodes, color: "text-emerald-400" },
              { label: "Ativos",     value: activeNodes,   color: "text-primary" },
              { label: "Bloqueados", value: blockedNodes,  color: "text-amber-400" },
            ].map((stat) => (
              <div key={stat.label} className="flex flex-col items-center justify-center rounded-lg border border-border bg-secondary/30 px-3 py-2 min-w-[60px]">
                <span className={cn("text-lg font-semibold", stat.color)}>{stat.value}</span>
                <span className="text-[10px] text-muted-foreground">{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stage context cards */}
        <div className="grid grid-cols-3 gap-0 border-t border-border">
          {[
            { icon: CheckCircle2, label: "O que foi feito", text: intro.done, color: "text-emerald-400" },
            { icon: Target,       label: "O que precisa",   text: intro.need, color: "text-amber-400" },
            { icon: Sparkles,     label: "Recomendação",    text: intro.next, color: "text-primary" },
          ].map((card, i) => (
            <div key={i} className={cn(
              "p-4",
              i < 2 && "border-r border-border"
            )}>
              <div className="flex items-center gap-1.5 mb-2">
                <card.icon className={cn("h-3.5 w-3.5", card.color)} />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{card.label}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── WorkspaceHeader (stage selector + owner) ───── */}
      <WorkspaceHeader
        clientName={clientName}
        ownerName={ownerName}
        status={ws.status}
        currentStage={ws.current_stage}
        changingStage={changingStage}
        onStageChange={handleStageChange}
        planName={planName}
      />

      {/* ── Tabs ────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="overflow-x-auto">
          <TabsList className="flex w-max gap-0 h-auto p-0 bg-transparent border-b border-border rounded-none">
            {TAB_GROUPS.map((group, gi) => (
              <div key={group.label} className={cn("flex items-center", gi > 0 && "border-l border-border/60 ml-1 pl-1")}>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 px-2 hidden lg:inline">
                  {group.label}
                </span>
                {group.tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="h-9 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-primary/5 transition-all"
                  >
                    {tab.label}
                  </TabsTrigger>
                ))}
              </div>
            ))}
            {/* Canvas tab separate — always visible */}
            <div className="border-l border-border/60 ml-1 pl-1">
              <TabsTrigger
                value="canvas"
                className="h-9 px-3 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-primary/5"
              >
                Canvas
              </TabsTrigger>
            </div>
          </TabsList>
        </div>

        {/* Tab contents */}
        <div className="mt-4">
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
            <WorkspaceTabTasks workspaceId={ws.id} clientId={ws.client_id} planName={planName} />
          </TabsContent>

          <TabsContent value="producao">
            <WorkspaceTabProducao workspaceId={ws.id} clientId={ws.client_id} planName={planName} />
          </TabsContent>

          <TabsContent value="assets">
            <WorkspaceTabAssets workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={fetchWorkspace} />
          </TabsContent>

          <TabsContent value="conteudo">
            <WorkspaceTabConteudo workspaceId={ws.id} clientId={ws.client_id} onTimelineRefresh={fetchWorkspace} />
          </TabsContent>

          <TabsContent value="drive">
            <ClientDrive
              workspaceId={ws.id}
              clientId={ws.client_id}
              clientName={clientName}
            />
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
              initialStatusFilter={canvasStatus}
            />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
