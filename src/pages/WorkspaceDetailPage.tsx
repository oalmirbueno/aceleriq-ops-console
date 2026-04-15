import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { FolderKanban } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceTabResumo from "@/components/workspace/WorkspaceTabResumo";
import WorkspaceTabTimeline from "@/components/workspace/WorkspaceTabTimeline";
import WorkspaceTabContexto from "@/components/workspace/WorkspaceTabContexto";
import WorkspaceTabTasks from "@/components/workspace/WorkspaceTabTasks";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Workspace {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  primary_owner_id: string | null;
  client_id: string;
  summary: string | null;
  clients: { id: string; name: string } | null;
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
      .select("id, name, status, current_stage, primary_owner_id, client_id, summary, clients(id, name), profiles:primary_owner_id(full_name, email)")
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
      description: `De "${oldStage}" para "${newStage}"`,
      happened_at: new Date().toISOString(),
    });

    toast({ title: "Etapa atualizada", description: `Movido para "${newStage}"` });
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
        />

        <Tabs defaultValue="resumo" className="w-full">
          <TabsList>
            <TabsTrigger value="resumo">Resumo</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
            <TabsTrigger value="contexto">Contexto</TabsTrigger>
            <TabsTrigger value="tasks" disabled className="opacity-40">Tasks</TabsTrigger>
            <TabsTrigger value="canvas" disabled className="opacity-40">Canvas</TabsTrigger>
          </TabsList>

          <TabsContent value="resumo">
            <WorkspaceTabResumo
              clientName={clientName}
              workspaceName={ws.name}
              status={ws.status}
              currentStage={ws.current_stage}
              ownerName={ownerName}
              summary={ws.summary ?? null}
              recentEvents={timeline}
            />
          </TabsContent>

          <TabsContent value="timeline">
            <WorkspaceTabTimeline events={timeline} />
          </TabsContent>

          <TabsContent value="contexto">
            <WorkspaceTabContexto workspaceId={ws.id} clientId={ws.client_id} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
