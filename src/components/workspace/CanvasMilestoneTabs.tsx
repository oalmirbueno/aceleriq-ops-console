/**
 * CanvasMilestoneTabs
 *
 * Barra "fordista" no topo do canvas que substitui as pastinhas visuais de
 * project_group / milestone_group dentro do board. Mostra os projetos como
 * grupos e os milestones como abas selecionáveis. Clicar numa aba ativa o
 * modo esteira do milestone (selectedMilestoneId no CanvasStudio), exatamente
 * como antes acontecia ao clicar na pastinha do canvas.
 *
 * Bidirecional: como project_group / milestone_group são alimentados em
 * tempo real pelos triggers do Portal (receive-portal-sync) e pelo realtime
 * do canvas_nodes, a barra atualiza sozinha quando algo muda nos dois lados.
 */
import { memo, useEffect, useMemo, useState } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Folder, Layers, Target, Radio, ArrowDownToLine, ArrowUpFromLine, AlertCircle } from "lucide-react";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

type CanvasNodeRow = CanvasNodeRecord & { parent_node_id?: string | null };

export type RealtimeState = "connecting" | "connected" | "disconnected";
export interface SyncStatus {
  realtimeState: RealtimeState;
  realtimeAt: number | null;     // último postgres_changes recebido
  portalPushAt: number | null;   // último Ops→Portal concluído
  portalPullAt: number | null;   // último Portal→Ops concluído
  portalBusy: boolean;           // sync em voo
  portalError: string | null;    // mensagem se o último round falhou
}

interface Props {
  nodes: CanvasNodeRow[];
  selectedMilestoneId: string | null;
  onSelectMilestone: (id: string | null) => void;
  syncStatus?: SyncStatus;
}

function kindOf(n: CanvasNodeRow): string {
  return String((n.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
}

function portalOrder(n: CanvasNodeRow): number {
  const v = Number((n.data as Record<string, unknown> | null)?.portal_position ?? 9999);
  return Number.isFinite(v) ? v : 9999;
}

const COMPLETED_STATUSES = new Set(["done", "completed", "concluido", "concluída", "concluida"]);
const NON_TASK_TYPES = new Set(["client", "ai_orb", "chat_node"]);
const NON_TASK_KINDS = new Set(["project_group", "milestone_group", "chat_node"]);

interface MilestoneTabProps {
  id: string;
  title: string;
  active: boolean;
  done: number;
  total: number;
  onSelect: (id: string, active: boolean) => void;
}

const MilestoneTab = memo(function MilestoneTab({ id, title, active, done, total, onSelect }: MilestoneTabProps) {
  const pct = total > 0 ? Math.round((done / total) * 100) : null;
  return (
    <button
      onClick={() => onSelect(id, active)}
      className={`shrink-0 group flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11px] font-medium transition-all ${
        active
          ? "bg-primary/15 border-primary/50 text-primary shadow-sm"
          : "border-border bg-background/60 text-muted-foreground hover:text-foreground hover:bg-muted/50"
      }`}
      title={pct !== null ? `${title} · ${done}/${total} (${pct}%)` : title}
    >
      <Target className={`h-3 w-3 ${active ? "text-primary" : "text-muted-foreground/70"}`} />
      <span className="truncate max-w-[180px]">{title}</span>
      {total > 0 && (
        <span className={`text-[10px] tabular-nums ${active ? "text-primary/80" : "opacity-60"}`}>
          {done}/{total}
        </span>
      )}
    </button>
  );
});

function relativeTime(ts: number | null, nowMs: number): string {
  if (!ts) return "—";
  const diff = Math.max(0, Math.floor((nowMs - ts) / 1000));
  if (diff < 5) return "agora";
  if (diff < 60) return `${diff}s atrás`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

const SyncIndicator = memo(function SyncIndicator({ status }: { status: SyncStatus }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(id);
  }, []);

  const rt = status.realtimeState;
  const rtColor =
    rt === "connected" ? "text-primary"
    : rt === "connecting" ? "text-amber-400"
    : "text-destructive";
  const rtLabel =
    rt === "connected" ? "Realtime ao vivo"
    : rt === "connecting" ? "Conectando realtime…"
    : "Realtime offline";

  const lastRealtime = relativeTime(status.realtimeAt, now);
  const lastPush = relativeTime(status.portalPushAt, now);
  const lastPull = relativeTime(status.portalPullAt, now);

  return (
    <div
      className="shrink-0 flex items-center gap-2 h-8 px-2.5 rounded-md border border-border/60 bg-background/40 text-[10px] tabular-nums text-muted-foreground"
      title={[
        `Realtime: ${rtLabel}${status.realtimeAt ? ` · último evento ${lastRealtime}` : ""}`,
        `Ops → Portal: ${lastPush}${status.portalBusy ? " (sincronizando…)" : ""}`,
        `Portal → Ops: ${lastPull}`,
        status.portalError ? `Erro: ${status.portalError}` : "",
      ].filter(Boolean).join("\n")}
    >
      <span className={`flex items-center gap-1 ${rtColor}`}>
        <span className="relative flex items-center justify-center">
          <Radio className="h-3 w-3" />
          {rt === "connected" && (
            <span className="absolute inset-0 rounded-full bg-primary/30 animate-ping" />
          )}
        </span>
        <span className="hidden lg:inline">{lastRealtime}</span>
      </span>
      <span className="h-3 w-px bg-border/60" />
      <span className={`flex items-center gap-1 ${status.portalBusy ? "text-primary animate-pulse" : ""}`}>
        <ArrowUpFromLine className="h-3 w-3" />
        <span className="hidden lg:inline">{lastPush}</span>
      </span>
      <span className="flex items-center gap-1">
        <ArrowDownToLine className="h-3 w-3" />
        <span className="hidden lg:inline">{lastPull}</span>
      </span>
      {status.portalError && (
        <span className="flex items-center gap-1 text-destructive">
          <AlertCircle className="h-3 w-3" />
        </span>
      )}
    </div>
  );
});

function CanvasMilestoneTabsComp({ nodes, selectedMilestoneId, onSelectMilestone, syncStatus }: Props) {
  // Build a narrow signature so we only recompute when fields that affect the
  // bar actually change. Unrelated updates (positions, drawer data, etc.) on
  // canvas_nodes won't invalidate this memo.
  const progressSignature = useMemo(() => {
    const parts: string[] = [];
    for (const n of nodes) {
      const k = kindOf(n);
      const t = (n.node_type ?? "").toLowerCase();
      const isMilestone = k === "milestone_group";
      const isTask = !NON_TASK_TYPES.has(t) && !NON_TASK_KINDS.has(k);
      if (!isMilestone && !isTask) continue;
      const d = (n.data as Record<string, unknown> | null) ?? {};
      parts.push(
        `${n.id}|${k}|${n.parent_node_id ?? ""}|${(n.status ?? "").toLowerCase()}|${
          (d.portal_milestone_id as string | undefined) ?? ""
        }|${(d.milestone_key as string | undefined) ?? ""}|${(d.portal_project_id as string | undefined) ?? ""}`,
      );
    }
    parts.sort();
    return parts.join("\n");
  }, [nodes]);

  const progressById = useMemo(() => {
    const map = new Map<string, { total: number; done: number }>();
    const milestones: CanvasNodeRow[] = [];
    // Index tasks by parent and by portal milestone keys in a single pass.
    const byParent = new Map<string, CanvasNodeRow[]>();
    const byPortalMs = new Map<string, CanvasNodeRow[]>();
    const byMsKey = new Map<string, CanvasNodeRow[]>();
    for (const n of nodes) {
      const k = kindOf(n);
      if (k === "milestone_group") {
        milestones.push(n);
        continue;
      }
      const t = (n.node_type ?? "").toLowerCase();
      if (NON_TASK_TYPES.has(t) || NON_TASK_KINDS.has(k)) continue;
      if (n.parent_node_id) {
        const arr = byParent.get(n.parent_node_id);
        if (arr) arr.push(n); else byParent.set(n.parent_node_id, [n]);
      }
      const d = (n.data as Record<string, unknown> | null) ?? {};
      const pid = d.portal_milestone_id as string | undefined;
      if (pid) {
        const arr = byPortalMs.get(pid);
        if (arr) arr.push(n); else byPortalMs.set(pid, [n]);
      }
      const mKey = d.milestone_key as string | undefined;
      const mProj = d.portal_project_id as string | undefined;
      if (mKey && mProj) {
        const key = `${mProj}::${mKey}`;
        const arr = byMsKey.get(key);
        if (arr) arr.push(n); else byMsKey.set(key, [n]);
      }
    }
    for (const m of milestones) {
      const md = (m.data as Record<string, unknown> | null) ?? {};
      const mPid = md.portal_milestone_id as string | undefined;
      const mKey = md.milestone_key as string | undefined;
      const mProj = md.portal_project_id as string | undefined;
      const seen = new Set<string>();
      const collect = (arr?: CanvasNodeRow[]) => {
        if (!arr) return;
        for (const n of arr) seen.add(n.id);
      };
      collect(byParent.get(m.id));
      if (mPid) collect(byPortalMs.get(mPid));
      if (mKey && mProj) collect(byMsKey.get(`${mProj}::${mKey}`));
      let done = 0;
      for (const id of seen) {
        // Re-resolve status via a tight loop avoiding extra map.
      }
      // Resolve done count by walking the union once.
      const idSet = seen;
      let total = idSet.size;
      if (total > 0) {
        for (const n of nodes) {
          if (!idSet.has(n.id)) continue;
          if (COMPLETED_STATUSES.has((n.status ?? "").toLowerCase())) done++;
        }
      }
      map.set(m.id, { total, done });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progressSignature]);

  const grouped = useMemo(() => {
    const projects = nodes
      .filter((n) => kindOf(n) === "project_group")
      .slice()
      .sort((a, b) => portalOrder(a) - portalOrder(b) || String(a.title).localeCompare(String(b.title)));

    const claimed = new Set<string>();
    return projects.map((project) => {
      const pdata = (project.data as Record<string, unknown> | null) ?? {};
      const portalProjectId = typeof pdata.portal_project_id === "string" ? pdata.portal_project_id : null;
      const milestones = nodes
        .filter((n) => {
          if (kindOf(n) !== "milestone_group") return false;
          if (claimed.has(n.id)) return false;
          const d = (n.data as Record<string, unknown> | null) ?? {};
          const matchesParent = n.parent_node_id === project.id;
          const matchesPortal = !!portalProjectId && d.portal_project_id === portalProjectId;
          if (matchesParent || matchesPortal) {
            claimed.add(n.id);
            return true;
          }
          return false;
        })
        .slice()
        .sort((a, b) => portalOrder(a) - portalOrder(b) || String(a.title).localeCompare(String(b.title)));
      return { project, milestones };
    }).filter((g) => g.milestones.length > 0 || true);
  }, [nodes]);

  const handleSelect = useMemo(
    () => (id: string, active: boolean) => onSelectMilestone(active ? null : id),
    [onSelectMilestone],
  );

  return (
    <div className="flex items-stretch gap-3 px-2 py-1.5 border-b border-border bg-card/40 backdrop-blur-sm overflow-hidden">
      <ScrollArea className="flex-1">
        <div className="flex items-stretch gap-3 min-w-0">
          {grouped.length === 0 && (
            <div className="shrink-0 flex items-center gap-2 px-3 text-[11px] text-muted-foreground/70 italic">
              <Folder className="h-3 w-3" />
              <span>Nenhum projeto/milestone ainda — crie um projeto no Portal ou adicione um milestone aqui para começar.</span>
            </div>
          )}

          {grouped.map(({ project, milestones }) => (
            <div key={project.id} className="shrink-0 flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-md border border-border/60 bg-background/30">
              <div className="flex items-center gap-1.5 pr-1.5 border-r border-border/60 mr-1">
                <Folder className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground max-w-[180px] truncate" title={project.title}>
                  {project.title}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {milestones.length === 0 && (
                  <span className="text-[10px] text-muted-foreground/60 italic px-2">sem milestones</span>
                )}
                {milestones.map((m) => {
                  const active = m.id === selectedMilestoneId;
                  const progress = progressById.get(m.id);
                  return (
                    <MilestoneTab
                      key={m.id}
                      id={m.id}
                      title={m.title}
                      active={active}
                      done={progress?.done ?? 0}
                      total={progress?.total ?? 0}
                      onSelect={handleSelect}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <ScrollBar orientation="horizontal" className="h-1.5" />
      </ScrollArea>
      {syncStatus && <SyncIndicator status={syncStatus} />}
    </div>
  );
}

export default memo(CanvasMilestoneTabsComp);