import { useState, useEffect } from "react";
import { Users, FolderKanban, Activity, Clock } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import { supabase } from "@/integrations/supabase/client";

interface StatCard {
  label: string;
  value: string;
  icon: React.ElementType;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<StatCard[]>([
    { label: "Total de Clientes", value: "0", icon: Users },
    { label: "Workspaces", value: "0", icon: FolderKanban },
    { label: "Clientes Ativos", value: "0", icon: Activity },
    { label: "Itens Recentes", value: "0", icon: Clock },
  ]);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [clientsRes, workspacesRes, activeRes] = await Promise.all([
          supabase.from("clients").select("*", { count: "exact", head: true }),
          supabase.from("workspaces").select("*", { count: "exact", head: true }),
          supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
        ]);

        setStats([
          { label: "Total de Clientes", value: String(clientsRes.count ?? 0), icon: Users },
          { label: "Workspaces", value: String(workspacesRes.count ?? 0), icon: FolderKanban },
          { label: "Clientes Ativos", value: String(activeRes.count ?? 0), icon: Activity },
          { label: "Itens Recentes", value: "0", icon: Clock },
        ]);
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) return (
    <>
      <AppHeader title="Dashboard" />
      <LoadingState />
    </>
  );

  return (
    <>
      <AppHeader title="Dashboard" subtitle="Visão geral das operações" />
      <div className="p-6">
        <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="card-hover rounded-lg border border-border bg-card p-5"
            >
              <div className="mb-3 flex items-center gap-2">
                <div className="rounded-md bg-primary/10 p-2">
                  <s.icon className="h-4 w-4 text-primary" />
                </div>
                <span className="label-sm">{s.label}</span>
              </div>
              <p className="text-2xl font-semibold text-foreground">{s.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-lg border border-border bg-card p-6">
          <p className="label-sm mb-2">ATIVIDADE RECENTE</p>
          <p className="text-sm text-muted-foreground">
            Nenhuma atividade registrada ainda.
          </p>
        </div>
      </div>
    </>
  );
}
