/**
 * WorkspaceProjectsLauncher
 *
 * Lista os projetos do workspace (vindos do Portal como project_group em
 * canvas_nodes). Cada projeto é um cartão clicável que leva para
 * /ops/projects/:portalProjectId — ali o canvas auto-puxa as tasks e
 * mostra os milestones (pastas) pra escolher antes de abrir a esteira.
 *
 * Sem botão "Sync portal": o `usePortalAutoSync` global e o auto-pull
 * dentro do CanvasStudio cuidam disso automaticamente. Se a lista
 * estiver vazia, mostramos um estado neutro com fallback discreto.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FolderKanban, RefreshCw, Loader2, Network, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface ProjectGroup {
  portalProjectId: string;
  title: string;
  status: string | null;
  totalTasks: number;
  doneTasks: number;
  totalMilestones: number;
}

interface Props {
  workspaceId: string;
  clientName: string;
  portalClientId?: string | null;
  portalProjectId?: string | null;
}

export default function WorkspaceProjectsLauncher({ workspaceId, clientName, portalClientId, portalProjectId }: Props) {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const autoPulledRef = useRef(false);

  const load = useCallback(async () => {
    const { data: nodes } = await supabase
      .from("canvas_nodes")
      .select("id, title, status, data, parent_node_id")
      .eq("workspace_id", workspaceId);
    const all = (nodes ?? []) as Array<{
      id: string; title: string; status: string | null;
      data: Record<string, unknown> | null; parent_node_id: string | null;
    }>;
    const projectMap = new Map<string, ProjectGroup>();
    const milestonesByProject = new Map<string, Set<string>>();
    const tasksByProject = new Map<string, { total: number; done: number }>();

    for (const n of all) {
      const kind = String(n.data?.kind ?? "").toLowerCase();
      const ppid = typeof n.data?.portal_project_id === "string" ? (n.data.portal_project_id as string) : null;
      if (kind === "project_group" && ppid) {
        projectMap.set(ppid, {
          portalProjectId: ppid,
          title: n.title || "Projeto",
          status: n.status,
          totalTasks: 0,
          doneTasks: 0,
          totalMilestones: 0,
        });
      }
    }
    for (const n of all) {
      const kind = String(n.data?.kind ?? "").toLowerCase();
      const ppid = typeof n.data?.portal_project_id === "string" ? (n.data.portal_project_id as string) : null;
      if (kind === "milestone_group" && ppid) {
        const set = milestonesByProject.get(ppid) ?? new Set<string>();
        set.add(n.id);
        milestonesByProject.set(ppid, set);
      } else if (!["project_group", "milestone_group", "chat_node"].includes(kind) && ppid && projectMap.has(ppid)) {
        const t = tasksByProject.get(ppid) ?? { total: 0, done: 0 };
        t.total += 1;
        if ((n.status ?? "").toLowerCase() === "done") t.done += 1;
        tasksByProject.set(ppid, t);
      }
    }
    for (const [ppid, p] of projectMap) {
      p.totalMilestones = milestonesByProject.get(ppid)?.size ?? 0;
      const t = tasksByProject.get(ppid);
      if (t) { p.totalTasks = t.total; p.doneTasks = t.done; }
    }
    setProjects(Array.from(projectMap.values()).sort((a, b) => a.title.localeCompare(b.title)));
    setLoading(false);
  }, [workspaceId]);

  // Roda backfill e depois pull-portal-tasks no escopo do projeto já
  // vinculado ao workspace. Só cai para cliente quando o workspace ainda
  // não tem portal_project_id.
  const fullSync = useCallback(async () => {
    setSyncMessage("Sincronizando Portal…");
    const backfill = await supabase.functions.invoke("backfill-from-portal", { body: { source: "launcher", workspaceId, portalClientId, portalProjectId } });
    if (backfill.error) throw backfill.error;

    const pullBody: Record<string, string> = { workspaceId };
    if (portalProjectId) pullBody.portalProjectId = portalProjectId;
    const pull = await supabase.functions.invoke("pull-portal-tasks", { body: pullBody });
    if (pull.error) {
      const stats = (backfill.data as { stats?: { canvas_projects_synced?: number; canvas_milestones_synced?: number; canvas_tasks_synced?: number } } | null)?.stats;
      setSyncMessage(`Portal sincronizado: ${stats?.canvas_projects_synced ?? 0} projeto(s), ${stats?.canvas_milestones_synced ?? 0} milestone(s), ${stats?.canvas_tasks_synced ?? 0} tarefa(s).`);
      return;
    }

    const result = (pull.data ?? {}) as { skipped?: boolean; reason?: string; total?: number; projects?: number; milestones?: number };
    if (result.skipped) throw new Error(result.reason ?? "Portal não retornou projetos para este workspace");
    setSyncMessage(`Portal sincronizado: ${result.projects ?? 0} projeto(s), ${result.milestones ?? 0} milestone(s), ${result.total ?? 0} tarefa(s).`);
  }, [workspaceId, portalClientId, portalProjectId]);

  useEffect(() => {
    setLoading(true);
    setSyncMessage(null);
    load();
    // realtime: novos projetos/milestones do Portal aparecem na hora
    const ch = supabase
      .channel(`ws-projects:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "canvas_nodes", filter: `workspace_id=eq.${workspaceId}` }, () => {
        load();
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, load]);

  // Auto-pull silencioso: se ao terminar o load não tiver nenhum projeto,
  // dispara o fullSync uma vez. Isso cobre o caso "cliente já tem projeto
  // no Portal mas nunca rodou o pull pra esse workspace".
  useEffect(() => {
    if (loading) return;
    if (projects.length > 0) return;
    if (autoPulledRef.current) return;
    autoPulledRef.current = true;
    (async () => {
      setSyncing(true);
      try {
        await fullSync();
        await load();
      } catch (err) {
        setSyncMessage(err instanceof Error ? err.message : "Falha ao sincronizar Portal");
      } finally {
        setSyncing(false);
      }
    })();
  }, [loading, projects.length, fullSync, load]);

  const triggerSync = async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      await fullSync();
      await load();
    } catch (err) {
      setSyncMessage(err instanceof Error ? err.message : "Falha ao sincronizar Portal");
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-12 justify-center">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando projetos…
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
          <FolderKanban className="h-6 w-6 text-primary" />
        </div>
        <div>
          <p className="text-base font-semibold text-foreground mb-1">
            Aguardando projeto do Portal
          </p>
          <p className="text-xs text-muted-foreground max-w-md">
            O projeto de <span className="text-foreground">{clientName}</span> ainda não foi materializado no canvas.
            Ele aparecerá aqui automaticamente — não precisa apertar nada.
          </p>
        </div>
        {(syncing || syncMessage) && (
          <p className="text-[11px] text-muted-foreground max-w-md">{syncing ? "Buscando projetos, milestones e tarefas do Portal…" : syncMessage}</p>
        )}
        {!syncing && syncMessage?.toLowerCase().includes("falha") && (
          <Button size="sm" variant="outline" onClick={triggerSync} className="mt-2 h-8 text-xs gap-1.5">
            <RefreshCw className="h-3 w-3" /> Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Projetos do Portal</h3>
          <p className="text-[11px] text-muted-foreground">Cada projeto tem seu próprio canvas com milestones e tarefas em tempo real.</p>
        </div>
        <Button size="sm" variant="ghost" onClick={triggerSync} disabled={syncing} className="h-7 text-[11px] gap-1.5 text-muted-foreground" title="Atualizar dados do Portal">
          <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Atualizando…" : "Atualizar"}
        </Button>
      </div>
      {syncMessage && <p className="text-[11px] text-muted-foreground">{syncMessage}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const pct = p.totalTasks > 0 ? Math.round((p.doneTasks / p.totalTasks) * 100) : 0;
          return (
            <button
              key={p.portalProjectId}
              type="button"
              onClick={() => navigate(`/ops/projects/${p.portalProjectId}`)}
              className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card/40 backdrop-blur-sm hover:border-primary/50 hover:bg-card/70 transition-all p-4 text-left"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-8 w-8 shrink-0 rounded-md border border-primary/30 bg-primary/10 flex items-center justify-center">
                    <FolderKanban className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{p.title}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70">{p.status ?? "ativo"}</p>
                  </div>
                </div>
                <Network className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="h-3 w-3" />
                  {p.totalMilestones} {p.totalMilestones === 1 ? "milestone" : "milestones"}
                </span>
                <span className="tabular-nums">
                  {p.doneTasks}/{p.totalTasks} tasks
                </span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}