import { memo, useMemo, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { AlertTriangle, BrainCircuit, CheckCircle2, Clock3, GitBranch, Link2, ListChecks, Maximize2, Paperclip, Plus, XCircle } from "lucide-react";
import {
  getNodeFamily,
  getNodeFlowRole,
  getProjectTypeMeta,
  NODE_FAMILY_LABELS,
  NODE_FLOW_ROLE_LABELS,
} from "./canvasProjectTypes";
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
  kind: string;
  status: string;
  description: string | null;
  hasLinkedEntity: boolean;
  attachments?: number;
  links?: number;
  checklistDone?: number;
  checklistTotal?: number;
  coverAttachment?: ProjectNodeCoverAttachment | null;
  clientName?: string | null;
  clientSeed?: string | null;
  clientLogoUrl?: string | null;
  operationalMeta?: CanvasOperationalMeta | null;
  onQuickConnect?: (dir: "right" | "bottom") => void;
  canExpandHub?: boolean;
  onExpandHub?: () => void;
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
  const flowRole = getNodeFlowRole(d.kind);
  const checklistPct = d.checklistTotal && d.checklistTotal > 0
    ? Math.round(((d.checklistDone ?? 0) / d.checklistTotal) * 100)
    : null;
  const opMeta = d.operationalMeta ?? null;
  const approvalSignal = getApprovalSignal(opMeta?.approvalStatus);
  const evidenceCount = countOperationalEvidence(opMeta);
  const dependencyCount = countOperationalDependencies(opMeta);
  const overdue = isOperationalOverdue(opMeta);
  const blocked = !!opMeta?.blockedReason || d.status === "blocked" || d.status === "bloqueado";
  const [hover, setHover] = useState(false);

  const isEngine = d.kind === "engine";
  const isProof = family === "proof";
  const widthClass = isEngine ? "w-[440px]" : isProof ? "w-[370px]" : "w-[340px]";
  const handleClass = isProof
    ? "!bg-amber-400 !w-4 !h-4 !border-2 !border-background shadow-lg"
    : isEngine
      ? "!bg-sky-400 !w-4 !h-4 !border-2 !border-background shadow-lg"
      : "!bg-primary !w-4 !h-4 !border-2 !border-background shadow-lg";

  const proofSignals = useMemo(() => {
    if (d.kind === "metrica") return ["KPI", "Mede"]; 
    if (d.kind === "before_after") return ["Compara", "Antes/Depois"]; 
    if (d.kind === "case") return ["Narrativa", "Case"]; 
    return [];
  }, [d.kind]);

  return (
    <div
      className={`relative group node-family-${family} node-flow-${flowRole}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />

      {(hover || selected) && (
        <>
          <div className="pointer-events-none absolute top-1/2 -left-16 -translate-y-1/2 rounded-full border border-border/70 bg-card/95 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            Entrada
          </div>
          <div className="pointer-events-none absolute top-1/2 -right-16 -translate-y-1/2 rounded-full border border-border/70 bg-card/95 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            Conectar
          </div>
          <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 rounded-full border border-border/70 bg-card/95 px-2 py-0.5 text-[10px] text-muted-foreground shadow-sm">
            Próximo passo
          </div>
        </>
      )}

      <div
        data-selected={selected ? "true" : "false"}
        className={`node-card relative rounded-xl ${widthClass} px-5 py-4 shadow-sm ${isEngine ? "node-card-engine" : isProof ? "node-card-proof" : ""}`}
      >
        <div className="mb-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground/70">
          <span>{NODE_FAMILY_LABELS[family]}</span>
          {isEngine && <span className="text-sky-300">Hub central</span>}
          {isProof && <span className="text-amber-300">Prova da entrega</span>}
        </div>

        <div className="mb-2.5 flex items-center gap-2.5">
          <div className="node-icon h-8 w-8 rounded-md flex items-center justify-center shrink-0">
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
          <span className="node-kind-label truncate text-[11px] font-semibold uppercase tracking-[0.08em]">
            {meta?.shortLabel ?? d.kind}
          </span>
          {isEngine && d.canExpandHub && d.onExpandHub && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                d.onExpandHub?.();
              }}
              className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[10px] font-medium text-sky-100 hover:bg-sky-400/15"
              aria-label="Montar hub inteligente"
            >
              <span className="inline-flex items-center gap-1">
                <BrainCircuit className="h-3 w-3" />
                Hub
              </span>
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Maximize2 className="h-3 w-3 text-foreground/35 opacity-0 transition-opacity group-hover:opacity-100" aria-label="Abrir popup" />
            {approvalSignal && <approvalSignal.icon className={`h-3 w-3 ${approvalSignal.className}`} aria-label={approvalSignal.label} />}
            {blocked && <AlertTriangle className="h-3 w-3 text-destructive" aria-label="Bloqueado" />}
            {overdue && <Clock3 className="h-3 w-3 text-destructive" aria-label="Prazo vencido" />}
            {d.hasLinkedEntity && <Link2 className="h-3 w-3 text-foreground/40" aria-label="Vinculado" />}
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

        <div className="mb-2 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
          <span>{NODE_FLOW_ROLE_LABELS[flowRole]}</span>
          {isProof && proofSignals.length > 0 && (
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {proofSignals.map((signal) => (
                <span
                  key={signal}
                  className="rounded-full border border-amber-300/25 bg-amber-300/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-100"
                >
                  {signal}
                </span>
              ))}
            </div>
          )}
        </div>

        {d.coverAttachment?.url && (
          <div
            className="relative mb-2 overflow-hidden rounded-md border border-border/60 bg-black/30 h-24 w-full"
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

        <p className={`mb-1.5 line-clamp-2 font-semibold leading-[1.2] text-foreground ${isEngine ? "text-[18px]" : "text-[16px]"}`}>
          {d.title}
        </p>

        {d.description && (
          <p className="mb-2.5 line-clamp-2 text-xs leading-snug text-muted-foreground/80">
            {d.description}
          </p>
        )}

        {checklistPct !== null && (
          <div className="mb-2.5">
            <div className="mb-0.5 flex items-center justify-between text-[9.5px] text-muted-foreground/70">
              <span className="inline-flex items-center gap-1">
                <ListChecks className="h-2.5 w-2.5" />
                {d.checklistDone ?? 0}/{d.checklistTotal}
              </span>
              <span className="font-mono tabular-nums">{checklistPct}%</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted/40">
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

        <div className="flex items-center gap-2 border-t border-border/40 pt-2">
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

        <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/30 pt-2 text-[10px] text-muted-foreground/70">
          <span>
            {isEngine
              ? "Centraliza contexto, regra e saída"
              : isProof
                ? "Mede, compara e prova a entrega"
                : "Arraste os conectores para ligar este node"}
          </span>
          {d.onQuickConnect && <span className="font-medium text-foreground/70">+ próximo</span>}
        </div>
      </div>

      {hover && d.onQuickConnect && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              d.onQuickConnect?.("right");
            }}
            className="absolute top-1/2 -right-3 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-foreground/90 text-background shadow-lg transition-all hover:scale-110 hover:bg-foreground"
            aria-label="Adicionar próximo node à direita"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              d.onQuickConnect?.("bottom");
            }}
            className="absolute -bottom-3 left-1/2 z-10 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-foreground/90 text-background shadow-lg transition-all hover:scale-110 hover:bg-foreground"
            aria-label="Adicionar próximo node abaixo"
          >
            <Plus className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </>
      )}

      <Handle type="source" position={Position.Right} className={handleClass} />
      <Handle type="source" position={Position.Bottom} className={handleClass} id="bottom" />
    </div>
  );
}

export default memo(ProjectNodeCardComp);
