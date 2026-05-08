import { useParams } from "react-router-dom";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";

const TASK_STATUS_LABEL: Record<string, string> = {
  todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueada",
  done: "Concluída", archived: "Arquivada",
};
const TASK_STATUS_CLS: Record<string, string> = {
  todo: "border-border bg-background text-muted-foreground",
  in_progress: "border-primary/40 bg-primary/10 text-primary",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  done: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  archived: "border-border bg-muted/40 text-muted-foreground",
};

function StatusPill({ status }: { status: string }) {
  const cls = TASK_STATUS_CLS[status] ?? TASK_STATUS_CLS.todo;
  const label = TASK_STATUS_LABEL[status] ?? status;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

export default function TasksTabV2() {
  const { projectId = "" } = useParams();
  const { data, error, loading, reload } = usePortalQuery(async () => {
    const [milestones, tasks] = await Promise.all([
      portalClient.listMilestones(projectId),
      portalClient.listTasks({ projectId }),
    ]);
    return { milestones, tasks };
  }, [projectId]);
  if (loading) return <LoadingState />;
  if (error) return <QueryError error={error} onRetry={reload} />;
  if (!data) return null;

  const groups = data.milestones.map((m) => ({
    milestone: m,
    tasks: data.tasks.filter((t) => t.milestoneId === m.id),
  }));
  const orphans = data.tasks.filter((t) => !data.milestones.some((m) => m.id === t.milestoneId));

  return (
    <div className="grid gap-4 animate-fade-in">
      {groups.map(({ milestone, tasks }) => (
        <div key={milestone.id} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">
              {milestone.title}
            </p>
            <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
              {tasks.length} tarefa{tasks.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                <p className="text-sm text-foreground truncate">{t.title}</p>
                <StatusPill status={t.status} />
              </li>
            ))}
            {tasks.length === 0 && (
              <li className="px-4 py-3 text-center text-xs text-muted-foreground">Sem tarefas.</li>
            )}
          </ul>
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-2 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">Sem milestone</div>
          <ul className="divide-y divide-border">
            {orphans.map((t) => (
              <li key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
                <p className="text-sm text-foreground truncate">{t.title}</p>
                <StatusPill status={t.status} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
