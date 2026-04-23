import { useEffect, useState } from "react";
import { ArrowLeft, FolderKanban, Search } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import CanvasStudio from "@/components/workspace/CanvasStudio";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import { supabase } from "@/integrations/supabase/client";

interface WorkspaceOption {
  id: string;
  name: string;
  client_id: string;
  clients: { id: string; name: string; company_name: string | null; logo_url?: string | null } | null;
}

export default function CanvasPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workspaceId = searchParams.get("workspaceId");
  const clientId = searchParams.get("clientId");
  const clientName = searchParams.get("clientName") || "Canvas Ops";
  const [loading, setLoading] = useState(!workspaceId || !clientId);
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (workspaceId && clientId) return;
    async function fetchWorkspaces() {
      setLoading(true);
      const { data } = await supabase
        .from("workspaces")
        .select("id, name, client_id, clients(id, name, company_name, logo_url)")
        .order("updated_at", { ascending: false })
        .limit(30);
      setWorkspaces((data ?? []) as unknown as WorkspaceOption[]);
      setLoading(false);
    }
    fetchWorkspaces();
  }, [workspaceId, clientId]);

  if (workspaceId && clientId) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-background">
        <CanvasStudio
          workspaceId={workspaceId}
          clientId={clientId}
          clientName={clientName}
          fullscreen
          onToggleFullscreen={() => navigate(-1)}
          onTimelineRefresh={() => {}}
        />
      </div>
    );
  }

  const filtered = workspaces.filter((workspace) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return workspace.name.toLowerCase().includes(q) || workspace.clients?.name.toLowerCase().includes(q) || workspace.clients?.company_name?.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-screen bg-background p-6 page-enter">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="label-sm">Canvas global</p>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">Escolha um workspace</h1>
          </div>
          <Button variant="outline" onClick={() => navigate("/ops/workspaces")}>
            <ArrowLeft className="h-4 w-4" /> Workspaces
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar workspace ou cliente..." className="pl-9" />
        </div>

        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title="Nenhum workspace disponível" description="Abra um workspace existente para acessar o canvas global." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((workspace) => {
              const client = workspace.clients;
              const params = new URLSearchParams({ workspaceId: workspace.id, clientId: workspace.client_id, clientName: client?.name ?? workspace.name });
              return (
                <button key={workspace.id} type="button" onClick={() => navigate(`/ops/canvas?${params.toString()}`)} className="surface-2 group flex items-center gap-3 rounded-lg p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40">
                  <ClientAvatar name={client?.name ?? workspace.name} seed={client?.id ?? workspace.id} logoUrl={client?.logo_url} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{client?.name ?? workspace.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{client?.company_name ?? workspace.name}</p>
                  </div>
                  <span className="text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">Abrir ↗</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}