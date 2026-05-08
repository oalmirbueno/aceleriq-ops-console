import { useParams } from "react-router-dom";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";

const STATUS_LABEL: Record<string, string> = {
  planned: "Planejada", in_progress: "Em curso", done: "Concluída", paused: "Pausada",
};
const STATUS_DOT: Record<string, string> = {
  planned: "bg-muted-foreground/50", in_progress: "bg-primary",
  done: "bg-emerald-400", paused: "bg-amber-400",
};

export default function MilestonesTabV2() {
  const { projectId = "" } = useParams();
  const { data, error, loading, reload } = usePortalQuery(
    () => portalClient.listMilestones(projectId), [projectId],
  );
  if (loading) return <LoadingState />;
  if (error) return <QueryError error={error} onRetry={reload} />;
  const list = data ?? [];
  if (list.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
        <p className="text-sm font-medium text-foreground">Sem milestones</p>
        <p className="text-xs text-muted-foreground mt-0.5">Crie milestones no Portal para vê-los aqui.</p>
      </div>
    );
  }
  return (
    <div className="grid gap-2 animate-fade-in">
      {list.map((m) => {
        const pct = Math.round(m.progress * 100);
        return (
          <div
            key={m.id}
            className="rounded-xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/30"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[m.status] ?? "bg-muted-foreground/50"}`} />
                <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {STATUS_LABEL[m.status] ?? m.status}
                </span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {m.tasksDoneCount}/{m.tasksCount}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] tabular-nums text-muted-foreground shrink-0 w-8 text-right">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
