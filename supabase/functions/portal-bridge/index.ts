/**
 * portal-bridge — leitura read-only do Portal Aceleriq para o OPS V2.
 *
 * Deploy tag: v2.2.5 — Portal-only global cascade + alias resolution.
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
    return {
      projects: Array.isArray(body.projects) ? body.projects as Record<string, any>[] : [],
      tasks: Array.isArray(body.tasks) ? body.tasks as Record<string, any>[] : [],
      milestones: Array.isArray(body.milestones) ? body.milestones as Record<string, any>[] : [],
    };
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

  const full = await fetchFullExport(headers);
  if (full) {
    projectsRaw = full.projects;
    tasksRaw = full.tasks;
    milestonesRaw = full.milestones;
  }

  // 2) Fallbacks só quando full-export não estiver disponível.
  if (projectsRaw.length === 0) projectsRaw = await fetchProjectsFallback(headers);
  if (tasksRaw.length === 0) {
    const fb = await fetchTasksFallback(headers);
    tasksRaw = fb.tasks;
    if (milestonesRaw.length === 0) milestonesRaw = fb.milestones;
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
  let tasksAliasResolved = 0;
  const tasksNorm = tasksRaw.map((rawT) => {
    const t = normalizeTask(rawT);
    if (t.milestoneId) {
      const canonical = milestoneAliasToId.get(t.milestoneId);
      if (canonical && canonical !== t.milestoneId) {
        t.milestoneId = canonical;
        tasksAliasResolved += 1;
      }
    }
    return t;
  }).filter((t) => t.id && t.projectId);
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
    case "listClients": {
      const includeAll = (params as any).includeAll === true || (params as any).includeAll === "1";
      type Agg = {
        id: string;
        name: string;
        company: string;
        email: string;
        activeProjectsCount: number;
      };
      const map = new Map<string, Agg>();
      for (const p of projectsNorm) {
        if (!p.clientId) continue;
        const c = map.get(p.clientId) ?? {
          id: p.clientId, name: "", company: "", email: "", activeProjectsCount: 0,
        };
        if (p.status === "active") c.activeProjectsCount += 1;
        if (!c.name && p.clientName && !isUuidLike(p.clientName)) c.name = p.clientName;
        if (!c.company && (p as any).clientCompany) c.company = (p as any).clientCompany;
        if (!c.email && (p as any).clientEmail) c.email = (p as any).clientEmail;
        map.set(p.clientId, c);
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
      const rows = projectsRaw.map((rawP) => {
        const id = firstString(rawP.id, rawP.project_id, rawP.uuid);
        const norm = projectsNorm.find((p) => p.id === id);
        const ms = id ? (milestonesByProject.get(id) ?? []) : [];
        const ts = id ? (tasksByProject.get(id) ?? []) : [];
        const problems: string[] = [];
        if (!id) problems.push("missing_id");
        if (!norm) {
          if (!firstString(clientIdOf(rawP))) problems.push("missing_clientId");
          if (firstString(rawP.deleted_at, rawP.archived_at)) problems.push("deleted_or_archived");
          if (rawP.archived || rawP.is_archived) problems.push("archived_flag");
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
      return json({
        ok: true,
        deployTag: "v2.2.4",
        totals: {
          projectsRaw: projectsRaw.length,
          projectsValid: projectsNorm.length,
          milestonesRaw: milestonesRaw.length,
          milestonesValid: validMilestoneIds.size,
          tasksRaw: tasksRaw.length,
          tasksValid: tasksFiltered.length,
        },
        rows,
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