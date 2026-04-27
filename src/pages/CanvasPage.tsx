import { useEffect, useState } from "react";
import { FolderKanban, Search, Layout, Trash2, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";
import { ACELERA_STAGES, type AceleraStageKey } from "@/components/workspace/canvasProjectTypes";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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

  const fetchWorkspaces = async () => {
    const { data } = await supabase
      .from("workspaces")
      .select("id, name, client_id, current_stage, clients(id, name, company_name, logo_url)")
      .order("updated_at", { ascending: false })
      .limit(60);
    setWorkspaces((data ?? []) as unknown as WorkspaceOption[]);
    setLoading(false);
  };

  useEffect(() => { fetchWorkspaces(); }, []);

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

  const deleteWorkspace = async (ws: WorkspaceOption) => {
    try {
      await supabase.from("canvas_edges").delete().eq("workspace_id", ws.id);
      await supabase.from("canvas_nodes").delete().eq("workspace_id", ws.id);
      await supabase.from("timeline_events").delete().eq("workspace_id", ws.id);
      const { error } = await supabase.from("workspaces").delete().eq("id", ws.id);
      if (error) throw error;
      toast({ title: "Workspace removido" });
      await fetchWorkspaces();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message, variant: "destructive" });
    }
  };

  // Agrupa por etapa
  const grouped = ACELERA_STAGES.map(stage => ({
    stage,
    items: filtered.filter(ws => ws.current_stage === stage.key),
  })).filter(g => g.items.length > 0);

  return (
    <div className="min-h-screen bg-background p-8 page-enter">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-card text-primary shadow-sm">
              <Layout className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">Canvas operacional</h1>
              <p className="text-sm text-muted-foreground mt-1">Selecione um workspace para abrir o Canvas — agrupado por etapa ACELERA</p>
            </div>
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar workspace ou cliente..."
              className="pl-9 h-10"
            />
          </div>
        </div>

        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FolderKanban} title="Nenhum workspace disponível" description="Crie ou abra um workspace para acessar o canvas." />
        ) : (
          <div className="space-y-8">
            {grouped.map(({ stage, items }) => (
              <section key={stage.key}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card font-mono text-sm font-bold text-foreground/70">
                    {stage.letter}
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">{stage.label}</h2>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground/70">{items.length} workspace{items.length > 1 ? "s" : ""}</p>
                  </div>
                  <div className="h-px flex-1 bg-border/50" />
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {items.map(ws => {
                    const client = ws.clients;
                    return (
                      <div
                        key={ws.id}
                        className="group relative rounded-xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg"
                      >
                        <button
                          type="button"
                          onClick={() => openCanvas(ws)}
                          className="block w-full text-left"
                        >
                          <div className="flex items-start gap-4">
                            <ClientAvatar name={client?.name ?? ws.name} seed={client?.id ?? ws.id} logoUrl={client?.logo_url} size="md" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-base font-semibold text-foreground">{client?.name ?? ws.name}</p>
                              {client?.company_name && <p className="truncate text-xs text-muted-foreground mt-0.5">{client.company_name}</p>}
                              <p className="mt-2 text-xs text-primary/90 font-medium">{getStagePremiumLabel(ws.current_stage)}</p>
                            </div>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground/70 truncate">{ws.name}</span>
                            <span className="inline-flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                              Abrir Canvas <ArrowRight className="h-3 w-3" />
                            </span>
                          </div>
                        </button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="absolute top-3 right-3 h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10"
                              title="Remover workspace"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover workspace?</AlertDialogTitle>
                              <AlertDialogDescription>"{ws.name}" e todos os nodes/edges/timeline associados serão removidos. Ação irreversível.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteWorkspace(ws)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
