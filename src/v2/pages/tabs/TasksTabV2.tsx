import { useParams } from "react-router-dom";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";

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
    <div className="grid gap-4">
      {groups.map(({ milestone, tasks }) => (
        <div key={milestone.id} className="rounded-lg border border-border bg-card">
          <div className="px-4 py-2 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {milestone.title}
          </div>
          <ul className="divide-y divide-border">
            {tasks.map((t) => (
              <li key={t.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <p className="text-sm text-foreground truncate">{t.title}</p>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{t.status}</span>
              </li>
            ))}
            {tasks.length === 0 && (
              <li className="px-4 py-3 text-center text-xs text-muted-foreground">Sem tarefas.</li>
            )}
          </ul>
        </div>
      ))}
      {orphans.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="px-4 py-2 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">Sem milestone</div>
          <ul className="divide-y divide-border">
            {orphans.map((t) => (
              <li key={t.id} className="px-4 py-2 flex items-center justify-between gap-3">
                <p className="text-sm text-foreground truncate">{t.title}</p>
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">{t.status}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
