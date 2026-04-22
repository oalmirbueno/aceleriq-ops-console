import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle2, FolderKanban, Sparkles, Target } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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

const STAGES = ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"];

function workspaceProgress(stage: string) {
  const index = Math.max(0, STAGES.indexOf(stage));
  return Math.round(((index + 1) / STAGES.length) * 100);
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

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);

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
      .limit(20);

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

  return (
    <>
      <AppHeader title={clientName} subtitle={ws.name} />

      <div className="p-6 animate-fade-in space-y-5">
        <WorkspaceHeader
          clientName={clientName}
          ownerName={ownerName}
          status={ws.status}
          currentStage={ws.current_stage}
          changingStage={changingStage}
          onStageChange={handleStageChange}
          planName={planName}
        />

        <Tabs defaultValue="resumo" className="w-full">
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
        </Tabs>
      </div>
    </>
  );
}
