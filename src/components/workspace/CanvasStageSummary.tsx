import { memo, useMemo } from "react";
import { CheckCircle2, Clock3, OctagonAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ACELERA_STAGES, getStageMeta, type AceleraStageKey } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import { isCanvasNodeBlocked, isCanvasNodeDone, readCanvasOperationalMeta } from "./canvasOperationalMeta";

function stageOf(node: CanvasNodeRecord): AceleraStageKey {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return ((data.stage ?? data.acelera_stage) as AceleraStageKey | undefined) ?? "producao";
}

function CanvasStageSummary({ nodes }: { nodes: CanvasNodeRecord[] }) {
  const stageStats = useMemo(() => ACELERA_STAGES.map((stage) => {
    const scoped = nodes.filter((node) => stageOf(node) === stage.key);
    return {
      stage,
      meta: getStageMeta(stage.key),
      total: scoped.length,
      blocked: scoped.filter((node) => isCanvasNodeBlocked(node.status, readCanvasOperationalMeta(node.data as Record<string, unknown> | null))).length,
      pending: scoped.filter((node) => readCanvasOperationalMeta(node.data as Record<string, unknown> | null).approvalStatus === "pending").length,
      done: scoped.filter((node) => isCanvasNodeDone(node.status)).length,
    };
  }), [nodes]);

  return (
    <div className="flex max-w-[calc(100vw-30rem)] items-center gap-1 overflow-x-auto rounded-lg border border-border/70 bg-card/72 p-1 shadow-lg shadow-background/25 backdrop-blur-xl">
      {stageStats.map(({ stage, meta, total, blocked, pending, done }) => {
        return (
          <div key={stage.key} className="min-w-[118px] rounded-md border border-border/45 bg-background/25 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-foreground/70">{meta.short}</span>
              <Badge variant="outline" className="h-4 border-border/60 px-1.5 text-[9px]">{total}</Badge>
            </div>
            <div className="mt-1.5 flex items-center gap-2 text-[9px] text-muted-foreground">
              <span className="inline-flex items-center gap-0.5"><OctagonAlert className="h-2.5 w-2.5 text-destructive" />{blocked}</span>
              <span className="inline-flex items-center gap-0.5"><Clock3 className="h-2.5 w-2.5" />{pending}</span>
              <span className="inline-flex items-center gap-0.5"><CheckCircle2 className="h-2.5 w-2.5 text-primary" />{done}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(CanvasStageSummary);