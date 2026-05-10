import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  CheckCircle2, Circle, Clock, AlertCircle, Archive, User, Calendar,
  GripVertical, Eye, ExternalLink,
} from "lucide-react";
import type { PortalTask, PortalTaskStatus } from "@/v2/data/portalClient";

const STATUS_META: Record<PortalTaskStatus, {
  label: string; icon: typeof Circle; accent: string; textCls: string;
}> = {
  todo:        { label: "A fazer",   icon: Circle,       accent: "hsl(220 9% 60%)",   textCls: "text-muted-foreground" },
  in_progress: { label: "Em curso",  icon: Clock,        accent: "hsl(145 100% 50%)", textCls: "text-primary" },
  blocked:     { label: "Bloqueada", icon: AlertCircle,  accent: "hsl(0 84% 60%)",    textCls: "text-destructive" },
  done:        { label: "Concluída", icon: CheckCircle2, accent: "hsl(145 70% 45%)",  textCls: "text-emerald-300" },
  archived:    { label: "Arquivada", icon: Archive,      accent: "hsl(220 9% 40%)",   textCls: "text-muted-foreground" },
};

export interface TaskNodeData extends Record<string, unknown> {
  task: PortalTask;
  onOpenDetail?: (id: string) => void;
}

function TaskNodeV2Comp({ data, selected }: NodeProps) {
  const { task, onOpenDetail } = data as TaskNodeData;
  const nodeSize = ((data as TaskNodeData & { __nodeSize?: string }).__nodeSize ?? "md") as "sm" | "md" | "lg";
  const widthCls = nodeSize === "sm" ? "w-[280px]" : nodeSize === "lg" ? "w-[380px]" : "w-[320px]";
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  const pct = Math.round(task.progress * 100);

  return (
    <div
      className={`group relative ${widthCls} rounded-2xl border bg-card/95 backdrop-blur-md transition-all ${
        selected
          ? "border-primary/60 shadow-[0_20px_60px_-20px_hsl(145_100%_50%/0.45),0_0_0_1px_hsl(145_100%_50%/0.5)]"
          : "border-border/80 shadow-[0_12px_40px_-16px_rgba(0,0,0,0.7)] hover:border-foreground/30"
      }`}
      style={{
        background: `linear-gradient(180deg, hsl(0 0% 8%/0.95) 0%, hsl(0 0% 6%/0.98) 100%)`,
      }}
    >
      {/* Accent stripe */}
      <div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-2xl"
        style={{ background: meta.accent }}
        aria-hidden
      />

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !-left-1.5 !border-2 !border-background !bg-foreground/40 hover:!bg-primary transition-colors"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !-right-1.5 !border-2 !border-background !bg-foreground/40 hover:!bg-primary transition-colors"
      />

      {/* Header */}
      <div className="px-4 pt-3.5 pb-2.5 flex items-start gap-2.5">
        <div
          className="mt-0.5 grid place-items-center h-6 w-6 rounded-md shrink-0"
          style={{ background: `${meta.accent}1f`, color: meta.accent }}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${meta.textCls}`}
              style={{ borderColor: `${meta.accent}40`, background: `${meta.accent}12` }}
            >
              {meta.label}
            </span>
            <span className="text-[9px] text-muted-foreground/70 tabular-nums font-mono">#{task.id.slice(0, 6)}</span>
          </div>
          <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-2">{task.title}</p>
        </div>
        <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30 mt-1 shrink-0 cursor-grab opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>

      {/* Description */}
      {task.description && (
        <div className="px-4 pb-2">
          <p className="text-[11px] text-muted-foreground/90 line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        </div>
      )}

      {/* Progress */}
      <div className="px-4 pt-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">Progresso</span>
          <span className="text-[10px] font-mono tabular-nums text-foreground/90">{pct}%</span>
        </div>
        <div className="h-1 w-full rounded-full bg-foreground/5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, background: meta.accent }}
          />
        </div>
      </div>

      {/* Meta row */}
      <div className="px-4 pt-2.5 pb-3 flex items-center justify-between text-[10px] text-muted-foreground gap-2">
        <span className="inline-flex items-center gap-1 truncate max-w-[160px]">
          <User className="h-3 w-3 shrink-0 opacity-70" />
          <span className="truncate">{task.assigneeName ?? "Sem responsável"}</span>
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums shrink-0">
          {task.dueAt ? (
            <>
              <Calendar className="h-3 w-3 opacity-70" />
              {new Date(task.dueAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </>
          ) : (
            <span className="opacity-50">sem prazo</span>
          )}
        </span>
      </div>

      {/* Hover actions */}
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
