/**
 * MetricaNodeDrawer
 *
 * Wrapper pra nodes "metrica". Adiciona:
 *  - Gráfico de linha com snapshots históricos da `metric_key` (ou label)
 *    extraída do prefill (kpi.name) ou do data.metric_key do node
 *  - Filtro por horizonte (30/90/365 dias / tudo)
 *  - Linha de meta (h30) sobreposta quando definida
 */
import { useEffect, useMemo, useState } from "react";
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import { getNodeBlueprint } from "./nodeBlueprints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BarChart3, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { useCanvasNodeMetadata } from "@/hooks/useCanvasNodeMetadata";
import { useNodeQuickActions } from "@/hooks/useNodeQuickActions";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import type { NodePrefillPayload } from "./nodePrefillTypes";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onCreateFront?: () => void;
}

interface SnapshotRow {
  id: string;
  metric_key: string;
  metric_label: string | null;
  metric_value: number | null;
  metric_unit: string | null;
  captured_at: string;
}

type Horizon = "30" | "90" | "365" | "all";

const HORIZONS: Array<{ key: Horizon; label: string; days: number | null }> = [
  { key: "30",  label: "30d", days: 30  },
  { key: "90",  label: "90d", days: 90  },
  { key: "365", label: "1a",  days: 365 },
  { key: "all", label: "Tudo",days: null },
];

function getStringField(payload: NodePrefillPayload | null, sectionId: string, fieldId: string): string {
  const f = payload?.sections?.[sectionId]?.fields?.[fieldId];
  return typeof f?.value === "string" ? f.value : "";
}

function parseTargetNumber(raw: string): number | null {
  if (!raw) return null;
  // extrai primeiro número do texto (ex: "60% conversão" → 60)
  const m = raw.replace(/\./g, "").match(/-?\d+(?:[,.]\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0].replace(",", "."));
  return isNaN(n) ? null : n;
}

export default function MetricaNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete, onCreateFront,
}: Props) {
  const blueprint = getNodeBlueprint("metrica");
  const [snapshots, setSnapshots] = useState<SnapshotRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>("90");
  const { prefill } = useCanvasNodeMetadata({ nodeId: node.id, open });
  const { handlers: baseHandlers, dialogs } = useNodeQuickActions({
    node, open, workspaceId, clientId, clientName,
  });

  // Identificador da métrica
  const kpiName = getStringField(prefill, "kpi", "name").trim();
  const targetH30 = parseTargetNumber(getStringField(prefill, "targets", "h30"));

  const dataMetricKey = useMemo(() => {
    const data = node.data as Record<string, unknown> | null;
    return (data?.metric_key as string | undefined) ?? null;
  }, [node.data]);

  // Carrega snapshots filtrando por metric_key (preferência) ou metric_label match
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      let q = supabase
        .from("metric_snapshots")
        .select("id, metric_key, metric_label, metric_value, metric_unit, captured_at")
        .eq("client_id", clientId)
        .order("captured_at", { ascending: true });

      if (dataMetricKey) {
        q = q.eq("metric_key", dataMetricKey);
      } else if (kpiName) {
        q = q.ilike("metric_label", `%${kpiName.slice(0, 30)}%`);
      }

      const { data, error } = await q.limit(200);
      if (!alive) return;
      if (error) {
        console.error("snapshots fetch error", error);
        setSnapshots([]);
      } else {
        setSnapshots((data ?? []) as SnapshotRow[]);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open, clientId, dataMetricKey, kpiName]);

  // Filtra por horizonte
  const filtered = useMemo(() => {
    const cfg = HORIZONS.find((h) => h.key === horizon);
    if (!cfg?.days) return snapshots;
    const cutoff = Date.now() - cfg.days * 24 * 3600 * 1000;
    return snapshots.filter((s) => new Date(s.captured_at).getTime() >= cutoff);
  }, [snapshots, horizon]);

  const chartData = useMemo(
    () => filtered
      .filter((s) => s.metric_value != null)
      .map((s) => ({
        date: new Date(s.captured_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }),
        value: s.metric_value,
        label: s.metric_label,
        unit: s.metric_unit,
        ts: new Date(s.captured_at).getTime(),
      }))
      .sort((a, b) => a.ts - b.ts),
    [filtered],
  );

  const currentValue = chartData[chartData.length - 1]?.value ?? null;
  const previousValue = chartData[chartData.length - 2]?.value ?? null;
  const delta = currentValue != null && previousValue != null && previousValue !== 0
    ? ((currentValue - previousValue) / Math.abs(previousValue)) * 100
    : null;

  const unit = chartData[chartData.length - 1]?.unit ?? "";

  if (!blueprint) return null;

  const handlers = {
    ...baseHandlers,
    ...(onCreateFront && { create_front: onCreateFront }),
  };

  const extraSlot = (
    <div className="space-y-3">
      {/* ─── Header KPI ─── */}
      <div className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="h-7 w-7 rounded-md bg-orange-500/15 border border-orange-500/30 flex items-center justify-center shrink-0">
              <BarChart3 className="h-3.5 w-3.5 text-orange-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate">{kpiName || "KPI"}</p>
              <p className="text-[10px] text-muted-foreground">
                {chartData.length} snapshot{chartData.length === 1 ? "" : "s"} · janela {HORIZONS.find((h) => h.key === horizon)?.label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {HORIZONS.map((h) => (
              <Button
                key={h.key} size="sm"
                variant={horizon === h.key ? "default" : "outline"}
                onClick={() => setHorizon(h.key)}
                className="h-6 px-2 text-[10px]"
              >{h.label}</Button>
            ))}
          </div>
        </div>

        {/* Stats line */}
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Atual</p>
            <p className="text-xl font-bold tabular-nums leading-none">
              {currentValue != null ? currentValue.toLocaleString("pt-BR") : "—"}
              {unit && <span className="text-xs text-muted-foreground ml-1 font-normal">{unit}</span>}
            </p>
          </div>
          {delta != null && (
            <div className={cn(
              "flex items-center gap-1 mb-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold tabular-nums",
              delta > 0  ? "bg-emerald-500/15 text-emerald-400" :
              delta < 0  ? "bg-rose-500/15 text-rose-400" :
              "bg-muted text-muted-foreground",
            )}>
              {delta > 0 ? <TrendingUp className="h-3 w-3" /> :
               delta < 0 ? <TrendingDown className="h-3 w-3" /> :
               <Minus className="h-3 w-3" />}
              {delta > 0 ? "+" : ""}{delta.toFixed(1)}%
            </div>
          )}
          {targetH30 != null && (
            <div>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Meta 30d</p>
              <p className="text-sm font-semibold text-amber-400 tabular-nums">
                {targetH30.toLocaleString("pt-BR")}{unit}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Gráfico ─── */}
      <div className="rounded-lg border border-border bg-card/40 p-3">
        {loading ? (
          <div className="h-40 flex items-center justify-center text-[11px] text-muted-foreground">
            Carregando snapshots…
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center gap-2 text-center">
            <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground">
              Sem snapshots {dataMetricKey || kpiName ? "pra essa métrica" : "ainda"}.
            </p>
            {onCreateSnapshot && (
              <Button size="sm" variant="outline" onClick={onCreateSnapshot} className="h-7 text-[11px]">
                Criar primeiro snapshot
              </Button>
            )}
          </div>
        ) : (
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                {targetH30 != null && (
                  <ReferenceLine y={targetH30} stroke="hsl(var(--accent-foreground))" strokeDasharray="4 4" opacity={0.5}
                    label={{ value: "meta", fill: "hsl(var(--muted-foreground))", fontSize: 9, position: "right" }} />
                )}
                <Line
                  type="monotone" dataKey="value"
                  stroke="hsl(24 100% 60%)" strokeWidth={2}
                  dot={{ r: 3, fill: "hsl(24 100% 60%)" }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {!dataMetricKey && !kpiName && (
        <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400">
          Defina o nome do KPI na seção 'KPI' pra carregar histórico
        </Badge>
      )}
    </div>
  );

  return (
    <SpecializedNodeDrawer
      node={node}
      open={open}
      onOpenChange={onOpenChange}
      workspaceId={workspaceId}
      clientId={clientId}
      blueprintOverride={blueprint}
      quickActionHandlers={handlers}
      onDelete={onDelete}
      extraSlot={extraSlot}
    />
  );
}
