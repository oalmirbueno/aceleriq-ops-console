import { memo, useMemo } from "react";
import { ChevronRight, Folder, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import { mapLegacyStatus } from "./canvasEsteiraStatus";

type Row = CanvasNodeRecord & { parent_node_id?: string | null };

interface Props {
  nodes: Row[];
  selectedMilestoneId: string | null;
  onSelect: (id: string) => void;
  onClear: () => void;
}

const kindOf = (n: Row) => String((n.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
const dataOf = (n: Row) => (n.data as Record<string, unknown> | null) ?? {};
const portalOrder = (n: Row) => {
  const v = Number(dataOf(n).portal_position ?? 9999);
  return Number.isFinite(v) ? v : 9999;
};

function MilestoneFordismoBarBase({ nodes, selectedMilestoneId, onSelect, onClear }: Props) {
  const groups = useMemo(() => {
    const projects = nodes
      .filter((n) => kindOf(n) === "project_group")
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
    const milestones = nodes
      .filter((n) => kindOf(n) === "milestone_group")
      .sort((a, b) => portalOrder(a) - portalOrder(b) || String(a.title).localeCompare(String(b.title)));

    const isTask = (n: Row) => {
      const t = (n.node_type ?? "").toLowerCase();
      const k = kindOf(n);
      return !["client", "ai_orb", "chat_node"].includes(t) && !["project_group", "milestone_group", "chat_node"].includes(k);
    };
    const tasks = nodes.filter(isTask);

    const tasksOfMilestone = (m: Row) => {
      const md = dataOf(m);
      return tasks.filter((task) => {
        const td = dataOf(task);
        if (task.parent_node_id === m.id) return true;
        if (md.portal_milestone_id && td.portal_milestone_id === md.portal_milestone_id) return true;
        if (md.milestone_key && td.milestone_key === md.milestone_key && td.portal_project_id === md.portal_project_id) return true;
        return false;
      });
    };

    return projects.map((p) => {
      const pd = dataOf(p);
      const ms = milestones.filter((m) => dataOf(m).portal_project_id === pd.portal_project_id);
      return {
        project: p,
        milestones: ms.map((m) => {
          const t = tasksOfMilestone(m);
          const done = t.filter((tk) => mapLegacyStatus(tk.status ?? "") === "concluido").length;
          return { milestone: m, total: t.length, done };
        }),
      };
    });
  }, [nodes]);

  const selectedMilestone = selectedMilestoneId ? nodes.find((n) => n.id === selectedMilestoneId) : null;
  const selectedProject = selectedMilestone
    ? groups.find((g) => g.milestones.some((m) => m.milestone.id === selectedMilestoneId))?.project
    : null;

  if (groups.length === 0) return null;

  return (
    <div className="absolute left-0 right-0 top-0 z-20 border-b border-border/60 bg-background/95 backdrop-blur-sm">
      {selectedMilestone ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClear}>
            <X className="h-3 w-3 mr-1" />
            Voltar para pastas
          </Button>
          <span className="text-muted-foreground text-xs flex items-center gap-1 truncate">
            <Folder className="h-3 w-3" />
            <span className="truncate">{selectedProject?.title ?? "Projeto"}</span>
            <ChevronRight className="h-3 w-3" />
            <FolderOpen className="h-3 w-3 text-primary" />
            <span className="text-foreground font-medium truncate">{selectedMilestone.title}</span>
          </span>
          <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="hidden md:inline">Esteira fordismo · etapas:</span>
            {["Ideia", "Em produção", "Revisão", "Bloqueado", "Concluído"].map((s) => (
              <span key={s} className="rounded-full border border-border px-1.5 py-0.5">{s}</span>
            ))}
          </div>
        </div>
      ) : (
        <ScrollArea className="w-full">
          <div className="flex items-stretch gap-3 px-3 py-2">
            {groups.map(({ project, milestones }) => (
              <div key={project.id} className="flex items-stretch gap-2 shrink-0">
                <div className="flex flex-col justify-center pr-2 border-r border-border/40">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Projeto</span>
                  <span className="text-xs font-semibold text-foreground truncate max-w-[180px]">{project.title}</span>
                </div>
                {milestones.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground self-center">sem milestones</span>
                ) : (
                  milestones.map(({ milestone, total, done }) => {
                    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                    return (
                      <button
                        key={milestone.id}
                        type="button"
                        onClick={() => onSelect(milestone.id)}
                        className="group flex flex-col items-start gap-1 rounded-md border border-border/70 hover:border-primary/60 hover:bg-primary/5 transition px-2.5 py-1.5 min-w-[160px]"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-medium text-foreground truncate w-full">
                          <Folder className="h-3 w-3 text-muted-foreground group-hover:text-primary shrink-0" />
                          <span className="truncate">{milestone.title}</span>
                        </span>
                        <span className="flex items-center gap-2 w-full">
                          <span className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                            <span className="block h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="text-[10px] text-muted-foreground tabular-nums">{done}/{total}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            ))}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}
    </div>
  );
}

export default memo(MilestoneFordismoBarBase);
