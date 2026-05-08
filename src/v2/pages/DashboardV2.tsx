import { Link } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";
import { QueryError, LoadingState } from "@/v2/components/QueryState";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";

export default function DashboardV2() {
  const { data, error, loading, reload } = usePortalQuery(
    async () => {
      const projects = await portalClient.listProjects();
      return { projects };
    },
    [],
  );

  return (
    <>
      <HeaderV2 title="Dashboard" subtitle="Visão geral da operação" />
      <div className="px-2 py-6">
        {loading && <LoadingState />}
        {error && <QueryError error={error} onRetry={reload} />}
        {data && (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card label="Projetos" value={data.projects.length} />
              <Card label="Em andamento" value={data.projects.filter(p => p.status === "active").length} />
              <Card label="Pausados" value={data.projects.filter(p => p.status === "paused").length} />
            </div>
            <div className="rounded-lg border border-border bg-card">
              <div className="px-4 py-3 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">Projetos</div>
              <ul className="divide-y divide-border">
                {data.projects.map((p) => (
                  <li key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/ops-v2/projetos/${p.id}`} className="text-sm font-medium text-foreground hover:text-primary truncate block">{p.name}</Link>
                      <p className="text-xs text-muted-foreground truncate">{p.clientName}</p>
                    </div>
                    <div className="text-xs text-muted-foreground shrink-0">{Math.round(p.progress * 100)}%</div>
                  </li>
                ))}
                {data.projects.length === 0 && (
                  <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum projeto encontrado.</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-foreground">{value}</p>
    </div>
  );
}
