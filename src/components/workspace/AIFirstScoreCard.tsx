/**
 * AIFirstScoreCard — card visual que mostra o AI-First Score do cliente.
 *
 * Duas variantes:
 *  - "full": card grande com ring, métricas, status (WorkspaceDetailPage hero)
 *  - "compact": badge pequeno inline (ClientsPage, listagens)
 *
 * Calcula em tempo real a partir dos canvas_nodes do cliente.
 */
import { useEffect, useState } from "react";
import { Brain, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateAIFirstScore,
  getAIFirstStatusLabel,
  getAIFirstStatusColor,
  type AIFirstScore,
  type NodeForScore,
} from "@/lib/aiFirstScore";
import { cn } from "@/lib/utils";

interface Props {
  clientId: string;
  planName: string | null;
  variant?: "full" | "compact";
  /** Pass pre-fetched nodes to avoid duplicate query */
  preloadedNodes?: NodeForScore[];
}

export default function AIFirstScoreCard({ clientId, planName, variant = "full", preloadedNodes }: Props) {
  const [score, setScore] = useState<AIFirstScore | null>(null);
  const [loading, setLoading] = useState(!preloadedNodes);

  useEffect(() => {
    if (preloadedNodes) {
      setScore(calculateAIFirstScore(preloadedNodes, planName));
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("canvas_nodes")
        .select("node_type, data")
        .eq("client_id", clientId);
      if (!cancelled) {
        setScore(calculateAIFirstScore((data ?? []) as NodeForScore[], planName));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [clientId, planName, preloadedNodes]);

  if (variant === "compact") {
    return <CompactBadge score={score} loading={loading} />;
  }
  return <FullCard score={score} loading={loading} />;
}

// ═══ Compact badge ═══════════════════════════════════════════

function CompactBadge({ score, loading }: { score: AIFirstScore | null; loading: boolean }) {
  if (loading || !score) {
    return <span className="text-[10px] text-muted-foreground/40">—</span>;
  }
  const color = getAIFirstStatusColor(score.status);
  return (
    <div className="flex items-center gap-1.5" title={`AI-First · ${score.score}% (meta: ${score.target}%)`}>
      <Brain className="h-3 w-3" style={{ color }} />
      <span className="text-xs font-semibold tabular-nums" style={{ color }}>
        {score.score}%
      </span>
      <span className="text-[10px] text-muted-foreground/60">/{score.target}%</span>
    </div>
  );
}

// ═══ Full card with progress ring ════════════════════════════

function FullCard({ score, loading }: { score: AIFirstScore | null; loading: boolean }) {
  if (loading || !score) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 h-32 animate-pulse flex items-center justify-center">
        <span className="text-xs text-muted-foreground">Calculando AI-First Score...</span>
      </div>
    );
  }

  const color = getAIFirstStatusColor(score.status);
  const statusLabel = getAIFirstStatusLabel(score.status);

  // Ring math
  const size = 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(score.score, 100) / 100) * c;
  const targetDash = (score.target / 100) * c;

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-4 px-5 py-4">
        {/* Progress ring */}
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            {/* Track */}
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke="hsl(var(--secondary))" strokeWidth={stroke} />
            {/* Target indicator (thin) */}
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={`${color}40`} strokeWidth={2}
              strokeDasharray={`${targetDash} ${c}`}
              strokeLinecap="round" />
            {/* Actual score */}
            <circle cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={color} strokeWidth={stroke}
              strokeDasharray={`${dash} ${c}`}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.7s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Brain className="h-4 w-4" style={{ color }} />
            <span className="text-lg font-bold tabular-nums mt-0.5" style={{ color }}>
              {score.score}%
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              AI-First Score
            </p>
            {score.delta > 0 && (
              <TrendingUp className="h-3 w-3 text-emerald-400" />
            )}
            {score.delta < -5 && score.status !== "no_data" && (
              <TrendingDown className="h-3 w-3 text-amber-400" />
            )}
            {score.status === "no_data" && (
              <Minus className="h-3 w-3 text-muted-foreground" />
            )}
          </div>
          <p className="text-sm font-semibold" style={{ color }}>{statusLabel}</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[10px]">
            <div>
              <p className="text-muted-foreground uppercase tracking-wider">Meta plano</p>
              <p className="font-semibold text-foreground tabular-nums">{score.target}%</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase tracking-wider">Nodes IA</p>
              <p className="font-semibold text-foreground tabular-nums">{score.aiNodes}</p>
            </div>
            <div>
              <p className="text-muted-foreground uppercase tracking-wider">Automações</p>
              <p className="font-semibold text-foreground tabular-nums">{score.automationNodes}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom hint */}
      <div className="px-5 py-2 border-t border-border/40 bg-secondary/20">
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          {score.status === "no_data" && "Adicione nodes no canvas para começar a medir o AI-First Score."}
          {score.status === "below" && `Operação ${Math.abs(score.delta)}pp abaixo da meta. Considere adicionar agentes IA e automações.`}
          {score.status === "on_track" && "Densidade de IA na operação está alinhada com o plano contratado."}
          {score.status === "above" && `Superando a meta em ${score.delta}pp — operação verdadeiramente AI-first.`}
        </p>
      </div>
    </div>
  );
}
