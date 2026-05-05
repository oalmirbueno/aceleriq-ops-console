/**
 * CanvasMilestoneTabs
 *
 * Barra "fordista" no topo do canvas que substitui as pastinhas visuais de
 * project_group / milestone_group dentro do board. Mostra os projetos como
 * grupos e os milestones como abas selecionáveis. Clicar numa aba ativa o
 * modo esteira do milestone (selectedMilestoneId no CanvasStudio), exatamente
 * como antes acontecia ao clicar na pastinha do canvas.
 *
 * Bidirecional: como project_group / milestone_group são alimentados em
 * tempo real pelos triggers do Portal (receive-portal-sync) e pelo realtime
 * do canvas_nodes, a barra atualiza sozinha quando algo muda nos dois lados.
 */
import { memo, useMemo } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Folder, Layers, Target } from "lucide-react";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

type CanvasNodeRow = CanvasNodeRecord & { parent_node_id?: string | null };

interface Props {
  nodes: CanvasNodeRow[];
  selectedMilestoneId: string | null;
  onSelectMilestone: (id: string | null) => void;
}

function kindOf(n: CanvasNodeRow): string {
  return String((n.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
}

function portalOrder(n: CanvasNodeRow): number {
  const v = Number((n.data as Record<string, unknown> | null)?.portal_position ?? 9999);
  return Number.isFinite(v) ? v : 9999;
}

function CanvasMilestoneTabsComp({ nodes, selectedMilestoneId, onSelectMilestone, groupProgressById }: Props) {
  // groupProgressById removed from props; compute locally so the bar stays
  // self-contained. Real-time updates flow via the parent re-rendering with
  // updated `nodes` (canvas_nodes realtime + portal triggers).
  const progressById = useMemo(() => {
    const COMPLETED = new Set(["done", "completed", "concluido", "concluída", "concluida"]);
    const isTaskish = (n: CanvasNodeRow) => {
      const t = (n.node_type ?? "").toLowerCase();
      const k = kindOf(n);
      return !["client", "ai_orb", "chat_node"].includes(t) && !["project_group", "milestone_group", "chat_node"].includes(k);
    };
    const map = new Map<string, { total: number; done: number }>();
    const milestones = nodes.filter((n) => kindOf(n) === "milestone_group");
    for (const m of milestones) {
      const md = (m.data as Record<string, unknown> | null) ?? {};
      const mPid = md.portal_milestone_id as string | undefined;
      const mKey = md.milestone_key as string | undefined;
      const mProj = md.portal_project_id as string | undefined;
      const tasks = nodes.filter((n) => {
        if (!isTaskish(n)) return false;
        if (n.parent_node_id === m.id) return true;
        const d = (n.data as Record<string, unknown> | null) ?? {};
        if (mPid && d.portal_milestone_id === mPid) return true;
        if (mKey && d.milestone_key === mKey && d.portal_project_id === mProj) return true;
        return false;
      });
      const done = tasks.filter((t) => COMPLETED.has((t.status ?? "").toLowerCase())).length;
      map.set(m.id, { total: tasks.length, done });
    }
    return map;
  }, [nodes]);

  const grouped = useMemo(() => {
    const projects = nodes
      .filter((n) => kindOf(n) === "project_group")
      .slice()
      .sort((a, b) => portalOrder(a) - portalOrder(b) || String(a.title).localeCompare(String(b.title)));

    return projects.map((project) => {
      const pdata = (project.data as Record<string, unknown> | null) ?? {};
      const portalProjectId = typeof pdata.portal_project_id === "string" ? pdata.portal_project_id : null;
      const milestones = nodes
        .filter((n) => {
          if (kindOf(n) !== "milestone_group") return false;
          const d = (n.data as Record<string, unknown> | null) ?? {};
          if (n.parent_node_id === project.id) return true;
          if (portalProjectId && d.portal_project_id === portalProjectId) return true;
          return false;
        })
        .slice()
        .sort((a, b) => portalOrder(a) - portalOrder(b) || String(a.title).localeCompare(String(b.title)));
      return { project, milestones };
    }).filter((g) => g.milestones.length > 0 || true);
  }, [nodes]);

  if (grouped.length === 0) return null;

  return (
    <div className="flex items-stretch gap-3 px-2 py-1.5 border-b border-border bg-card/40 backdrop-blur-sm overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="flex items-stretch gap-3 min-w-0">
          <button
            onClick={() => onSelectMilestone(null)}
            className={`shrink-0 group flex items-center gap-1.5 h-8 px-3 rounded-md border text-[11px] font-medium transition-all ${
              selectedMilestoneId === null
                ? "bg-primary/15 border-primary/40 text-primary"
                : "border-border bg-background/40 text-muted-foreground hover:text-foreground hover:bg-muted/50"
            }`}
            title="Visão geral (todos os projetos)"
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Visão geral</span>
          </button>

          {grouped.map(({ project, milestones }) => (
            <div key={project.id} className="shrink-0 flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md border border-border/60 bg-background/30">
              <div className="flex items-center gap-1.5 pr-1.5 border-r border-border/60 mr-1">
                <Folder className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground max-w-[180px] truncate" title={project.title}>
                  {project.title}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {milestones.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/60 italic px-2">sem milestones</span>
                )}
                {milestones.map((m) => {
                  const active = m.id === selectedMilestoneId;
                  const progress = groupProgressById?.get(m.id);
                  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : null;
                  return (
                    <button
                      key={m.id}
                      onClick={() => onSelectMilestone(active ? null : m.id)}
                      className={`shrink-0 group flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-all ${
                        active
                          ? "bg-primary/15 border-primary/50 text-primary shadow-sm"
                          : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      }`}
                      title={pct !== null ? `${m.title} · ${progress?.done ?? 0}/${progress?.total ?? 0} (${pct}%)` : m.title}
                    >
                      <Target className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/70"}`} />
                      <span className="truncate max-w-[180px]">{m.title}</span>
                      {progress && progress.total > 0 && (
                        <span className={`text-[10px] tabular-nums ${active ? "text-primary/80" : "opacity-60"}`}>
                          {progress.done}/{progress.total}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
    </div>
  );
}

export default memo(CanvasMilestoneTabsComp);