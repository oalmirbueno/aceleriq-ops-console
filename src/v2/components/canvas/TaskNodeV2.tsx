import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2, Circle, Clock, AlertCircle, Archive, User, Calendar,
} from "lucide-react";
import type { PortalTask, PortalTaskStatus } from "@/v2/data/portalClient";

const STATUS_META: Record<PortalTaskStatus, { label: string; icon: typeof Circle; cls: string; ring: string; dot: string }> = {
  todo:        { label: "A fazer",   icon: Circle,       cls: "text-muted-foreground border-border bg-card",                          ring: "ring-border",            dot: "bg-muted-foreground/60" },
  in_progress: { label: "Em curso",  icon: Clock,        cls: "text-primary border-primary/40 bg-primary/5",                          ring: "ring-primary/40",        dot: "bg-primary" },
  blocked:     { label: "Bloqueada", icon: AlertCircle,  cls: "text-destructive border-destructive/40 bg-destructive/5",              ring: "ring-destructive/40",    dot: "bg-destructive" },
  done:        { label: "Concluída", icon: CheckCircle2, cls: "text-emerald-300 border-emerald-400/30 bg-emerald-400/[0.04]",         ring: "ring-emerald-400/40",    dot: "bg-emerald-400" },
  archived:    { label: "Arquivada", icon: Archive,      cls: "text-muted-foreground border-border bg-card opacity-60",               ring: "ring-border",            dot: "bg-muted-foreground/40" },
};

export interface TaskNodeData extends Record<string, unknown> {
  task: PortalTask;
  selected?: boolean;
}

function TaskNodeV2Comp({ data, selected }: NodeProps) {
  const { task } = data as TaskNodeData;
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  const pct = Math.round(task.progress * 100);

  return (
    <div
      className={`relative w-[260px] rounded-xl border ${meta.cls} backdrop-blur-sm shadow-[0_8px_24px_-12px_rgba(0,0,0,0.5)] transition-all ${
        selected ? `ring-2 ${meta.ring} border-primary` : ""
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-border !bg-background"
      />

      <div className="px-3 pt-3 pb-2 flex items-start gap-2">
        <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${meta.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{task.title}</p>
          <span className={`mt-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.cls}`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
        </div>
      </div>

      {task.description && (
        <p className="px-3 text-[11px] text-muted-foreground line-clamp-2">{task.description}</p>
      )}

      <div className="px-3 pt-2">
        <div className="h-1 w-full rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="px-3 pt-2 pb-3 flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
          <User className="h-3 w-3 shrink-0" />
          <span className="truncate">{task.assigneeName ?? "—"}</span>
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums">
          {task.dueAt ? (
            <>
              <Calendar className="h-3 w-3" />
              {new Date(task.dueAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </>
          ) : (
            <span>{pct}%</span>
          )}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-border !bg-background"
      />
    </div>
  );
}

export const TaskNodeV2 = memo(TaskNodeV2Comp);
