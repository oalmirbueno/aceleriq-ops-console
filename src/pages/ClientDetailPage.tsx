import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, ExternalLink, FolderPlus, Trash2, Users, Target,
  Sparkles, AlertTriangle, Layers, TrendingUp, FileText, Archive, ArchiveRestore,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import ProjectTypeBadge from "@/components/workspace/ProjectTypeBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";

interface ClientRow {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
  segment: string | null;
  plan_name: string | null;
  project_type: string | null;
  custom_monthly_value: number | null;
  logo_url: string | null;
  metadata: Record<string, unknown> | null;
}

interface WorkspaceRow {
  id: string;
  name: string;
  status: string;
  current_stage: string;
  updated_at: string;
}

const statusBadge: Record<string, string> = {
  setup: "bg-muted/15 text-muted-foreground border-border",
  active: "bg-primary/15 text-primary border-primary/30",
  paused: "bg-muted/15 text-muted-foreground border-border",
  archived: "bg-muted/15 text-muted-foreground/60 border-border",
};

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    if (!id) return;
    setLoading(true);
    const [c, ws] = await Promise.all([
      supabase.from("clients").select("id, name, company_name, status, segment, plan_name, project_type, custom_monthly_value, logo_url, metadata").eq("id", id).maybeSingle(),
      supabase.from("workspaces").select("id, name, status, current_stage, updated_at").eq("client_id", id).order("updated_at", { ascending: false }),
    ]);
    setClient((c.data as ClientRow) ?? null);
    setWorkspaces((ws.data as WorkspaceRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, [id]);

  const briefing = useMemo(() => {
    const eb = (client?.metadata?.essential_briefing as Record<string, string> | undefined) ?? {};
    return {
      positioning: eb.positioning ?? "",
      icp: eb.icp ?? "",
      goals: eb.goals_12m ?? "",
    };
  }, [client]);

  const createWorkspace = async () => {
    if (!client) return;
    try {
      const { data, error } = await supabase
        .from("workspaces")
        .insert({ client_id: client.id, name: `${client.name} — Workspace`, status: "setup", current_stage: "entrada" })
        .select("id").single();
      if (error) throw error;
      if (data) {
        toast({ title: "Workspace criado" });
        navigate(`/ops/workspaces/${data.id}`);
      }
    } catch (err: any) {
      toast({ title: "Erro ao criar", description: err?.message, variant: "destructive" });
    }
  };

  const deleteWorkspace = async (wsId: string) => {
    try {
      // cascade defensivo: deleta dependências sem FK on delete cascade
      await supabase.from("canvas_edges").delete().eq("workspace_id", wsId);
      await supabase.from("canvas_nodes").delete().eq("workspace_id", wsId);
      await supabase.from("timeline_events").delete().eq("workspace_id", wsId);
      const { error } = await supabase.from("workspaces").delete().eq("id", wsId);
      if (error) throw error;
      toast({ title: "Workspace removido" });
      await fetchAll();
    } catch (err: any) {
      toast({ title: "Erro ao remover", description: err?.message, variant: "destructive" });
    }
  };

  const deleteClient = async () => {
    if (!client) return;
    try {
      for (const ws of workspaces) {
        await supabase.from("canvas_edges").delete().eq("workspace_id", ws.id);
        await supabase.from("canvas_nodes").delete().eq("workspace_id", ws.id);
        await supabase.from("timeline_events").delete().eq("workspace_id", ws.id);
        await supabase.from("workspaces").delete().eq("id", ws.id);
      }
      const { error } = await supabase.from("clients").delete().eq("id", client.id);
      if (error) throw error;
      toast({ title: "Cliente removido" });
      navigate("/ops/clients");
    } catch (err: any) {
      toast({ title: "Erro ao remover cliente", description: err?.message, variant: "destructive" });
    }
  };

  const toggleArchiveClient = async () => {
    if (!client) return;
    const next = client.status === "archived" ? "active" : "archived";
    try {
      const { error } = await supabase.from("clients").update({ status: next }).eq("id", client.id);
      if (error) throw error;
      toast({ title: next === "archived" ? "Cliente arquivado" : "Cliente reativado" });
      setClient({ ...client, status: next });
    } catch (err: any) {
      toast({ title: "Erro ao atualizar status", description: err?.message, variant: "destructive" });
    }
  };

  const toggleArchiveWorkspace = async (ws: WorkspaceRow) => {
    const next = ws.status === "archived" ? "active" : "archived";
    try {
      const { error } = await supabase.from("workspaces").update({ status: next }).eq("id", ws.id);
      if (error) throw error;
      toast({ title: next === "archived" ? "Projeto arquivado" : "Projeto reativado" });
      setWorkspaces(prev => prev.map(w => w.id === ws.id ? { ...w, status: next } : w));
    } catch (err: any) {
      toast({ title: "Erro ao atualizar status", description: err?.message, variant: "destructive" });
    }
  };

  if (loading) return (<><AppHeader title="Cliente" subtitle="Carregando…" /><LoadingState /></>);
  if (!client) return (<><AppHeader title="Cliente" subtitle="Não encontrado" /><EmptyState icon={Users} title="Cliente não encontrado" description="Volte para a lista de clientes." /></>);

  return (
    <>
      <AppHeader title={client.name} subtitle={client.company_name ?? "Detalhe do cliente"} />
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        {/* Back */}
        <button onClick={() => navigate("/ops/clients")} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar para clientes
        </button>

        {/* Hero */}
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-start gap-5">
            <ClientAvatar name={client.name} seed={client.id} logoUrl={client.logo_url} size="lg" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold text-foreground tracking-tight">{client.name}</h1>
                <ProjectTypeBadge type={client.project_type} variant="compact" />
                <Badge variant="outline" className="text-xs capitalize">{client.status}</Badge>
              </div>
              {client.company_name && <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" /> {client.company_name}</p>}
              <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                {client.plan_name && <span className="capitalize">Plano: <span className="text-foreground font-medium">{client.plan_name}</span></span>}
                {client.segment && <span>Segmento: <span className="text-foreground">{client.segment}</span></span>}
                {client.custom_monthly_value && <span>MRR: <span className="text-primary font-medium tabular-nums">R$ {client.custom_monthly_value.toLocaleString("pt-BR")}</span></span>}
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <StatCard icon={Layers} label="Projetos" value={String(workspaces.length)} />
          <StatCard icon={TrendingUp} label="Ativos" value={String(workspaces.filter(w => w.status === "active").length)} />
          <StatCard icon={Sparkles} label="Plano" value={client.plan_name ?? "—"} className="capitalize" />
        </div>

        {/* Briefing */}
        {(briefing.positioning || briefing.icp || briefing.goals) && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Briefing essencial</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {briefing.positioning && <BriefingField label="Posicionamento" value={briefing.positioning} />}
              {briefing.icp && <BriefingField label="ICP" value={briefing.icp} />}
              {briefing.goals && <BriefingField label="Objetivo 12 meses" value={briefing.goals} />}
            </div>
          </div>
        )}

        {/* Workspaces */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Projetos / Workspaces</h2>
            <Button onClick={createWorkspace} size="sm" className="h-9 gap-1.5"><FolderPlus className="h-3.5 w-3.5" /> Novo projeto</Button>
          </div>
          {workspaces.length === 0 ? (
            <EmptyState icon={Layers} title="Nenhum projeto criado" description="Clique em 'Novo projeto' para começar." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {workspaces.map(ws => (
                <div key={ws.id} className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md">
                  <button onClick={() => navigate(`/ops/workspaces/${ws.id}`)} className="block w-full text-left">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-foreground">{ws.name}</p>
                        <p className="mt-0.5 text-xs text-primary">{getStagePremiumLabel(ws.current_stage)}</p>
                      </div>
                      <Badge variant="outline" className={`text-[10px] ${statusBadge[ws.status] ?? ""}`}>{ws.status}</Badge>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground/70">Atualizado em {new Date(ws.updated_at).toLocaleDateString("pt-BR")}</p>
                  </button>
                  <div className="absolute top-3 right-3 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => navigate(`/ops/workspaces/${ws.id}`)} title="Abrir">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => toggleArchiveWorkspace(ws)}
                      title={ws.status === "archived" ? "Reativar projeto" : "Arquivar projeto"}
                    >
                      {ws.status === "archived"
                        ? <ArchiveRestore className="h-3.5 w-3.5 text-primary" />
                        : <Archive className="h-3.5 w-3.5 text-muted-foreground" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" title="Remover">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover este projeto?</AlertDialogTitle>
                          <AlertDialogDescription>O workspace "{ws.name}", seus nodes, edges e timeline serão removidos. Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteWorkspace(ws.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Remover</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-destructive">Zona de perigo</h3>
              <p className="text-xs text-muted-foreground mt-1">Arquivar oculta o cliente da operação preservando todos os dados. Excluir apaga tudo de forma irreversível.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5"
              onClick={toggleArchiveClient}
            >
              {client.status === "archived"
                ? <><ArchiveRestore className="h-3.5 w-3.5" /> Reativar cliente</>
                : <><Archive className="h-3.5 w-3.5" /> Arquivar cliente</>}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="h-9 gap-1.5"><Trash2 className="h-3.5 w-3.5" /> Excluir cliente</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir {client.name}?</AlertDialogTitle>
                  <AlertDialogDescription>Todos os {workspaces.length} workspace(s), nodes, edges e timeline serão removidos. Esta ação não pode ser desfeita.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteClient} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir tudo</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, className = "" }: { icon: any; label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-3">
      <div className="h-9 w-9 rounded-md border border-border bg-background flex items-center justify-center text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold text-foreground tabular-nums ${className}`}>{value}</p>
      </div>
    </div>
  );
}

function BriefingField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm text-foreground/90 leading-relaxed line-clamp-4">{value}</p>
    </div>
  );
}