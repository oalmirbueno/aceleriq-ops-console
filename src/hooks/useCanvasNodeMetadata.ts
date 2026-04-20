/**
 * useCanvasNodeMetadata
 *
 * Carrega `canvas_nodes.metadata` (jsonb) do node — usado pelos wrappers
 * especializados pra ler o prefill cacheado sem disparar a edge function de novo.
 *
 * O hook escuta `open` pra refetch quando o drawer abre/refresh, e re-carrega
 * quando o `nodeId` muda.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { NodePrefillPayload } from "../components/workspace/nodePrefillTypes";

interface CanvasNodeMetadata {
  prefill?: NodePrefillPayload | null;
  [key: string]: unknown;
}

interface Args {
  nodeId: string;
  open: boolean;
}

export function useCanvasNodeMetadata({ nodeId, open }: Args) {
  const [metadata, setMetadata] = useState<CanvasNodeMetadata | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !nodeId) return;
    let alive = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("canvas_nodes")
        .select("metadata")
        .eq("id", nodeId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        console.error("useCanvasNodeMetadata:", error);
        setMetadata(null);
      } else {
        setMetadata((data?.metadata as CanvasNodeMetadata | null) ?? null);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [nodeId, open]);

  // Polling leve a cada 4s enquanto aberto — captura prefill recém-gerado pelo SpecializedNodeDrawer
  useEffect(() => {
    if (!open || !nodeId) return;
    const intv = window.setInterval(async () => {
      const { data } = await supabase
        .from("canvas_nodes")
        .select("metadata")
        .eq("id", nodeId)
        .maybeSingle();
      setMetadata((data?.metadata as CanvasNodeMetadata | null) ?? null);
    }, 4000);
    return () => window.clearInterval(intv);
  }, [nodeId, open]);

  const prefill: NodePrefillPayload | null = metadata?.prefill ?? null;

  return { metadata, prefill, loading };
}
