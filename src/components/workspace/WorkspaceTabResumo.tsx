/**
 * WorkspaceTabResumo — visão geral visual com gráficos reais.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { TrendingUp, ListChecks, Layers, FileText, Clock, AlertTriangle, DollarSign, CalendarClock, CheckCircle2, Circle, User, Tag, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { getStagePremiumLabel } from "./aceleraConstants";
import { getPlanConfig } from "@/lib/planConfig";
import { cn } from "@/lib/utils";

interface TimelineEvent {
  id: string; event_type: string; title: string;
  description: string | null; happened_at: string;
}

interface Props {
  clientName: string; companyName: string | null; workspaceName: string;
  status: string; currentStage: string; ownerName: string | null;
  planName: string | null; segment: string | null; createdAt: string;
  focusAreas: string[] | null; summary: string | null;
  recentEvents: TimelineEvent[]; workspaceId: string;
}

const EVENT_COLORS: Record<string, string> = {
  stage_changed:       "#00FF88",
  task_created:        "#60A5FA",
  task_completed:      "#10B981",
  asset_created:       "#F59E0B",
  canvas_node_created: "#8B5CF6",
  briefing_submitted:  "#EC4899",
};

function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1)  return "agora";
  if (m < 60) return `${m}m atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// Mini donut SVG
function DonutChart({ value, total, color, size = 64 }: { value: number; total: number; color: string; size?: number }) {
  const pct = total > 0 ? value / total : 0;
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="rotate-[-90deg]">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={7} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

// Horizontal bar chart
function BarChart({ items }: { items: Array<{ label: string; value: number; color: string }> }) {
  const max = Math.max(...items.map(i => i.value), 1);
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.label} className="space-y-1">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-semibold tabular-nums" style={{ color: item.color }}>{item.value}</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(item.value / max) * 100}%`, background: item.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function WorkspaceTabResumo({ clientName, companyName, workspaceName, status, currentStage, ownerName, planName, segment, createdAt, focusAreas, summary, recentEvents, workspaceId }: Props) {
  const [tasks, setTasks] = useState({ total: 0, done: 0, in_progress: 0, blocked: 0, todo: 0 });
  const [fronts, setFronts] = useState({ total: 0, active: 0, conditional: 0, out_of_scope: 0 });
  const [briefings, setBriefings] = useState({ total: 0, reviewed: 0 });
  const [nodes, setNodes] = useState({ total: 0, done: 0, active: 0, blocked: 0 });

  const load = useCallback(async () => {
    const [tRes, fRes, bRes, nRes] = await Promise.all([
      supabase.from("tasks").select("id,status").eq("workspace_id", workspaceId),
      supabase.from("operational_fronts").select("id,bucket_status").eq("workspace_id", workspaceId),
      supabase.from("context_entries").select("id,metadata").eq("workspace_id", workspaceId).eq("context_type", "briefing"),
      supabase.from("canvas_nodes").select("id,status").eq("workspace_id", workspaceId),
    ]);
    const t = tRes.data ?? [];
    setTasks({ total: t.length, done: t.filter((x: any) => x.status === "done").length, in_progress: t.filter((x: any) => x.status === "in_progress").length, blocked: t.filter((x: any) => x.status === "blocked").length, todo: t.filter((x: any) => x.status === "todo" || x.status === "backlog").length });
    const f = fRes.data ?? [];
    setFronts({ total: f.length, active: f.filter((x: any) => x.bucket_status === "active").length, conditional: f.filter((x: any) => x.bucket_status === "conditional").length, out_of_scope: f.filter((x: any) => x.bucket_status === "out_of_scope").length });
    const b = bRes.data ?? [];
    setBriefings({ total: b.length, reviewed: b.filter((x: any) => (x.metadata as any)?.import_review_status === "reviewed").length });
    const n = nRes.data ?? [];
    setNodes({ total: n.length, done: n.filter((x: any) => x.status === "done" || x.status === "concluido").length, active: n.filter((x: any) => x.status === "active" || x.status === "ativo").length, blocked: n.filter((x: any) => x.status === "blocked" || x.status === "bloqueado").length });
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const taskPct   = tasks.total   > 0 ? Math.round((tasks.done   / tasks.total)   * 100) : 0;
  const nodePct   = nodes.total   > 0 ? Math.round((nodes.done   / nodes.total)   * 100) : 0;
  const briefPct  = briefings.total > 0 ? Math.round((briefings.reviewed / briefings.total) * 100) : 0;

  const planConfig = getPlanConfig();
  const planInfo = planConfig[planName as keyof typeof planConfig] ?? null;

  const renewalDate = useMemo(() => {
    if (!createdAt) return null;
    const d = new Date(createdAt);
    while (d <= new Date()) d.setMonth(d.getMonth() + 1);
    return d;
  }, [createdAt]);

  const eventGroups = useMemo(() => {
    const map: Record<string, number> = {};
    recentEvents.forEach((e) => { map[e.event_type] = (map[e.event_type] ?? 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [recentEvents]);

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Identity card ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Empresa</p>
            <h2 className="text-xl font-semibold text-foreground">{companyName ?? clientName}</h2>
            {companyName && companyName !== clientName && (
              <p className="text-sm text-muted-foreground">Responsável: <span className="text-foreground">{clientName}</span></p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 items-start">
            <Badge variant="outline" className="text-xs capitalize">{status}</Badge>
            <Badge className="text-xs bg-primary/10 text-primary border-primary/25">{getStagePremiumLabel(currentStage)}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-border">
          {[
            { icon: User, label: "Responsável",  value: ownerName ?? "Não definido" },
            { icon: Tag,  label: "Plano",        value: planInfo?.label ?? planName ?? "Não definido" },
            { icon: Tag,  label: "Segmento",     value: segment ?? "Não definido" },
            { icon: CalendarClock, label: "Início", value: new Date(createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) },
          ].map((item, i) => (
            <div key={i} className={cn("px-4 py-3", i < 3 && "border-r border-border")}>
              <div className="flex items-center gap-1.5 mb-1">
                <item.icon className="h-3 w-3 text-muted-foreground/60" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.label}</p>
              </div>
              <p className="text-sm font-medium text-foreground truncate">{item.value}</p>
            </div>
          ))}
        </div>

        {planInfo && (
          <div className="grid grid-cols-2 sm:grid-cols-3 border-t border-border">
            <div className="px-4 py-3 sm:border-r border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="h-3 w-3 text-primary/60" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor mensal</p>
              </div>
              <p className="text-lg font-bold text-foreground">
                R$ {planInfo.monthly.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
              </p>
            </div>
            <div className="px-4 py-3 sm:border-r border-border">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarClock className="h-3 w-3 text-primary/60" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Próxima renovação</p>
              </div>
              <p className="text-sm font-medium text-foreground">
                {renewalDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" }) ?? "—"}
              </p>
            </div>
            {planInfo.extras.length > 0 && (
              <div className="px-4 py-3 col-span-2 sm:col-span-1">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Adicionais</p>
                <div className="flex flex-wrap gap-1">
                  {planInfo.extras.map((e) => <Badge key={e} variant="secondary" className="text-[10px]">{e}</Badge>)}
                </div>
              </div>
            )}
          </div>
        )}

        {(focusAreas?.length || summary) && (
          <div className="border-t border-border px-5 py-4 space-y-3">
            {focusAreas && focusAreas.length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Áreas de foco</p>
                <div className="flex flex-wrap gap-1.5">
                  {focusAreas.map((a) => <Badge key={a} variant="secondary" className="text-xs capitalize">{a.replace(/_/g, " ")}</Badge>)}
                </div>
              </div>
            )}
            {summary && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3 w-3 text-primary" />
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Resumo executivo</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Metrics grid ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Tasks donut */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="relative shrink-0">
            <DonutChart value={tasks.done} total={tasks.total} color="#10B981" />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{taskPct}%</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tasks</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{tasks.total}</p>
            <p className="text-xs text-emerald-400">{tasks.done} concluídas</p>
            {tasks.blocked > 0 && <p className="text-xs text-amber-400">{tasks.blocked} bloqueadas</p>}
          </div>
        </div>

        {/* Canvas nodes donut */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="relative shrink-0">
            <DonutChart value={nodes.done} total={nodes.total} color="hsl(var(--primary))" />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{nodePct}%</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Canvas</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{nodes.total}</p>
            <p className="text-xs text-primary">{nodes.active} ativos</p>
            {nodes.blocked > 0 && <p className="text-xs text-amber-400">{nodes.blocked} bloqueados</p>}
          </div>
        </div>

        {/* Briefings */}
        <div className="rounded-xl border border-border bg-card p-4 flex items-center gap-3">
          <div className="relative shrink-0">
            <DonutChart value={briefings.reviewed} total={Math.max(briefings.total, 1)} color="#EC4899" />
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{briefPct}%</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Briefings</p>
            <p className="text-lg font-bold text-foreground tabular-nums">{briefings.total}</p>
            <p className="text-xs text-pink-400">{briefings.reviewed} revisados</p>
            {briefings.total > briefings.reviewed && (
              <p className="text-xs text-amber-400">{briefings.total - briefings.reviewed} pendentes</p>
            )}
          </div>
        </div>

        {/* Fronts */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Frentes operacionais</p>
          {fronts.total === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma criada</p>
          ) : (
            <BarChart items={[
              { label: "Ativas",      value: fronts.active,       color: "#10B981" },
              { label: "Condicionais",value: fronts.conditional,  color: "#F59E0B" },
              { label: "Fora do plano",value: fronts.out_of_scope, color: "#6B7280" },
            ]} />
          )}
        </div>
      </div>

      {/* ── Activity + Event types ────────────────────── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
        {/* Timeline feed */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <p className="text-sm font-semibold text-foreground">Atividade recente</p>
            <span className="ml-auto text-xs text-muted-foreground">{recentEvents.length} eventos</span>
          </div>
          <div className="divide-y divide-border/50">
            {recentEvents.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground text-center">Nenhum evento registrado.</p>
            ) : recentEvents.slice(0, 10).map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                  style={{ background: EVENT_COLORS[ev.event_type] ?? "hsl(var(--primary)/0.5)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground leading-tight">{ev.title}</p>
                  {ev.description && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{ev.description}</p>
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{relTime(ev.happened_at)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Event type breakdown */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-sm font-semibold text-foreground">Distribuição de eventos</p>
          </div>
          <div className="px-4 py-4">
            {eventGroups.length === 0 ? (
              <p className="text-xs text-muted-foreground">Sem eventos.</p>
            ) : (
              <BarChart items={eventGroups.map(([type, count]) => ({
                label: type.replace(/_/g, " "),
                value: count,
                color: EVENT_COLORS[type] ?? "hsl(var(--primary)/0.6)",
              }))} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
