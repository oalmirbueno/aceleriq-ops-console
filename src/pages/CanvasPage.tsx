import { useEffect, useState } from "react";
import { FolderKanban, Search, Layout } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";
import { supabase } from "@/integrations/supabase/client";

interface WorkspaceOption {
  id: string;
  name: string;
  client_id: string;
  current_stage: string;
  clients: { id: string; name: string; company_name: string | null; logo_url?: string | null } | null;
}

export default function CanvasPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    async function fetchWorkspaces() {
      const { data } = await supabase
        .from("workspaces")
        .select("id, name, client_id, current_stage, clients(id, name, company_name, logo_url)")
        .order("updated_at", { ascending: false })
        .limit(30);
      setWorkspaces((data ?? []) as unknown as WorkspaceOption[]);
      setLoading(false);
    }
    fetchWorkspaces();
  }, []);

  const filtered = workspaces.filter((ws) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      ws.name.toLowerCase().includes(q) ||
      ws.clients?.name.toLowerCase().includes(q) ||
      ws.clients?.company_name?.toLowerCase().includes(q)
    );
  });

  const openCanvas = (ws: WorkspaceOption) => {
    const params = new URLSearchParams({
      workspaceId: ws.id,
      clientId: ws.client_id,
      clientName: ws.clients?.name ?? ws.name,
    });
    navigate(`/ops/canvas/open?${params.toString()}`);
  };

  return (
    <div className="min-h-screen bg-background p-6 page-enter">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-card text-primary">
            <Layout className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Canvas operacional</h1>
            <p className="text-sm text-muted-foreground">Selecione um workspace para abrir o Canvas</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar workspace ou cliente..."
            className="pl-9"
          />
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title="Nenhum workspace disponível" description="Abra um workspace existente para acessar o canvas." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((ws) => {
              const client = ws.clients;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => openCanvas(ws)}
                  className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
                >
                  <ClientAvatar name={client?.name ?? ws.name} seed={client?.id ?? ws.id} logoUrl={client?.logo_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{client?.name ?? ws.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{client?.company_name ?? ws.name}</p>
                    <p className="mt-1 text-xs text-primary">{getStagePremiumLabel(ws.current_stage)}</p>
                  </div>
                  <span className="text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">Abrir Canvas ↗</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
