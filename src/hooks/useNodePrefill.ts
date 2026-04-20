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
      const { data, error } = await supabase.functions.invoke("prefill-node", {
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
            // Auto-contexto UNIVERSAL: une fontes do blueprint + Dossiê/Tasks/Métricas/Assets/Timeline.
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
    [nodeId, workspaceId, clientId, blueprint],
  );

  // Mount: try cache
  useEffect(() => {
    if (!enabled || !blueprint || !nodeId) return;
    let cancelled = false;
    triedAutoRef.current = false;
    setStatus("loading");
    setError(null);
    callEdge(false, true)
      .then((res) => {
        if (cancelled) return;
        if (res.prefill) {
          setPrefill(res.prefill);
          setStatus("ready");
        } else {
          setStatus("idle"); // empty — drawer mostra CTA "Auto-preencher"
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro");
        setStatus("error");
      });
    return () => { cancelled = true; };
  }, [enabled, blueprint, nodeId, callEdge]);

  const generate = useCallback(async (force = false) => {
    if (!blueprint) return;
    setStatus("generating");
    setError(null);
    try {
      const res = await callEdge(force, false);
      if (res.prefill) {
        setPrefill(res.prefill);
        setStatus("ready");
      } else {
        setStatus("idle");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro");
      setStatus("error");
    }
  }, [blueprint, callEdge]);

  // Auto-trigger first time when status=idle (lazy: only when drawer is visible)
  useEffect(() => {
    if (status === "idle" && enabled && blueprint && !triedAutoRef.current) {
      triedAutoRef.current = true;
      generate(false);
    }
  }, [status, enabled, blueprint, generate]);

  // ── Mutations (debounced persist)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistRef = useRef<NodePrefillPayload | null>(null);
  persistRef.current = prefill;

  const schedulePersist = useCallback(() => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    persistTimerRef.current = setTimeout(async () => {
      const current = persistRef.current;
      if (!current) return;
      // read current metadata, merge prefill, update
      const { data: cur } = await supabase
        .from("canvas_nodes").select("metadata").eq("id", nodeId).maybeSingle();
      const newMeta = { ...(cur?.metadata as Record<string, unknown> | null ?? {}), prefill: current };
      await supabase.from("canvas_nodes")
        .update({ metadata: newMeta, updated_at: new Date().toISOString() })
        .eq("id", nodeId);
    }, 800);
  }, [nodeId]);

  useEffect(() => () => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
  }, []);

  const updateField = useCallback((sectionId: string, fieldId: string, next: PrefillFieldValue) => {
    setPrefill((prev) => {
      if (!prev) return prev;
      const sections = { ...prev.sections };
      const section = sections[sectionId] ?? { fields: {} };
      sections[sectionId] = { ...section, fields: { ...section.fields, [fieldId]: next } };
      return { ...prev, sections };
    });
    schedulePersist();
  }, [schedulePersist]);

  const updateMethod = useCallback((itemId: string, done: boolean) => {
    setPrefill((prev) => {
      const base: NodePrefillPayload = prev ?? {
        blueprint_kind: blueprint?.kind ?? "",
        sections: {},
        method_state: {},
        sources_used: [],
        generated_at: new Date().toISOString(),
        ai_model: "manual",
        schema_version: 1,
      };
      const ms: MethodChecklistState = { ...(base.method_state ?? {}) };
      ms[itemId] = done
        ? { done: true, checked_at: new Date().toISOString() }
        : { done: false };
      return { ...base, method_state: ms };
    });
    schedulePersist();
  }, [blueprint, schedulePersist]);

  return {
    prefill,
    status,
    error,
    generate,
    regenerate: () => generate(true),
    updateField,
    updateMethod,
  };
}
