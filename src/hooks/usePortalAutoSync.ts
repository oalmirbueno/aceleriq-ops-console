import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Dispara reconciliação Portal→Ops periodicamente (cobre criações,
 * atualizações e — principalmente — DELEÇÕES de clientes/projetos
 * que não chegam por webhook). Roda enquanto o usuário estiver com
 * o Ops aberto.
 */
export function usePortalAutoSync(intervalMs = 60_000) {
  const running = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (running.current || cancelled) return;
      if (typeof document !== "undefined" && document.hidden) return;
      running.current = true;
      try {
        // backfill-from-portal foi removido do auto-sync (causava WORKER_RESOURCE_LIMIT).
        // Agora só pull leve por workspace, e backfill é manual/protegido.
        const path = window.location.pathname;
        const search = new URLSearchParams(window.location.search);
        const tab = search.get("tab");
        const workspaceFromPath = path.match(/\/ops\/workspaces\/([^/]+)/)?.[1];
        const workspaceFromQuery = search.get("workspaceId");
        const workspaceId = workspaceFromPath ?? workspaceFromQuery;
        const shouldPullCanvas = Boolean(workspaceId && (tab === "canvas" || path.includes("/ops/canvas") || path.includes("/ops/projects/")));
        if (shouldPullCanvas) {
          await supabase.functions.invoke("pull-portal-tasks", {
            body: { workspaceId, source: "auto" },
          });
        }
      } catch {
        // silencioso: é background sync
      } finally {
        running.current = false;
      }
    };

    // primeira execução logo após montar
    const first = setTimeout(tick, 4_000);
    const id = setInterval(tick, intervalMs);
    const onVis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearTimeout(first);
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [intervalMs]);
}