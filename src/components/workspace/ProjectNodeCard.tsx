/**
 * ProjectNodeCard — n8n-style node card com identidade visual por tipo.
 * Cada tipo tem accent color, ícone, ações rápidas e "capa" própria.
 */
import { memo, useState, useCallback, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  Plus, Trash2, CheckCircle2, Circle, AlertTriangle, Clock3,
  Link2, Paperclip, ExternalLink, Copy, Play, Eye, MoreHorizontal,
  XCircle, Sparkles,
} from "lucide-react";
import { getProjectTypeMeta, getNodeFamily } from "./canvasProjectTypes";
import { getEsteiraStatus, mapLegacyStatus } from "./canvasEsteiraStatus";
import {
  countOperationalDependencies,
  countOperationalEvidence,
  isOperationalOverdue,
  type CanvasOperationalMeta,
} from "./canvasOperationalMeta";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Accent color per kind (sync with drawer accents) ────────

const KIND_ACCENT: Record<string, string> = {
  briefing:     "#00FF88",
  contexto_ops: "#00FF88",
  objetivo:     "#10B981",
  acessos:      "#F97316",
  documento:    "#9CA3AF",
  checklist:    "#6366F1",
  contato:      "#14B8A6",
  funil:        "#FBBF24",
  landing_page: "#818CF8",
  site:         "#22D3EE",
  automacao:    "#FB923C",
  ia:           "#06B6D4",
  agente:       "#06B6D4",
  integracao:   "#8B5CF6",
  conteudo:     "#F472B6",
  video:        "#F472B6",
  imagem:       "#F472B6",
  asset:        "#A3E635",
  trafego:      "#EF4444",
  email_mkt:    "#EF4444",
  social:       "#EC4899",
  crm:          "#FBBF24",
  metrica:      "#60A5FA",
  before_after: "#14B8A6",
  case:         "#F59E0B",
  decisao:      "#A78BFA",
  lancamento:   "#DC2626",
  reuniao:      "#38BDF8",
  ideia:        "#FCD34D",
  engine:       "#00FF88",
  resultado:    "#A3E635",
  instrucao:    "#6366F1",
};

// ─── Types ────────────────────────────────────────────────────

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
  operationalMeta?: CanvasOperationalMeta | null;
  nodeId?: string;
  workspaceId?: string;
  onPrefilled?: () => void;
  onQuickConnect?: (nodeId: string, dir: "right" | "bottom") => void;
  onDelete?: (nodeId: string) => void;
  canExpandHub?: boolean;
  onExpandHub?: (nodeId: string) => void;
  /** Preview/action data per kind */
  typeData?: Record<string, unknown>;
  /** Pisca quando o node foi criado pelo portal e ainda não foi tocado pelo operador. */
  pulse?: boolean;
}

// ─── Status icon ──────────────────────────────────────────────

function StatusIcon({ status, accent }: { status: string; accent: string }) {
  const k = mapLegacyStatus(status);
  if (k === "concluido") return <CheckCircle2 className="h-3 w-3" style={{ color: accent }} />;
  if (k === "bloqueado") return <AlertTriangle className="h-3 w-3 text-amber-400" />;
  if (k === "ativo")     return <Play className="h-3 w-3 fill-current" style={{ color: accent }} />;
  if (k === "revisao")   return <Clock3 className="h-3 w-3 text-blue-400" />;
  return <Circle className="h-3 w-3 text-white/30" />;
}

// ─── Type-specific quick actions ──────────────────────────────

function getQuickActions(d: ProjectNodeData, accent: string): Array<{
  label: string; icon: React.ElementType; onClick: () => void;
}> {
  const actions: Array<{ label: string; icon: React.ElementType; onClick: () => void }> = [];
  const td = (d.typeData ?? {}) as Record<string, unknown>;

  // Link to external resource (landing, site, crm, dashboard)
  const urlField = (td.deploy_url as string) ?? (td.crm_url as string) ?? (td.dashboard_url as string) ?? (td.tool_url as string) ?? (td.landing_url as string) ?? (td.publish_url as string) ?? (td.test_link as string);
  if (urlField) {
    actions.push({
      label: "Abrir link",
      icon: ExternalLink,
      onClick: () => window.open(urlField, "_blank"),
    });
  }

  // Copy specific field for some types
  if (d.kind === "conteudo" || d.kind === "video" || d.kind === "social") {
    const copy = [(td.hook as string), (td.body as string), (td.cta as string)].filter(Boolean).join("\n\n");
    if (copy) {
      actions.push({
        label: "Copiar copy",
        icon: Copy,
        onClick: () => { navigator.clipboard.writeText(copy); toast({ title: "Copy copiado!" }); },
      });
    }
  }

  if (d.kind === "landing_page" && td.headline) {
    actions.push({
      label: "Copiar headline",
      icon: Copy,
      onClick: () => { navigator.clipboard.writeText(td.headline as string); toast({ title: "Headline copiada!" }); },
    });
  }

  return actions;
}

// ─── Main component ──────────────────────────────────────────

function ProjectNodeCardComp({ data, selected }: NodeProps) {
  const d = data as ProjectNodeData;
  const meta = getProjectTypeMeta(d.kind);
  const Icon = meta?.icon ?? Link2;
  const accent = KIND_ACCENT[d.kind] ?? "#9CA3AF";
  const statusMeta = getEsteiraStatus(mapLegacyStatus(d.status));
  const family = getNodeFamily(d.kind);
  const checklistPct = d.checklistTotal && d.checklistTotal > 0
    ? Math.round(((d.checklistDone ?? 0) / d.checklistTotal) * 100)
    : null;
  const opMeta = d.operationalMeta ?? null;
  const overdue = isOperationalOverdue(opMeta);
  const blocked = !!opMeta?.blockedReason || d.status === "blocked" || d.status === "bloqueado";
  const [hover, setHover] = useState(false);

  const isEngine = d.kind === "engine";
  const widthClass = isEngine ? "w-[400px]" : "w-[280px]";
  const quickActions = useMemo(() => getQuickActions(d, accent), [d.typeData, d.kind, accent]);

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (d.onDelete && d.nodeId) {
      d.onDelete(d.nodeId);
    }
  }, [d.onDelete, d.nodeId, d.title]);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* ═══ MÚLTIPLOS HANDLES — pares source/target no mesmo ponto ═══
         Mantém a edge presa na bolinha escolhida mesmo quando a conexão começa
         por um lado que antes era só target/source em ConnectionMode.Loose. */}
      <Handle type="target" position={Position.Left} id="l1" className="flex-handle" style={{ top: "25%", background: accent }} />
      <Handle type="source" position={Position.Left} id="l1" className="flex-handle" style={{ top: "25%", background: accent }} />
      <Handle type="target" position={Position.Left} id="l2" className="flex-handle" style={{ top: "50%", background: accent }} />
      <Handle type="source" position={Position.Left} id="l2" className="flex-handle" style={{ top: "50%", background: accent }} />
      <Handle type="target" position={Position.Left} id="l3" className="flex-handle" style={{ top: "75%", background: accent }} />
      <Handle type="source" position={Position.Left} id="l3" className="flex-handle" style={{ top: "75%", background: accent }} />
      <Handle type="target" position={Position.Top} id="t1" className="flex-handle" style={{ left: "25%", background: accent }} />
      <Handle type="source" position={Position.Top} id="t1" className="flex-handle" style={{ left: "25%", background: accent }} />
      <Handle type="target" position={Position.Top} id="t2" className="flex-handle" style={{ left: "50%", background: accent }} />
      <Handle type="source" position={Position.Top} id="t2" className="flex-handle" style={{ left: "50%", background: accent }} />
      <Handle type="target" position={Position.Top} id="t3" className="flex-handle" style={{ left: "75%", background: accent }} />
      <Handle type="source" position={Position.Top} id="t3" className="flex-handle" style={{ left: "75%", background: accent }} />
      <Handle type="target" position={Position.Right} id="r1" className="flex-handle" style={{ top: "25%", background: accent }} />
      <Handle type="source" position={Position.Right} id="r1" className="flex-handle" style={{ top: "25%", background: accent }} />
      <Handle type="target" position={Position.Right} id="r2" className="flex-handle" style={{ top: "50%", background: accent }} />
      <Handle type="source" position={Position.Right} id="r2" className="flex-handle" style={{ top: "50%", background: accent }} />
      <Handle type="target" position={Position.Right} id="r3" className="flex-handle" style={{ top: "75%", background: accent }} />
      <Handle type="source" position={Position.Right} id="r3" className="flex-handle" style={{ top: "75%", background: accent }} />
      <Handle type="target" position={Position.Bottom} id="b1" className="flex-handle" style={{ left: "25%", background: accent }} />
      <Handle type="source" position={Position.Bottom} id="b1" className="flex-handle" style={{ left: "25%", background: accent }} />
      <Handle type="target" position={Position.Bottom} id="b2" className="flex-handle" style={{ left: "50%", background: accent }} />
      <Handle type="source" position={Position.Bottom} id="b2" className="flex-handle" style={{ left: "50%", background: accent }} />
      <Handle type="target" position={Position.Bottom} id="b3" className="flex-handle" style={{ left: "75%", background: accent }} />
      <Handle type="source" position={Position.Bottom} id="b3" className="flex-handle" style={{ left: "75%", background: accent }} />

      {/* ═══ THE CARD ═══════════════════════════════════════════ */}
      <div
        data-selected={selected ? "true" : "false"}
        className={cn(
          "relative rounded-xl cursor-pointer overflow-hidden",
          widthClass,
          "border bg-[#0F1B11]",
          selected && "ring-2 ring-offset-2 ring-offset-[#0B0F0C]",
          hover && "shadow-lg",
          d.pulse && "animate-pulse-border",
        )}
        style={{
          borderColor: selected ? accent : `${accent}30`,
          boxShadow: d.pulse
            ? `0 0 0 2px ${accent}, 0 0 24px -2px ${accent}99`
            : hover ? `0 8px 24px -8px ${accent}50` : undefined,
          ['--tw-ring-color' as string]: accent,
        }}
      >
        {/* Top accent bar */}
        <div className="h-0.5 w-full" style={{ background: accent }} />

        {/* Cover — preview image if available */}
        {d.coverAttachment?.url && d.coverAttachment.type?.startsWith("image") && (
          <div className="h-24 w-full border-b overflow-hidden relative" style={{ borderColor: `${accent}18` }}>
            <img src={d.coverAttachment.url} alt={d.coverAttachment.label ?? d.title}
              className="w-full h-full object-cover opacity-80" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0F1B11] via-transparent to-transparent" />
          </div>
        )}

        {/* Header row: icon + kind label + status */}
        <div className="px-3 pt-2.5 pb-2 flex items-center gap-2">
          <div
            className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
            style={{ background: `${accent}20`, border: `1px solid ${accent}40` }}
          >
            <Icon className="h-3 w-3" style={{ color: accent }} strokeWidth={2} />
          </div>
          <span
            className="text-[9px] font-bold uppercase tracking-[0.12em] truncate flex-1"
            style={{ color: `${accent}` }}
          >
            {meta?.shortLabel ?? d.kind}
          </span>
          <StatusIcon status={d.status} accent={accent} />
        </div>

        {/* Title */}
        <div className="px-3 pb-2">
          <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{d.title}</p>
          {d.description && !d.coverAttachment?.url && (
            <p className="text-[11px] text-white/40 mt-1 line-clamp-2 leading-tight">{d.description}</p>
          )}
        </div>

        {/* Checklist progress */}
        {checklistPct !== null && (
          <div className="px-3 pb-2">
            <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
              <span>Checklist</span>
              <span className="tabular-nums font-semibold" style={{ color: accent }}>
                {d.checklistDone}/{d.checklistTotal}
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${checklistPct}%`, background: accent }}
              />
            </div>
          </div>
        )}

        {/* Footer: metadata + quick actions */}
        <div
          className="px-3 py-1.5 flex items-center gap-2 border-t"
          style={{ background: `${accent}06`, borderColor: `${accent}18` }}
        >
          <span className="text-[10px] font-medium" style={{ color: accent }}>
            {statusMeta.label}
          </span>
          <div className="flex-1" />
          <div className="flex items-center gap-1.5 text-[10px] text-white/35">
            {(d.links ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Link2 className="h-2.5 w-2.5" />{d.links}
              </span>
            )}
            {(d.attachments ?? 0) > 0 && (
              <span className="flex items-center gap-0.5">
                <Paperclip className="h-2.5 w-2.5" />{d.attachments}
              </span>
            )}
            {overdue && (
              <span className="flex items-center text-amber-400" title="Prazo vencido">
                <AlertTriangle className="h-2.5 w-2.5" />
              </span>
            )}
            {blocked && (
              <span className="flex items-center text-red-400" title="Bloqueado">
                <XCircle className="h-2.5 w-2.5" />
              </span>
            )}
          </div>
        </div>

        {/* Hover overlay actions — top right */}
        {hover && (
          <div
            className="absolute top-1.5 right-1.5 flex items-center gap-0.5 rounded-md border px-1 py-0.5"
            style={{ background: "rgba(15,27,17,0.95)", borderColor: `${accent}30`, backdropFilter: "blur(8px)" }}
          >
            {quickActions.slice(0, 2).map((action, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); action.onClick(); }}
                className="flex h-5 w-5 items-center justify-center rounded hover:bg-white/10 transition-colors"
                title={action.label}
                style={{ color: accent }}
              >
                <action.icon className="h-2.5 w-2.5" />
              </button>
            ))}
            {d.onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="flex h-5 w-5 items-center justify-center rounded text-red-400/70 hover:bg-red-400/15 hover:text-red-400 transition-colors"
                title="Excluir node"
              >
                <Trash2 className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quick connect "+" buttons — cleaner, type-accented */}
      {hover && d.onQuickConnect && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); d.nodeId && d.onQuickConnect?.(d.nodeId, "right"); }}
            className="absolute top-1/2 -right-3.5 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border-2 text-white/70 transition-all hover:scale-110"
            style={{
              background: "#0F1B11",
              borderColor: `${accent}60`,
              boxShadow: `0 0 12px -2px ${accent}40`,
              pointerEvents: "all",
            }}
            aria-label="Conectar próximo node"
          >
            <Plus className="h-3 w-3" style={{ color: accent }} strokeWidth={2.5} />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); d.nodeId && d.onQuickConnect?.(d.nodeId, "bottom"); }}
            className="absolute -bottom-3.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full border-2 text-white/50 transition-all hover:scale-110"
            style={{
              background: "#0F1B11",
              borderColor: `${accent}40`,
              pointerEvents: "all",
            }}
            aria-label="Adicionar node abaixo"
          >
            <Plus className="h-2.5 w-2.5" style={{ color: accent }} strokeWidth={2.5} />
          </button>
        </>
      )}
    </div>
  );
}

function shallowArrayEqual(a: unknown[], b: unknown[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function areProjectNodePropsEqual(prev: NodeProps, next: NodeProps): boolean {
  if (prev.selected !== next.selected) return false;
  const a = prev.data as ProjectNodeData;
  const b = next.data as ProjectNodeData;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "function" && typeof bv === "function") continue;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (!shallowArrayEqual(av, bv)) return false;
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}

export default memo(ProjectNodeCardComp, areProjectNodePropsEqual);
