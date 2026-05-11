import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2, Circle, Clock, AlertCircle, Archive, User, Calendar,
  GripVertical, Eye, ExternalLink, Flag,
} from "lucide-react";
import type { PortalTask, PortalTaskStatus } from "@/v2/data/portalClient";

const STATUS_META: Record<PortalTaskStatus, {
  label: string; icon: typeof Circle; accent: string; textCls: string; bg: string;
}> = {
  todo:        { label: "A fazer",   icon: Circle,       accent: "hsl(220 9% 60%)",   textCls: "text-muted-foreground", bg: "bg-muted/20" },
  in_progress: { label: "Em curso",  icon: Clock,        accent: "hsl(145 100% 50%)", textCls: "text-primary", bg: "bg-primary/10" },
  blocked:     { label: "Bloqueada", icon: AlertCircle,  accent: "hsl(0 84% 60%)",    textCls: "text-destructive", bg: "bg-destructive/10" },
  done:        { label: "Concluída", icon: CheckCircle2, accent: "hsl(145 70% 45%)",  textCls: "text-emerald-300", bg: "bg-emerald-400/10" },
  archived:    { label: "Arquivada", icon: Archive,      accent: "hsl(220 9% 40%)",   textCls: "text-muted-foreground", bg: "bg-muted/10" },
};

const SIZE: Record<"sm" | "md" | "lg", {
  width: string; minH: string; pad: string; title: string; desc: string; showDesc: boolean;
}> = {
  sm: { width: "w-[300px]", minH: "min-h-[188px]", pad: "px-3", title: "text-[12px] line-clamp-2", desc: "line-clamp-1", showDesc: false },
  md: { width: "w-[344px]", minH: "min-h-[218px]", pad: "px-4", title: "text-[13px] line-clamp-2", desc: "line-clamp-2", showDesc: true },
  lg: { width: "w-[408px]", minH: "min-h-[258px]", pad: "px-5", title: "text-[14px] line-clamp-3", desc: "line-clamp-3", showDesc: true },
};

export interface TaskNodeData extends Record<string, unknown> {
  task: PortalTask;
  onOpenDetail?: (id: string) => void;
}

function clampPct(progress: number, status: PortalTaskStatus): number {
  if (status === "done") return 100;
  if (status === "todo") return Math.max(0, Math.min(12, Math.round(progress * 100)));
  return Math.max(0, Math.min(99, Math.round(progress * 100)));
}

function TaskNodeV2Comp({ data, selected }: NodeProps) {
  const { task, onOpenDetail } = data as TaskNodeData;
  const nodeSize = ((data as TaskNodeData & { __nodeSize?: string }).__nodeSize ?? "md") as "sm" | "md" | "lg";
  const sz = SIZE[nodeSize];
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  const pct = clampPct(task.progress, task.status);
  const missingOwner = task.status !== "done" && task.status !== "archived" && !task.assigneeName;
  const missingDue = task.status !== "done" && task.status !== "archived" && !task.dueAt;

  return (
    <div
      className={`group relative ${sz.width} ${sz.minH} rounded-2xl border bg-card/95 backdrop-blur-md transition-all duration-150 ${
        selected
          ? "border-primary/70 shadow-[0_24px_70px_-20px_hsl(145_100%_50%/0.55),0_0_0_2px_hsl(145_100%_50%/0.35)] scale-[1.01]"
          : "border-border/80 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.75)] hover:border-primary/35 hover:shadow-[0_18px_55px_-24px_hsl(145_100%_50%/0.35)]"
      }`}
      style={{ background: "linear-gradient(180deg, hsl(0 0% 8%/0.96) 0%, hsl(0 0% 5%/0.99) 100%)" }}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent" />
      <div className="absolute left-0 top-0 bottom-0 w-[4px] rounded-l-2xl" style={{ background: meta.accent }} aria-hidden />

      <Handle type="target" position={Position.Left} className="!h-3.5 !w-3.5 !-left-1.5 !border-2 !border-background !bg-foreground/40 hover:!bg-primary transition-colors" />
      <Handle type="source" position={Position.Right} className="!h-3.5 !w-3.5 !-right-1.5 !border-2 !border-background !bg-foreground/40 hover:!bg-primary transition-colors" />

      <div className={`${sz.pad} pt-3.5 pb-2.5 flex items-start gap-2.5`}>
        <div className="mt-0.5 grid place-items-center h-7 w-7 rounded-lg shrink-0 border" style={{ background: `${meta.accent}1f`, color: meta.accent, borderColor: `${meta.accent}33` }}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${meta.textCls}`} style={{ borderColor: `${meta.accent}40`, background: `${meta.accent}12` }}>
              {meta.label}
            </span>
            <span className="text-[9px] text-muted-foreground/70 tabular-nums font-mono">#{task.id.slice(0, 6)}</span>
            {(missingOwner || missingDue) && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
                <Flag className="h-2.5 w-2.5" /> revisar
              </span>
            )}
          </div>
          <p className={`${sz.title} font-semibold text-foreground leading-snug`}>{task.title}</p>
        </div>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-1 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {sz.showDesc && task.description && (
        <div className={`${sz.pad} pb-2`}>
          <p className={`text-[11px] text-muted-foreground/90 ${sz.desc} leading-relaxed`}>{task.description}</p>
        </div>
      )}

      <div className={`${sz.pad} pt-1`}>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Progresso coerente</span>
          <span className="text-[10px] font-mono tabular-nums text-foreground/90">{pct}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-foreground/5 overflow-hidden border border-foreground/5">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: meta.accent }} />
        </div>
      </div>

      <div className={`${sz.pad} pt-3 pb-3 flex items-center justify-between text-[10px] text-muted-foreground gap-2`}>
        <span className={`inline-flex items-center gap-1 truncate max-w-[58%] rounded-md border px-1.5 py-1 ${missingOwner ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-border/50 bg-background/30"}`}>
          <User className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{task.assigneeName ?? "Sem responsável"}</span>
        </span>
        <span className={`inline-flex items-center gap-1 tabular-nums shrink-0 rounded-md border px-1.5 py-1 ${missingDue ? "border-amber-400/30 bg-amber-400/10 text-amber-300" : "border-border/50 bg-background/30"}`}>
          <Calendar className="h-3 w-3 opacity-70" />
          {task.dueAt ? new Date(task.dueAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "sem prazo"}
        </span>
      </div>

      <div className="absolute -top-2 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onOpenDetail?.(task.id); }}
          className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:border-primary/50 hover:text-primary text-muted-foreground"
          title="Ver detalhes"
        >
          <Eye className="h-3 w-3" />
        </button>
        <a
          href={`https://portal.aceleriq.com.br/tasks/${task.id}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="h-6 w-6 grid place-items-center rounded-md border border-border bg-card hover:border-primary/50 hover:text-primary text-muted-foreground"
          title="Abrir no Portal"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

export const TaskNodeV2 = memo(TaskNodeV2Comp);
