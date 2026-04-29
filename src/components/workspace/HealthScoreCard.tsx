/**
 * HealthScoreCard — saúde operacional do cliente (USO INTERNO).
 *
 * NUNCA exibir no portal do cliente — é sinal privado do time.
 *
 * Duas variantes:
 *  - "full": card completo com 4 dimensões + insights + warnings
 *  - "compact": badge pequeno (usado em listas de clientes)
 *
 * Busca automaticamente todos os dados necessários do Supabase.
 */
import { useEffect, useState, useMemo } from "react";
import { Activity, AlertTriangle, CheckCircle2, Heart, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateHealthScore, getHealthLevelColor, getHealthLevelLabel,
  type HealthScore, type HealthSignals,
} from "@/lib/healthScore";
import { cn } from "@/lib/utils";
import { syncScoresUpdated } from "./syncToPortalEvents";

interface Props {
  clientId: string;
  workspaceId?: string;
  clientMetadata?: Record<string, unknown> | null;
  currentStage?: string;
  variant?: "full" | "compact";
}

const STAGES = [
  "entrada","diagnostico","estrutura_base","planejamento",
  "producao","ativacao","otimizacao","expansao",
];

export default function HealthScoreCard({ clientId, workspaceId, clientMetadata, currentStage, variant = "full" }: Props) {
  const [score, setScore] = useState<HealthScore | null>(null);
  const [loading, setLoading] = useState(true);

  // Briefing completeness from metadata
  const briefingPct = useMemo(() => {
    const eb = (clientMetadata?.essential_briefing as Record<string, string> | undefined);
    if (!eb) return 0;
    const fields = ["positioning","differential","icp","main_pains","goals_12m","success_metric","revenue_range","team_size"];
    const filled = fields.filter((f) => (eb[f] ?? "").toString().trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [clientMetadata]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const now = Date.now();
      const d7 = new Date(now - 7 * 86400000).toISOString();
      const d30 = new Date(now - 30 * 86400000).toISOString();

      // Scope: workspace-specific if provided, otherwise client-wide
      const scopeFilter = workspaceId ? { workspace_id: workspaceId } : { client_id: clientId };

      const [nodes, tasks, events, contexts, briefings, snapshots] = await Promise.all([
        supabase.from("canvas_nodes").select("status, data").match(scopeFilter),
        supabase.from("tasks").select("status, due_date").match(scopeFilter),
        supabase.from("timeline_events").select("happened_at").match(scopeFilter)
          .order("happened_at", { ascending: false }).limit(100),
        supabase.from("context_entries").select("id").match(scopeFilter),
        supabase.from("context_entries").select("id").match(scopeFilter).eq("context_type", "briefing"),
        supabase.from("metric_snapshots").select("captured_at").match(scopeFilter)
          .gte("captured_at", d30),
      ]);

      const n = nodes.data ?? [];
      const t = tasks.data ?? [];
      const e = events.data ?? [];

      const overdueNodes = t.filter((task: any) =>
        task.due_date && task.status !== "done" && new Date(task.due_date).getTime() < now
      ).length;

      const lastEventTime = e.length > 0 ? new Date(e[0].happened_at as string).getTime() : 0;
      const daysSinceLastEvent = lastEventTime > 0 ? Math.floor((now - lastEventTime) / 86400000) : 999;

      const signals: HealthSignals = {
        totalNodes: n.length,
        doneNodes: n.filter((x: any) => x.status === "done" || x.status === "concluido").length,
        activeNodes: n.filter((x: any) => x.status === "active" || x.status === "ativo").length,
        blockedNodes: n.filter((x: any) => x.status === "blocked" || x.status === "bloqueado").length,
        overdueNodes,
        totalTasks: t.length,
        doneTasks: t.filter((x: any) => x.status === "done").length,
        blockedTasks: t.filter((x: any) => x.status === "blocked").length,
        eventsLast7d: e.filter((x: any) => new Date(x.happened_at).toISOString() >= d7).length,
        eventsLast30d: e.filter((x: any) => new Date(x.happened_at).toISOString() >= d30).length,
        daysSinceLastEvent,
        essentialBriefingPct: briefingPct,
        contextEntries: contexts.data?.length ?? 0,
        briefingsCount: briefings.data?.length ?? 0,
        currentStageIndex: Math.max(0, STAGES.indexOf(currentStage ?? "entrada")),
        totalStages: STAGES.length,
        metricSnapshotsLast30d: snapshots.data?.length ?? 0,
      };

      if (!cancelled) {
        const calculated = calculateHealthScore(signals);
        setScore(calculated);
        // Persiste fire-and-forget — não bloqueia a UI
        if (calculated && clientId) {
          (async () => {
            const { data: current } = await supabase
              .from("clients").select("metadata").eq("id", clientId).single();
            const meta = (current?.metadata as Record<string, any>) ?? {};
            await supabase.from("clients").update({
              metadata: { ...meta, health_score: calculated, health_score_at: new Date().toISOString() },
            }).eq("id", clientId);
            syncScoresUpdated({ workspaceId, clientId, healthScore: calculated.score });
          })().catch(() => {});
        }
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, workspaceId, briefingPct, currentStage]);

  if (variant === "compact") return <CompactBadge score={score} loading={loading} />;
  return <FullCard score={score} loading={loading} />;
}

// ═══ Compact badge ═══════════════════════════════════════════

function CompactBadge({ score, loading }: { score: HealthScore | null; loading: boolean }) {
  if (loading || !score) return <span className="text-[10px] text-muted-foreground/40">—</span>;
  const color = getHealthLevelColor(score.level);
  return (
    <div className="flex items-center gap-1.5" title={`Health ${score.score}/100 · ${getHealthLevelLabel(score.level)}`}>
      <Heart className="h-3 w-3" style={{ color }} fill={score.level === "healthy" ? color : "none"} />
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>{score.score}</span>
    </div>
  );
}

// ═══ Full card ══════════════════════════════════════════════

function FullCard({ score, loading }: { score: HealthScore | null; loading: boolean }) {
  if (loading || !score) {
    return (
      <div className="rounded-xl border border-border bg-card h-36 animate-pulse flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Calculando Health Score...</span>
      </div>
    );
  }

  const color = getHealthLevelColor(score.level);
  const label = getHealthLevelLabel(score.level);

  // Ring
  const size = 88, stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(score.score, 100) / 100) * c;

  return (
    <div className="rounded-xl border bg-card overflow-hidden" style={{ borderColor: `${color}40` }}>
      {/* Header strip */}
      <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: `${color}10` }}>
        <Heart className="h-3 w-3" style={{ color }} fill={color} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>Health Score · Interno</span>
        <span className="ml-auto text-[10px] text-muted-foreground italic">nunca mostrar ao cliente</span>
      </div>

      <div className="flex items-start gap-4 px-5 py-4">
        {/* Ring */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={stroke} />
            <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.7s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold tabular-nums" style={{ color }}>{score.score}</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">/ 100</span>
          </div>
        </div>

        {/* Dimensions */}
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-sm font-bold mb-1" style={{ color }}>{label}</p>
          <DimensionBar label="Atividade"   value={score.dimensions.activity}   color={color} />
          <DimensionBar label="Engajamento" value={score.dimensions.engagement} color={color} />
          <DimensionBar label="Contexto"    value={score.dimensions.context}    color={color} />
          <DimensionBar label="Progresso"   value={score.dimensions.progress}   color={color} />
        </div>
      </div>

      {/* Warnings */}
      {score.warnings.length > 0 && (
        <div className="px-5 py-3 border-t border-border/40 bg-secondary/10 space-y-1.5">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3 w-3 text-amber-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
              {score.warnings.length} alerta{score.warnings.length > 1 ? "s" : ""}
            </p>
          </div>
          {score.warnings.map((w, i) => (
            <p key={i} className="text-[11px] text-amber-400/85 leading-snug flex items-start gap-1.5">
              <span className="text-amber-400/60 shrink-0">→</span>{w}
            </p>
          ))}
        </div>
      )}

      {/* Insights (positive) */}
      {score.insights.length > 0 && (
        <div className="px-5 py-3 border-t border-border/40 space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Pontos positivos</p>
          </div>
          {score.insights.map((ins, i) => (
            <p key={i} className="text-[11px] text-muted-foreground leading-snug flex items-start gap-1.5">
              <span className="text-emerald-400/60 shrink-0">✓</span>{ins}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function DimensionBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums" style={{ color }}>{Math.round(value)}</span>
      </div>
      <div className="h-1 rounded-full bg-secondary overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.min(value, 100)}%`, background: color }} />
      </div>
    </div>
  );
}
