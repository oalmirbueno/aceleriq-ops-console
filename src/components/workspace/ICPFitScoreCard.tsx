/**
 * ICPFitScoreCard — avaliação de qualificação do cliente (USO INTERNO).
 *
 * NUNCA exibir no portal do cliente. É decisão comercial/estratégica privada.
 *
 * Duas variantes:
 *  - "compact": badge de crachá para listas
 *  - "full": card com dimensões, insights, red flags e recomendação de plano
 */
import { useEffect, useMemo } from "react";
import { Target, AlertTriangle, CheckCircle2, ArrowUp, ArrowDown, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateICPFitScore, getICPLevelColor, getICPLevelLabel, getPlanDisplayName,
  type ICPFitScore, type ICPSignals,
} from "@/lib/icpFitScore";
import type { PlanKey } from "@/lib/planConfig";
import { cn } from "@/lib/utils";

interface Props {
  clientMetadata: Record<string, unknown> | null | undefined;
  currentPlan?: PlanKey | string | null;
  variant?: "full" | "compact";
  clientId?: string;
}

export default function ICPFitScoreCard({ clientMetadata, currentPlan, variant = "full", clientId }: Props) {
  const score: ICPFitScore = useMemo(() => {
    const eb = (clientMetadata?.essential_briefing as Record<string, unknown> | undefined) ?? {};
    const signals: ICPSignals = {
      revenue_range:    eb.revenue_range as string | undefined,
      team_size:        eb.team_size as string | undefined,
      maturity_digital: eb.maturity_digital as string | undefined,
      ai_readiness:     eb.ai_readiness as string | undefined,
      positioning:      eb.positioning as string | undefined,
      differential:     eb.differential as string | undefined,
      icp:              eb.icp as string | undefined,
      main_pains:       eb.main_pains as string | undefined,
      goals_12m:        eb.goals_12m as string | undefined,
      success_metric:   eb.success_metric as string | undefined,
      currentPlan:      currentPlan as PlanKey | null | undefined,
    };
    return calculateICPFitScore(signals);
  }, [clientMetadata, currentPlan]);

  // Persiste fire-and-forget no clients.metadata quando clientId disponível
  useEffect(() => {
    if (!clientId || score.level === "no_data") return;
    (async () => {
      const { data: current } = await supabase
        .from("clients").select("metadata").eq("id", clientId).single();
      const meta = (current?.metadata as Record<string, any>) ?? {};
      await supabase.from("clients").update({
        metadata: { ...meta, icp_fit_score: score, icp_fit_score_at: new Date().toISOString() },
      }).eq("id", clientId);
    })().catch(() => {});
  }, [clientId, score]);

  if (variant === "compact") return <Compact score={score} />;
  return <Full score={score} />;
}

// ═══ Compact ══════════════════════════════════════════════════

function Compact({ score }: { score: ICPFitScore }) {
  const color = getICPLevelColor(score.level);
  return (
    <div className="flex items-center gap-1.5" title={`ICP-Fit · ${score.score}/100 · ${getICPLevelLabel(score.level)}`}>
      <Target className="h-3 w-3" style={{ color }} />
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        {score.level === "no_data" ? "—" : score.score}
      </span>
    </div>
  );
}

// ═══ Full ════════════════════════════════════════════════════

function Full({ score }: { score: ICPFitScore }) {
  const color = getICPLevelColor(score.level);
  const label = getICPLevelLabel(score.level);

  // Ring
  const size = 88, stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(score.score, 100) / 100) * c;

  return (
    <div className="rounded-xl border bg-card overflow-hidden" style={{ borderColor: `${color}40` }}>
      {/* Header strip */}
      <div className="px-3 py-1.5 flex items-center gap-1.5" style={{ background: `${color}10` }}>
        <Shield className="h-3 w-3" style={{ color }} />
        <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
          ICP-Fit · Interno
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground italic">
          nunca mostrar ao cliente
        </span>
      </div>

      {/* Main */}
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
            <Target className="h-4 w-4 mb-0.5" style={{ color }} />
            <span className="text-xl font-bold tabular-nums" style={{ color }}>
              {score.level === "no_data" ? "—" : score.score}
            </span>
            {score.level !== "no_data" && (
              <span className="text-[9px] text-muted-foreground uppercase tracking-wider">/100</span>
            )}
          </div>
        </div>

        {/* Dimensions */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold mb-2" style={{ color }}>{label}</p>
          <div className="space-y-1.5">
            <Bar label="Faturamento" value={score.dimensions.revenue} color={color} />
            <Bar label="Maturidade digital" value={score.dimensions.maturity} color={color} />
            <Bar label="Prontidão IA" value={score.dimensions.ai} color={color} />
            <Bar label="Time & recursos" value={score.dimensions.team} color={color} />
            <Bar label="Engajamento (briefing)" value={score.dimensions.commitment} color={color} />
          </div>
        </div>
      </div>

      {/* Plano recomendado */}
      {score.recommendedPlan && score.planMatchStatus !== "unknown" && (
        <div
          className={cn("px-5 py-3 border-t border-border/40 flex items-center gap-2",
            score.planMatchStatus === "match" && "bg-emerald-400/5",
            score.planMatchStatus === "upgrade_available" && "bg-blue-400/5",
            score.planMatchStatus === "downgrade_needed" && "bg-red-400/5",
          )}>
          {score.planMatchStatus === "match" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
          {score.planMatchStatus === "upgrade_available" && <ArrowUp className="h-3.5 w-3.5 text-blue-400" />}
          {score.planMatchStatus === "downgrade_needed" && <ArrowDown className="h-3.5 w-3.5 text-red-400" />}
          <div className="flex-1 text-xs">
            <span className="font-semibold">
              {score.planMatchStatus === "match" && "Plano alinhado com perfil"}
              {score.planMatchStatus === "upgrade_available" && `Perfil suporta ${getPlanDisplayName(score.recommendedPlan)}`}
              {score.planMatchStatus === "downgrade_needed" && `Perfil sugere ${getPlanDisplayName(score.recommendedPlan)}`}
            </span>
            {score.planMatchStatus === "upgrade_available" && (
              <span className="text-muted-foreground ml-1">— oportunidade de upsell</span>
            )}
            {score.planMatchStatus === "downgrade_needed" && (
              <span className="text-muted-foreground ml-1">— risco de churn por preço</span>
            )}
          </div>
        </div>
      )}

      {/* Red flags */}
      {score.redFlags.length > 0 && (
        <div className="px-5 py-3 border-t border-border/40 bg-red-400/5 space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3 w-3 text-red-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">
              {score.redFlags.length} alerta{score.redFlags.length > 1 ? "s" : ""}
            </p>
          </div>
          {score.redFlags.map((f, i) => (
            <p key={i} className="text-[11px] text-red-400/85 leading-snug flex items-start gap-1.5">
              <span className="text-red-400/60 shrink-0">→</span>{f}
            </p>
          ))}
        </div>
      )}

      {/* Positive insights */}
      {score.insights.length > 0 && (
        <div className="px-5 py-3 border-t border-border/40 space-y-1">
          <div className="flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Pontos fortes</p>
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

function Bar({ label, value, color }: { label: string; value: number; color: string }) {
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
