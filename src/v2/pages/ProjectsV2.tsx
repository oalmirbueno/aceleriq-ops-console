import { Link } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";
import { QueryError, LoadingState } from "@/v2/components/QueryState";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";

export default function ProjectsV2() {
  const { data, error, loading, reload } = usePortalQuery(() => portalClient.listProjects(), []);
  return (
    <>
      <HeaderV2 title="Projetos" subtitle="Projetos vindos do Portal" />
      <div className="px-2 py-6">
        {loading && <LoadingState />}
        {error && <QueryError error={error} onRetry={reload} />}
        {data && (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {data.map((p) => (
                <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <Link to={`/ops-v2/projetos/${p.id}`} className="text-sm font-medium text-foreground hover:text-primary truncate block">{p.name}</Link>
                    <p className="text-xs text-muted-foreground truncate">{p.clientName} · {p.status}</p>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">{Math.round(p.progress * 100)}%</div>
                </li>
              ))}
              {data.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum projeto.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
