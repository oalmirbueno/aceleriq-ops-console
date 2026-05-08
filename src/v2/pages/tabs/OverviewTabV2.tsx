import { useParams } from "react-router-dom";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";

export default function OverviewTabV2() {
  const { projectId = "" } = useParams();
  const { data, error, loading, reload } = usePortalQuery(async () => {
    const [project, milestones, tasks] = await Promise.all([
      portalClient.getProject(projectId),
      portalClient.listMilestones(projectId),
      portalClient.listTasks({ projectId }),
    ]);
    return { project, milestones, tasks };
  }, [projectId]);

  if (loading) return <LoadingState />;
  if (error) return <QueryError error={error} onRetry={reload} />;
  if (!data?.project) return <p className="text-xs text-muted-foreground">Projeto não encontrado.</p>;

  const { project, milestones, tasks } = data;
  const current = milestones.find((m) => m.id === project.currentMilestoneId);
  const pct = Math.round(project.progress * 100);
  return (
    <div className="grid gap-4 animate-fade-in">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card label="Status" value={project.status} />
        <Card label="Progresso" value={`${pct}%`} />
        <Card label="Milestones" value={milestones.length} />
        <Card label="Tarefas" value={tasks.length} />
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Milestone atual</p>
            <p className="mt-1 text-sm font-medium text-foreground truncate">{current?.title ?? "—"}</p>
          </div>
          {current && (
            <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground tabular-nums">
              {current.tasksDoneCount}/{current.tasksCount}
            </span>
          )}
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/30">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}
