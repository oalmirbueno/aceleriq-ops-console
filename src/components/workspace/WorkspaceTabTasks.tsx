import { useState, useEffect, useCallback } from "react";
import { Plus, ListFilter, CheckCircle2, Sparkles, ClipboardList, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import TaskFormDialog, { type TaskFormData } from "./TaskFormDialog";
import GenerateTasksDialog from "./GenerateTasksDialog";
import TaskPlanningWizard from "./TaskPlanningWizard";
import {
  TASK_STATUS_OPTIONS,
  getStatusLabel,
  getPriorityLabel,
  getStageLabel,
  getStatusColor,
  getPriorityColor,
} from "./taskConstants";

interface Task {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  stage: string | null;
  due_date: string | null;
  source_type: string | null;
  source_id: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface FrontOption {
  id: string;
  name: string;
  front_key: string | null;
}

interface Props {
  workspaceId: string;
  clientId: string;
  planName?: string | null;
}

export default function WorkspaceTabTasks({ workspaceId, clientId, planName }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [fronts, setFronts] = useState<FrontOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [frontFilter, setFrontFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  // Fetch fronts for filter + label resolution
  const fetchFronts = useCallback(async () => {
    const { data } = await supabase
      .from("operational_fronts")
      .select("id, name, front_key")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });
    setFronts((data ?? []) as FrontOption[]);
  }, [workspaceId]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("tasks")
      .select("id, title, description, status, priority, stage, due_date, source_type, source_id, completed_at, metadata, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      q = q.eq("status", filter);
    } else {
      q = q.neq("status", "archived");
    }

    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar tasks", description: error.message, variant: "destructive" });
    }
    setTasks(data ?? []);
    setLoading(false);
  }, [workspaceId, filter]);

  useEffect(() => { fetchFronts(); }, [fetchFronts]);
  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Resolve front name from task metadata
  const getFrontName = (t: Task): string | null => {
    const meta = t.metadata;
    if (!meta) return null;
    const frontId = meta.operational_front_id as string | undefined;
    if (!frontId) return null;
    // Try metadata first (faster), then resolve from fetched fronts
    const fromMeta = meta.front_name as string | undefined;
    if (fromMeta) return fromMeta;
    const found = fronts.find((f) => f.id === frontId);
    return found?.name ?? null;
  };

  const getFrontId = (t: Task): string | null => {
    return (t.metadata?.operational_front_id as string) ?? null;
  };

  // Apply front filter client-side
  const filteredTasks = frontFilter === "all"
    ? tasks
    : frontFilter === "none"
      ? tasks.filter((t) => !getFrontId(t))
      : tasks.filter((t) => getFrontId(t) === frontFilter);

  const handleCreate = async (form: TaskFormData) => {
    const meta: Record<string, unknown> = {};
    if (form.action_plan && Object.values(form.action_plan).some((v) => v.trim())) {
      meta.action_plan = form.action_plan;
    }

    const payload: Record<string, unknown> = {
      workspace_id: workspaceId,
      client_id: clientId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      stage: form.stage || null,
      due_date: form.due_date || null,
      metadata: Object.keys(meta).length > 0 ? meta : null,
    };

    const { data, error } = await supabase.from("tasks").insert(payload).select("id").single();
    if (error) {
      toast({ title: "Erro ao criar task", description: error.message, variant: "destructive" });
      throw error;
    }

    await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: "task_created",
      title: "Task criada",
      description: `"${form.title.trim()}"`,
      happened_at: new Date().toISOString(),
    });

    toast({ title: "Task criada" });
    fetchTasks();
  };

  const handleEdit = async (form: TaskFormData) => {
    if (!editTask) return;
    const wasNotDone = editTask.status !== "done";
    const becomingDone = form.status === "done";
    const leavingDone = editTask.status === "done" && form.status !== "done";

    // Merge action_plan into existing metadata
    const existingMeta = (editTask.metadata ?? {}) as Record<string, unknown>;
    if (form.action_plan && Object.values(form.action_plan).some((v) => v.trim())) {
      existingMeta.action_plan = form.action_plan;
    }

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      stage: form.stage || null,
      due_date: form.due_date || null,
      completed_at: becomingDone ? (editTask.completed_at ?? new Date().toISOString()) : leavingDone ? null : editTask.completed_at,
      metadata: existingMeta,
    };

    const { error } = await supabase.from("tasks").update(payload).eq("id", editTask.id);
    if (error) {
      toast({ title: "Erro ao salvar task", description: error.message, variant: "destructive" });
      throw error;
    }

    if (wasNotDone && becomingDone) {
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "task_completed",
        title: "Task concluída",
        description: `"${form.title.trim()}"`,
        happened_at: new Date().toISOString(),
      });
    }

    toast({ title: "Task atualizada" });
    setEditTask(null);
    fetchTasks();
  };

  const handleQuickStatus = async (task: Task, newStatus: string) => {
    if (task.status === newStatus) return;
    const wasNotDone = task.status !== "done";
    const becomingDone = newStatus === "done";
    const leavingDone = task.status === "done" && newStatus !== "done";

    const payload: Record<string, unknown> = {
      status: newStatus,
      completed_at: becomingDone ? new Date().toISOString() : leavingDone ? null : task.completed_at,
    };

    const { error } = await supabase.from("tasks").update(payload).eq("id", task.id);
    if (error) {
      toast({ title: "Erro ao mudar status", description: error.message, variant: "destructive" });
      return;
    }

    if (wasNotDone && becomingDone) {
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "task_completed",
        title: "Task concluída",
        description: `"${task.title}"`,
        happened_at: new Date().toISOString(),
      });
    }

    toast({ title: `Status → ${getStatusLabel(newStatus)}` });
    fetchTasks();
  };

  const handleArchive = async (task: Task) => {
    const { error } = await supabase.from("tasks").update({ status: "canceled" }).eq("id", task.id);
    if (error) {
      toast({ title: "Erro ao arquivar task", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Task cancelada/arquivada" });
    if (editTask?.id === task.id) setEditTask(null);
    fetchTasks();
  };

  const getSourceLabel = (t: Task) => {
    const meta = t.metadata;
    if (meta?.generation_mode === "operational_wizard") return "plano operacional";
    if (!t.source_type) return "manual";
    return t.source_type;
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando tasks...</p>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {TASK_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {fronts.length > 0 && (
            <>
              <Layers className="h-4 w-4 text-muted-foreground ml-1" />
              <Select value={frontFilter} onValueChange={setFrontFilter}>
                <SelectTrigger className="h-8 w-[180px] text-xs">
                  <SelectValue placeholder="Frente" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as frentes</SelectItem>
                  <SelectItem value="none">Sem frente vinculada</SelectItem>
                  {fronts.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setWizardOpen(true)}>
            <ClipboardList className="h-4 w-4 mr-1" /> Plano Operacional
          </Button>
          <Button size="sm" variant="outline" onClick={() => setGenerateOpen(true)}>
            <Sparkles className="h-4 w-4 mr-1" /> Gerar de Contexto
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nova Task
          </Button>
        </div>
      </div>

      {/* list */}
      {filteredTasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            {filter === "all" && frontFilter === "all" ? "Nenhuma task neste workspace" : "Nenhuma task com esses filtros"}
          </p>
          <p className="text-xs text-muted-foreground">
            {filter === "all" && frontFilter === "all"
              ? "Use o Plano Operacional ou gere frentes na aba Produção para criar tasks automaticamente."
              : "Tente outro filtro ou crie uma nova task."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTasks.map((t) => {
            const frontName = getFrontName(t);
            return (
              <Card key={t.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setEditTask(t)}>
                <CardContent className="p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{t.title}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(t.status)}`}>
                        {getStatusLabel(t.status)}
                      </Badge>
                      <span className={`text-[10px] ${getPriorityColor(t.priority)}`}>
                        {getPriorityLabel(t.priority)}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                      {frontName && (
                        <span className="text-primary/80 font-medium flex items-center gap-1">
                          <Layers className="h-2.5 w-2.5" />
                          {frontName}
                        </span>
                      )}
                      {getStageLabel(t.stage) && <span>Etapa: {getStageLabel(t.stage)}</span>}
                      {t.due_date && <span>Prazo: {new Date(t.due_date).toLocaleDateString("pt-BR")}</span>}
                      <span className="opacity-60">Origem: {getSourceLabel(t)}</span>
                    </div>
                  </div>
                  {/* quick status */}
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <Select value={t.status} onValueChange={(v) => handleQuickStatus(t, v)}>
                      <SelectTrigger className="h-7 w-[120px] text-[10px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {t.status !== "canceled" && (
                      <button
                        onClick={() => { if (window.confirm("Cancelar/arquivar esta task?")) handleArchive(t); }}
                        className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded"
                        title="Cancelar task"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* dialogs */}
      <TaskFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        mode="create"
      />
      <TaskFormDialog
        open={!!editTask}
        onOpenChange={(open) => { if (!open) setEditTask(null); }}
        onSubmit={handleEdit}
        mode="edit"
        initial={editTask ? {
          title: editTask.title,
          description: editTask.description ?? "",
          status: editTask.status,
          priority: editTask.priority,
          stage: editTask.stage ?? "",
          due_date: editTask.due_date ?? "",
          action_plan: (editTask.metadata as Record<string, unknown>)?.action_plan as TaskFormData["action_plan"] ?? undefined,
        } : null}
      />
      <GenerateTasksDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        onGenerated={fetchTasks}
      />
      <TaskPlanningWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        planName={planName}
        onGenerated={fetchTasks}
      />
    </div>
  );
}
