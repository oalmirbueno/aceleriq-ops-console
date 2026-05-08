import { Link } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";
import { QueryError } from "@/v2/components/QueryState";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { ChevronRight, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function ClientsV2() {
  const { data, error, loading, reload } = usePortalQuery(() => portalClient.listClients(), []);
  return (
    <>
      <HeaderV2 title="Clientes" subtitle="Lista enxuta vinda do Portal" />
      <div className="px-2 py-6 animate-fade-in">
        {loading && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[88px] rounded-xl" />
            ))}
          </div>
        )}
        {error && <QueryError error={error} onRetry={reload} />}
        {data && data.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
            <Users className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-2 text-sm font-medium text-foreground">Nenhum cliente</p>
            <p className="text-xs text-muted-foreground">Quando houver clientes no Portal, eles aparecem aqui.</p>
          </div>
        )}
        {data && data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((c) => {
              const name = c.displayName || c.name;
              const target = c.primaryProjectId ? `/ops-v2/projetos/${c.primaryProjectId}` : null;
              const card = (
                <div className="group relative rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.12),0_8px_24px_-12px_hsl(var(--primary)/0.25)]">
                  <div className="flex items-start gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-[13px] font-semibold text-primary">
                      {initialsOf(name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{name}</p>
                      {c.company && c.company !== name && (
                        <p className="text-[11px] text-muted-foreground truncate">{c.company}</p>
                      )}
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {c.activeProjectsCount} projeto{c.activeProjectsCount === 1 ? "" : "s"} ativo{c.activeProjectsCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    {target && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    )}
                  </div>
                  {c.primaryProjectName && (
                    <p className="mt-3 truncate text-[11px] text-muted-foreground/80">
                      <span className="text-muted-foreground/60">Projeto: </span>{c.primaryProjectName}
                    </p>
                  )}
                </div>
              );
              return target ? (
                <Link key={c.id} to={target}>{card}</Link>
              ) : (
                <div key={c.id} className="opacity-70 cursor-default">{card}</div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
