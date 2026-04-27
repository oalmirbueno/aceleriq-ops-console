/**
 * ClientDetailPage — página dedicada de um cliente, funciona como "pasta".
 *
 * Mostra:
 *  - Info do cliente (plano, tipo, scores, briefing)
 *  - Lista de todos os workspaces/projetos do cliente
 *  - Ações: abrir, criar novo, renomear, deletar workspace
 *  - Ação: deletar cliente (com confirmação forte)
 */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, FolderOpen, Plus, Trash2, ExternalLink,
  Calendar, Activity, Settings, AlertTriangle, Loader2,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import ProjectTypeBadge from "@/components/workspace/ProjectTypeBadge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface ClientData {
  id: string;
  name: string;
  company_name: string | null;
  plan_name: string | null;
  project_type: string | null;
  status: string;
  segment: string | null;
  portal_client_id: string | null;
  custom_monthly_value: number | null;
  metadata: Record<string, unknown> | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  status: string;
  current_stage: string | null;
  project_type: string | null;
  created_at: string;
  updated_at: string;
}

const STAGE_LABELS: Record<string, string> = {
  entrada: "Abertura", diagnostico: "Diagnóstico",
  estrutura_base: "Arquitetura", planejamento: "Planejamento",
  producao: "Produção", ativacao: "Ativação",
  otimizacao: "Otimização", expansao: "Expansão",
};

const STATUS_COLORS: Record<string, string> = {
  setup: "text-muted-foreground border-border",
  active: "text-emerald-400 border-emerald-400/40 bg-emerald-400/5",
  paused: "text-amber-400 border-amber-400/40 bg-amber-400/5",
  completed: "text-blue-400 border-blue-400/40 bg-blue-400/5",
  archived: "text-muted-foreground/50 border-border",
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [client, setClient] = useState<ClientData | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [deleteClientOpen, setDeleteClientOpen] = useState(false);
  const [deleteWsId, setDeleteWsId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: c }, { data: ws }] = await Promise.all([
      supabase.from("clients").select("*").eq("id", id).maybeSingle(),
      supabase.from("workspaces").select("id, name, status, current_stage, project_type, created_at, updated_at")
        .eq("client_id", id).order("created_at", { ascending: false }),
    ]);
    setClient(c as ClientData | null);
    setWorkspaces((ws ?? []) as WorkspaceRow[]);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [id]);

  // ─── Criar workspace ───────────────────────────────────────
  const handleCreateWorkspace = async () => {
    if (!id || !client) return;
    setCreating(true);
    try {
      const { data: ws, error } = await supabase.from("workspaces").insert({
        client_id: id,
        name: `${client.name} — Projeto ${workspaces.length + 1}`,
        status: "setup",
        current_stage: "entrada",
      }).select("id").single();
      if (error) throw error;
      await supabase.from("timeline_events").insert({
        workspace_id: ws.id, client_id: id,
        event_type: "workspace_created",
        title: "Workspace criado",
        happened_at: new Date().toISOString(),
      });
      toast({ title: "Workspace criado" });
      await fetchData();
      navigate(`/ops/workspaces/${ws.id}`);
    } catch (err) {
      toast({ title: "Erro ao criar workspace", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  // ─── Deletar workspace ─────────────────────────────────────
  const handleDeleteWorkspace = async () => {
    if (!deleteWsId) return;
    setDeleting(true);
    try {
      await supabase.from("canvas_edges").delete().eq("workspace_id", deleteWsId);
      await supabase.from("canvas_nodes").delete().eq("workspace_id", deleteWsId);
      await supabase.from("timeline_events").delete().eq("workspace_id", deleteWsId);
      await supabase.from("workspace_chat_messages").delete().eq("workspace_id", deleteWsId);
      const { error } = await supabase.from("workspaces").delete().eq("id", deleteWsId);
      if (error) throw error;
      toast({ title: "Workspace removido" });
      setWorkspaces(prev => prev.filter(w => w.id !== deleteWsId));
    } catch {
      toast({ title: "Erro ao remover workspace", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteWsId(null);
    }
  };

  // ─── Deletar cliente ───────────────────────────────────────
  const handleDeleteClient = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      // Deleta todos os dados dependentes
      for (const ws of workspaces) {
        await supabase.from("canvas_edges").delete().eq("workspace_id", ws.id);
        await supabase.from("canvas_nodes").delete().eq("workspace_id", ws.id);
        await supabase.from("timeline_events").delete().eq("workspace_id", ws.id);
        await supabase.from("workspace_chat_messages").delete().eq("workspace_id", ws.id);
      }
      await supabase.from("workspaces").delete().eq("client_id", id);
      await supabase.from("context_entries").delete().eq("client_id", id);
      await supabase.from("pending_leads").delete().eq("client_id", id);
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Cliente removido com sucesso" });
      navigate("/ops/clients");
    } catch {
      toast({ title: "Erro ao remover cliente", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteClientOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">Cliente não encontrado</p>
        <Button variant="ghost" onClick={() => navigate("/ops/clients")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
        </Button>
      </div>
    );
  }

  const eb = (client.metadata?.essential_briefing ?? {}) as Record<string, string>;

  return (
    <>
      <AppHeader
        title={client.name}
        subtitle={client.company_name ?? client.segment ?? "Cliente"}
        breadcrumb={[{ label: "Clientes", href: "/ops/clients" }, { label: client.name }]}
      />

      <div className="p-5 space-y-5 max-w-5xl">
        {/* ─── Info do cliente ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-2">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-base">{client.name}</CardTitle>
                  {client.company_name && (
                    <p className="text-sm text-muted-foreground">{client.company_name}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {client.project_type && (
                    <ProjectTypeBadge type={client.project_type as any} />
                  )}
                  {client.plan_name && (
                    <Badge variant="outline" className="text-xs">{client.plan_name}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {eb.positioning && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Posicionamento</p>
                  <p className="text-sm">{eb.positioning}</p>
                </div>
              )}
              {eb.icp && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">ICP</p>
                  <p className="text-sm">{eb.icp}</p>
                </div>
              )}
              {eb.goals_12m && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Objetivo 12 meses</p>
                  <p className="text-sm">{eb.goals_12m}</p>
                </div>
              )}
              {!eb.positioning && !eb.icp && (
                <p className="text-sm text-muted-foreground italic">Briefing não preenchido</p>
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="space-y-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Projetos</p>
                <p className="text-3xl font-bold">{workspaces.length}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Status</p>
                <Badge variant="outline" className={cn("mt-1 text-xs", STATUS_COLORS[client.status] ?? "")}>
                  {client.status}
                </Badge>
              </CardContent>
            </Card>
            {client.custom_monthly_value && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">MRR</p>
                  <p className="text-lg font-bold text-primary">
                    R$ {client.custom_monthly_value.toLocaleString("pt-BR")}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* ─── Workspaces/Projetos ─── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">
              Projetos / Workspaces
              <span className="ml-2 text-muted-foreground font-normal">({workspaces.length})</span>
            </h2>
            <Button
              size="sm"
              onClick={handleCreateWorkspace}
              disabled={creating}
              className="h-8 gap-1.5"
            >
              {creating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <Plus className="h-3.5 w-3.5" />
              }
              Novo projeto
            </Button>
          </div>

          {workspaces.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum projeto ainda</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={handleCreateWorkspace}
                  disabled={creating}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Criar primeiro projeto
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {workspaces.map((ws) => (
                <Card
                  key={ws.id}
                  className="cursor-pointer hover:border-primary/40 transition-colors group"
                  onClick={() => navigate(`/ops/workspaces/${ws.id}`)}
                >
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 shrink-0">
                      <FolderOpen className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{ws.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {ws.current_stage && (
                          <span className="text-[10px] text-muted-foreground">
                            {STAGE_LABELS[ws.current_stage] ?? ws.current_stage}
                          </span>
                        )}
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] h-4 px-1.5", STATUS_COLORS[ws.status] ?? "")}
                        >
                          {ws.status}
                        </Badge>
                        {ws.project_type && (
                          <span className="text-[9px] text-muted-foreground">{ws.project_type}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        title="Abrir workspace"
                        onClick={(e) => { e.stopPropagation(); navigate(`/ops/workspaces/${ws.id}`); }}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 hover:text-red-400 hover:bg-red-400/10"
                        title="Remover projeto"
                        onClick={(e) => { e.stopPropagation(); setDeleteWsId(ws.id); }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground shrink-0">
                      {new Date(ws.updated_at).toLocaleDateString("pt-BR")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* ─── Zona de perigo ─── */}
        <div className="rounded-lg border border-red-400/20 bg-red-400/5 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" /> Zona de perigo
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Deletar o cliente remove permanentemente todos os seus projetos, canvas, dados e histórico.
              </p>
            </div>
            <Button
              size="sm"
              variant="destructive"
              className="shrink-0 ml-4 h-8"
              onClick={() => setDeleteClientOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Deletar cliente
            </Button>
          </div>
        </div>
      </div>

      {/* ─── Dialogs de confirmação ─── */}
      <AlertDialog open={!!deleteWsId} onOpenChange={(o) => !o && setDeleteWsId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover projeto?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o workspace e todos os nodes, edges, eventos e mensagens de chat vinculados. Não pode desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteWorkspace}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteClientOpen} onOpenChange={setDeleteClientOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-400">
              Deletar {client.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Isso deleta permanentemente o cliente, seus {workspaces.length} projeto(s), todos os nodes, edges, eventos de timeline, mensagens de chat e dados do dossiê.
              <br /><br />
              <strong>Esta ação é irreversível.</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteClient}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Deletar permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
