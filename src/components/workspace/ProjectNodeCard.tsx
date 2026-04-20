import { memo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Plus, Link2, Paperclip, ListChecks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getProjectTypeMeta } from "./canvasProjectTypes";
import { getEsteiraStatus, mapLegacyStatus } from "./canvasEsteiraStatus";
import ClientAvatar from "./ClientAvatar";
import AttachmentPreview from "./AttachmentPreview";

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
  /** Callback to open quick-add at a relative direction */
  onQuickConnect?: (dir: "right" | "bottom") => void;
}

function ProjectNodeCardComp({ data, selected }: NodeProps) {
  const d = data as ProjectNodeData;
  const meta = getProjectTypeMeta(d.kind);
  const Icon = meta?.icon ?? Link2;
  const colorClass = meta?.color ?? "border-border text-foreground";
  const bgClass = meta?.bg ?? "bg-muted/30";
  const statusMeta = getEsteiraStatus(mapLegacyStatus(d.status));

  const [hover, setHover] = useState(false);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Handle type="target" position={Position.Left} className="!bg-primary !w-2 !h-2 !border-background" />

      <div
        className={`relative rounded-xl border-2 ${colorClass} ${bgClass} px-3 py-2.5 w-[230px] shadow-md backdrop-blur-sm transition-all ${
          selected ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-[1.02]" : "hover:shadow-lg hover:-translate-y-0.5"
        }`}
      >
        {/* Top row: icon + label + client avatar + linked indicator */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <div className={`h-6 w-6 rounded-md ${bgClass} border ${colorClass.split(" ")[0]} flex items-center justify-center shrink-0`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] uppercase tracking-wider opacity-80 font-semibold truncate">
            {meta?.shortLabel ?? d.kind}
          </span>
          <div className="ml-auto flex items-center gap-1">
            {d.hasLinkedEntity && (
              <Link2 className="h-3 w-3 text-primary" aria-label="Vinculado" />
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
            className="relative mb-2 rounded-md overflow-hidden border border-border/60 bg-muted/40 h-24 w-full"
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

        {/* Title */}
        <p className="text-sm font-semibold text-foreground leading-tight line-clamp-2 mb-1">
          {d.title}
        </p>

        {/* Description */}
        {d.description && (
          <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug mb-2">
            {d.description}
          </p>
        )}

        {/* Footer: status + meta counts */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${statusMeta.color}`}>
            {statusMeta.label}
          </Badge>
          {(d.checklistTotal ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
              <ListChecks className="h-2.5 w-2.5" />
              {d.checklistDone ?? 0}/{d.checklistTotal}
            </span>
          )}
          {(d.links ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
              <Link2 className="h-2.5 w-2.5" />
              {d.links}
            </span>
          )}
          {(d.attachments ?? 0) > 0 && (
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-0.5">
              <Paperclip className="h-2.5 w-2.5" />
              {d.attachments}
            </span>
          )}
        </div>
      </div>

      {/* Inline + buttons (right & bottom) */}
      {hover && d.onQuickConnect && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); d.onQuickConnect?.("right"); }}
            className="absolute top-1/2 -right-3 -translate-y-1/2 h-6 w-6 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-10"
            aria-label="Adicionar próximo node à direita"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); d.onQuickConnect?.("bottom"); }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 h-6 w-6 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-10"
            aria-label="Adicionar próximo node abaixo"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      <Handle type="source" position={Position.Right} className="!bg-primary !w-2 !h-2 !border-background" />
      <Handle type="source" position={Position.Bottom} className="!bg-primary !w-2 !h-2 !border-background" id="bottom" />
    </div>
  );
}

export default memo(ProjectNodeCardComp);
