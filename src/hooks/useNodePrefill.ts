/**
 * useNodePrefill
 *
 * Hook que gerencia o auto-preenchimento de um node:
 *  - Em mount: tenta cache (cacheOnly=true). Se vazio, dispara prefill (lazy).
 *  - Expõe prefill, status, regenerate(), updateField(), updateMethod()
 *  - Mudanças locais persistem com debounce em canvas_nodes.metadata.prefill
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { expandUniversalSources, type NodeBlueprint } from "../components/workspace/nodeBlueprints";
import type {
  NodePrefillPayload, PrefillFieldValue, MethodChecklistState,
} from "../components/workspace/nodePrefillTypes";

type Status = "idle" | "loading" | "generating" | "ready" | "error";

interface UseNodePrefillArgs {
  nodeId: string;
  workspaceId: string;
  clientId: string;
  blueprint: NodeBlueprint | null;
  enabled?: boolean;
}

export function useNodePrefill({
  nodeId, workspaceId, clientId, blueprint, enabled = true,
}: UseNodePrefillArgs) {
  const [prefill, setPrefill] = useState<NodePrefillPayload | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const triedAutoRef = useRef(false);

  // Edge function caller — always sends blueprint reduced to wire-format
  const callEdge = useCallback(
    async (force: boolean, cacheOnly: boolean) => {
      if (!blueprint) throw new Error("Sem blueprint pra esse tipo de node");
      const { data, error } = await supabase.functions.invoke("prefill-node-v2", {
        body: {
          nodeId, workspaceId, clientId,
          blueprint: {
            kind: blueprint.kind,
            purpose: blueprint.purpose,
            sections: blueprint.sections.map((s) => ({
              id: s.id, title: s.title, description: s.description,
              fields: s.fields.map((f) => ({
                id: f.id, label: f.label, type: f.type, hint: f.hint, decisionOnly: f.decisionOnly,
              })),
            })),
            sources: expandUniversalSources(blueprint.sources),
            prefillPrompt: blueprint.prefillPrompt,
          },
          force, cacheOnly,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { prefill: NodePrefillPayload | null; cached: boolean };
    },
    [blueprint, nodeId, workspaceId, clientId]
  );

  const run = useCallback(
    async (force: boolean) => {
      if (!enabled || !blueprint) return;
      setStatus(force ? "generating" : "loading");
      setError(null);
      try {
        // Tenta cache primeiro
        if (!force) {
          const cacheResult = await callEdge(false, true);
          if (cacheResult.prefill) {
            setPrefill(cacheResult.prefill);
            setStatus("ready");
            return;
          }
        }
        // Gera
        setStatus("generating");
        const result = await callEdge(force, false);
        setPrefill(result.prefill);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao gerar prefill");
        setStatus("error");
      }
    },
    [callEdge, enabled, blueprint]
  );

  // Auto-dispara na montagem
  useEffect(() => {
    if (!enabled || triedAutoRef.current) return;
    triedAutoRef.current = true;
    void run(false);
  }, [enabled, run]);

  const regenerate = useCallback(() => run(true), [run]);

  const persistDebouncedRef = useRef<number | null>(null);
  const persistLocal = useCallback(
    (next: NodePrefillPayload) => {
      if (persistDebouncedRef.current) window.clearTimeout(persistDebouncedRef.current);
      persistDebouncedRef.current = window.setTimeout(async () => {
        const { data: node } = await supabase.from("canvas_nodes").select("metadata").eq("id", nodeId).maybeSingle();
        const newMeta = { ...((node?.metadata as Record<string, unknown>) ?? {}), prefill: next };
        await supabase.from("canvas_nodes").update({ metadata: newMeta }).eq("id", nodeId);
      }, 800);
    },
    [nodeId]
  );

  const updateField = useCallback(
    (sectionId: string, fieldId: string, value: PrefillFieldValue) => {
      setPrefill((curr) => {
        if (!curr) return curr;
        const prevSection = curr.sections[sectionId] ?? { fields: {} };
        const next: NodePrefillPayload = {
          ...curr,
          sections: {
            ...curr.sections,
            [sectionId]: {
              ...prevSection,
              fields: { ...(prevSection.fields ?? {}), [fieldId]: value },
            },
          },
        };
        persistLocal(next);
        return next;
      });
    },
    [persistLocal]
  );

  const updateMethod = useCallback(
    (itemId: string, done: boolean) => {
      setPrefill((curr) => {
        if (!curr) return curr;
        const method_state: MethodChecklistState = {
          ...(curr.method_state ?? {}),
          [itemId]: done
            ? { done: true, checked_at: new Date().toISOString() }
            : { done: false },
        };
        const next: NodePrefillPayload = { ...curr, method_state };
        persistLocal(next);
        return next;
      });
    },
    [persistLocal]
  );

  return {
    prefill,
    status,
    error,
    generate: run,
    regenerate,
    updateField,
    updateMethod,
  };
}
