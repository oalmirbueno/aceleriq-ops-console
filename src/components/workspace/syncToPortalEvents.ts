import { supabase } from "@/integrations/supabase/client";

const COMPLETED_STATUSES = new Set(["done", "completed", "concluido"]);

function isCompletedStatus(status?: string | null) {
  return COMPLETED_STATUSES.has((status ?? "").toLowerCase());
}

export function syncNodeCompletedWhenDone({
  previousStatus,
  nextStatus,
  workspaceId,
  clientId,
  nodeId,
  nodeTitle,
}: {
  previousStatus?: string | null;
  nextStatus?: string | null;
  workspaceId: string;
  clientId?: string | null;
  nodeId: string;
  nodeTitle?: string | null;
}) {
  if (!clientId) return;
  if (!isCompletedStatus(nextStatus) || isCompletedStatus(previousStatus)) return;

  void supabase.functions.invoke("sync-to-portal", {
    body: {
      event: "node_completed",
      workspaceId,
      clientId,
      nodeId,
      nodeTitle: nodeTitle ?? undefined,
    },
  }).catch(() => {});
}

export function syncBriefingUpdatedForClient(clientId: string) {
  void (async () => {
    try {
      const { data } = await supabase
        .from("workspaces")
        .select("id")
        .eq("client_id", clientId);

      (data ?? []).forEach((workspace) => {
        void supabase.functions.invoke("sync-to-portal", {
          body: {
            event: "briefing_updated",
            workspaceId: workspace.id,
            clientId,
          },
        }).catch(() => {});
      });
    } catch {
      // fire-and-forget: não bloqueia o fluxo principal
    }
  })();
}

export function syncScoresUpdated({
  workspaceId,
  clientId,
  healthScore,
  aiFirstScore,
}: {
  workspaceId?: string | null;
  clientId: string;
  healthScore?: number | null;
  aiFirstScore?: number | null;
}) {
  if (!workspaceId) return;

  void supabase.functions.invoke("sync-to-portal", {
    body: {
      event: "scores_updated",
      workspaceId,
      clientId,
      health_score: healthScore ?? undefined,
      ai_first_score: aiFirstScore ?? undefined,
    },
  }).catch(() => {});
}
