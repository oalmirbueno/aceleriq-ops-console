import { supabase } from "@/integrations/supabase/client";

const COMPLETED_STATUSES = new Set(["done", "completed", "concluido"]);

function isCompletedStatus(status?: string | null) {
  return COMPLETED_STATUSES.has((status ?? "").toLowerCase());
}

/**
 * Progresso híbrido: status define faixa, campos preenchidos refinam dentro da faixa.
 * draft   →  0–33%
 * active  → 33–66%
 * blocked → mantém faixa do active
 * done    → 100%
 */
export function computeNodeProgress(status?: string | null, data?: Record<string, unknown> | null): number {
  const s = (status ?? "").toLowerCase();
  if (isCompletedStatus(s)) return 100;

  // conta campos preenchidos em node.data (top-level, ignora meta/operationalMeta)
  const ignore = new Set(["operationalMeta", "operational_meta", "_meta", "history"]);
  const entries = Object.entries(data ?? {}).filter(([k]) => !ignore.has(k));
  const total = entries.length || 1;
  const filled = entries.filter(([, v]) => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v as object).length > 0;
    return true;
  }).length;
  const ratio = Math.min(filled / total, 1);

  if (s === "draft" || s === "" || s === "not_started") return Math.round(ratio * 33);
  if (s === "blocked" || s === "bloqueado") return Math.round(33 + ratio * 33);
  // active / em_andamento / outros
  return Math.round(33 + ratio * 33);
}

/**
 * Dispara sync ao portal a cada update relevante de node (não apenas conclusão).
 * Envia status + progresso para o portal atualizar a tarefa equivalente no kanban.
 */
export function syncNodeUpdated({
  workspaceId,
  clientId,
  nodeId,
  nodeTitle,
  nodeType,
  status,
  previousStatus,
  data,
}: {
  workspaceId: string;
  clientId?: string | null;
  nodeId: string;
  nodeTitle?: string | null;
  nodeType?: string | null;
  status?: string | null;
  previousStatus?: string | null;
  data?: Record<string, unknown> | null;
}) {
  if (!clientId) return;
  const progress = computeNodeProgress(status, data);

  void supabase.functions.invoke("sync-to-portal", {
    body: {
      event: "node_updated",
      workspaceId,
      clientId,
      nodeId,
      nodeTitle: nodeTitle ?? undefined,
      nodeType: nodeType ?? undefined,
      status: status ?? undefined,
      previousStatus: previousStatus ?? undefined,
      progress,
    },
  }).catch(() => {});
}

/**
 * Cria uma task no portal a partir de um node recém-criado no Ops.
 * Cada node = card no kanban do projeto.
 */
export function syncNodeCreated({
  workspaceId,
  clientId,
  nodeId,
  nodeTitle,
  nodeType,
}: {
  workspaceId: string;
  clientId?: string | null;
  nodeId: string;
  nodeTitle?: string | null;
  nodeType?: string | null;
}) {
  if (!clientId) return;
  void supabase.functions.invoke("sync-to-portal", {
    body: {
      event: "node_created",
      workspaceId,
      clientId,
      nodeId,
      nodeTitle: nodeTitle ?? undefined,
      nodeType: nodeType ?? undefined,
    },
  }).catch(() => {});
}

/** Remove a task correspondente do portal quando o node é deletado. */
export function syncNodeDeleted({
  workspaceId,
  clientId,
  nodeId,
}: {
  workspaceId: string;
  clientId?: string | null;
  nodeId: string;
}) {
  if (!clientId) return;
  void supabase.functions.invoke("sync-to-portal", {
    body: { event: "node_deleted", workspaceId, clientId, nodeId },
  }).catch(() => {});
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
