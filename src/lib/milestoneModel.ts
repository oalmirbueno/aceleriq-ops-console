/**
 * milestoneModel — derivação de Projeto / Milestone / Task a partir de
 * `canvas_nodes` Portal-bound. Cliente-side, leitura pura.
 *
 * Hierarquia derivada (milestone-first):
 *   project_group  → milestone_group  → tasks (qualquer node operacional)
 *
 * Não toca em DB / edge / sync. Apenas espelha o que a query server-side já
 * trouxe (filtrada por workspace + Portal-bound).
 */

export type RawNodeRow = {
  id: string;
  workspace_id?: string;
  node_type?: string | null;
  title?: string | null;
  status?: string | null;
  description?: string | null;
  parent_node_id?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  sync_status?: string | null;
  data?: Record<string, unknown> | null;
  updated_at?: string | null;
  created_at?: string | null;
};

export interface DerivedProject {
  id: string;
  title: string;
  portalProjectId: string | null;
  raw: RawNodeRow;
}

export interface DerivedMilestone {
  id: string;
  title: string;
  status: string;
  projectId: string | null;
  portalMilestoneId: string | null;
  portalProjectId: string | null;
  milestoneKey: string | null;
  order: number;
  raw: RawNodeRow;
}

export interface DerivedTask {
  id: string;
  title: string;
  status: string;
  description: string | null;
  milestoneId: string | null;
  portalTaskId: string | null;
  portalMilestoneId: string | null;
  dueDate: string | null;
  raw: RawNodeRow;
}

const COMPLETED = new Set(["done", "completed", "concluido", "concluída", "concluida"]);
const NON_TASK_TYPES = new Set(["client", "ai_orb", "chat_node"]);
const NON_TASK_KINDS = new Set(["project_group", "milestone_group", "chat_node"]);

function dataOf(n: RawNodeRow): Record<string, unknown> {
  return (n.data as Record<string, unknown> | null | undefined) ?? {};
}
function kindOf(n: RawNodeRow): string {
  return String(dataOf(n).kind ?? "").toLowerCase();
}
function portalOrder(n: RawNodeRow): number {
  const v = Number(dataOf(n).portal_position ?? 9999);
  return Number.isFinite(v) ? v : 9999;
}
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

export function isProjectGroup(n: RawNodeRow): boolean {
  return kindOf(n) === "project_group";
}
export function isMilestoneGroup(n: RawNodeRow): boolean {
  return kindOf(n) === "milestone_group";
}
export function isTaskNode(n: RawNodeRow): boolean {
  const t = String(n.node_type ?? "").toLowerCase();
  const k = kindOf(n);
  if (NON_TASK_TYPES.has(t)) return false;
  if (NON_TASK_KINDS.has(k)) return false;
  return true;
}

export function listProjects(nodes: RawNodeRow[]): DerivedProject[] {
  return nodes
    .filter(isProjectGroup)
    .map((n) => ({
      id: n.id,
      title: n.title ?? "Projeto",
      portalProjectId: strOrNull(dataOf(n).portal_project_id),
      raw: n,
    }))
    .sort((a, b) => portalOrder(a.raw) - portalOrder(b.raw) || a.title.localeCompare(b.title));
}

export function listMilestones(nodes: RawNodeRow[], projectId?: string | null): DerivedMilestone[] {
  const projects = listProjects(nodes);
  const projectByPortal = new Map(projects.map((p) => [p.portalProjectId ?? "", p]));

  return nodes
    .filter(isMilestoneGroup)
    .map((n) => {
      const d = dataOf(n);
      const portalProjectId = strOrNull(d.portal_project_id);
      const explicitParent = n.parent_node_id ?? null;
      const inferredParent = portalProjectId ? projectByPortal.get(portalProjectId)?.id ?? null : null;
      return {
        id: n.id,
        title: n.title ?? "Milestone",
        status: String(n.status ?? "active").toLowerCase(),
        projectId: explicitParent ?? inferredParent,
        portalMilestoneId: strOrNull(d.portal_milestone_id),
        portalProjectId,
        milestoneKey: strOrNull(d.milestone_key),
        order: portalOrder(n),
        raw: n,
      } satisfies DerivedMilestone;
    })
    .filter((m) => (projectId ? m.projectId === projectId : true))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function listTasksByMilestone(nodes: RawNodeRow[], milestone: DerivedMilestone): DerivedTask[] {
  const matches = nodes.filter((n) => {
    if (!isTaskNode(n)) return false;
    const d = dataOf(n);
    if (n.parent_node_id && n.parent_node_id === milestone.id) return true;
    if (milestone.portalMilestoneId && d.portal_milestone_id === milestone.portalMilestoneId) return true;
    if (
      milestone.milestoneKey &&
      milestone.portalProjectId &&
      d.milestone_key === milestone.milestoneKey &&
      d.portal_project_id === milestone.portalProjectId
    ) return true;
    return false;
  });

  // Dedupe by id (a node may match multiple criteria)
  const seen = new Set<string>();
  const tasks: DerivedTask[] = [];
  for (const n of matches) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    const d = dataOf(n);
    tasks.push({
      id: n.id,
      title: n.title ?? "Task",
      status: String(n.status ?? "todo").toLowerCase(),
      description: n.description ?? null,
      milestoneId: milestone.id,
      portalTaskId: strOrNull(d.portal_task_id),
      portalMilestoneId: strOrNull(d.portal_milestone_id),
      dueDate: strOrNull(d.due_date) ?? strOrNull(d.dueDate),
      raw: n,
    });
  }
  return tasks.sort((a, b) => a.title.localeCompare(b.title));
}

export interface MilestoneProgress {
  total: number;
  done: number;
  pct: number;
}

export function milestoneProgress(tasks: DerivedTask[]): MilestoneProgress {
  const total = tasks.length;
  const done = tasks.filter((t) => COMPLETED.has(t.status)).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  return { total, done, pct };
}

export function isTaskCompleted(status: string | null | undefined): boolean {
  return COMPLETED.has(String(status ?? "").toLowerCase());
}
