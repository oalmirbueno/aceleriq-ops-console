/**
 * portal-bridge — leitura read-only do Portal Aceleriq para o OPS V2.
 *
 * Deploy tag: v2.1.2 (force redeploy) — força redeploy no projeto OPS.
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
  return firstString(
    t.project_id, t.portal_project_id, t.workspace_id,
    t.project?.id, t.milestone?.project_id, t.folder?.project_id,
  );
}
function milestoneIdOf(t: Record<string, any>) {
  return firstString(
    t.milestone_id, t.portal_milestone_id, t.folder_id,
    t.portal_folder_id, t.stage_id, t.phase_id, t.column_id,
    t.milestone?.id, t.folder?.id,
  );
}
function clientIdOf(p: Record<string, any>) {
  return firstString(
    p.client_id, p.profile_id, p.customer_id, p.user_id,
    p.client?.id, p.profile?.id,
  );
}
function clientNameOf(p: Record<string, any>) {
  return firstString(
    p.client_name, p.client?.name, p.client?.full_name,
    p.profile?.name, p.profile?.full_name, p.customer_name,
  );
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
    id: firstString(t.id, t.task_id, t.portal_task_id, t.uuid),
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
  const id = firstString(m.id, m.milestone_id, m.folder_id, m.portal_folder_id);
  const tasks = tasksByMilestone.get(id) ?? [];
  const tasksDoneCount = tasks.filter((t) => t.status === "done").length;
  const explicit = normalizeProgress(m.progress, m.completion, m.percent);
  const derived = tasks.length === 0 ? 0 : tasksDoneCount / tasks.length;
  return {
    id,
    projectId: firstString(m.project_id, m.portal_project_id, m.workspace_id, m.project?.id),
    title: firstString(m.title, m.name, m.folder_name, "Milestone"),
    description: m.description ?? null,
    status: mapMilestoneStatus(m.status ?? m.state),
    progress: explicit || derived,
    tasksCount: tasks.length,
    tasksDoneCount,
    order: numberOr(m.position ?? m.order ?? m.sort_order ?? m.sequence, 9999),
    dueAt: firstString(m.due_at, m.deadline, m.due_date) || null,
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
    name: firstString(p.name, p.title, "Projeto"),
    status: (["active", "paused", "done", "archived"].includes(status)
      ? status : "active") as "active" | "paused" | "done" | "archived",
    progress: explicit || derived,
    currentMilestoneId: currentMilestone?.id ?? null,
    updatedAt: firstString(p.updated_at, p.modified_at, p.created_at)
      || new Date().toISOString(),
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

  // ---------- Build derived indexes ----------
  const tasksNorm = tasksRaw.map(normalizeTask).filter((t) => t.id && t.projectId);
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
    .filter((m) => m.id && m.projectId);
  const milestonesByProject = new Map<string, typeof milestonesNorm>();
  for (const m of milestonesNorm) {
    const lp = milestonesByProject.get(m.projectId) ?? [];
    lp.push(m); milestonesByProject.set(m.projectId, lp);
  }

  const projectsNorm = projectsRaw
    .map((p) => normalizeProject(p, milestonesByProject, tasksByProject))
    .filter((p) => p.id);

  // ---------- Dispatch ----------
  switch (action) {
    case "listClients": {
      const map = new Map<string, { id: string; name: string; activeProjectsCount: number }>();
      for (const p of projectsNorm) {
        if (!p.clientId) continue;
        const c = map.get(p.clientId)
          ?? { id: p.clientId, name: p.clientName, activeProjectsCount: 0 };
        if (p.status === "active") c.activeProjectsCount += 1;
        if (!c.name && p.clientName) c.name = p.clientName;
        map.set(p.clientId, c);
      }
      return json({ ok: true, clients: [...map.values()].sort((a, b) => a.name.localeCompare(b.name)) });
    }
    case "listProjects": {
      const clientId = firstString((params as any).clientId);
      const list = clientId
        ? projectsNorm.filter((p) => p.clientId === clientId)
        : projectsNorm;
      return json({ ok: true, projects: list });
    }
    case "getProject": {
      const id = firstString((params as any).projectId);
      if (!id) return json({ error: "missing_projectId" }, 400);
      const project = projectsNorm.find((p) => p.id === id) ?? null;
      return json({ ok: true, project });
    }
    case "listMilestones": {
      const projectId = firstString((params as any).projectId);
      if (!projectId) return json({ error: "missing_projectId" }, 400);
      const list = (milestonesByProject.get(projectId) ?? [])
        .slice().sort((a, b) => a.order - b.order);
      return json({ ok: true, milestones: list });
    }
    case "listTasks": {
      const projectId = firstString((params as any).projectId);
      const milestoneId = firstString((params as any).milestoneId);
      if (!projectId) return json({ error: "missing_projectId" }, 400);
      let list = tasksByProject.get(projectId) ?? [];
      if (milestoneId) list = list.filter((t) => t.milestoneId === milestoneId);
      return json({ ok: true, tasks: list });
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
  clientName: string;
  source: "essential_briefing" | "context_entries";
  kind: "essential" | "enterprise_structuring" | "ai_automation" | string;
  updatedAt: string | null;
  approxFields: number;
  contentLength: number;
  hasRawPortalResponses: boolean;
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
    const clientId = firstString((params as any).clientId);
    // (params.projectId aceito mas ignorado nesta fase — briefings são por cliente)

    // 1) Essential briefings em clients.metadata
    let q = sb.from("clients").select("id,name,metadata").limit(500);
    if (clientId) q = q.eq("id", clientId);
    const { data: clients, error: cErr } = await q;
    if (cErr) return json({ error: "clients_read_failed", message: cErr.message }, 500);

    const out: BriefingSummary[] = [];
    for (const c of clients ?? []) {
      const meta = (c as any).metadata ?? {};
      const eb = meta?.essential_briefing ?? null;
      if (eb && typeof eb === "object") {
        const length = JSON.stringify(eb).length;
        const fields = countNonEmptyFields(eb);
        out.push({
          briefingId: `essential:${c.id}`,
          clientId: c.id,
          clientName: (c as any).name ?? "Cliente",
          source: "essential_briefing",
          kind: "essential",
          updatedAt: eb.updated_at ?? meta?.last_portal_briefing_sync ?? null,
          approxFields: fields,
          contentLength: length,
          hasRawPortalResponses: Boolean(meta?.raw_portal_responses ?? eb.raw_portal_responses),
          hasStructuredSignals: Boolean(eb.structured_signals ?? meta?.structured_signals),
          publicStatus: eb.public_briefing_status ?? null,
          reviewStatus: eb.import_review_status ?? null,
          isFilled: fields > 0 && length > 50,
        });
      } else if (!clientId) {
        // listagem geral: também incluímos placeholder "pendente" para o cliente
        out.push({
          briefingId: `essential:${c.id}`,
          clientId: c.id,
          clientName: (c as any).name ?? "Cliente",
          source: "essential_briefing",
          kind: "essential",
          updatedAt: null,
          approxFields: 0,
          contentLength: 0,
          hasRawPortalResponses: false,
          hasStructuredSignals: false,
          publicStatus: null,
          reviewStatus: null,
          isFilled: false,
        });
      }
    }

    // 2) context_entries com context_type='briefing'
    let q2 = sb
      .from("context_entries")
      .select("id,client_id,workspace_id,context_type,metadata,updated_at,created_at")
      .eq("context_type", "briefing")
      .limit(1000);
    if (clientId) q2 = q2.eq("client_id", clientId);
    const { data: entries, error: eErr } = await q2;
    if (eErr) {
      // Tabela pode não existir / coluna ausente — não fatal para essential.
      // Apenas registra no payload e segue.
      return json({
        ok: true,
        briefings: out,
        warning: `context_entries unavailable: ${eErr.message}`,
      });
    }

    // index nome do cliente para enriquecer entries
    const nameById = new Map<string, string>();
    for (const c of clients ?? []) nameById.set((c as any).id, (c as any).name ?? "Cliente");

    for (const e of entries ?? []) {
      const meta = (e as any).metadata ?? {};
      const kind = String(meta?.briefing_kind ?? "essential");
      const length = JSON.stringify(meta).length;
      const fields = countNonEmptyFields(meta);
      out.push({
        briefingId: `entry:${(e as any).id}`,
        clientId: (e as any).client_id ?? "",
        clientName: nameById.get((e as any).client_id) ?? "Cliente",
        source: "context_entries",
        kind,
        updatedAt: (e as any).updated_at ?? (e as any).created_at ?? null,
        approxFields: fields,
        contentLength: length,
        hasRawPortalResponses: Boolean(meta?.raw_portal_responses),
        hasStructuredSignals: Boolean(meta?.structured_signals),
        publicStatus: meta?.public_briefing_status ?? null,
        reviewStatus: meta?.import_review_status ?? null,
        isFilled: fields > 0 && length > 50,
      });
    }

    out.sort((a, b) => a.clientName.localeCompare(b.clientName) || a.kind.localeCompare(b.kind));
    return json({ ok: true, briefings: out });
  }

  if (action === "getBriefing") {
    const briefingId = firstString((params as any).briefingId);
    const clientId = firstString((params as any).clientId);
    const kind = firstString((params as any).kind) || "essential";

    // Resolve por id "essential:<clientId>" / "entry:<id>" ou por (clientId, kind).
    const isEssential = briefingId.startsWith("essential:")
      || (!briefingId && kind === "essential");
    const isEntry = briefingId.startsWith("entry:");

    if (isEssential) {
      const cid = briefingId.startsWith("essential:")
        ? briefingId.slice("essential:".length)
        : clientId;
      if (!cid) return json({ error: "missing_clientId" }, 400);
      const { data, error } = await sb
        .from("clients")
        .select("id,name,metadata")
        .eq("id", cid)
        .maybeSingle();
      if (error) return json({ error: "client_read_failed", message: error.message }, 500);
      if (!data) return json({ ok: true, briefing: null });
      const meta = (data as any).metadata ?? {};
      const eb = meta?.essential_briefing ?? null;
      return json({
        ok: true,
        briefing: eb ? {
          briefingId: `essential:${data.id}`,
          clientId: data.id,
          clientName: (data as any).name ?? "Cliente",
          source: "essential_briefing",
          kind: "essential",
          updatedAt: eb.updated_at ?? meta?.last_portal_briefing_sync ?? null,
          rawPortalResponses: meta?.raw_portal_responses ?? eb.raw_portal_responses ?? null,
          lastPortalBriefingSync: meta?.last_portal_briefing_sync ?? null,
          publicBriefingStatus: eb.public_briefing_status ?? null,
          importReviewStatus: eb.import_review_status ?? null,
          structuredSignals: eb.structured_signals ?? null,
          content: eb,
        } : null,
      });
    }

    if (isEntry) {
      const id = briefingId.slice("entry:".length);
      const { data, error } = await sb
        .from("context_entries")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) return json({ error: "entry_read_failed", message: error.message }, 500);
      if (!data) return json({ ok: true, briefing: null });
      const meta = (data as any).metadata ?? {};
      return json({
        ok: true,
        briefing: {
          briefingId: `entry:${(data as any).id}`,
          clientId: (data as any).client_id ?? "",
          source: "context_entries",
          kind: meta?.briefing_kind ?? "essential",
          updatedAt: (data as any).updated_at ?? (data as any).created_at ?? null,
          rawPortalResponses: meta?.raw_portal_responses ?? null,
          lastPortalBriefingSync: meta?.last_portal_briefing_sync ?? null,
          publicBriefingStatus: meta?.public_briefing_status ?? null,
          importReviewStatus: meta?.import_review_status ?? null,
          structuredSignals: meta?.structured_signals ?? null,
          content: data,
        },
      });
    }

    return json({ error: "missing_briefingId" }, 400);
  }

  return json({ error: "unknown_ops_action", action }, 400);
}