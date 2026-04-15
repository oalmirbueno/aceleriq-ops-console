import { useState, useEffect, useCallback } from "react";
import { Plus, ListFilter, CheckCircle2, Sparkles, ClipboardList, Trash2 } from "lucide-react";
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
  created_at: string;
  updated_at: string;
}

interface Props {
  workspaceId: string;
  clientId: string;
}

export default function WorkspaceTabTasks({ workspaceId, clientId }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("tasks")
      .select("id, title, description, status, priority, stage, due_date, source_type, source_id, completed_at, created_at, updated_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      q = q.eq("status", filter);
    }

    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar tasks", description: error.message, variant: "destructive" });
    }
    setTasks(data ?? []);
    setLoading(false);
  }, [workspaceId, filter]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const handleCreate = async (form: TaskFormData) => {
    const payload: Record<string, unknown> = {
      workspace_id: workspaceId,
      client_id: clientId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      stage: form.stage || null,
      due_date: form.due_date || null,
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

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      status: form.status,
      priority: form.priority,
      stage: form.stage || null,
      due_date: form.due_date || null,
      completed_at: becomingDone ? (editTask.completed_at ?? new Date().toISOString()) : leavingDone ? null : editTask.completed_at,
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
        <div className="flex items-center gap-2">
          <ListFilter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {TASK_STATUS_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <CheckCircle2 className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">
            {filter === "all" ? "Nenhuma task neste workspace" : "Nenhuma task com esse filtro"}
          </p>
          <p className="text-xs text-muted-foreground">
            {filter === "all" ? "Crie a primeira task para começar." : "Tente outro filtro ou crie uma nova task."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map((t) => (
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
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
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
          ))}
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
        onGenerated={fetchTasks}
      />
    </div>
  );
}
