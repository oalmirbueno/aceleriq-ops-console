import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, CheckCircle2, Clock3, GitBranch, Plus, Link2, Paperclip, ListChecks, Maximize2, XCircle } from "lucide-react";
import { getProjectTypeMeta, getNodeFamily } from "./canvasProjectTypes";
import { getEsteiraStatus, mapLegacyStatus } from "./canvasEsteiraStatus";
import ClientAvatar from "./ClientAvatar";
import AttachmentPreview from "./AttachmentPreview";
import {
  countOperationalDependencies,
  countOperationalEvidence,
  isOperationalOverdue,
  type ApprovalStatus,
  type CanvasOperationalMeta,
} from "./canvasOperationalMeta";

export interface ProjectNodeCoverAttachment {
  url: string;
  type?: string;
  label?: string;
}

export interface ProjectNodeData extends Record<string, unknown> {
  title: string;
  /** kind from canvasProjectTypes; falls back to db node_type if absent */
  kind: string;
  status: string;
  description: string | null;
  hasLinkedEntity: boolean;
  attachments?: number;
  links?: number;
  checklistDone?: number;
  checklistTotal?: number;
  /** First previewable attachment, used as visual cover */
  coverAttachment?: ProjectNodeCoverAttachment | null;
  /** Owner client (folder) — used for visual identification */
  clientName?: string | null;
  clientSeed?: string | null;
  clientLogoUrl?: string | null;
  operationalMeta?: CanvasOperationalMeta | null;
  /** Callback to open quick-add at a relative direction */
  onQuickConnect?: (dir: "right" | "bottom") => void;
}

function getApprovalSignal(status?: ApprovalStatus) {
  if (status === "pending") return { icon: Clock3, label: "Aprovação pendente", className: "text-muted-foreground" };
  if (status === "approved") return { icon: CheckCircle2, label: "Aprovado", className: "text-primary" };
  if (status === "rejected") return { icon: XCircle, label: "Reprovado", className: "text-destructive" };
  return null;
}

function ProjectNodeCardComp({ data, selected }: NodeProps) {
  const d = data as ProjectNodeData;
  const meta = getProjectTypeMeta(d.kind);
  const Icon = meta?.icon ?? Link2;
  const statusMeta = getEsteiraStatus(mapLegacyStatus(d.status));
  const family = getNodeFamily(d.kind);
  const checklistPct =
    d.checklistTotal && d.checklistTotal > 0
      ? Math.round(((d.checklistDone ?? 0) / d.checklistTotal) * 100)
      : null;
  const opMeta = d.operationalMeta ?? null;
  const approvalSignal = getApprovalSignal(opMeta?.approvalStatus);
  const evidenceCount = countOperationalEvidence(opMeta);
  const dependencyCount = countOperationalDependencies(opMeta);
  const overdue = isOperationalOverdue(opMeta);
  const blocked = !!opMeta?.blockedReason || d.status === "blocked" || d.status === "bloqueado";

  const [hover, setHover] = useState(false);

  return (
    <div
      className={`relative group node-family-${family}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2 !h-2 !border-background" />

      <div
        data-selected={selected ? "true" : "false"}
        className="node-card relative rounded-lg w-[292px] px-4 py-3.5"
      >
        {/* Top row: icon · kind label · indicators */}
        <div className="flex items-center gap-2.5 mb-2.5">
          <div className="node-icon h-8 w-8 rounded-md flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
          <span className="node-kind-label text-[11px] uppercase tracking-[0.08em] font-semibold truncate">
            {meta?.shortLabel ?? d.kind}
          </span>
          <div className="ml-auto flex items-center gap-1.5">
            <Maximize2 className="h-3 w-3 text-foreground/35 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Abrir popup" />
            {approvalSignal && (
              <approvalSignal.icon className={`h-3 w-3 ${approvalSignal.className}`} aria-label={approvalSignal.label} />
            )}
            {blocked && (
              <AlertTriangle className="h-3 w-3 text-destructive" aria-label="Bloqueado" />
            )}
            {overdue && (
              <Clock3 className="h-3 w-3 text-destructive" aria-label="Prazo vencido" />
            )}
            {d.hasLinkedEntity && (
              <Link2 className="h-3 w-3 text-foreground/40" aria-label="Vinculado" />
            )}
            {d.clientName && (
              <ClientAvatar
                name={d.clientName}
                seed={d.clientSeed ?? d.clientName}
                logoUrl={d.clientLogoUrl ?? null}
                size="xs"
              />
            )}
          </div>
        </div>

        {/* Cover thumbnail (first previewable attachment) */}
        {d.coverAttachment?.url && (
          <div
            className="relative mb-2 rounded-md overflow-hidden border border-border/60 bg-black/30 h-24 w-full"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 [&>div]:!h-full [&>div]:!w-full [&>button]:!h-full [&>button]:!w-full [&>button]:!rounded-md [&_img]:!object-cover [&_canvas]:!object-contain">
              <AttachmentPreview
                url={d.coverAttachment.url}
                type={d.coverAttachment.type}
                label={d.coverAttachment.label}
                className="!h-full !w-full !rounded-md"
              />
            </div>
          </div>
        )}

        {/* Title — strong hierarchy */}
        <p className="text-[15px] font-semibold text-foreground leading-[1.25] line-clamp-2 mb-1.5">
          {d.title}
        </p>

        {/* Description — secondary */}
        {d.description && (
          <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-snug mb-2.5">
            {d.description}
          </p>
        )}

        {/* Checklist progress bar — only if there's a checklist */}
        {checklistPct !== null && (
          <div className="mb-2.5">
            <div className="flex items-center justify-between text-[9.5px] text-muted-foreground/70 mb-0.5">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-2.5 w-2.5" />
                {d.checklistDone ?? 0}/{d.checklistTotal}
              </span>
              <span className="font-mono tabular-nums">{checklistPct}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-muted/40 overflow-hidden">
              <div
                className="h-full rounded-full transition-[width] duration-300"
                style={{
                  width: `${checklistPct}%`,
                  background: "hsl(var(--node-accent, var(--primary)) / 0.85)",
                }}
              />
            </div>
          </div>
        )}

        {/* Footer: status dot + meta counts (compact, low contrast) */}
        <div className="flex items-center gap-2 pt-2 border-t border-border/40">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "hsl(var(--node-accent, var(--muted-foreground)) / 0.9)" }}
            />
            {statusMeta.label}
          </span>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground/60">
            {(d.links ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Link2 className="h-2.5 w-2.5" />
                {d.links}
              </span>
            )}
            {(d.attachments ?? 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="h-2.5 w-2.5" />
                {d.attachments}
              </span>
            )}
            {evidenceCount > 0 && (
              <span className="inline-flex items-center gap-0.5" aria-label={`${evidenceCount} evidências`}>
                <CheckCircle2 className="h-2.5 w-2.5" />
                {evidenceCount}
              </span>
            )}
            {dependencyCount > 0 && (
              <span className="inline-flex items-center gap-0.5" aria-label={`${dependencyCount} dependências`}>
                <GitBranch className="h-2.5 w-2.5" />
                {dependencyCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Inline + buttons (right & bottom) */}
      {hover && d.onQuickConnect && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); d.onQuickConnect?.("right"); }}
            className="absolute top-1/2 -right-3 -translate-y-1/2 h-5 w-5 rounded-full bg-foreground/90 text-background shadow-lg flex items-center justify-center hover:scale-110 hover:bg-foreground transition-all z-10"
            aria-label="Adicionar próximo node à direita"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); d.onQuickConnect?.("bottom"); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-5 w-5 rounded-full bg-foreground/90 text-background shadow-lg flex items-center justify-center hover:scale-110 hover:bg-foreground transition-all z-10"
            aria-label="Adicionar próximo node abaixo"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </>
      )}

      <Handle type="source" position={Position.Right} className="!bg-primary !w-2 !h-2 !border-background" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2 !border-background" id="bottom" />
    </div>
  );
}

export default memo(ProjectNodeCardComp);
