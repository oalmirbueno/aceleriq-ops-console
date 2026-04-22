import { CheckCircle2, Clock3, OctagonAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ACELERA_STAGES, getStageMeta, type AceleraStageKey } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import { isCanvasNodeBlocked, isCanvasNodeDone, readCanvasOperationalMeta } from "./canvasOperationalMeta";

function stageOf(node: CanvasNodeRecord): AceleraStageKey {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return ((data.stage ?? data.acelera_stage) as AceleraStageKey | undefined) ?? "producao";
}

export default function CanvasStageSummary({ nodes }: { nodes: CanvasNodeRecord[] }) {
  return (
    <div className="flex max-w-[calc(100vw-28rem)] items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card/85 p-1.5 shadow-lg shadow-background/30 backdrop-blur-xl">
      {ACELERA_STAGES.map((stage) => {
        const scoped = nodes.filter((node) => stageOf(node) === stage.key);
        const blocked = scoped.filter((node) => isCanvasNodeBlocked(node.status, readCanvasOperationalMeta(node.data as Record<string, unknown> | null))).length;
        const pending = scoped.filter((node) => readCanvasOperationalMeta(node.data as Record<string, unknown> | null).approvalStatus === "pending").length;
        const done = scoped.filter((node) => isCanvasNodeDone(node.status)).length;
        const meta = getStageMeta(stage.key);

        return (
          <div key={stage.key} className="min-w-[132px] rounded-md border border-border/70 bg-background/35 px-2 py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-foreground/70">{meta.short}</span>
              <Badge variant="outline" className="h-4 px-1.5 text-[9px]">{scoped.length}</Badge>
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