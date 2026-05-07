import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

type CanvasNodeRow = CanvasNodeRecord & { parent_node_id?: string | null };

/**
 * Auto-sync de milestones OPS → Portal.
 *
 * Para cada node `kind = milestone_group` que ainda NÃO tem `portal_milestone_id`
 * salvo (nem em data.portal_milestone_id, nem na coluna estável), chama
 * `sync-milestones-to-portal` com `event: "apply_one"` e `milestoneId`.
 *
 * Garantias:
 *  - Escopo: apenas o workspaceId em uso. Nunca global.
 *  - Idempotência: a função do lado do servidor faz upsert por ops_milestone_id.
 *    Após sucesso, ela escreve `portal_milestone_id` no node — então este hook
 *    nunca dispara duas vezes para o mesmo milestone.
 *  - Anti-loop: mantém um Set local de IDs em flight + IDs já tratados na sessão.
 *  - Não mexe em outros workspaces, não mexe em backfill global, não cria task.
 */
export function useMilestoneAutoSync(workspaceId: string | null | undefined, nodes: CanvasNodeRow[], enabled: boolean = true) {
  const inFlightRef = useRef<Set<string>>(new Set());
  const handledRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    if (!workspaceId) return;

    const candidates = nodes.filter((n) => {
      if (n.workspace_id && n.workspace_id !== workspaceId) return false;
      const data = (n.data as Record<string, unknown> | null) ?? {};
      const kind = String(data.kind ?? "").toLowerCase();
      if (kind !== "milestone_group") return false;
      const dataPmid = typeof data.portal_milestone_id === "string" ? data.portal_milestone_id.trim() : "";
      const colPmid = typeof (n as unknown as { portal_milestone_id?: string }).portal_milestone_id === "string"
        ? ((n as unknown as { portal_milestone_id?: string }).portal_milestone_id ?? "").trim()
        : "";
      if (dataPmid || colPmid) return false;
      if (inFlightRef.current.has(n.id) || handledRef.current.has(n.id)) return false;
      return true;
    });

    if (candidates.length === 0) return;

    for (const ms of candidates) {
      inFlightRef.current.add(ms.id);
      console.log("[milestone-auto-sync] firing apply_one", { milestoneId: ms.id, title: ms.title, workspaceId });
      void supabase.functions
        .invoke("sync-milestones-to-portal", {
          body: { event: "apply_one", confirm: true, milestoneId: ms.id },
        })
        .then(({ data, error }) => {
          if (error) {
            console.warn("[milestone-auto-sync] failed", { milestoneId: ms.id, error: error.message });
            // não marca como handled → permite nova tentativa em próxima mudança de nodes
          } else {
            console.log("[milestone-auto-sync] ok", { milestoneId: ms.id, response: data });
            handledRef.current.add(ms.id);
          }
        })
        .catch((err: unknown) => {
          console.warn("[milestone-auto-sync] threw", { milestoneId: ms.id, err });
        })
        .finally(() => {
          inFlightRef.current.delete(ms.id);
        });
    }
  }, [workspaceId, nodes, enabled]);
}