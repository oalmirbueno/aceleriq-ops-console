/**
 * portal-bridge — leitura read-only do Portal Aceleriq para o OPS V2.
 *
 * Deploy tag: v2.2.7 — inspectPortalPayload + nested task→milestone resolver.
 *  - inspectPortalPayload: diagnóstico seguro do payload real do Portal.
 *  - extrai tasks aninhadas em projects[].milestones[].tasks[] etc., injetando
 *    _containerMilestoneId / _containerProjectId / _jsonPath na task.
 *  - audit com tasksWithDetectedContainerMilestone, tasksWithDirectMilestoneField,
 *    tasksWithNoRelation, tasksDroppedBecauseNoMilestone.
 *  - resolução task→milestone via direct/folder/parent/opsFallback;
 *  - auditPortalSources com contadores por categoria + debug seguro;
 *  - listClients devolve primaryProjectId para CTAs clicáveis.
 *  - projects: requerem id + clientId; filtram deleted/archived/trash.
 *  - milestones: só de projects válidos; filtram deleted/archived/placeholders.
 *  - tasks: só de milestones válidos; resolve milestoneId via alias map robusto.
 *  - clients: displayName resolvido em cascata (name/full_name/company/email/...).
 *  - auditPortalSources expandido com problemas globais.
 *
 * REGRAS:
 *   - Apenas leitura. Sem insert/update/delete. Sem backfill. Sem materialização.
 *   - Não usa pull-portal-tasks, sync-to-portal, backfill ou functions legacy.
 *   - Não escreve em nenhuma tabela do OPS.
 *   - Não chama Supabase do OPS.
 *   - Apenas reencaminha leitura para os endpoints já existentes do Portal:
 *       * ops-full-export    → { projects, tasks, milestones }
 *       * ops-projects-list  → { projects }   (fallback)
 *       * ops-tasks-list     → { tasks }      (fallback)
 *
 * Body (POST): { action, params? }
 *   action: "listClients" | "listProjects" | "getProject"
 *         | "listMilestones" | "listTasks"
 *
 * Resposta normalizada com os tipos definidos em
 * src/v2/data/portalClient.ts.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";
const DEPLOY_TAG = "v2.4.1-recover";

const STATUS_TASK: Record<string, string> = {
  todo: "todo", backlog: "todo", "to-do": "todo", to_do: "todo", draft: "todo",
  doing: "in_progress", in_progress: "in_progress", "in-progress": "in_progress",
  active: "in_progress", andamento: "in_progress",
  blocked: "blocked", bloqueado: "blocked", bloqueada: "blocked",
  done: "done", completed: "done", concluido: "done", "concluído": "done",
  concluida: "done", "concluída": "done", finalizada: "done",
  archived: "archived", arquivado: "archived",
};
const STATUS_MILESTONE: Record<string, string> = {
  planned: "planned", planejado: "planned", todo: "planned",
  doing: "in_progress", in_progress: "in_progress", active: "in_progress",
  done: "done", completed: "done", concluida: "done", concluído: "done",
  paused: "paused", pausado: "paused", on_hold: "paused",
};

const firstString = (...values: unknown[]) => {
  for (const v of values) {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    if (s) return s;
  }
  return "";
};
const numberOr = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function normalizeProgress(...values: unknown[]) {
  for (const v of values) {
    if (v == null || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    return clamp01(n > 1 ? n / 100 : n);
  }
  return 0;
}

function mapTaskStatus(s: unknown) {
  const k = firstString(s).toLowerCase();
  return (STATUS_TASK[k] ?? "todo") as
    | "todo" | "in_progress" | "blocked" | "done" | "archived";
}
function mapMilestoneStatus(s: unknown) {
  const k = firstString(s).toLowerCase();
  return (STATUS_MILESTONE[k] ?? "planned") as
    | "planned" | "in_progress" | "done" | "paused";
}

function projectIdOf(t: Record<string, any>) {
  const meta = (t.metadata ?? {}) as Record<string, any>;
  const data = (t.data ?? {}) as Record<string, any>;
  return firstString(
    t._containerProjectId,
    t.project_id, t.projectId,
    t.portal_project_id, t.portalProjectId,
    t.workspace_id,
    t.project?.id, t.milestone?.project_id, t.folder?.project_id,
    meta.project_id, meta.projectId,
    meta.portal_project_id, meta.portalProjectId,
    data.project_id, data.projectId,
    data.portal_project_id, data.portalProjectId,
  );
}
function milestoneIdOf(t: Record<string, any>) {
  const meta = (t.metadata ?? {}) as Record<string, any>;
  const data = (t.data ?? {}) as Record<string, any>;
  return firstString(
    t._containerMilestoneId,
    t.milestone_id, t.milestoneId,
    t.portal_milestone_id, t.portalMilestoneId,
    t.folder_id, t.portal_folder_id, t.folderId, t.portalFolderId,
    t.ops_milestone_id, t.opsMilestoneId,
    t.parent_milestone_id, t.parentMilestoneId,
    t.stage_id, t.phase_id, t.column_id,
    t.milestone?.id, t.milestone?.uuid,
    t.folder?.id,
    meta.milestone_id, meta.milestoneId,
    meta.portal_milestone_id, meta.portalMilestoneId,
    meta.folder_id, meta.portal_folder_id,
    data.milestone_id, data.milestoneId,
    data.portal_milestone_id, data.portalMilestoneId,
    data.folder_id, data.portal_folder_id,
  );
}

/** Tenta resolver milestoneId de uma task em categorias.
 *  Retorna o primeiro hit + a categoria que resolveu. */
function resolveTaskMilestone(
  t: Record<string, any>,
  aliasToId: Map<string, string>,
): { id: string; category: "container" | "direct" | "folder" | "parent" | "" } {
  // 0) Container (task aninhada em milestone no payload)
  const containerId = typeof t._containerMilestoneId === "string" ? t._containerMilestoneId.trim() : "";
  if (containerId) {
    const hit = aliasToId.get(containerId) ?? containerId;
    return { id: hit, category: "container" };
  }
  const meta = (t.metadata ?? {}) as Record<string, any>;
  const data = (t.data ?? {}) as Record<string, any>;
  const raw = (t.raw ?? {}) as Record<string, any>;
  const node = (t.node ?? {}) as Record<string, any>;
  const task = (t.task ?? {}) as Record<string, any>;
  const buckets: { cat: "direct" | "folder" | "parent"; vals: unknown[] }[] = [
    { cat: "direct", vals: [
      t._containerMilestoneId,
      t.milestone_id, t.milestoneId, t.portal_milestone_id, t.portalMilestoneId,
      t.ops_milestone_id, t.opsMilestoneId,
      t.parent_milestone_id, t.parentMilestoneId,
      t.milestone?.id, t.milestone?.uuid,
      meta.milestone_id, meta.milestoneId, meta.portal_milestone_id, meta.portalMilestoneId,
      data.milestone_id, data.milestoneId, data.portal_milestone_id, data.portalMilestoneId,
      raw.milestone_id, raw.portal_milestone_id,
      node.milestone_id, node.portal_milestone_id,
      task.milestone_id, task.portal_milestone_id,
    ]},
    { cat: "folder", vals: [
      t.folder_id, t.portal_folder_id, t.folderId, t.portalFolderId,
      t.folder?.id, t.folder?.uuid,
      meta.folder_id, meta.portal_folder_id, meta.folderId, meta.portalFolderId,
      data.folder_id, data.portal_folder_id, data.folderId, data.portalFolderId,
      raw.folder_id, raw.portal_folder_id,
      node.folder_id, node.portal_folder_id,
    ]},
    { cat: "parent", vals: [
      t.parent_id, t.parentId, t.parent_node_id, t.parentNodeId,
      t.stage_id, t.phase_id, t.column_id,
      meta.parent_id, meta.parentId, meta.parent_node_id, meta.parentNodeId,
      data.parent_id, data.parentId, data.parent_node_id, data.parentNodeId,
      raw.parent_id, raw.parent_node_id,
      node.parent_id, node.parent_node_id,
    ]},
  ];
  for (const b of buckets) {
    for (const v of b.vals) {
      const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
      if (!s) continue;
      const hit = aliasToId.get(s);
      if (hit) return { id: hit, category: b.cat };
    }
  }
  return { id: "", category: "" };
}

/** Coleta keys interessantes do payload da task para debug audit. */
function debugTaskShape(t: Record<string, any>) {
  const meta = (t.metadata ?? {}) as Record<string, any>;
  const data = (t.data ?? {}) as Record<string, any>;
  const interesting = [
    "milestone_id", "milestoneId", "portal_milestone_id", "portalMilestoneId",
    "ops_milestone_id", "opsMilestoneId",
    "folder_id", "folderId", "portal_folder_id", "portalFolderId",
    "parent_id", "parentId", "parent_node_id", "parentNodeId",
    "stage_id", "phase_id", "column_id",
    "node_id", "ops_node_id",
  ];
  const found: Record<string, string> = {};
  for (const k of interesting) {
    const v = (t as any)[k] ?? meta[k] ?? data[k];
    if (v != null && v !== "") found[k] = String(v).slice(0, 60);
  }
  return {
    keys: Object.keys(t),
    metadataKeys: Object.keys(meta),
    dataKeys: Object.keys(data),
    candidates: found,
  };
}

/** Coleta TODOS os ids/aliases possíveis de um milestone bruto. */
function milestoneAliasesOf(m: Record<string, any>): string[] {
  const meta = (m.metadata ?? {}) as Record<string, any>;
  const data = (m.data ?? {}) as Record<string, any>;
  const raw = [
    m.id, m.milestone_id, m.milestoneId,
    m.portal_milestone_id, m.portalMilestoneId,
    m.ops_milestone_id, m.opsMilestoneId,
    m.folder_id, m.portal_folder_id, m.folderId, m.portalFolderId,
    m.node_id, m.nodeId, m.uuid,
    meta.id, meta.milestone_id, meta.milestoneId,
    meta.portal_milestone_id, meta.portalMilestoneId,
    meta.folder_id, meta.portal_folder_id,
    meta.node_id,
    data.id, data.milestone_id, data.milestoneId,
    data.portal_milestone_id, data.portalMilestoneId,
    data.folder_id, data.portal_folder_id,
    data.node_id,
  ];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

function clientIdOf(p: Record<string, any>) {
  return firstString(
    p.client_id, p.profile_id, p.customer_id, p.user_id,
    p.client?.id, p.profile?.id,
  );
}
function clientNameOf(p: Record<string, any>) {
  const c = (p.client ?? {}) as Record<string, any>;
  const pr = (p.profile ?? {}) as Record<string, any>;
  const cMeta = (c.metadata ?? {}) as Record<string, any>;
  const cRum = (c.raw_user_meta_data ?? {}) as Record<string, any>;
  const prMeta = (pr.metadata ?? {}) as Record<string, any>;
  return firstString(
    p.client_name, p.customer_name,
    c.name, c.full_name, c.fullName, c.display_name, c.displayName,
    c.company, c.company_name, c.companyName, c.business_name,
    pr.name, pr.full_name, pr.fullName, pr.display_name, pr.displayName,
    cMeta.name, cMeta.client_name, cMeta.full_name, cMeta.fullName,
    cMeta.company, cMeta.company_name, cMeta.companyName,
    cRum.name, cRum.full_name, cRum.fullName,
    prMeta.name, prMeta.full_name,
  );
}
function clientCompanyOf(p: Record<string, any>): string {
  const c = (p.client ?? {}) as Record<string, any>;
  const cMeta = (c.metadata ?? {}) as Record<string, any>;
  return firstString(
    p.client_company, c.company, c.company_name, c.companyName, c.business_name,
    cMeta.company, cMeta.company_name, cMeta.companyName, cMeta.business_name,
  );
}
function clientEmailOf(p: Record<string, any>): string {
  const c = (p.client ?? {}) as Record<string, any>;
  const pr = (p.profile ?? {}) as Record<string, any>;
  const cMeta = (c.metadata ?? {}) as Record<string, any>;
  return firstString(
    p.client_email, c.email, pr.email, cMeta.email,
  );
}
function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
function resolveClientDisplayName(name: string, company: string, email: string): { displayName: string; missing: boolean } {
  const candidates = [name, company, email].map((s) => (s || "").trim()).filter(Boolean);
  for (const cand of candidates) {
    if (isUuidLike(cand)) continue;
    return { displayName: cand, missing: false };
  }
  return { displayName: "", missing: true };
}

// ---------- Portal fetch (read-only) ----------

async function fetchFullExport(headers: Record<string, string>) {
  try {
    const res = await fetch(`${PORTAL_BASE}/ops-full-export`, { method: "POST", headers });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return null;
    const projects = Array.isArray(body.projects) ? body.projects as Record<string, any>[] : [];
    const briefings = Array.isArray(body.briefings) ? body.briefings as Record<string, any>[] : [];
    const tasksTop = Array.isArray(body.tasks) ? body.tasks as Record<string, any>[] : [];
    const milestonesTop = Array.isArray(body.milestones) ? body.milestones as Record<string, any>[] : [];

    // ---- Extrai estruturas aninhadas (projects[].milestones[].tasks[] etc.) ----
    // Ao iterar, injeta no objeto task:
    //   _containerMilestoneId — id detectado do milestone pai
    //   _containerProjectId   — id detectado do project pai
    //   _jsonPath             — caminho no JSON (ex: projects[0].milestones[1].tasks[3])
    const nestedMilestones: Record<string, any>[] = [];
    const nestedTasks: Record<string, any>[] = [];
    const TASK_KEYS = ["tasks", "items", "cards", "nodes", "children"];
    const MS_KEYS = ["milestones", "folders", "stages", "phases", "columns", "groups", "sections"];

    function pickId(o: Record<string, any>): string {
      return firstString(o?.id, o?.uuid, o?.milestone_id, o?.portal_milestone_id, o?.folder_id, o?.project_id);
    }
    function walkMilestone(ms: Record<string, any>, projectId: string, path: string) {
      if (!ms || typeof ms !== "object") return;
      const msId = pickId(ms);
      // marca o ms com projectId do container se ausente
      if (projectId && !ms.project_id && !ms.projectId) (ms as any)._containerProjectId = projectId;
      nestedMilestones.push(ms);
      for (const tk of TASK_KEYS) {
        const arr = (ms as any)[tk];
        if (!Array.isArray(arr)) continue;
        arr.forEach((t: any, i: number) => {
          if (!t || typeof t !== "object") return;
          if (msId) (t as any)._containerMilestoneId = msId;
          if (projectId) (t as any)._containerProjectId = projectId;
          (t as any)._jsonPath = `${path}.${tk}[${i}]`;
          nestedTasks.push(t);
        });
      }
      // Sub-milestones (raras, mas defensivo)
      for (const mk of MS_KEYS) {
        const arr = (ms as any)[mk];
        if (!Array.isArray(arr)) continue;
        arr.forEach((sub: any, i: number) => {
          walkMilestone(sub, projectId, `${path}.${mk}[${i}]`);
        });
      }
    }
    projects.forEach((p, pi) => {
      const projectId = firstString(p.id, p.project_id, p.uuid);
      const ppath = `projects[${pi}]`;
      // Tasks soltas direto no projeto
      for (const tk of TASK_KEYS) {
        const arr = (p as any)[tk];
        if (!Array.isArray(arr)) continue;
        arr.forEach((t: any, i: number) => {
          if (!t || typeof t !== "object") return;
          if (projectId) (t as any)._containerProjectId = projectId;
          (t as any)._jsonPath = `${ppath}.${tk}[${i}]`;
          nestedTasks.push(t);
        });
      }
      // Milestones aninhados
      for (const mk of MS_KEYS) {
        const arr = (p as any)[mk];
        if (!Array.isArray(arr)) continue;
        arr.forEach((ms: any, i: number) => {
          walkMilestone(ms, projectId, `${ppath}.${mk}[${i}]`);
        });
      }
    });

    // Merge dedupe por id (top-level vence se conflitar)
    const msSeen = new Set<string>();
    const milestones: Record<string, any>[] = [];
    for (const m of [...milestonesTop, ...nestedMilestones]) {
      const id = pickId(m);
      if (!id) { milestones.push(m); continue; }
      if (msSeen.has(id)) continue;
      msSeen.add(id); milestones.push(m);
    }
    const tSeen = new Set<string>();
    const tasks: Record<string, any>[] = [];
    for (const t of [...tasksTop, ...nestedTasks]) {
      const id = firstString(t.id, t.task_id, t.uuid, t.portal_task_id);
      if (!id) { tasks.push(t); continue; }
      if (tSeen.has(id)) continue;
      tSeen.add(id); tasks.push(t);
    }
    return { projects, tasks, milestones, briefings };
  } catch {
    return null;
  }
}

async function fetchProjectsFallback(headers: Record<string, string>) {
  try {
    const res = await fetch(`${PORTAL_BASE}/ops-projects-list`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return [];
    return Array.isArray((body as any).projects)
      ? (body as any).projects as Record<string, any>[]
      : Array.isArray(body) ? body as Record<string, any>[] : [];
  } catch { return []; }
}

async function fetchTasksFallback(headers: Record<string, string>) {
  try {
    const res = await fetch(`${PORTAL_BASE}/ops-tasks-list`, {
      method: "POST", headers, body: JSON.stringify({ limit: 1000 }),
    });
    if (!res.ok) return { tasks: [], milestones: [] };
    const body = await res.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return { tasks: [], milestones: [] };
    return {
      tasks: Array.isArray((body as any).tasks)
        ? (body as any).tasks as Record<string, any>[]
        : Array.isArray(body) ? body as Record<string, any>[] : [],
      milestones: Array.isArray((body as any).milestones)
        ? (body as any).milestones as Record<string, any>[] : [],
    };
  } catch { return { tasks: [], milestones: [] }; }
}

async function fetchClientsList(headers: Record<string, string>): Promise<Record<string, any>[]> {
  try {
    const res = await fetch(`${PORTAL_BASE}/ops-clients-list`, {
      method: "POST", headers, body: JSON.stringify({}),
    });
    if (!res.ok) return [];
    const body = await res.json().catch(() => null) as any;
    if (!body) return [];
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.clients)) return body.clients;
    if (Array.isArray(body.profiles)) return body.profiles;
    if (Array.isArray(body.data)) return body.data;
    return [];
  } catch { return []; }
}

/** Extrai displayName/company/email/clientId de um registro bruto do Portal
 *  (cliente ou profile). Cobre cascata extensa de campos. */
function extractClientFields(raw: Record<string, any>): { id: string; name: string; company: string; email: string } {
  const meta = (raw.metadata ?? {}) as Record<string, any>;
  const rum = (raw.raw_user_meta_data ?? {}) as Record<string, any>;
  const id = firstString(
    raw.id, raw.client_id, raw.profile_id, raw.user_id, raw.uuid,
    meta.client_id, meta.profile_id,
  );
  const company = firstString(
    raw.company, raw.companyName, raw.company_name, raw.business_name, raw.businessName,
    meta.company, meta.companyName, meta.company_name, meta.business_name,
    rum.company, rum.companyName, rum.company_name,
  );
  const name = firstString(
    raw.name, raw.full_name, raw.fullName, raw.display_name, raw.displayName,
    raw.client_name, raw.profile_name,
    meta.name, meta.full_name, meta.fullName, meta.display_name, meta.displayName, meta.client_name,
    rum.name, rum.full_name, rum.fullName, rum.display_name,
  );
  const email = firstString(
    raw.email, raw.contact_email, meta.email, rum.email,
  );
  return { id, name, company, email };
}

// ---------- Normalizers ----------

function normalizeTask(t: Record<string, any>) {
  return {
    id: firstString(t.id, t.task_id, t.portal_task_id, t.ops_node_id, t.uuid),
    projectId: projectIdOf(t),
    milestoneId: milestoneIdOf(t),
    title: firstString(t.title, t.name, "Tarefa"),
    description: t.description ?? t.notes ?? null,
    status: mapTaskStatus(t.status ?? t.state),
    progress: normalizeProgress(t.progress, t.completion, t.percent),
    assigneeName: firstString(
      t.assignee_name, t.assignee?.name, t.responsible_name,
      t.responsible?.name,
    ) || null,
    dueAt: firstString(t.due_at, t.deadline, t.due_date) || null,
    updatedAt: firstString(
      t.updated_at, t.modified_at, t.created_at,
    ) || new Date().toISOString(),
  };
}

function normalizeMilestone(
  m: Record<string, any>,
  tasksByMilestone: Map<string, ReturnType<typeof normalizeTask>[]>,
) {
  const meta = (m.metadata ?? {}) as Record<string, any>;
  const data = (m.data ?? {}) as Record<string, any>;
  const id = firstString(
    m.id, m.milestone_id, m.milestoneId,
    m.portal_milestone_id, m.portalMilestoneId,
    m.folder_id, m.portal_folder_id, m.uuid,
    meta.milestone_id, meta.portal_milestone_id,
    data.milestone_id, data.portal_milestone_id,
  );
  const tasks = tasksByMilestone.get(id) ?? [];
  const tasksDoneCount = tasks.filter((t) => t.status === "done").length;
  const explicit = normalizeProgress(m.progress, m.completion, m.percent);
  const derived = tasks.length === 0 ? 0 : tasksDoneCount / tasks.length;
  const rawStatus = firstString(m.status, m.state).toLowerCase();
  return {
    id,
    projectId: firstString(
      m._containerProjectId,
      m.project_id, m.projectId,
      m.portal_project_id, m.portalProjectId,
      m.workspace_id, m.project?.id,
      meta.project_id, meta.portal_project_id,
      data.project_id, data.portal_project_id,
    ),
    title: firstString(m.title, m.name, m.folder_name, "Milestone"),
    description: m.description ?? null,
    status: mapMilestoneStatus(m.status ?? m.state),
    progress: explicit || derived,
    tasksCount: tasks.length,
    tasksDoneCount,
    order: numberOr(m.position ?? m.order ?? m.sort_order ?? m.sequence, 9999),
    dueAt: firstString(m.due_at, m.deadline, m.due_date) || null,
    _deletedAt: firstString(m.deleted_at, m.deletedAt, m.archived_at, m.archivedAt) || null,
    _archived: Boolean(m.archived || m.is_archived || m.isArchived),
    _rawStatus: rawStatus,
  };
}

function normalizeProject(
  p: Record<string, any>,
  milestonesByProject: Map<string, ReturnType<typeof normalizeMilestone>[]>,
  tasksByProject: Map<string, ReturnType<typeof normalizeTask>[]>,
) {
  const id = firstString(p.id, p.project_id, p.uuid);
  const ms = milestonesByProject.get(id) ?? [];
  const tasks = tasksByProject.get(id) ?? [];
  const explicit = normalizeProgress(p.progress, p.completion, p.percent);
  const derived = tasks.length === 0 ? 0
    : tasks.filter((t) => t.status === "done").length / tasks.length;
  const currentMilestone = ms.find((m) => m.status === "in_progress")
    ?? ms.find((m) => m.status === "planned")
    ?? ms[0]
    ?? null;
  const status = (firstString(p.status, p.state).toLowerCase() || "active");
  return {
    id,
    clientId: clientIdOf(p),
    clientName: clientNameOf(p) || "Cliente",
    clientCompany: clientCompanyOf(p) || "",
    clientEmail: clientEmailOf(p) || "",
    name: firstString(p.name, p.title, "Projeto"),
    status: (["active", "paused", "done", "archived"].includes(status)
      ? status : "active") as "active" | "paused" | "done" | "archived",
    progress: explicit || derived,
    currentMilestoneId: currentMilestone?.id ?? null,
    updatedAt: firstString(p.updated_at, p.modified_at, p.created_at)
      || new Date().toISOString(),
    _deletedAt: firstString(p.deleted_at, p.deletedAt, p.archived_at, p.archivedAt) || null,
    _archived: Boolean(p.archived || p.is_archived || p.isArchived),
    _rawStatus: status,
  };
}

// ---------- Handler ----------

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let body: { action?: string; params?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { /* allow empty */ }
  const action = String(body.action ?? "").trim();
  const params = (body.params ?? {}) as Record<string, unknown>;

  if (!action) return json({ error: "missing_action" }, 400);

  // ---------- OPS context actions (read-only, lê banco do OPS) ----------
  // Separadas das portal actions. Não chamam o Portal. Não escrevem.
  if (action === "listBriefings" || action === "getBriefing") {
    return await handleOpsContextAction(action, params);
  }

  // Debug read-only: varre context_entries com service_role (ignora RLS).
  if (action === "dumpOpsContext") {
    const sb = opsSupabase();
    if (!sb) return json({ error: "missing_ops_supabase_env" }, 500);
    const clientId = String((params as any).clientId ?? "").trim();
    let q = sb.from("context_entries").select("*").limit(500);
    if (clientId) q = q.or(`client_id.eq.${clientId},workspace_id.not.is.null`);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, count: data?.length ?? 0, entries: data ?? [] });
  }

  // ---------- Portal actions (read-only via Portal endpoints) ----------
  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";
  if (!PORTAL_SECRET || !PORTAL_ANON) {
    return json({
      error: "missing_portal_secrets",
      hint: "PORTAL_WEBHOOK_SECRET e PORTAL_ANON_KEY precisam estar configurados no projeto OPS.",
    }, 500);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-webhook-secret": PORTAL_SECRET,
    apikey: PORTAL_ANON,
    Authorization: `Bearer ${PORTAL_ANON}`,
  };

  // 1) Tenta full-export (1 round-trip) — fonte preferida.
  let projectsRaw: Record<string, any>[] = [];
  let tasksRaw: Record<string, any>[] = [];
  let milestonesRaw: Record<string, any>[] = [];
  let briefingsRaw: Record<string, any>[] = [];

  const full = await fetchFullExport(headers);
  if (full) {
    projectsRaw = full.projects;
    tasksRaw = full.tasks;
    milestonesRaw = full.milestones;
    briefingsRaw = full.briefings;
  }

  // 2) Fallbacks só quando full-export não estiver disponível.
  if (projectsRaw.length === 0) projectsRaw = await fetchProjectsFallback(headers);
  if (tasksRaw.length === 0) {
    const fb = await fetchTasksFallback(headers);
    tasksRaw = fb.tasks;
    if (milestonesRaw.length === 0) milestonesRaw = fb.milestones;
  }

  // Fetch global clients list (Portal exposes ops-clients-list with names/company).
  // Used to enrich projects.clientName when the project payload lacks it.
  const clientsRaw = await fetchClientsList(headers);
  const clientsMap = new Map<string, { name: string; company: string; email: string }>();
  for (const c of clientsRaw) {
    const f = extractClientFields(c);
    if (!f.id) continue;
    const prev = clientsMap.get(f.id);
    if (!prev) {
      clientsMap.set(f.id, { name: f.name, company: f.company, email: f.email });
    } else {
      clientsMap.set(f.id, {
        name: prev.name || f.name,
        company: prev.company || f.company,
        email: prev.email || f.email,
      });
    }
  }

  // ---------- Build alias map (milestones) ----------
  // Mapeia qualquer alias conhecido → id canônico do milestone.
  const milestoneAliasToId = new Map<string, string>();
  for (const m of milestonesRaw) {
    const aliases = milestoneAliasesOf(m);
    const canonical = aliases[0];
    if (!canonical) continue;
    for (const a of aliases) {
      if (!milestoneAliasToId.has(a)) milestoneAliasToId.set(a, canonical);
    }
  }

  // ---------- Build derived indexes ----------
  let tasksResolvedByDirectMilestoneId = 0;
  let tasksResolvedByFolderId = 0;
  let tasksResolvedByParentId = 0;
  let tasksResolvedByContainer = 0;
  const tasksNormPairs: { task: ReturnType<typeof normalizeTask>; raw: Record<string, any>; resolvedBy: "container" | "direct" | "folder" | "parent" | "" }[] = [];
  for (const rawT of tasksRaw) {
    const t = normalizeTask(rawT);
    if (!t.id || !t.projectId) continue;
    let resolvedBy: "container" | "direct" | "folder" | "parent" | "" = "";
    const containerId = typeof (rawT as any)._containerMilestoneId === "string" ? (rawT as any)._containerMilestoneId.trim() : "";
    if (containerId) {
      t.milestoneId = milestoneAliasToId.get(containerId) ?? containerId;
      resolvedBy = "container";
    } else if (t.milestoneId && milestoneAliasToId.has(t.milestoneId)) {
      t.milestoneId = milestoneAliasToId.get(t.milestoneId)!;
      resolvedBy = "direct";
    } else {
      const r = resolveTaskMilestone(rawT, milestoneAliasToId);
      if (r.id) { t.milestoneId = r.id; resolvedBy = r.category; }
    }
    if (resolvedBy === "container") tasksResolvedByContainer++;
    else if (resolvedBy === "direct") tasksResolvedByDirectMilestoneId++;
    else if (resolvedBy === "folder") tasksResolvedByFolderId++;
    else if (resolvedBy === "parent") tasksResolvedByParentId++;
    tasksNormPairs.push({ task: t, raw: rawT, resolvedBy });
  }
  const tasksNorm = tasksNormPairs.map((p) => p.task);
  const tasksByMilestone = new Map<string, typeof tasksNorm>();
  const tasksByProject = new Map<string, typeof tasksNorm>();
  for (const t of tasksNorm) {
    if (t.milestoneId) {
      const list = tasksByMilestone.get(t.milestoneId) ?? [];
      list.push(t); tasksByMilestone.set(t.milestoneId, list);
    }
    const lp = tasksByProject.get(t.projectId) ?? [];
    lp.push(t); tasksByProject.set(t.projectId, lp);
  }

  const milestonesNorm = milestonesRaw
    .map((m) => normalizeMilestone(m, tasksByMilestone))
    .filter((m) => {
      if (!m.id || !m.projectId) return false;
      if ((m as any)._deletedAt) return false;
      if ((m as any)._archived) return false;
      const rs = (m as any)._rawStatus as string;
      if (rs === "deleted" || rs === "archived" || rs === "trash" || rs === "trashed") return false;
      const t = m.title.trim().toLowerCase();
      if (t === "sem milestone" || t === "no milestone" || t === "milestone") return false;
      return true;
    });
  // Dedupe by id
  {
    const seenMs = new Set<string>();
    for (let i = milestonesNorm.length - 1; i >= 0; i--) {
      if (seenMs.has(milestonesNorm[i].id)) milestonesNorm.splice(i, 1);
      else seenMs.add(milestonesNorm[i].id);
    }
  }
  const milestonesByProject = new Map<string, typeof milestonesNorm>();
  for (const m of milestonesNorm) {
    const lp = milestonesByProject.get(m.projectId) ?? [];
    lp.push(m); milestonesByProject.set(m.projectId, lp);
  }

  const projectsNorm = projectsRaw
    .map((p) => normalizeProject(p, milestonesByProject, tasksByProject))
    .filter((p) => {
      if (!p.id) return false;
      if (!p.clientId) return false;
      if ((p as any)._deletedAt) return false;
      if ((p as any)._archived) return false;
      const rs = (p as any)._rawStatus as string;
      if (rs === "deleted" || rs === "trash" || rs === "trashed") return false;
      return true;
    });

  // ---------- Enriquecimento de cliente por projeto ----------
  // Resolve displayName real (cascata name/company/email) por clientId,
  // agregando dados de TODOS os projetos do mesmo cliente. Aplica de volta
  // em cada projectNorm para garantir que getProject/listProjects nunca
  // retornem clientName genérico ("Cliente").
  {
    type CAgg = { name: string; company: string; email: string };
    const byClient = new Map<string, CAgg>();
    for (const p of projectsNorm) {
      if (!p.clientId) continue;
      const c = byClient.get(p.clientId) ?? { name: "", company: "", email: "" };
      const candName = (p.clientName || "").trim();
      if (!c.name && candName && candName.toLowerCase() !== "cliente" && !isUuidLike(candName)) c.name = candName;
      if (!c.company && (p as any).clientCompany) c.company = (p as any).clientCompany;
      if (!c.email && (p as any).clientEmail) c.email = (p as any).clientEmail;
      byClient.set(p.clientId, c);
    }
    // Merge global clientsMap (from ops-clients-list) — fonte primária de
    // displayName/company/email quando o payload de projects não traz.
    for (const [cid, info] of clientsMap.entries()) {
      const prev = byClient.get(cid) ?? { name: "", company: "", email: "" };
      byClient.set(cid, {
        name: prev.name || info.name,
        company: prev.company || info.company,
        email: prev.email || info.email,
      });
    }
    for (const p of projectsNorm) {
      if (!p.clientId) continue;
      const c = byClient.get(p.clientId) ?? { name: "", company: "", email: "" };
      const { displayName, missing } = resolveClientDisplayName(c.name, c.company, c.email);
      const operationalName = displayName || c.company || c.email || "";
      (p as any).clientName = operationalName;
      (p as any).clientDisplayName = operationalName;
      (p as any).clientCompany = c.company || null;
      (p as any).clientEmail = c.email || null;
      (p as any).clientProblems = missing ? ["missing_display_name"] : [];
    }
  }

  // Set de project ids válidos — usado para filtrar milestones/tasks órfãs.
  const validProjectIds = new Set(projectsNorm.map((p) => p.id));
  // Reduz milestones a apenas projetos válidos.
  for (const [pid] of [...milestonesByProject]) {
    if (!validProjectIds.has(pid)) milestonesByProject.delete(pid);
  }
  const validMilestoneIds = new Set<string>();
  for (const ms of milestonesByProject.values()) for (const m of ms) validMilestoneIds.add(m.id);

  // Filtra tasks: precisam ter milestoneId real (existente). Tasks sem
  // milestone real NÃO entram no canvas.
  const tasksFiltered = tasksNorm.filter(
    (t) => validProjectIds.has(t.projectId) && t.milestoneId && validMilestoneIds.has(t.milestoneId),
  );
  // Reconstrói tasksByProject a partir das filtradas (para listTasks).
  tasksByProject.clear();
  for (const t of tasksFiltered) {
    const lp = tasksByProject.get(t.projectId) ?? [];
    lp.push(t); tasksByProject.set(t.projectId, lp);
  }

  // ---------- Dispatch ----------
  switch (action) {
    case "recoverStopBriefings": {
      // Recuperação forense read-only, deliberadamente limitada aos IDs já
      // confirmados da Stop Informática. Não aceita escopo arbitrário.
      const STOP_PORTAL_CLIENT_IDS = new Set([
        "6a847578-ba39-44cd-be61-08e34e18e4c9",
      ]);
      const STOP_PORTAL_PROJECT_IDS = new Set([
        "626fe41b-2ed0-4236-9e6b-6bb9a39b6417",
      ]);
      const recovered = briefingsRaw.filter((briefing) => {
        const clientId = firstString(briefing.client_id, briefing.clientId);
        const projectId = firstString(briefing.project_id, briefing.projectId);
        return STOP_PORTAL_CLIENT_IDS.has(clientId) || STOP_PORTAL_PROJECT_IDS.has(projectId);
      });
      return json({
        ok: true,
        readOnly: true,
        source: "portal.ops-full-export.briefings",
        count: recovered.length,
        briefings: recovered,
      });
    }
    case "listClients": {
      const includeAll = (params as any).includeAll === true || (params as any).includeAll === "1";
      type Agg = {
        id: string;
        name: string;
        company: string;
        email: string;
        activeProjectsCount: number;
        primaryProjectId: string;
        primaryProjectName: string;
        primaryProjectUpdatedAt: string;
      };
      const map = new Map<string, Agg>();
      for (const p of projectsNorm) {
        if (!p.clientId) continue;
        const c = map.get(p.clientId) ?? {
          id: p.clientId, name: "", company: "", email: "", activeProjectsCount: 0,
          primaryProjectId: "", primaryProjectName: "", primaryProjectUpdatedAt: "",
        };
        if (p.status === "active") c.activeProjectsCount += 1;
        if (!c.name && p.clientName && !isUuidLike(p.clientName)) c.name = p.clientName;
        if (!c.company && (p as any).clientCompany) c.company = (p as any).clientCompany;
        if (!c.email && (p as any).clientEmail) c.email = (p as any).clientEmail;
        const isActive = p.status === "active";
        const beats = isActive && (
          !c.primaryProjectId ||
          (p.updatedAt && p.updatedAt > c.primaryProjectUpdatedAt)
        );
        if (beats) {
          c.primaryProjectId = p.id;
          c.primaryProjectName = p.name;
          c.primaryProjectUpdatedAt = p.updatedAt || "";
        }
        map.set(p.clientId, c);
      }
      // Reforça com global clientsMap.
      for (const [cid, info] of clientsMap.entries()) {
        const prev = map.get(cid);
        if (!prev) continue; // só clientes com projetos válidos entram
        if (!prev.name) prev.name = info.name;
        if (!prev.company) prev.company = info.company;
        if (!prev.email) prev.email = info.email;
      }
      const clients = [...map.values()].map((c) => {
        const { displayName, missing } = resolveClientDisplayName(c.name, c.company, c.email);
        const problems: string[] = [];
        if (missing) problems.push("missing_display_name");
        if (c.activeProjectsCount === 0) problems.push("client_without_active_project");
        const included = !missing && (includeAll || c.activeProjectsCount > 0);
        return {
          id: c.id,
          name: displayName || "Cliente sem nome",
          displayName: displayName || "Cliente sem nome",
          company: c.company || null,
          email: c.email || null,
          activeProjectsCount: c.activeProjectsCount,
          primaryProjectId: c.primaryProjectId || null,
          primaryProjectName: c.primaryProjectName || null,
          source: full ? "ops-full-export" : "fallback",
          included,
          problems,
        };
      });
      const visible = includeAll ? clients : clients.filter((c) => c.included);
      visible.sort((a, b) => a.displayName.localeCompare(b.displayName));
      return json({ ok: true, clients: visible });
    }
    case "listProjects": {
      const clientId = firstString((params as any).clientId);
      const includeAll = (params as any).includeAll === true || (params as any).includeAll === "1";
      let list = clientId
        ? projectsNorm.filter((p) => p.clientId === clientId)
        : projectsNorm;
      if (!includeAll) list = list.filter((p) => p.status === "active");
      const clean = list.map(({ _deletedAt: _d, _archived: _a, _rawStatus: _r, ...rest }: any) => rest);
      return json({ ok: true, projects: clean });
    }
    case "auditPortalSources": {
      const tasksWithoutValidMilestone = tasksNorm.filter(
        (t) => validProjectIds.has(t.projectId) && (!t.milestoneId || !validMilestoneIds.has(t.milestoneId)),
      );
      const placeholderMilestonesRemoved = milestonesRaw
        .map((m) => normalizeMilestone(m, tasksByMilestone))
        .filter((m) => {
          const t = m.title.trim().toLowerCase();
          return t === "sem milestone" || t === "no milestone" || t === "milestone";
        }).length;

      const projectRows = projectsRaw.map((rawP) => {
        const id = firstString(rawP.id, rawP.project_id, rawP.uuid);
        const norm = projectsNorm.find((p) => p.id === id);
        const ms = id ? (milestonesByProject.get(id) ?? []) : [];
        const ts = id ? (tasksByProject.get(id) ?? []) : [];
        const problems: string[] = [];
        if (!id) problems.push("missing_id");
        const cid = firstString(clientIdOf(rawP));
        if (!cid) problems.push("project_without_valid_client");
        if (!norm) {
          if (!cid) problems.push("missing_clientId");
          if (firstString(rawP.deleted_at, rawP.archived_at)) problems.push("deleted_or_archived");
          if (rawP.archived || rawP.is_archived) problems.push("archived_flag");
          const rs = firstString(rawP.status, rawP.state).toLowerCase();
          if (rs && rs !== "active") problems.push("non_active_project_filtered");
        }
        return {
          projectId: id,
          projectName: firstString(rawP.name, rawP.title, "—"),
          status: firstString(rawP.status, rawP.state, "—"),
          milestonesCount: ms.length,
          tasksCount: ts.length,
          source: full ? "ops-full-export" : "fallback",
          included: Boolean(norm),
          problems,
        };
      });

      // Clients (mesma lógica do listClients) para audit.
      type Agg = { id: string; name: string; company: string; email: string; activeProjectsCount: number };
      const cmap = new Map<string, Agg>();
      for (const p of projectsNorm) {
        if (!p.clientId) continue;
        const c = cmap.get(p.clientId) ?? {
          id: p.clientId, name: "", company: "", email: "", activeProjectsCount: 0,
        };
        if (p.status === "active") c.activeProjectsCount += 1;
        if (!c.name && p.clientName && !isUuidLike(p.clientName)) c.name = p.clientName;
        if (!c.company && (p as any).clientCompany) c.company = (p as any).clientCompany;
        if (!c.email && (p as any).clientEmail) c.email = (p as any).clientEmail;
        cmap.set(p.clientId, c);
      }
      const clientRows = [...cmap.values()].map((c) => {
        const { displayName, missing } = resolveClientDisplayName(c.name, c.company, c.email);
        const problems: string[] = [];
        if (missing) problems.push("missing_display_name");
        if (c.activeProjectsCount === 0) problems.push("client_without_active_project");
        return {
          clientId: c.id,
          displayName: displayName || null,
          company: c.company || null,
          email: c.email || null,
          activeProjectsCount: c.activeProjectsCount,
          included: !missing && c.activeProjectsCount > 0,
          problems,
        };
      });

      return json({
        ok: true,
        deployTag: DEPLOY_TAG,
        totals: {
          projectsRaw: projectsRaw.length,
          projectsValid: projectsNorm.length,
          clientsRaw: clientsRaw.length,
          clientsWithDisplayName: clientRows.filter((c) => c.displayName).length,
          clientsMissingDisplayName: clientRows.filter((c) => !c.displayName).length,
          milestonesRaw: milestonesRaw.length,
          milestonesValid: validMilestoneIds.size,
          tasksRaw: tasksRaw.length,
          tasksValid: tasksFiltered.length,
          tasksWithDetectedContainerMilestone: tasksResolvedByContainer,
          tasksWithDirectMilestoneField: tasksResolvedByDirectMilestoneId,
          tasksWithNoRelation: tasksNormPairs.filter((p) => !p.resolvedBy).length,
          tasksDroppedBecauseNoMilestone: tasksNorm.length - tasksFiltered.length,
          tasksResolvedByDirectMilestoneId,
          tasksResolvedByContainer,
          tasksResolvedByFolderId,
          tasksResolvedByParentId,
          tasksStillUnresolved: tasksWithoutValidMilestone.length,
          tasksFilteredOut: tasksNorm.length - tasksFiltered.length,
          tasksWithoutValidMilestone: tasksWithoutValidMilestone.length,
          placeholderMilestonesRemoved,
          clientsTotal: clientRows.length,
          clientsIncluded: clientRows.filter((c) => c.included).length,
        },
        message:
          tasksRaw.length > 0 && tasksFiltered.length === 0
            ? "Relação task→milestone não encontrada no payload atual. Use action inspectPortalPayload para diagnóstico."
            : undefined,
        problemsLegend: [
          "missing_display_name",
          "client_without_active_project",
          "task_without_valid_milestone",
          "task_resolved_by_direct",
          "task_resolved_by_folder",
          "task_resolved_by_parent",
          "project_without_valid_client",
          "placeholder_milestone_removed",
          "non_active_project_filtered",
        ],
        clients: clientRows,
        rows: projectRows,
        tasksWithoutValidMilestone: tasksWithoutValidMilestone.slice(0, 50).map((t) => ({
          taskId: t.id,
          projectId: t.projectId,
          milestoneIdRaw: t.milestoneId || null,
          title: (t.title || "").slice(0, 40),
          problems: ["task_without_valid_milestone"],
        })),
        tasksUnresolvedDebug: tasksNormPairs
          .filter((p) => validProjectIds.has(p.task.projectId) && (!p.task.milestoneId || !validMilestoneIds.has(p.task.milestoneId)))
          .slice(0, 5)
          .map((p) => ({
            taskId: p.task.id,
            titleHash: (p.task.title || "").slice(0, 30),
            projectId: p.task.projectId,
            shape: debugTaskShape(p.raw),
          })),
      });
    }
    case "getProject": {
      const id = firstString((params as any).projectId);
      if (!id) return json({ error: "missing_projectId" }, 400);
      const found = projectsNorm.find((p) => p.id === id) ?? null;
      const project = found
        ? (({ _deletedAt: _d, _archived: _a, _rawStatus: _r, ...rest }: any) => rest)(found)
        : null;
      return json({ ok: true, project });
    }
    case "listMilestones": {
      const projectId = firstString((params as any).projectId);
      if (!projectId) return json({ error: "missing_projectId" }, 400);
      const list = (milestonesByProject.get(projectId) ?? [])
        .slice().sort((a, b) => a.order - b.order)
        .map(({ _deletedAt: _d, _archived: _a, _rawStatus: _r, ...rest }: any) => rest);
      return json({ ok: true, milestones: list });
    }
    case "listTasks": {
      const projectId = firstString((params as any).projectId);
      const milestoneId = firstString((params as any).milestoneId);
      if (!projectId) return json({ error: "missing_projectId" }, 400);
      let list = tasksByProject.get(projectId) ?? [];
      if (milestoneId) list = list.filter((t) => t.milestoneId === milestoneId);
      const debug = (params as any).debug === 1 || (params as any).debug === "1";
      const payload: Record<string, unknown> = { ok: true, tasks: list };
      if (debug) {
        const sampleRaw = tasksRaw.find((t) => projectIdOf(t) === projectId) ?? tasksRaw[0] ?? {};
        payload.debug = {
          tasksRawCount: tasksRaw.length,
          milestonesRawCount: milestonesRaw.length,
          tasksProjectCount: (tasksByProject.get(projectId) ?? []).length,
          tasksWithoutMilestone: (tasksByProject.get(projectId) ?? []).filter((t) => !t.milestoneId).length,
          sampleTaskKeys: Object.keys(sampleRaw),
          sampleMilestoneKeys: Object.keys(milestonesRaw[0] ?? {}),
        };
      }
      return json(payload);
    }
    case "inspectPortalPayload": {
      // Diagnóstico read-only do payload bruto. Mascara dados sensíveis.
      const RELATION_PATTERNS = [
        /milestone/i, /folder/i, /parent/i, /stage/i, /phase/i,
        /column/i, /node/i, /^task/i, /project/i, /group/i, /section/i,
      ];
      const mask = (v: unknown): unknown => {
        if (v == null) return v;
        if (typeof v === "string") {
          if (isUuidLike(v)) return v; // ids ajudam diagnóstico
          return v.length > 80 ? v.slice(0, 80) + "…" : v;
        }
        if (typeof v === "number" || typeof v === "boolean") return v;
        return Array.isArray(v) ? `[array len=${(v as any[]).length}]` : "[object]";
      };
      const safeSample = (o: Record<string, any>) => {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) out[k] = mask(v);
        return out;
      };
      const collectRelationFields = (o: Record<string, any>): Record<string, unknown> => {
        const found: Record<string, unknown> = {};
        const walk = (obj: any, prefix = "") => {
          if (!obj || typeof obj !== "object" || Array.isArray(obj)) return;
          for (const [k, v] of Object.entries(obj)) {
            const path = prefix ? `${prefix}.${k}` : k;
            if (RELATION_PATTERNS.some((re) => re.test(k))) {
              if (v != null && (typeof v === "string" || typeof v === "number")) {
                found[path] = String(v).slice(0, 80);
              }
            }
            if (v && typeof v === "object" && !Array.isArray(v) && prefix.split(".").length < 2) {
              walk(v, path);
            }
          }
        };
        walk(o);
        return found;
      };

      const projectSample = projectsRaw[0]
        ? { keys: Object.keys(projectsRaw[0]), sample: safeSample(projectsRaw[0]) }
        : null;

      const idFieldsOf = (arr: Record<string, any>[]) => {
        const ids = new Set<string>();
        const projIds = new Set<string>();
        for (const o of arr.slice(0, 50)) {
          for (const k of Object.keys(o)) {
            if (/(^|_)id$/i.test(k) || /uuid/i.test(k)) ids.add(k);
            if (/project/i.test(k) && /id/i.test(k)) projIds.add(k);
          }
        }
        return { possibleIdFields: [...ids], possibleProjectIdFields: [...projIds] };
      };

      const milestoneInfo = {
        totalRaw: milestonesRaw.length,
        keys: milestonesRaw[0] ? Object.keys(milestonesRaw[0]) : [],
        sample: milestonesRaw.slice(0, 3).map((m) => safeSample(m)),
        ...idFieldsOf(milestonesRaw),
      };

      // Tasks unresolved sample
      const unresolvedPairs = tasksNormPairs.filter(
        (p) => validProjectIds.has(p.task.projectId) &&
          (!p.task.milestoneId || !validMilestoneIds.has(p.task.milestoneId)),
      );
      const tasksSampleSource = unresolvedPairs.length > 0 ? unresolvedPairs : tasksNormPairs;
      const taskSamples = tasksSampleSource.slice(0, 5).map((p) => {
        const raw = p.raw;
        const meta = (raw.metadata ?? {}) as Record<string, any>;
        const data = (raw.data ?? {}) as Record<string, any>;
        const rawInner = (raw.raw ?? {}) as Record<string, any>;
        return {
          id: p.task.id,
          title: (p.task.title || "").slice(0, 40),
          detectedProjectId: p.task.projectId,
          containerMilestoneId: (raw as any)._containerMilestoneId ?? null,
          containerProjectId: (raw as any)._containerProjectId ?? null,
          jsonPath: (raw as any)._jsonPath ?? null,
          relationFields: collectRelationFields(raw),
          structure: (raw as any)._jsonPath
            ? `nested at ${(raw as any)._jsonPath}`
            : "flat (top-level array)",
          metadataKeys: Object.keys(meta),
          dataKeys: Object.keys(data),
          rawKeys: Object.keys(rawInner),
        };
      });

      const taskInfo = {
        totalRaw: tasksRaw.length,
        keys: tasksRaw[0] ? Object.keys(tasksRaw[0]) : [],
        metadataKeys: tasksRaw[0]?.metadata ? Object.keys(tasksRaw[0].metadata) : [],
        dataKeys: tasksRaw[0]?.data ? Object.keys(tasksRaw[0].data) : [],
        rawKeys: tasksRaw[0]?.raw ? Object.keys(tasksRaw[0].raw) : [],
        nestedDetected: tasksRaw.filter((t) => (t as any)._jsonPath).length,
        flatDetected: tasksRaw.filter((t) => !(t as any)._jsonPath).length,
        unresolvedSample: taskSamples,
      };

      return json({
        ok: true,
        deployTag: DEPLOY_TAG,
        source: full ? "ops-full-export" : "fallback",
        projects: {
          totalRaw: projectsRaw.length,
          keys: projectSample?.keys ?? [],
          sample: projectSample?.sample ?? null,
        },
        milestones: milestoneInfo,
        tasks: taskInfo,
        resolution: {
          tasksWithDetectedContainerMilestone: tasksResolvedByContainer,
          tasksWithDirectMilestoneField: tasksResolvedByDirectMilestoneId,
          tasksResolvedByFolderId,
          tasksResolvedByParentId,
          tasksWithNoRelation: tasksNormPairs.filter((p) => !p.resolvedBy).length,
          tasksDroppedBecauseNoMilestone: tasksNorm.length - tasksFiltered.length,
        },
      });
    }
    default:
      return json({ error: "unknown_action", action }, 400);
  }
});

// ============================================================
// OPS context actions — read-only, leem o banco do próprio OPS.
// Fontes:
//   - clients.metadata.essential_briefing  (legado, fonte principal hoje)
//   - context_entries (context_type='briefing')  (formato novo, vazio hoje)
// Regras:
//   - Apenas leitura. Sem INSERT/UPDATE/DELETE.
//   - Sem migração automática entre os dois formatos.
//   - Preserva raw_portal_responses, last_portal_briefing_sync,
//     briefing_kind, public_briefing_status, structured_signals.
// ============================================================

function opsSupabase() {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

type BriefingSummary = {
  briefingId: string;
  clientId: string;
  opsClientId: string;
  portalClientId: string | null;
  clientName: string;
  company: string | null;
  source: "essential_briefing" | "context_entries";
  kind: "essential" | "enterprise_structuring" | "ai_automation" | string;
  updatedAt: string | null;
  approxFields: number;
  contentLength: number;
  hasRawPortalResponses: boolean;
  hasLastPortalBriefingSync: boolean;
  hasStructuredSignals: boolean;
  publicStatus: string | null;
  reviewStatus: string | null;
  isFilled: boolean;
};

function countNonEmptyFields(obj: unknown): number {
  if (!obj || typeof obj !== "object") return 0;
  let n = 0;
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v == null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === "object" && !Array.isArray(v) && Object.keys(v as object).length === 0) continue;
    n += 1;
  }
  return n;
}

async function handleOpsContextAction(
  action: string,
  params: Record<string, unknown>,
): Promise<Response> {
  const sb = opsSupabase();
  if (!sb) {
    return json({
      error: "missing_ops_supabase_env",
      hint: "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são providos automaticamente em edge functions.",
    }, 500);
  }

  if (action === "listBriefings") {
    const clientIdParam = firstString((params as any).clientId);
    const opsClientIdParam = firstString((params as any).opsClientId);
    const portalClientIdParam = firstString(
      (params as any).portalClientId,
      // back-compat: alguns callers passam clientId já como Portal id.
    );
    // Fase atual: somente Briefing Essencial em clients.metadata.essential_briefing.
    // Estruturação Empresarial e Automação/IA aparecerão em fase futura.
    const { data: clients, error: cErr } = await sb
      .from("clients")
      .select("id,name,metadata,portal_client_id")
      .limit(500);
    if (cErr) return json({ error: "clients_read_failed", message: cErr.message }, 500);

    const all: BriefingSummary[] = [];
    for (const c of clients ?? []) {
      const meta = (c as any).metadata ?? {};
      const eb = meta?.essential_briefing ?? null;
      const hasEb = eb && typeof eb === "object";
      const length = hasEb ? JSON.stringify(eb).length : 0;
      const fields = hasEb ? countNonEmptyFields(eb) : 0;
      const ebLastSync = hasEb ? (eb.last_portal_briefing_sync ?? null) : null;
      const ebUpdatedAt = hasEb ? (eb.updated_at ?? null) : null;
      const portalClientId = firstString(
        (c as any).portal_client_id,
        meta?.portal_client_id,
      ) || null;
      const company = firstString(
        meta?.company, meta?.company_name, meta?.companyName,
      ) || null;
      all.push({
        briefingId: `essential:${c.id}`,
        clientId: c.id,
        opsClientId: c.id,
        portalClientId,
        clientName: (c as any).name ?? "Cliente",
        company,
        source: "essential_briefing",
        kind: "essential",
        updatedAt: ebUpdatedAt ?? ebLastSync ?? null,
        approxFields: fields,
        contentLength: length,
        hasRawPortalResponses: Boolean(hasEb && eb.raw_portal_responses),
        hasLastPortalBriefingSync: Boolean(ebLastSync),
        hasStructuredSignals: Boolean(hasEb && eb.structured_signals),
        publicStatus: hasEb ? (eb.public_briefing_status ?? null) : null,
        reviewStatus: hasEb ? (eb.import_review_status ?? null) : null,
        isFilled: fields > 0 && length > 50,
      });
    }

    // Filtros opcionais (resolução read-only):
    let out = all;
    if (opsClientIdParam) {
      out = out.filter((b) => b.opsClientId === opsClientIdParam);
    } else if (portalClientIdParam) {
      out = out.filter((b) => b.portalClientId === portalClientIdParam);
    } else if (clientIdParam) {
      // Aceita id ambíguo: tenta opsClientId, depois portalClientId.
      out = out.filter(
        (b) => b.opsClientId === clientIdParam || b.portalClientId === clientIdParam,
      );
    }
    out.sort((a, b) => a.clientName.localeCompare(b.clientName));
    return json({ ok: true, briefings: out });
  }

  if (action === "getBriefing") {
    const briefingId = firstString((params as any).briefingId);
    const clientIdParam = firstString((params as any).clientId);
    const opsClientIdParam = firstString((params as any).opsClientId);
    const portalClientIdParam = firstString((params as any).portalClientId);
    const clientNameParam = firstString((params as any).clientName);
    const kind = firstString((params as any).kind) || "essential";

    // Resolve por id "essential:<clientId>" / "entry:<id>" ou por (clientId, kind).
    const isEssential = briefingId.startsWith("essential:")
      || (!briefingId && kind === "essential");

    if (isEssential) {
      // Resolução em ordem: briefingId → opsClientId → portalClientId → clientId(ambíguo) → clientName(match único).
      let resolved: any = null;
      const opsId = briefingId.startsWith("essential:")
        ? briefingId.slice("essential:".length)
        : (opsClientIdParam || "");

      if (opsId) {
        const { data, error } = await sb
          .from("clients")
          .select("id,name,metadata,portal_client_id")
          .eq("id", opsId)
          .maybeSingle();
        if (error) return json({ error: "client_read_failed", message: error.message }, 500);
        resolved = data ?? null;
      }

      if (!resolved && portalClientIdParam) {
        const { data, error } = await sb
          .from("clients")
          .select("id,name,metadata,portal_client_id")
          .eq("portal_client_id", portalClientIdParam)
          .limit(2);
        if (error) return json({ error: "client_read_failed", message: error.message }, 500);
        if (data && data.length === 1) resolved = data[0];
      }

      if (!resolved && clientIdParam) {
        // tenta como ops id depois como portal id
        const r1 = await sb.from("clients").select("id,name,metadata,portal_client_id").eq("id", clientIdParam).maybeSingle();
        if (r1.data) resolved = r1.data;
        if (!resolved) {
          const r2 = await sb.from("clients").select("id,name,metadata,portal_client_id").eq("portal_client_id", clientIdParam).limit(2);
          if (r2.data && r2.data.length === 1) resolved = r2.data[0];
        }
      }

      if (!resolved && clientNameParam) {
        const { data } = await sb
          .from("clients")
          .select("id,name,metadata,portal_client_id")
          .ilike("name", clientNameParam)
          .limit(2);
        if (data && data.length === 1) resolved = data[0];
      }

      if (!resolved) return json({ ok: true, briefing: null });
      const data = resolved;
      const meta = (data as any).metadata ?? {};
      const eb = meta?.essential_briefing ?? null;
      const ebLastSync = eb ? (eb.last_portal_briefing_sync ?? null) : null;
      const ebUpdatedAt = eb ? (eb.updated_at ?? null) : null;
      const portalClientId = firstString((data as any).portal_client_id, meta?.portal_client_id) || null;
      return json({
        ok: true,
        briefing: eb ? {
          briefingId: `essential:${data.id}`,
          clientId: data.id,
          opsClientId: data.id,
          portalClientId,
          clientName: (data as any).name ?? "Cliente",
          source: "essential_briefing",
          kind: "essential",
          updatedAt: ebUpdatedAt ?? ebLastSync ?? null,
          rawPortalResponses: eb.raw_portal_responses ?? null,
          hasRawPortalResponses: Boolean(eb.raw_portal_responses),
          lastPortalBriefingSync: ebLastSync,
          hasLastPortalBriefingSync: Boolean(ebLastSync),
          publicBriefingStatus: eb.public_briefing_status ?? null,
          importReviewStatus: eb.import_review_status ?? null,
          structuredSignals: eb.structured_signals ?? null,
          content: eb,
        } : null,
      });
    }

    return json({ error: "missing_briefingId" }, 400);
  }

  return json({ error: "unknown_ops_action", action }, 400);
}