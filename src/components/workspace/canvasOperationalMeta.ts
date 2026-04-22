export type ApprovalStatus = "not_required" | "pending" | "approved" | "rejected";

export interface CanvasOperationalMeta {
  ownerName?: string | null;
  dueDate?: string | null;
  approvalStatus?: ApprovalStatus;
  blockedReason?: string | null;
  evidenceLinks?: string[];
  dependencyNodeIds?: string[];
}

export function isOperationalOverdue(meta?: CanvasOperationalMeta | null) {
  if (!meta?.dueDate) return false;
  const due = new Date(meta.dueDate);
  if (Number.isNaN(due.getTime())) return false;
  return due < new Date();
}

export function countOperationalEvidence(meta?: CanvasOperationalMeta | null) {
  return meta?.evidenceLinks?.filter(Boolean).length ?? 0;
}

export function countOperationalDependencies(meta?: CanvasOperationalMeta | null) {
  return meta?.dependencyNodeIds?.filter(Boolean).length ?? 0;
}