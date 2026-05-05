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

const COMPLETED_STATUSES = new Set(["done", "completed", "concluido", "concluída", "concluida"]);
const NON_TASK_TYPES = new Set(["client", "ai_orb", "chat_node"]);
const NON_TASK_KINDS = new Set(["project_group", "milestone_group", "chat_node"]);

interface MilestoneTabProps {
  id: string;
  title: string;
  active: boolean;
  done: number;
  total: number;
  onSelect: (id: string, active: boolean) => void;
}

const MilestoneTab = memo(function MilestoneTab({ id, title, active, done, total, onSelect }: MilestoneTabProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  return (
    <button
      onClick={() => onSelect(id, active)}
      className={`shrink-0 group flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-all ${
        active
          ? "bg-primary/15 border-primary/50 text-primary shadow-sm"
          : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
      title={pct !== null ? `${title} · ${done}/${total} (${pct}%)` : title}
    >
      <Target className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/70"}`} />
      <span className="truncate max-w-[180px]">{title}</span>
      {total > 0 && (
        <span className={`text-[10px] tabular-nums ${active ? "text-primary/80" : "opacity-60"}`}>
          {done}/{total}
        </span>
      )}
    </button>
  );
});

function CanvasMilestoneTabsComp({ nodes, selectedMilestoneId, onSelectMilestone }: Props) {
  // Build a narrow signature so we only recompute when fields that affect the
  // bar actually change. Unrelated updates (positions, drawer data, etc.) on
  // canvas_nodes won't invalidate this memo.
  const progressSignature = useMemo(() => {
    const parts: string[] = [];
    for (const n of nodes) {
      const k = kindOf(n);
      const t = (n.node_type ?? "").toLowerCase();
      const isMilestone = k === "milestone_group";
      const isTask = !NON_TASK_TYPES.has(t) && !NON_TASK_KINDS.has(k);
      if (!isMilestone && !isTask) continue;
      const d = (n.data as Record<string, unknown> | null) ?? {};
      parts.push(
        `${n.id}|${k}|${n.parent_node_id ?? ""}|${(n.status ?? "").toLowerCase()}|${
          (d.portal_milestone_id as string | undefined) ?? ""
        }|${(d.milestone_key as string | undefined) ?? ""}|${(d.portal_project_id as string | undefined) ?? ""}`,
      );
    }
    parts.sort();
    return parts.join("\n");
  }, [nodes]);

  const progressById = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    const milestones: CanvasNodeRow[] = [];
    // Index tasks by parent and by portal milestone keys in a single pass.
    const byParent = new Map<string, CanvasNodeRow[]>();
    const byPortalMs = new Map<string, CanvasNodeRow[]>();
    const byMsKey = new Map<string, CanvasNodeRow[]>();
    for (const n of nodes) {
      const k = kindOf(n);
      if (k === "milestone_group") {
        milestones.push(n);
        continue;
      }
      const t = (n.node_type ?? "").toLowerCase();
      if (NON_TASK_TYPES.has(t) || NON_TASK_KINDS.has(k)) continue;
      if (n.parent_node_id) {
        const arr = byParent.get(n.parent_node_id);
        if (arr) arr.push(n); else byParent.set(n.parent_node_id, [n]);
      }
      const d = (n.data as Record<string, unknown> | null) ?? {};
      const pid = d.portal_milestone_id as string | undefined;
      if (pid) {
        const arr = byPortalMs.get(pid);
        if (arr) arr.push(n); else byPortalMs.set(pid, [n]);
      }
      const mKey = d.milestone_key as string | undefined;
      const mProj = d.portal_project_id as string | undefined;
      if (mKey && mProj) {
        const key = `${mProj}::${mKey}`;
        const arr = byMsKey.get(key);
        if (arr) arr.push(n); else byMsKey.set(key, [n]);
      }
    }
    for (const m of milestones) {
      const md = (m.data as Record<string, unknown> | null) ?? {};
      const mPid = md.portal_milestone_id as string | undefined;
      const mKey = md.milestone_key as string | undefined;
      const mProj = md.portal_project_id as string | undefined;
      const seen = new Set<string>();
      const collect = (arr?: CanvasNodeRow[]) => {
        if (!arr) return;
        for (const n of arr) seen.add(n.id);
      };
      collect(byParent.get(m.id));
      if (mPid) collect(byPortalMs.get(mPid));
      if (mKey && mProj) collect(byMsKey.get(`${mProj}::${mKey}`));
      let done = 0;
      for (const id of seen) {
        // Re-resolve status via a tight loop avoiding extra map.
      }
      // Resolve done count by walking the union once.
      const idSet = seen;
      let total = idSet.size;
      if (total > 0) {
        for (const n of nodes) {
          if (!idSet.has(n.id)) continue;
          if (COMPLETED_STATUSES.has((n.status ?? "").toLowerCase())) done++;
        }
      }
      map.set(m.id, { total, done });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressSignature]);

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

  const handleSelect = useMemo(
    () => (id: string, active: boolean) => onSelectMilestone(active ? null : id),
    [onSelectMilestone],
  );

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

          {grouped.length === 0 && (
            <div className="shrink-0 flex items-center gap-2 px-3 text-[11px] text-muted-foreground/70 italic">
              <Folder className="h-3 w-3" />
              <span>Nenhum projeto/milestone ainda — crie um projeto no Portal ou adicione um milestone aqui para começar.</span>
            </div>
          )}

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
                  const progress = progressById.get(m.id);
                  return (
                    <MilestoneTab
                      key={m.id}
                      id={m.id}
                      title={m.title}
                      active={active}
                      done={progress?.done ?? 0}
                      total={progress?.total ?? 0}
                      onSelect={handleSelect}
                    />
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