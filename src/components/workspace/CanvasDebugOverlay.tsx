import { useEffect, useState } from "react";
import { Bug, X, Copy, Check } from "lucide-react";
import { setCanvasDebug } from "@/lib/canvasDebug";

export interface CanvasDebugStats {
  loading: boolean;
  workspaceId: string;
  clientId?: string | null;
  activeClientId?: string | null;
  selectedMilestoneId?: string | null;
  portalProjectIdProp?: string | null;
  totals: {
    dbNodes: number;
    projectNodes: number;
    scopedProjectNodes: number;
    visibleCanvasNodes: number;
    rfNodes: number;
    dbEdges: number;
    scopedEdges: number;
    rfEdges: number;
    clientGroups: number;
  };
  filters: {
    search: string;
    typeFilter: string | null;
    statusFilter: string | null;
    approvalFilter: string;
    blockedFilter: string;
    ownerFilter: string | null;
  };
  reasons: {
    droppedByClientScope: number;
    droppedByMilestone: number;
    droppedByUiFilters: number;
    folderNodesHidden: number;
    fromPortal: number;
    manual: number;
    aiGenerated: number;
  };
  lastFetchAt?: number | null;
  lastFetchError?: string | null;
}

interface Props {
  stats: CanvasDebugStats;
  onClose: () => void;
}

export default function CanvasDebugOverlay({ stats, onClose }: Props) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(stats, null, 2));
      setCopied(true);
    } catch {
      /* noop */
    }
  };

  const disable = () => {
    setCanvasDebug(false);
    onClose();
  };

  return (
    <div className="pointer-events-auto fixed bottom-4 right-4 z-[60] w-[340px] rounded-lg border border-primary/40 bg-background/95 shadow-xl backdrop-blur-sm font-mono text-[11px]">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 text-primary">
          <Bug className="h-3.5 w-3.5" />
          <span className="font-semibold tracking-wide">Canvas · Diagnóstico</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copyJson}
            className="rounded p-1 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
            title="Copiar JSON"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={disable}
            className="rounded p-1 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
            title="Desativar (Shift+D para reabrir)"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-3 space-y-3">
        <Section title="Estado">
          <Row k="loading" v={String(stats.loading)} />
          <Row k="workspaceId" v={shortId(stats.workspaceId)} />
          <Row k="clientId" v={shortId(stats.clientId)} />
          <Row k="activeClientId" v={shortId(stats.activeClientId)} />
          <Row k="selectedMilestoneId" v={shortId(stats.selectedMilestoneId)} />
          <Row k="portalProjectIdProp" v={shortId(stats.portalProjectIdProp)} />
          {stats.lastFetchError ? (
            <Row k="fetchError" v={stats.lastFetchError} highlight="error" />
          ) : null}
        </Section>

        <Section title="Pipeline (nodes)">
          <Row k="dbNodes" v={stats.totals.dbNodes} />
          <Row k="└ projectNodes (≠client)" v={stats.totals.projectNodes} />
          <Row k="  └ scopedProjectNodes" v={stats.totals.scopedProjectNodes} highlight={stats.totals.scopedProjectNodes === 0 ? "warn" : undefined} />
          <Row k="    └ visibleCanvasNodes" v={stats.totals.visibleCanvasNodes} highlight={stats.totals.visibleCanvasNodes === 0 && stats.totals.scopedProjectNodes > 0 ? "warn" : undefined} />
          <Row k="      └ rfNodes (rendered)" v={stats.totals.rfNodes} />
        </Section>

        <Section title="Edges">
          <Row k="dbEdges" v={stats.totals.dbEdges} />
          <Row k="scopedEdges" v={stats.totals.scopedEdges} />
          <Row k="rfEdges" v={stats.totals.rfEdges} />
        </Section>

        <Section title="Por que não aparece">
          <Row k="folder hidden (groups)" v={stats.reasons.folderNodesHidden} />
          <Row k="dropped: scope cliente" v={stats.reasons.droppedByClientScope} highlight={stats.reasons.droppedByClientScope > 0 ? "warn" : undefined} />
          <Row k="dropped: milestone" v={stats.reasons.droppedByMilestone} highlight={stats.reasons.droppedByMilestone > 0 ? "warn" : undefined} />
          <Row k="dropped: filtros UI" v={stats.reasons.droppedByUiFilters} highlight={stats.reasons.droppedByUiFilters > 0 ? "warn" : undefined} />
        </Section>

        <Section title="Origem dos nodes">
          <Row k="from_portal" v={stats.reasons.fromPortal} />
          <Row k="manual" v={stats.reasons.manual} />
          <Row k="ai gerado" v={stats.reasons.aiGenerated} />
          <Row k="clientGroups" v={stats.totals.clientGroups} />
        </Section>

        <Section title="Filtros UI">
          <Row k="search" v={stats.filters.search || "—"} />
          <Row k="type" v={stats.filters.typeFilter ?? "—"} />
          <Row k="status" v={stats.filters.statusFilter ?? "—"} />
          <Row k="approval" v={stats.filters.approvalFilter} />
          <Row k="blocked" v={stats.filters.blockedFilter} />
          <Row k="owner" v={stats.filters.ownerFilter ?? "—"} />
        </Section>
      </div>

      <div className="border-t border-border/60 px-3 py-2 text-[10px] text-muted-foreground">
        Atalho: <kbd className="rounded bg-muted/40 px-1">Shift</kbd> +{" "}
        <kbd className="rounded bg-muted/40 px-1">D</kbd> · logs detalhados no console
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="rounded border border-border/40 bg-muted/10 px-2 py-1.5 space-y-0.5">
        {children}
      </div>
    </div>
  );
}

function Row({ k, v, highlight }: { k: string; v: string | number | null | undefined; highlight?: "warn" | "error" }) {
  const color = highlight === "error" ? "text-red-400" : highlight === "warn" ? "text-amber-400" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground truncate">{k}</span>
      <span className={`${color} font-semibold tabular-nums`}>{String(v ?? "—")}</span>
    </div>
  );
}

function shortId(id?: string | null) {
  if (!id) return "—";
  return id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}