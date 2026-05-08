import { Link } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";
import { QueryError, LoadingState } from "@/v2/components/QueryState";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { ChevronRight } from "lucide-react";

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
              {data.map((c) => {
                const name = c.displayName || c.name;
                const target = c.primaryProjectId ? `/ops-v2/projetos/${c.primaryProjectId}` : null;
                const Inner = (
                  <>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {c.company && c.company !== name ? `${c.company} · ` : ""}
                        {c.activeProjectsCount} projeto{c.activeProjectsCount === 1 ? "" : "s"} ativo{c.activeProjectsCount === 1 ? "" : "s"}
                        {c.primaryProjectName ? ` · ${c.primaryProjectName}` : ""}
                      </p>
                    </div>
                    {target && (
                      <span className="text-xs text-primary shrink-0 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                        Abrir projeto <ChevronRight className="w-3 h-3" />
                      </span>
                    )}
                  </>
                );
                return (
                  <li key={c.id}>
                    {target ? (
                      <Link to={target} className="group px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors">
                        {Inner}
                      </Link>
                    ) : (
                      <div className="px-4 py-3 flex items-center justify-between gap-3 opacity-70">
                        {Inner}
                      </div>
                    )}
                  </li>
                );
              })}
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
