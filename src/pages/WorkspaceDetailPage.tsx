import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { FolderKanban, ChevronRight, User } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Workspace {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  primary_owner_id: string | null;
  client_id: string;
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

const stageIdx = (s: string) => STAGES.indexOf(s);

export default function WorkspaceDetailPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [changingStage, setChangingStage] = useState(false);

  const fetchWorkspace = async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("workspaces")
      .select("id, name, status, current_stage, primary_owner_id, client_id, clients(id, name), profiles:primary_owner_id(full_name, email)")
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

    const now = new Date().toISOString();
    await supabase.from("timeline_events").insert({
      workspace_id: ws.id,
      client_id: ws.client_id,
      event_type: "stage_changed",
      title: "Etapa alterada",
      description: `De "${oldStage}" para "${newStage}"`,
      happened_at: now,
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
      <EmptyState icon={FolderKanban} title="Workspace não encontrado" description="Este workspace não existe ou foi removido." />
    </>
  );

  const clientName = ws.clients?.name ?? "Cliente";
  const ownerName = ws.profiles?.full_name ?? ws.profiles?.email ?? null;

  return (
    <>
      <AppHeader title={clientName} subtitle={ws.name} />

      <div className="p-6 animate-fade-in space-y-6">
        {/* Info bar */}
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-sm">
            <span className="label-sm">Status</span>
            <Badge variant="outline">{ws.status}</Badge>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="label-sm">Etapa</span>
            <Select value={ws.current_stage} onValueChange={handleStageChange} disabled={changingStage}>
              <SelectTrigger className="h-8 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="label-sm">Responsável</span>
            {ownerName ? (
              <span className="text-foreground">{ownerName}</span>
            ) : (
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="h-3 w-3" /> Não atribuído
              </span>
            )}
          </div>
        </div>

        {/* Stage progress */}
        <div className="flex items-center gap-1 flex-wrap">
          {STAGES.map((s, i) => {
            const current = stageIdx(ws.current_stage);
            const done = i < current;
            const active = i === current;
            return (
              <div key={s} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
                <span
                  className={`rounded-full px-3 py-1 text-xs capitalize transition-colors ${
                    active
                      ? "bg-primary/15 text-primary font-medium border border-primary/30"
                      : done
                        ? "bg-primary/5 text-primary/60"
                        : "text-muted-foreground"
                  }`}
                >
                  {s.replace("_", " ")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Timeline */}
        <div className="rounded-lg border border-border bg-card p-5">
          <p className="label-sm mb-4">TIMELINE</p>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((ev) => (
                <div key={ev.id} className="flex gap-3 text-sm">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/40" />
                  <div>
                    <p className="font-medium text-foreground">{ev.title}</p>
                    {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(ev.happened_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
