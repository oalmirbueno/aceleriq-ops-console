/**
 * TasksOperationalTab — tarefas operacionais agrupadas por milestone.
 * Lê apenas canvas_nodes Portal-bound. Não cria nada, apenas exibe.
 */
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Circle, ListChecks, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import {
  listMilestones,
  listTasksByMilestone,
  listProjects,
  isTaskCompleted,
  type RawNodeRow,
  type DerivedTask,
} from "@/lib/milestoneModel";

type StatusFilter = "all" | "open" | "done";

interface Props {
  workspaceId: string;
  portalProjectId?: string | null;
}

export default function TasksOperationalTab({ workspaceId, portalProjectId }: Props) {
  const [nodes, setNodes] = useState<RawNodeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("canvas_nodes")
        .select("id, node_type, title, status, description, parent_node_id, archived_at, deleted_at, sync_status, data, updated_at, created_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .is("archived_at", null)
        .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)")
        .limit(500);
      if (alive) {
        setNodes((data ?? []) as RawNodeRow[]);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [workspaceId]);

  const projects = useMemo(() => listProjects(nodes), [nodes]);
  const groups = useMemo(() => {
    const all = listMilestones(nodes);
    const filtered = portalProjectId
      ? all.filter((m) => m.portalProjectId === portalProjectId || projects.find((p) => p.id === m.projectId)?.portalProjectId === portalProjectId)
      : all;
    return filtered.map((m) => {
      const tasks = listTasksByMilestone(nodes, m).filter((t) => {
        if (statusFilter === "all") return true;
        if (statusFilter === "done") return isTaskCompleted(t.status);
        return !isTaskCompleted(t.status);
      });
      return { milestone: m, tasks };
    }).filter((g) => g.tasks.length > 0);
  }, [nodes, portalProjectId, projects, statusFilter]);

  if (loading) return <LoadingState />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Tarefas reais vinculadas ao Portal, agrupadas por milestone.
        </p>
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <TabsList className="h-8">
            <TabsTrigger value="open" className="text-[11px] h-6 px-2.5">Abertas</TabsTrigger>
            <TabsTrigger value="done" className="text-[11px] h-6 px-2.5">Concluídas</TabsTrigger>
            <TabsTrigger value="all" className="text-[11px] h-6 px-2.5">Todas</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {groups.length === 0 && (
        <EmptyState
          icon={ListChecks}
          title="Nada por aqui"
          description={
            statusFilter === "open"
              ? "Nenhuma tarefa aberta neste workspace."
              : statusFilter === "done"
                ? "Nenhuma tarefa concluída ainda."
                : "Nenhuma tarefa vinculada ao Portal."
          }
        />
      )}

      {groups.map(({ milestone, tasks }) => (
        <Card key={milestone.id} className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-3.5 w-3.5 text-primary" />
            <h3 className="text-sm font-semibold text-foreground truncate">{milestone.title}</h3>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 ml-auto font-normal">
              {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
            </Badge>
          </div>
          <div className="space-y-1">
            {tasks.map((t) => (
              <TaskRow key={t.id} task={t} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function TaskRow({ task }: { task: DerivedTask }) {
  const done = isTaskCompleted(task.status);
  return (
    <div className="flex items-start gap-2.5 py-1.5 px-2 rounded hover:bg-muted/40 transition-colors">
      {done ? (
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-xs ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-[10px] text-muted-foreground/70 line-clamp-1 mt-0.5">{task.description}</p>
        )}
      </div>
      {task.dueDate && (
        <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
          {new Date(task.dueDate).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
        </span>
      )}
    </div>
  );
}
