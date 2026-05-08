import HeaderV2 from "@/v2/components/HeaderV2";
import { QueryError, LoadingState } from "@/v2/components/QueryState";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";

export default function ClientsV2() {
  const { data, error, loading, reload } = usePortalQuery(() => portalClient.listClients(), []);
  return (
    <>
      <HeaderV2 title="Clientes" subtitle="Lista enxuta vinda do Portal" />
      <div className="px-2 py-6">
        {loading && <LoadingState />}
        {error && <QueryError error={error} onRetry={reload} />}
        {data && (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {data.map((c) => (
                <li key={c.id} className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                    <p className="text-xs text-muted-foreground">{c.id}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{c.activeProjectsCount} ativos</span>
                </li>
              ))}
              {data.length === 0 && (
                <li className="px-4 py-6 text-center text-xs text-muted-foreground">Nenhum cliente.</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
