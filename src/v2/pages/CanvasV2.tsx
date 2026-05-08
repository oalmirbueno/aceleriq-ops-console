import { useParams } from "react-router-dom";
import { useState } from "react";
import HeaderV2 from "@/v2/components/HeaderV2";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";

export default function CanvasV2() {
  const { projectId = "" } = useParams();
  const [milestoneId, setMilestoneId] = useState<string>("");
  const ms = usePortalQuery(() => portalClient.listMilestones(projectId), [projectId]);
  const tk = usePortalQuery(
    () => milestoneId ? portalClient.listTasks({ projectId, milestoneId }) : Promise.resolve([]),
    [projectId, milestoneId],
  );

  return (
    <>
      <HeaderV2 title="Canvas" subtitle={`Projeto ${projectId}`} />
      <div className="py-6 grid gap-4">
        {ms.loading && <LoadingState />}
        {ms.error && <QueryError error={ms.error} onRetry={ms.reload} />}
        {ms.data && (
          <div className="flex flex-wrap gap-2">
            {ms.data.map((m) => (
              <button
                key={m.id}
                onClick={() => setMilestoneId(m.id)}
                className={`rounded-md border px-3 py-1.5 text-xs ${
                  milestoneId === m.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {m.title}
              </button>
            ))}
            {ms.data.length === 0 && <p className="text-xs text-muted-foreground">Nenhum milestone disponível.</p>}
          </div>
        )}
        {milestoneId && tk.loading && <LoadingState />}
        {tk.error && <QueryError error={tk.error} onRetry={tk.reload} />}
        {milestoneId && tk.data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tk.data.map((t) => (
              <div key={t.id} className="rounded-lg border border-border bg-card p-3">
                <p className="text-sm font-medium text-foreground">{t.title}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">{t.status}</p>
              </div>
            ))}
            {tk.data.length === 0 && <p className="text-xs text-muted-foreground">Sem tarefas neste milestone.</p>}
          </div>
        )}
      </div>
    </>
  );
}
