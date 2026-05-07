import { useState, useEffect } from "react";
import { Activity, ArrowRight, Clock, FolderKanban, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";
import { supabase } from "@/integrations/supabase/client";

interface RecentEvent { id: string; title: string; event_type: string; happened_at: string; workspace_id?: string | null; }
interface ActiveWorkspace { id: string; name: string; current_stage: string; client_id: string; clients: { id: string; name: string; company_name: string | null; logo_url?: string | null; plan_name?: string | null } | null; }
interface StatCard { label: string; value: string; icon: React.ElementType; delta: string; target: string; }

const STAGES = ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"];

function progressFor(stage: string) {
  return Math.round(((Math.max(0, STAGES.indexOf(stage)) + 1) / STAGES.length) * 100);
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 36e5);
  if (hours < 1) return "agora";
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [recentEvents, setRecentEvents] = useState<RecentEvent[]>([]);
  const [activeWorkspaces, setActiveWorkspaces] = useState<ActiveWorkspace[]>([]);
  const [stats, setStats] = useState<StatCard[]>([]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [clientsRes, workspacesRes, activeRes, tasksRes, eventsRes, activeWorkspacesRes] = await Promise.all([
          supabase.from("clients").select("*", { count: "exact", head: true })
            .is("deleted_at", null)
            .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)"),
          supabase.from("workspaces").select("*", { count: "exact", head: true })
            .is("deleted_at", null)
            .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)"),
          supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active")
            .is("deleted_at", null)
            .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)"),
          supabase.from("tasks").select("*", { count: "exact", head: true }).not("status", "in", "(done,canceled)"),
          supabase.from("timeline_events").select("id, title, event_type, happened_at, workspace_id").order("happened_at", { ascending: false }).limit(10),
          supabase.from("workspaces").select("id, name, current_stage, client_id, clients(id, name, company_name, logo_url, plan_name)")
            .is("deleted_at", null)
            .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)")
            .order("updated_at", { ascending: false }).limit(4),
        ]);

        const events = (eventsRes.data ?? []) as RecentEvent[];
        setRecentEvents(events);
        setActiveWorkspaces((activeWorkspacesRes.data ?? []) as unknown as ActiveWorkspace[]);
        setStats([
          { label: "Clientes ativos", value: String(activeRes.count ?? 0), icon: Users, delta: `${clientsRes.count ?? 0} no total`, target: "/ops/clients" },
          { label: "Workspaces", value: String(workspacesRes.count ?? 0), icon: FolderKanban, delta: "linha de produção", target: "/ops/workspaces" },
          { label: "Tasks abertas", value: String(tasksRes.count ?? 0), icon: Activity, delta: "pendências operacionais", target: "/ops/workspaces" },
          { label: "Último movimento", value: events[0] ? relativeTime(events[0].happened_at) : "—", icon: Clock, delta: events[0]?.event_type ?? "sem eventos", target: "/ops/workspaces" },
        ]);
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
  }, []);

  if (loading) return <><AppHeader title="Dashboard" /><LoadingState /></>;

  return (
    <>
      <AppHeader title="Dashboard" subtitle="Pulso operacional dos clientes, workspaces e movimentos recentes" />
      <div className="p-6 page-enter space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <button key={s.label} onClick={() => navigate(s.target)} className="surface-2 card-hover p-5 text-left">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className="rounded-md bg-primary/10 p-2"><s.icon className="h-4 w-4 text-primary" /></span>
                <span className="text-[11px] uppercase tracking-widest text-muted-foreground">{s.delta}</span>
              </div>
              <p className="text-[11px] uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className="mt-1 text-3xl font-semibold text-foreground">{s.value}</p>
            </button>
          ))}
        </div>

        <section className="surface-2 rounded-lg p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><p className="label-sm">Ativos agora</p><h2 className="text-lg font-semibold text-foreground">Workspaces em execução</h2></div>
            <Button variant="outline" size="sm" onClick={() => navigate("/ops/workspaces")}>Ver hub</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {activeWorkspaces.map((workspace) => {
              const client = workspace.clients;
              const progress = progressFor(workspace.current_stage);
              return (
                <article key={workspace.id} className="surface-3 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <ClientAvatar name={client?.name ?? workspace.name} seed={client?.id ?? workspace.id} logoUrl={client?.logo_url} size="sm" />
                    <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{client?.name ?? workspace.name}</p><p className="truncate text-xs text-muted-foreground">{client?.company_name ?? workspace.name}</p></div>
                  </div>
                  <div className="my-4 space-y-2"><div className="flex justify-between text-xs"><span className="text-muted-foreground">{getStagePremiumLabel(workspace.current_stage)}</span><span className="text-primary">{progress}%</span></div><Progress value={progress} className="h-1.5" /></div>
                  <div className="flex gap-2"><Button size="sm" className="h-8 flex-1" onClick={() => navigate(`/ops/workspaces/${workspace.id}`)}>Abrir</Button><Button size="sm" variant="outline" className="h-8" onClick={() => navigate(`/ops/workspaces/${workspace.id}?tab=canvas`)}>Canvas</Button></div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="surface-2 rounded-lg p-5">
          <p className="label-sm mb-4">Feed de atividade</p>
          {recentEvents.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p> : (
            <ul className="divide-y divide-border/60">
              {recentEvents.map((ev) => <li key={ev.id} className="flex items-center justify-between gap-4 py-3 text-sm"><div className="flex min-w-0 items-center gap-3"><span className="h-2 w-2 rounded-full bg-primary" /><span className="truncate text-foreground">{ev.title}</span><span className="hidden text-xs text-muted-foreground sm:inline">{ev.event_type}</span></div><span className="shrink-0 text-xs text-muted-foreground">{relativeTime(ev.happened_at)}</span></li>)}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
