import { useParams } from "react-router-dom";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";

export default function MilestonesTabV2() {
  const { projectId = "" } = useParams();
  const { data, error, loading, reload } = usePortalQuery(
    () => portalClient.listMilestones(projectId), [projectId],
  );
  if (loading) return <LoadingState />;
  if (error) return <QueryError error={error} onRetry={reload} />;
  return (
    <div className="rounded-lg border border-border bg-card">
      <ul className="divide-y divide-border">
        {(data ?? []).map((m) => (
          <li key={m.id} className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
              <p className="text-xs text-muted-foreground">{m.status} · {m.tasksDoneCount}/{m.tasksCount} tarefas</p>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{Math.round(m.progress * 100)}%</span>
          </li>
        ))}
        {(data ?? []).length === 0 && (
          <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum milestone.</li>
        )}
      </ul>
    </div>
  );
}
