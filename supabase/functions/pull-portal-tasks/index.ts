/**
 * pull-portal-tasks — busca tasks reais do portal e organiza no canvas por:
 * cliente → projeto → milestone → task.
 * Idempotente: nunca duplica; faz match por portal_task_id/ops_node_id.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";

const STATUS_MAP: Record<string, string> = {
  todo: "draft", backlog: "draft", "to-do": "draft", to_do: "draft",
  doing: "active", in_progress: "active", "in-progress": "active", andamento: "active",
  review: "in_review", revisao: "in_review", "em-revisao": "in_review",
  blocked: "blocked", bloqueada: "blocked", bloqueado: "blocked",
  done: "done", completed: "done", concluido: "done", concluída: "done", concluida: "done", finalizada: "done",
};

function firstString(...values: unknown[]) {
  for (const value of values) {
    const str = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (str) return str;
  }
  return "";
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ""));
}

function sortByPosition<T extends Record<string, any>>(items: T[]) {
  return items.slice().sort((a, b) => {
    const ap = Number(a.position ?? a.order ?? a.sort_order ?? a.sequence ?? 9999);
    const bp = Number(b.position ?? b.order ?? b.sort_order ?? b.sequence ?? 9999);
    if (Number.isFinite(ap) && Number.isFinite(bp) && ap !== bp) return ap - bp;
    return String(a.created_at ?? a.title ?? a.name ?? a.id ?? "").localeCompare(String(b.created_at ?? b.title ?? b.name ?? b.id ?? ""));
  });
}

function milestoneIdOf(task: Record<string, any>) {
  return firstString(task.milestone_id, task.portal_milestone_id, task.stage_id, task.phase_id, task.column_id, task.milestone?.id);
}

function milestoneTitleOf(milestone: Record<string, any> | undefined, task: Record<string, any>, fallback: string) {
  return firstString(milestone?.title, milestone?.name, task.milestone_title, task.milestone_name, task.stage_title, task.phase_title, task.column_title, task.milestone?.title, fallback);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";
  const PORTAL_URL_HOOK = Deno.env.get("PORTAL_WEBHOOK_URL") ?? `${PORTAL_BASE}/ops-webhook`;

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const auth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const { workspaceId } = await req.json() as { workspaceId: string };
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: ws } = await db
      .from("workspaces")
      .select("id, client_id, portal_project_id, clients(portal_client_id)")
      .eq("id", workspaceId)
      .single();
    if (!ws) return json({ error: "workspace not found" }, 404);
    if (!ws.portal_project_id) return json({ ok: false, skipped: true, reason: "workspace not linked to portal" });

    const portalHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "x-webhook-secret": PORTAL_SECRET,
    };
    if (PORTAL_ANON) {
      portalHeaders.apikey = PORTAL_ANON;
      portalHeaders.Authorization = `Bearer ${PORTAL_ANON}`;
    }

    let portalProjects: Record<string, any>[] = [];
    let allTasks: Record<string, any>[] = [];
    let portalMilestones: Record<string, any>[] = [];

    try {
      const exportRes = await fetch(`${PORTAL_BASE}/ops-full-export`, { method: "POST", headers: portalHeaders });
      if (exportRes.ok) {
        const full = await exportRes.json().catch(() => ({}));
        portalProjects = Array.isArray(full?.projects) ? full.projects : [];
        allTasks = Array.isArray(full?.tasks) ? full.tasks : [];
        portalMilestones = Array.isArray(full?.milestones) ? full.milestones : [];
      }
    } catch { /* fallback abaixo */ }

    if (portalProjects.length === 0) {
      try {
        const projRes = await fetch(`${PORTAL_BASE}/ops-projects-list`, { method: "POST", headers: portalHeaders, body: JSON.stringify({}) });
        if (projRes.ok) {
          const pj = await projRes.json().catch(() => ({}));
          portalProjects = Array.isArray(pj?.projects) ? pj.projects : Array.isArray(pj) ? pj : [];
        }
      } catch { /* fallback silencioso */ }
    }

    if (allTasks.length === 0) {
      const res = await fetch(`${PORTAL_BASE}/ops-tasks-list`, {
        method: "POST",
        headers: portalHeaders,
        body: JSON.stringify({ limit: 1000 }),
      });
      const text = await res.text();
      if (!res.ok) {
        if (res.status === 404) return json({ ok: false, warning: "Portal não expõe ops-tasks-list ainda.", raw: text.slice(0, 200) });
        return json({ error: `portal ${res.status}`, raw: text.slice(0, 300) }, 502);
      }
      let body: any = {};
      try { body = JSON.parse(text); } catch { return json({ error: "invalid portal json" }, 502); }
      allTasks = Array.isArray(body?.tasks) ? body.tasks : Array.isArray(body) ? body : [];
      portalMilestones = Array.isArray(body?.milestones) ? body.milestones : portalMilestones;
    }

    const { data: clientNode } = await db
      .from("canvas_nodes")
      .select("id, pos_x, pos_y")
      .eq("workspace_id", workspaceId)
      .eq("node_type", "client")
      .or(`linked_entity_id.eq.${ws.client_id},client_id.eq.${ws.client_id}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    const clientNodeId = clientNode?.id ?? null;
    const clientBaseX = Number(clientNode?.pos_x ?? 80);
    const clientBaseY = Number(clientNode?.pos_y ?? 0);

    const projectById = new Map<string, Record<string, any>>();
    for (const p of portalProjects) {
      const pid = firstString(p.id, p.project_id, p.uuid);
      if (pid) projectById.set(pid, p);
    }
    const linkedProject = projectById.get(String(ws.portal_project_id));
    const linkedClient = firstString(linkedProject?.client_id, linkedProject?.profile_id, linkedProject?.customer_id, (ws.clients as any)?.portal_client_id);

    const clientPortalProjectIds = new Set<string>([String(ws.portal_project_id)]);
    for (const p of portalProjects) {
      const pid = firstString(p.id, p.project_id, p.uuid);
      const pclient = firstString(p.client_id, p.profile_id, p.customer_id, p.user_id, p.client?.id, p.profile?.id);
      if (pid && pclient && linkedClient && pclient === linkedClient) clientPortalProjectIds.add(pid);
    }

    const tasks = sortByPosition(allTasks.filter((t) => {
      const pid = firstString(t.project_id, t.portal_project_id, t.workspace_id);
      return pid ? clientPortalProjectIds.has(pid) : false;
    }));

    const milestoneById = new Map<string, Record<string, any>>();
    for (const m of portalMilestones) {
      const mid = firstString(m.id, m.milestone_id, m.uuid);
      if (mid) milestoneById.set(mid, m);
    }

    async function ensureProjectGroupNode(portalProjectId: string, projectIndex: number): Promise<string | null> {
      const { data: existing } = await db
        .from("canvas_nodes")
        .select("id, data")
        .eq("workspace_id", workspaceId)
        .contains("data", { kind: "project_group", portal_project_id: portalProjectId })
        .maybeSingle();
      const projMeta = projectById.get(portalProjectId);
      const projTitle = firstString(projMeta?.name, projMeta?.title, projMeta?.project_name, "Projeto do portal");
      const projStatus = firstString(projMeta?.status, projMeta?.state, "active");
      const pos_x = clientBaseX + projectIndex * 520;
      const pos_y = clientBaseY + 190;
      if (existing?.id) {
        await db.from("canvas_nodes").update({
          parent_node_id: clientNodeId,
          title: projTitle,
          status: projStatus === "completed" ? "done" : "active",
          pos_x,
          pos_y,
          updated_at: new Date().toISOString(),
          data: { ...((existing.data as Record<string, unknown>) ?? {}), kind: "project_group", from_portal: true, portal_project_id: portalProjectId, portal_status: projStatus, stage: "producao" },
        }).eq("id", existing.id);
        return existing.id;
      }

      const { data: created } = await db.from("canvas_nodes").insert({
        workspace_id: workspaceId,
        client_id: ws.client_id,
        parent_node_id: clientNodeId,
        node_type: "front",
        title: projTitle,
        status: projStatus === "completed" ? "done" : "active",
        pos_x,
        pos_y,
        data: { kind: "project_group", from_portal: true, portal_project_id: portalProjectId, portal_status: projStatus, stage: "producao" },
      }).select("id").single();
      return created?.id ?? null;
    }

    async function ensureMilestoneGroupNode(args: {
      portalProjectId: string;
      projectNodeId: string | null;
      milestoneKey: string;
      portalMilestoneId: string | null;
      title: string;
      status: string;
      projectIndex: number;
      milestoneIndex: number;
    }): Promise<string | null> {
      const contains = args.portalMilestoneId
        ? { kind: "milestone_group", portal_milestone_id: args.portalMilestoneId }
        : { kind: "milestone_group", portal_project_id: args.portalProjectId, milestone_key: args.milestoneKey };
      const { data: existing } = await db
        .from("canvas_nodes")
        .select("id, data")
        .eq("workspace_id", workspaceId)
        .contains("data", contains)
        .maybeSingle();
      const pos_x = clientBaseX + args.projectIndex * 1760 + 32 + args.milestoneIndex * 360;
      const pos_y = clientBaseY + 350;
      const payload = {
        parent_node_id: args.projectNodeId ?? clientNodeId,
        title: args.title,
        status: STATUS_MAP[args.status] ?? (args.status === "completed" ? "done" : "active"),
        pos_x,
        pos_y,
        updated_at: new Date().toISOString(),
        data: compactRecord({
          ...((existing?.data as Record<string, unknown>) ?? {}),
          kind: "milestone_group",
          from_portal: true,
          portal_project_id: args.portalProjectId,
          portal_milestone_id: args.portalMilestoneId ?? undefined,
          milestone_key: args.milestoneKey,
          portal_status: args.status,
          stage: "producao",
        }),
      };
      if (existing?.id) {
        await db.from("canvas_nodes").update(payload).eq("id", existing.id);
        return existing.id;
      }
      const { data: created } = await db.from("canvas_nodes").insert({
        workspace_id: workspaceId,
        client_id: ws.client_id,
        node_type: "front",
        ...payload,
      }).select("id").single();
      return created?.id ?? null;
    }

    const TASKS_PER_ROW = 1;
    const TASK_GAP_Y = 136;
    let created = 0, updated = 0, linked = 0;
    const projectGroupCache = new Map<string, string | null>();
    const milestoneGroupCache = new Map<string, string | null>();
    const taskCounters = new Map<string, number>();
    const projectsInOrder = Array.from(new Set(tasks.map((t) => firstString(t.project_id, t.portal_project_id, t.workspace_id)).filter(Boolean)));
    const milestoneOrderByProject = new Map<string, string[]>();

    for (const t of tasks) {
      const portalTaskId = firstString(t.id, t.task_id, t.uuid);
      if (!portalTaskId) continue;
      const taskProjectId = firstString(t.project_id, t.portal_project_id, t.workspace_id, ws.portal_project_id);
      if (!taskProjectId) continue;
      const projectIndex = Math.max(0, projectsInOrder.indexOf(taskProjectId));

      let projectNodeId = projectGroupCache.get(taskProjectId) ?? null;
      if (!projectGroupCache.has(taskProjectId)) {
        projectNodeId = await ensureProjectGroupNode(taskProjectId, projectIndex);
        projectGroupCache.set(taskProjectId, projectNodeId);
      }

      const portalMilestoneId = milestoneIdOf(t) || null;
      const milestoneKey = portalMilestoneId ?? `no-milestone:${taskProjectId}`;
      const milestone = portalMilestoneId ? milestoneById.get(portalMilestoneId) : undefined;
      const milestoneTitle = milestoneTitleOf(milestone, t, "Sem milestone");
      const milestoneStatus = firstString(milestone?.status, t.milestone_status, t.stage_status, "active").toLowerCase();
      const order = milestoneOrderByProject.get(taskProjectId) ?? [];
      if (!order.includes(milestoneKey)) order.push(milestoneKey);
      milestoneOrderByProject.set(taskProjectId, order);
      const milestoneIndex = order.indexOf(milestoneKey);

      const milestoneCacheKey = `${taskProjectId}:${milestoneKey}`;
      let milestoneNodeId = milestoneGroupCache.get(milestoneCacheKey) ?? null;
      if (!milestoneGroupCache.has(milestoneCacheKey)) {
        milestoneNodeId = await ensureMilestoneGroupNode({
          portalProjectId: taskProjectId,
          projectNodeId,
          milestoneKey,
          portalMilestoneId,
          title: milestoneTitle,
          status: milestoneStatus,
          projectIndex,
          milestoneIndex,
        });
        milestoneGroupCache.set(milestoneCacheKey, milestoneNodeId);
      }

      const title = firstString(t.title, t.name, "Tarefa do portal");
      const portalStatus = firstString(t.status, t.kanban_status, "todo").toLowerCase();
      const opsStatus = STATUS_MAP[portalStatus] ?? "draft";
      const opsNodeId = firstString(t.ops_node_id);
      const description = (t.description ?? t.notes ?? null) as string | null;
      const priority = (t.priority ?? null) as string | null;
      const dueDate = (t.due_date ?? t.dueDate ?? t.deadline ?? null) as string | null;
      const assignee = (t.assignee_id ?? t.assignee ?? null) as string | null;
      const checklist = Array.isArray(t.checklist) ? t.checklist : [];
      const labels = Array.isArray(t.labels) ? t.labels : [];
      const counterKey = `${taskProjectId}:${milestoneKey}`;
      const idx = taskCounters.get(counterKey) ?? 0;
      taskCounters.set(counterKey, idx + 1);
      const pos_x = clientBaseX + projectIndex * 1760 + 64 + milestoneIndex * 360 + (idx % TASKS_PER_ROW) * 300;
      const pos_y = clientBaseY + 480 + Math.floor(idx / TASKS_PER_ROW) * TASK_GAP_Y;
      const nextTaskData = (cur: Record<string, unknown>) => compactRecord({
        ...cur,
        from_portal: true,
        portal_task_id: portalTaskId,
        portal_project_id: taskProjectId,
        portal_milestone_id: portalMilestoneId ?? undefined,
        milestone_key: milestoneKey,
        milestone_title: milestoneTitle,
        portal_status: portalStatus,
        kind: cur.kind ?? "checklist",
        checklist: checklist.length > 0 ? checklist : (cur.checklist ?? []),
        priority,
        due_date: dueDate,
        assignee,
        labels,
        stage: cur.stage ?? "producao",
      });

      const existingQuery = opsNodeId
        ? db.from("canvas_nodes").select("id, data").eq("id", opsNodeId).maybeSingle()
        : db.from("canvas_nodes").select("id, data").eq("workspace_id", workspaceId).contains("data", { portal_task_id: portalTaskId }).limit(1).maybeSingle();
      const { data: existing } = await existingQuery;

      if (existing) {
        const cur = (existing.data as Record<string, unknown>) ?? {};
        await db.from("canvas_nodes").update({
          title,
          status: opsStatus,
          parent_node_id: milestoneNodeId,
          description,
          pos_x,
          pos_y,
          updated_at: new Date().toISOString(),
          data: nextTaskData(cur),
        }).eq("id", existing.id);
        updated++;
        continue;
      }

      const { data: newNode } = await db.from("canvas_nodes").insert({
        workspace_id: workspaceId,
        client_id: ws.client_id,
        parent_node_id: milestoneNodeId,
        node_type: "task",
        title,
        status: opsStatus,
        description,
        pos_x,
        pos_y,
        data: nextTaskData({}),
      }).select("id").single();
      created++;

      if (newNode?.id) {
        try {
          const hookHeaders: Record<string, string> = { "Content-Type": "application/json", "x-webhook-secret": PORTAL_SECRET };
          if (PORTAL_ANON) {
            hookHeaders.apikey = PORTAL_ANON;
            hookHeaders.Authorization = `Bearer ${PORTAL_ANON}`;
          }
          await fetch(PORTAL_URL_HOOK, {
            method: "POST",
            headers: hookHeaders,
            body: JSON.stringify({
              event: "node_created",
              source: "ops",
              data: {
                project_id: taskProjectId,
                node_id: newNode.id,
                node_title: title,
                node_type: "checklist",
                status: opsStatus,
                portal_task_id: portalTaskId,
                portal_milestone_id: portalMilestoneId ?? undefined,
                update_type: "task_created",
              },
            }),
          });
          linked++;
        } catch { /* ignore */ }
      }
    }

    return json({ ok: true, total: tasks.length, created, updated, linked, projects: projectGroupCache.size, milestones: milestoneGroupCache.size });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});
