/**
 * Canvas V2 — Legacy UI Adapter
 *
 * Converte PortalTask (fonte de dados nova) para o formato que os componentes
 * visuais oficiais do canvas antigo já consomem (ProjectNodeData).
 *
 * Read-only: nenhum callback de mutação (onDelete, onPrefilled, onQuickConnect)
 * é repassado. O ProjectNodeCard apenas exibe.
 */
import type { PortalTask, PortalTaskStatus } from "@/v2/data/portalClient";
import type { ProjectNodeData } from "@/components/workspace/ProjectNodeCard";

/** Map status Portal → status premium da esteira (consumido por mapLegacyStatus internamente). */
const STATUS_TO_LEGACY: Record<PortalTaskStatus, string> = {
  todo: "planejado",
  in_progress: "em_producao",
  blocked: "bloqueado",
  done: "concluido",
  archived: "ideia",
};

/** Heurística simples para variar o "kind" visual por status sem inventar dado.
 *  Mantemos kinds neutros do catálogo (checklist/engine/resultado/decisao/documento). */
function pickKind(status: PortalTaskStatus): ProjectNodeData["kind"] {
  switch (status) {
    case "in_progress": return "engine";
    case "done":        return "resultado";
    case "blocked":     return "decisao";
    case "archived":    return "documento";
    case "todo":
    default:            return "checklist";
  }
}

export interface PortalNodeData extends ProjectNodeData {
  /** Mantém referência tipada à task original para o painel lateral. */
  __portalTask: PortalTask;
  /** Marcador de origem — leitor pode bloquear ações. */
  source: "portal";
  readOnly: true;
}

export function portalTaskToNodeData(task: PortalTask): PortalNodeData {
  const legacyStatus = STATUS_TO_LEGACY[task.status];
  const kind = pickKind(task.status);

  return {
    title: task.title,
    kind,
    status: legacyStatus,
    description: task.description ?? null,
    hasLinkedEntity: false,
    attachments: 0,
    links: 0,
    checklistDone: undefined,
    checklistTotal: undefined,
    coverAttachment: null,
    operationalMeta: {
      ownerName: task.assigneeName ?? null,
      dueDate: task.dueAt ?? null,
    },
    nodeId: task.id,
    workspaceId: task.projectId,
    typeData: {
      portal_task_id: task.id,
      progress_pct: Math.round(task.progress * 100),
    },
    pulse: false,
    // Marcadores V2
    __portalTask: task,
    source: "portal",
    readOnly: true,
  } as PortalNodeData;
}
