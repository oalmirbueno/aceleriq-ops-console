/**
 * useLinkedStepMetrics
 *
 * Quando um step do funil tem `linked_node_id`, puxa automaticamente as métricas
 * mais recentes do node vinculado a partir de `metric_snapshots`.
 *
 * Estratégia de resolução (sem coluna node_id em snapshots):
 *  1) Carrega o node vinculado (canvas_nodes) → extrai `data.metric_keys[]` se houver.
 *  2) Faz interseção com os `metricKeys` esperados pelo bloco do funil.
 *     Se vazia, usa todos os `metricKeys` do bloco (fallback amplo).
 *  3) Para cada metric_key resolvido, busca o snapshot mais recente do cliente.
 *  4) Caso o node tenha `data.metrics` (jsonb estático), também é considerado
 *     como fonte secundária pra preencher chaves sem snapshot.
 *
 * Retorna mapa `{ [metric_key]: { value, unit, captured_at, source } }`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getFunnelBlock } from "@/components/workspace/funnelBlocks";
import type { FunnelStepRow } from "@/components/workspace/FunnelStepCard";

export interface LinkedMetricValue {
  /** Numeric value if parsable, otherwise null */
  value: number | null;
  /** Raw value as stored (string fallback) */
  raw: string | number | null;
  unit: string | null;
  capturedAt: string | null;
  /** "snapshot" = metric_snapshots row · "node_data" = node.data.metrics · null = unresolved */
  source: "snapshot" | "node_data" | null;
}

export interface LinkedMetricsState {
  loading: boolean;
  /** Title of the linked node, if any */
  linkedNodeTitle: string | null;
  linkedNodeType: string | null;
  /** Map metric_key → value */
  metrics: Record<string, LinkedMetricValue>;
  /** Keys that were searched (intersection of node + block) */
  resolvedKeys: string[];
  refresh: () => void;
}

interface NodeRow {
  id: string;
  title: string;
  node_type: string;
  data: Record<string, unknown> | null;
}

interface SnapshotRow {
  metric_key: string;
  metric_value: number | null;
  metric_unit: string | null;
  captured_at: string;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim().replace(/[^\d.,-]/g, "").replace(",", ".");
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function useLinkedStepMetrics(
  step: Pick<FunnelStepRow, "linked_node_id" | "block_kind"> | null,
  clientId: string,
): LinkedMetricsState {
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [node, setNode] = useState<NodeRow | null>(null);
  const [snapshots, setSnapshots] = useState<Record<string, SnapshotRow>>({});

  const blockMetricKeys = useMemo(
    () => (step ? getFunnelBlock(step.block_kind).metricKeys : []),
    [step?.block_kind],
  );

  // Reset when no link
  useEffect(() => {
    if (!step?.linked_node_id) {
      setNode(null);
      setSnapshots({});
      return;
    }

    let alive = true;
    (async () => {
      setLoading(true);

      // 1. Fetch linked node
      const { data: nodeData, error: nodeErr } = await supabase
        .from("canvas_nodes")
        .select("id, title, node_type, data")
        .eq("id", step.linked_node_id!)
        .maybeSingle();

      if (!alive) return;
      if (nodeErr || !nodeData) {
        console.error("useLinkedStepMetrics: node fetch", nodeErr);
        setNode(null);
        setSnapshots({});
        setLoading(false);
        return;
      }
      const nodeRow = nodeData as NodeRow;
      setNode(nodeRow);

      // 2. Resolve metric keys: intersection node ∩ block, fallback to block list
      const nodeData_ = (nodeRow.data ?? {}) as Record<string, unknown>;
      const nodeKeys = Array.isArray(nodeData_.metric_keys)
        ? (nodeData_.metric_keys as unknown[]).filter((x): x is string => typeof x === "string")
        : [];
      const single = typeof nodeData_.metric_key === "string" ? [nodeData_.metric_key as string] : [];
      const allNodeKeys = Array.from(new Set([...nodeKeys, ...single]));

      let resolved = blockMetricKeys.filter((k) => allNodeKeys.includes(k));
      if (resolved.length === 0) {
        // fallback: use all block keys (may still yield matches in metric_snapshots)
        resolved = blockMetricKeys;
      }
      if (resolved.length === 0) {
        setSnapshots({});
        setLoading(false);
        return;
      }

      // 3. Latest snapshot per metric_key for this client
      const { data: snapData, error: snapErr } = await supabase
        .from("metric_snapshots")
        .select("metric_key, metric_value, metric_unit, captured_at")
        .eq("client_id", clientId)
        .in("metric_key", resolved)
        .order("captured_at", { ascending: false })
        .limit(500);

      if (!alive) return;
      if (snapErr) {
        console.error("useLinkedStepMetrics: snapshots", snapErr);
        setSnapshots({});
        setLoading(false);
        return;
      }
      const map: Record<string, SnapshotRow> = {};
      for (const row of (snapData ?? []) as SnapshotRow[]) {
        // because ordered desc, first wins
        if (!map[row.metric_key]) map[row.metric_key] = row;
      }
      setSnapshots(map);
      setLoading(false);
    })();

    return () => { alive = false; };
  }, [step?.linked_node_id, blockMetricKeys, clientId, tick]);

  // 4. Build merged metrics map (snapshot first, fallback node.data.metrics)
  const metrics = useMemo<Record<string, LinkedMetricValue>>(() => {
    const out: Record<string, LinkedMetricValue> = {};
    const nodeMetrics = ((node?.data ?? {}) as Record<string, unknown>).metrics as
      | Record<string, unknown>
      | undefined;
    for (const key of blockMetricKeys) {
      const snap = snapshots[key];
      if (snap) {
        out[key] = {
          value: snap.metric_value,
          raw: snap.metric_value,
          unit: snap.metric_unit,
          capturedAt: snap.captured_at,
          source: "snapshot",
        };
        continue;
      }
      if (nodeMetrics && nodeMetrics[key] != null && nodeMetrics[key] !== "") {
        const raw = nodeMetrics[key] as string | number;
        out[key] = {
          value: toNumber(raw),
          raw,
          unit: null,
          capturedAt: null,
          source: "node_data",
        };
        continue;
      }
      out[key] = { value: null, raw: null, unit: null, capturedAt: null, source: null };
    }
    return out;
  }, [snapshots, node, blockMetricKeys]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  return {
    loading,
    linkedNodeTitle: node?.title ?? null,
    linkedNodeType: node?.node_type ?? null,
    metrics,
    resolvedKeys: blockMetricKeys,
    refresh,
  };
}
