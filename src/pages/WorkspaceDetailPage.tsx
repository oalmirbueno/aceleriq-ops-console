import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, CalendarIcon, CheckCircle2, FolderKanban, ListChecks, Sparkles, Target, X } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
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

const STAGES = ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"];

function workspaceProgress(stage: string) {
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.round(((index + 1) / STAGES.length) * 100);
}

function calculateRealProgress(stage: string, nodes: WorkspaceNodeProgress[]) {
  if (nodes.length === 0) return workspaceProgress(stage);
  const done = nodes.filter((node) => node.status === "done" || node.status === "concluido").length;
  const activeWeight = nodes.filter((node) => node.status === "active" || node.status === "ativo").length * 0.55;
  const blockedPenalty = nodes.filter((node) => node.status === "blocked" || node.status === "bloqueado").length * 0.15;
  return Math.max(5, Math.min(100, Math.round(((done + activeWeight) / nodes.length) * 100 - blockedPenalty)));
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

function actionPlanFor(stage: string) {
  if (stage === "entrada") return ["Revisar briefing e contexto do cliente", "Mapear objetivos, restrições e acessos", "Criar os nodes iniciais do canvas"];
  if (stage === "diagnostico") return ["Separar fatos, hipóteses e lacunas", "Priorizar gargalos por impacto operacional", "Fechar diagnóstico antes da arquitetura"];
  if (stage === "estrutura_base") return ["Validar estrutura de funil, CRM e canais", "Organizar assets e documentos críticos", "Definir setup mínimo de execução"];
  if (stage === "planejamento") return ["Converter estratégia em milestones", "Distribuir responsáveis e dependências", "Gerar tasks operacionais da próxima etapa"];
  if (stage === "producao") return ["Checar entregáveis em produção", "Remover bloqueios de assets e aprovação", "Preparar checklist de ativação"];
  if (stage === "ativacao") return ["Conferir pixel, tráfego e CRM", "Acompanhar timeline T-7 → T+1", "Registrar sinais para otimização"];
  if (stage === "otimizacao") return ["Comparar métricas antes/depois", "Escolher próximos experimentos", "Documentar aprendizados com evidência"];
  return ["Fechar Case PASTA", "Criar Before/After com métricas", "Derivar playbook replicável"];
}

function sameDay(a: Date, iso: string) {
  const b = new Date(iso);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatMovementDate(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);
  const [showFullWorkspace, setShowFullWorkspace] = useState(false);
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState("__all__");
  const [movementDate, setMovementDate] = useState<Date | undefined>();

  const fetchWorkspace = async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, status, current_stage, primary_owner_id, client_id, summary, created_at, metadata, clients(id, name, company_name, segment, plan_name, logo_url, metadata), profiles:primary_owner_id(full_name, email)")
      .eq("id", workspaceId)
      .single();

    if (!error && data) setWs(data as unknown as Workspace);

    const { data: events } = await supabase
      .from("timeline_events")
      .select("id, event_type, title, description, happened_at, created_at")
      .eq("workspace_id", workspaceId)
      .order("happened_at", { ascending: false })
      .limit(100);

    if (events) setTimeline(events);
    setLoading(false);
  };

  useEffect(() => { fetchWorkspace(); }, [workspaceId]);

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
  const progress = workspaceProgress(ws.current_stage);
  const intro = introCopy(ws.current_stage);
  const actionPlan = actionPlanFor(ws.current_stage);
  const movementTypes = Array.from(new Set(timeline.map((event) => event.event_type))).sort();
  const filteredMovements = timeline.filter((event) => {
    const matchesType = eventTypeFilter === "__all__" || event.event_type === eventTypeFilter;
    const matchesDate = !movementDate || sameDay(movementDate, event.happened_at);
    return matchesType && matchesDate;
  });

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

        {!showFullWorkspace && (
          <section className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <div className="mb-5 flex items-center justify-between gap-4">
                <div>
                  <p className="label-sm mb-2">Pré-entrada operacional</p>
                  <h2 className="text-xl font-semibold tracking-tight text-foreground">Plano de ação antes de entrar no workspace completo</h2>
                </div>
                <div className="hidden h-10 w-10 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary md:flex">
                  <ListChecks className="h-5 w-5" />
                </div>
              </div>

              <div className="space-y-3">
                {actionPlan.map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-md border border-border bg-secondary/30 p-4">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-xs font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item}</p>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        Atualiza automaticamente conforme a etapa do cliente avança no processo.
                      </p>
                    </div>
                  </div>
                ))}
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

              <Button onClick={() => setShowFullWorkspace(true)} className="h-11 w-full gap-2">
                Entrar no workspace completo
                <ArrowRight className="h-4 w-4" />
              </Button>
            </aside>
          </section>
        )}

        <Dialog open={movementsOpen} onOpenChange={setMovementsOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Últimos movimentos</DialogTitle>
              <DialogDescription>Histórico operacional completo deste workspace.</DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-3">
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

              {(eventTypeFilter !== "__all__" || movementDate) && (
                <Button variant="ghost" className="gap-2" onClick={() => { setEventTypeFilter("__all__"); setMovementDate(undefined); }}>
                  <X className="h-4 w-4" />
                  Limpar filtros
                </Button>
              )}
            </div>

            <div className="max-h-[56vh] overflow-y-auto rounded-lg border border-border bg-secondary/20 p-3">
              {filteredMovements.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">Nenhum movimento encontrado.</div>
              ) : (
                <div className="space-y-3">
                  {filteredMovements.map((event) => (
                    <div key={event.id} className="rounded-md border border-border bg-card p-4">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium text-foreground">{event.title}</p>
                        <span className="text-xs text-muted-foreground">{formatMovementDate(event.happened_at)}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-muted-foreground">{event.description ?? "Registro operacional sem descrição."}</p>
                      <span className="mt-3 inline-flex rounded-md border border-border bg-secondary px-2 py-1 text-[11px] text-muted-foreground">
                        {event.event_type}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {showFullWorkspace && <WorkspaceHeader
          clientName={clientName}
          ownerName={ownerName}
          status={ws.status}
          currentStage={ws.current_stage}
          changingStage={changingStage}
          onStageChange={handleStageChange}
          planName={planName}
        />}

        {showFullWorkspace && <Tabs defaultValue="resumo" className="w-full">
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
            />
          </TabsContent>
        </Tabs>}
      </div>
    </>
  );
}
