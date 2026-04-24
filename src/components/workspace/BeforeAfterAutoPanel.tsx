/**
 * BeforeAfterAutoPanel — comparação AUTOMÁTICA entre baseline (primeiro snapshot)
 * e estado atual (último snapshot) de cada métrica do cliente.
 *
 * Uso duplo:
 *  - Ops: time vê os ganhos pra argumentar renovação
 *  - Portal (futuro): cliente vê como prova de valor
 *
 * Se uma métrica tem <2 snapshots, mostra "sem baseline ainda" e pede
 * pra registrar mais uma medição no futuro.
 */
import { useEffect, useState, useCallback } from "react";
import {
  TrendingUp, TrendingDown, Minus, BarChart3, Calendar,
  Download, Share2, Copy, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  computeBeforeAfter, formatDeltaValue, formatDeltaPct,
  getBeforeAfterStatusColor, getBeforeAfterStatusLabel,
  type MetricSnapshot, type BeforeAfterMetric,
} from "@/lib/beforeAfter";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string;
  clientId: string;
}

export default function BeforeAfterAutoPanel({ workspaceId, clientId }: Props) {
  const [metrics, setMetrics] = useState<BeforeAfterMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("metric_snapshots")
      .select("id, metric_name, value, unit, notes, captured_at")
      .eq("workspace_id", workspaceId)
      .order("captured_at", { ascending: true });
    const snapshots = (data ?? []) as MetricSnapshot[];
    setMetrics(computeBeforeAfter(snapshots));
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  // Realtime: atualiza quando novo snapshot é criado
  useEffect(() => {
    const ch = supabase
      .channel(`ba-snapshots:${workspaceId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "metric_snapshots", filter: `workspace_id=eq.${workspaceId}` },
        () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, load]);

  const improved = metrics.filter(m => m.status === "improved");
  const stable = metrics.filter(m => m.status === "stable");
  const regressed = metrics.filter(m => m.status === "regressed");
  const noBaseline = metrics.filter(m => m.status === "no_baseline");

  const exportSummary = () => {
    const lines: string[] = ["# Before / After — Resultados por métrica\n"];
    if (improved.length > 0) {
      lines.push("## Ganhos confirmados\n");
      improved.forEach(m => {
        lines.push(`- **${m.metric_name}**: ${m.baseline.value}${m.unit ?? ""} → ${m.current.value}${m.unit ?? ""} (${formatDeltaPct(m) ?? formatDeltaValue(m)}) em ${m.daysBetween} dias`);
      });
    }
    if (stable.length > 0) {
      lines.push("\n## Métricas estáveis\n");
      stable.forEach(m => {
        lines.push(`- **${m.metric_name}**: ${m.current.value}${m.unit ?? ""}`);
      });
    }
    if (regressed.length > 0) {
      lines.push("\n## Atenção necessária\n");
      regressed.forEach(m => {
        lines.push(`- **${m.metric_name}**: ${m.baseline.value}${m.unit ?? ""} → ${m.current.value}${m.unit ?? ""} (${formatDeltaPct(m) ?? formatDeltaValue(m)})`);
      });
    }
    const text = lines.join("\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Resumo copiado para clipboard" });
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-4 h-40 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/50 bg-card/30 px-5 py-6 text-center">
        <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
        <p className="text-sm font-medium text-muted-foreground">Nenhuma métrica capturada ainda</p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          Registre snapshots de métricas (via node Métrica) para gerar comparações automáticas aqui.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <button type="button" onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-5 py-3 bg-secondary/20 border-b border-border hover:bg-secondary/30 transition-colors">
        <BarChart3 className="h-4 w-4 text-primary" />
        <div className="flex-1 text-left">
          <p className="text-sm font-semibold text-foreground">Before / After automático</p>
          <p className="text-[11px] text-muted-foreground">
            Calculado a partir de {metrics.reduce((s, m) => s + m.history.length, 0)} snapshots de {metrics.length} métricas
          </p>
        </div>
        <div className="flex items-center gap-2">
          {improved.length > 0 && (
            <Badge className="text-[10px] bg-emerald-400/10 text-emerald-400 border-emerald-400/25">
              ↑ {improved.length} ganho{improved.length > 1 ? "s" : ""}
            </Badge>
          )}
          {regressed.length > 0 && (
            <Badge className="text-[10px] bg-red-400/10 text-red-400 border-red-400/25">
              ↓ {regressed.length} piorou
            </Badge>
          )}
          {expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <>
          {/* Action bar */}
          <div className="px-5 py-2 border-b border-border/40 flex items-center gap-2 bg-card/50">
            <Button onClick={exportSummary} size="sm" variant="ghost" className="h-7 text-xs gap-1.5">
              <Copy className="h-3 w-3" /> Copiar resumo markdown
            </Button>
          </div>

          {/* Metric cards grid */}
          <div className="p-5 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m, idx) => <MetricDeltaCard key={idx} m={m} />)}
          </div>
        </>
      )}
    </div>
  );
}

// ═══ Individual metric card with sparkline ═══════════════════

function MetricDeltaCard({ m }: { m: BeforeAfterMetric }) {
  const color = getBeforeAfterStatusColor(m.status);
  const statusLabel = getBeforeAfterStatusLabel(m.status);
  const deltaValueStr = formatDeltaValue(m);
  const deltaPctStr = formatDeltaPct(m);
  const Icon = m.status === "improved" ? TrendingUp : m.status === "regressed" ? TrendingDown : Minus;

  return (
    <div className="rounded-xl border bg-background/40 overflow-hidden" style={{ borderColor: `${color}25` }}>
      {/* Top strip */}
      <div className="h-0.5 w-full" style={{ background: color }} />

      <div className="p-4 space-y-3">
        {/* Metric name + status */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-foreground line-clamp-1">{m.metric_name}</p>
            <span className="text-[9px] font-bold uppercase tracking-widest" style={{ color }}>
              {statusLabel}
            </span>
          </div>
          <div className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
            style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
            <Icon className="h-3.5 w-3.5" style={{ color }} />
          </div>
        </div>

        {/* Before → After values */}
        {m.status !== "no_baseline" ? (
          <>
            <div className="grid grid-cols-2 gap-2 py-1">
              <div className="rounded-lg bg-secondary/30 px-2 py-1.5">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Antes</p>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  {m.baseline.value}
                  {m.unit && <span className="text-[10px] text-muted-foreground ml-0.5">{m.unit}</span>}
                </p>
              </div>
              <div className="rounded-lg px-2 py-1.5" style={{ background: `${color}10` }}>
                <p className="text-[9px] uppercase tracking-wider" style={{ color }}>Depois</p>
                <p className="text-sm font-bold tabular-nums" style={{ color }}>
                  {m.current.value}
                  {m.unit && <span className="text-[10px] opacity-70 ml-0.5">{m.unit}</span>}
                </p>
              </div>
            </div>

            {/* Delta */}
            <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/30">
              <span className="text-[10px] text-muted-foreground">
                {m.daysBetween} dias
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold tabular-nums" style={{ color }}>{deltaValueStr}</span>
                {deltaPctStr && (
                  <span className="text-[10px] font-semibold tabular-nums" style={{ color }}>
                    ({deltaPctStr})
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-lg bg-secondary/30 px-2 py-2 text-center">
            <p className="text-sm font-bold text-foreground tabular-nums">
              {m.current.value}{m.unit ? ` ${m.unit}` : ""}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              1 snapshot registrado · capture mais para ver delta
            </p>
          </div>
        )}

        {/* Mini sparkline */}
        {m.history.length >= 2 && <Sparkline values={m.history.map(h => h.value)} color={color} />}
      </div>
    </div>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 200;
  const h = 28;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-6">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        opacity={0.8}
        vectorEffect="non-scaling-stroke"
      />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * w;
        const y = h - ((v - min) / range) * h;
        return <circle key={i} cx={x} cy={y} r={1.5} fill={color} />;
      })}
    </svg>
  );
}
