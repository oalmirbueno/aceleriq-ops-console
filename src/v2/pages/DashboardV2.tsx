import { Link } from "react-router-dom";
import HeaderV2 from "@/v2/components/HeaderV2";
import { QueryError } from "@/v2/components/QueryState";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient } from "@/v2/data/portalClient";
import { Skeleton } from "@/components/ui/skeleton";
import { FolderKanban, Activity, PauseCircle, ArrowUpRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
      <div className="px-2 py-6 animate-fade-in">
        {loading && (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Skeleton className="h-[88px] rounded-xl" />
              <Skeleton className="h-[88px] rounded-xl" />
              <Skeleton className="h-[88px] rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )}
        {error && <QueryError error={error} onRetry={reload} />}
        {data && (
          <div className="grid gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Card icon={FolderKanban} label="Projetos" value={data.projects.length} accent="text-primary" />
              <Card icon={Activity} label="Em andamento" value={data.projects.filter(p => p.status === "active").length} accent="text-emerald-400" />
              <Card icon={PauseCircle} label="Pausados" value={data.projects.filter(p => p.status === "paused").length} accent="text-amber-400" />
            </div>
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b border-border text-xs font-medium uppercase tracking-wider text-muted-foreground">Projetos</div>
              <ul className="divide-y divide-border">
                {data.projects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/ops-v2/projetos/${p.id}`}
                      className="group flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.clientName}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="hidden sm:flex items-center gap-2 w-32">
                          <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${Math.round(p.progress * 100)}%` }} />
                          </div>
                          <span className="text-[11px] tabular-nums text-muted-foreground">{Math.round(p.progress * 100)}%</span>
                        </div>
                        <ArrowUpRight className="h-4 w-4 text-muted-foreground transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                      </div>
                    </Link>
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

function Card({ icon: Icon, label, value, accent }: { icon: LucideIcon; label: string; value: number; accent?: string }) {
  return (
    <div className="group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30">
      <div className="flex items-center gap-2">
        <Icon className={`h-3.5 w-3.5 ${accent ?? "text-muted-foreground"}`} />
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className="mt-1 text-2xl font-semibold text-foreground tabular-nums">{value}</p>
    </div>
  );
}
