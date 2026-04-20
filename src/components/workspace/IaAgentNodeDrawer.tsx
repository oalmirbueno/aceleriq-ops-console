/**
 * IaAgentNodeDrawer
 *
 * Wrapper do SpecializedNodeDrawer dedicado a nodes do tipo `ia` (Agente IA).
 *
 * Responsabilidade extra (vs. SpecializedGenericDrawer):
 *  - Renderiza <PromptVersionHistory /> LOGO ABAIXO do field `system_prompt`
 *    da seção `agent_core` via prop renderFieldExtra
 *  - Auto-snapshota a versão atual ANTES de aceitar uma edição (auto/edited)
 *    se ainda não houver versão salva idêntica — preserva o "estado original"
 *    da IA pra rollback fácil
 *  - Reverter cria nova entrada no histórico (auditoria) e aplica via updateField
 *
 * Mantém todos os quickActions padrão (gerar tasks, exportar PDF, etc).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import PromptVersionHistory, { type PromptVersion } from "./PromptVersionHistory";
import { useNodeQuickActions } from "@/hooks/useNodeQuickActions";
import { supabase } from "@/integrations/supabase/client";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import type { PrefillFieldValue, NodePrefillPayload } from "./nodePrefillTypes";

const PROMPT_SECTION_ID = "agent_core";
const PROMPT_FIELD_ID = "system_prompt";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
}

export default function IaAgentNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete, onUpdated,
}: Props) {
  const { handlers, dialogs } = useNodeQuickActions({
    node, open, workspaceId, clientId, clientName, onChanged: onUpdated,
  });

  // Cache local do conteúdo atual do prompt (alimentado via renderFieldExtra)
  // → necessário pra o componente de histórico saber o "atual" sem precisar
  //   re-bater no Supabase. Atualizado em renderFieldExtra a cada render.
  const currentPromptRef = useRef<string>("");
  // Forçar re-render quando o atual muda — pra updates do histórico se manterem em sync
  const [currentPrompt, setCurrentPrompt] = useState<string>("");

  // Snapshot inicial: na 1ª vez que o prompt aparece via auto-prefill, salva como v0.
  const seededRef = useRef(false);
  const handlePrefillChanged = useCallback((prefill: NodePrefillPayload | null) => {
    if (seededRef.current || !prefill) return;
    const f = prefill.sections?.[PROMPT_SECTION_ID]?.fields?.[PROMPT_FIELD_ID];
    if (!f) return;
    const content = typeof f.value === "string" ? f.value : "";
    if (!content.trim()) return;
    seededRef.current = true;
    void seedInitialVersion(node.id, content, f.origin === "auto" ? "auto" : "manual");
  }, [node.id]);

  // Reset seed flag ao trocar de node
  useEffect(() => { seededRef.current = false; }, [node.id]);

  // Quando o usuário reverte: precisa atualizar o field via updateField "original" do hook.
  // Como o updateField mora dentro do SpecializedNodeDrawer, exponho via wrapUpdateField:
  // mantenho ref do último updateField recebido pra usar no revert.
  const updateFieldRef = useRef<((s: string, f: string, v: PrefillFieldValue) => void) | null>(null);
  const wrapUpdateField = useCallback(
    (orig: (s: string, f: string, v: PrefillFieldValue) => void) => {
      updateFieldRef.current = orig;
      return orig; // sem interceptação — só captura ref
    },
    [],
  );

  const handleRevert = useCallback((text: string) => {
    setCurrentPrompt(text);
    currentPromptRef.current = text;
    updateFieldRef.current?.(
      PROMPT_SECTION_ID,
      PROMPT_FIELD_ID,
      { value: text, origin: "edited", citation: "revertido do histórico de versões" },
    );
  }, []);

  // Slot decorador: injeta o histórico LOGO ABAIXO do field system_prompt
  const renderFieldExtra = useCallback(
    (sectionId: string, fieldId: string, value: PrefillFieldValue | undefined) => {
      if (sectionId !== PROMPT_SECTION_ID || fieldId !== PROMPT_FIELD_ID) return null;
      const text = typeof value?.value === "string" ? value.value : "";
      // Atualiza o cache (sem causar re-render — só o ref)
      currentPromptRef.current = text;
      // Sincroniza estado pra forçar re-render do histórico apenas quando muda real
      if (text !== currentPrompt) {
        // Defer pra próximo tick pra evitar setState durante render
        queueMicrotask(() => setCurrentPrompt(text));
      }
      return (
        <PromptVersionHistory
          nodeId={node.id}
          currentPrompt={text}
          onRevert={handleRevert}
        />
      );
    },
    [node.id, handleRevert, currentPrompt],
  );

  return (
    <>
      <SpecializedNodeDrawer
        node={node}
        open={open}
        onOpenChange={onOpenChange}
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName}
        quickActionHandlers={handlers}
        onDelete={onDelete}
        renderFieldExtra={renderFieldExtra}
        wrapUpdateField={wrapUpdateField}
        onPrefillChanged={handlePrefillChanged}
      />
      {dialogs}
    </>
  );
}

/**
 * Salva uma versão inicial v0 quando o prompt aparece pela 1ª vez via prefill,
 * desde que não exista versão idêntica no histórico.
 */
async function seedInitialVersion(nodeId: string, content: string, origin: "auto" | "manual") {
  const { data } = await supabase.from("canvas_nodes").select("metadata").eq("id", nodeId).maybeSingle();
  const meta = (data?.metadata as Record<string, unknown> | null) ?? {};
  const list = Array.isArray(meta.prompt_versions) ? (meta.prompt_versions as PromptVersion[]) : [];
  if (list.some((v) => v.content.trim() === content.trim())) return; // já versionado
  const v: PromptVersion = {
    id: crypto.randomUUID(),
    content,
    created_at: new Date().toISOString(),
    origin,
    label: origin === "auto" ? "Versão inicial gerada pela IA" : "Snapshot inicial",
    size: content.length,
  };
  const newMeta = { ...meta, prompt_versions: [v, ...list] };
  await supabase.from("canvas_nodes")
    .update({ metadata: newMeta, updated_at: new Date().toISOString() })
    .eq("id", nodeId);
}