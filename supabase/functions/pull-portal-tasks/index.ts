/**
 * pull-portal-tasks — busca tasks reais do portal e organiza no canvas por:
 * cliente → projeto → milestone → task.
 * (redeploy trigger)
 * Idempotente: nunca duplica; faz match por portal_task_id/ops_node_id.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logSync, startTimer } from "../_shared/syncAudit.ts";

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
  return firstString(task.milestone_id, task.portal_milestone_id, task.folder_id, task.portal_folder_id, task.stage_id, task.phase_id, task.column_id, task.milestone?.id, task.folder?.id);
}

function milestoneTitleOf(milestone: Record<string, any> | undefined, task: Record<string, any>, fallback: string) {
  return firstString(milestone?.title, milestone?.name, milestone?.folder_name, task.milestone_title, task.milestone_name, task.folder_title, task.folder_name, task.stage_title, task.phase_title, task.column_title, task.milestone?.title, task.folder?.title, task.folder?.name, fallback);
}

function projectIdOfTask(task: Record<string, any>) {
  return firstString(task.project_id, task.portal_project_id, task.workspace_id, task.project?.id, task.milestone?.project_id, task.folder?.project_id);
}

function projectIdOfMilestone(milestone: Record<string, any>) {
  return firstString(milestone.project_id, milestone.portal_project_id, milestone.workspace_id, milestone.project?.id, milestone.folder?.project_id);
}

function milestoneKeyOf(record: Record<string, any>, fallback: string) {
  return firstString(record.id, record.milestone_id, record.folder_id, record.portal_folder_id, record.key, record.slug, record.title, record.name, fallback);
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
    const stopwatch = startTimer();
    const authHeader = req.headers.get("Authorization") ?? "";
    const auth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as { workspaceId?: string; portalProjectId?: string };
    const workspaceId = body.workspaceId;
    const requestedPortalProjectId = firstString(body.portalProjectId) || null;
    if (!workspaceId) return json({ error: "workspaceId required" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    let { data: ws } = await db
      .from("workspaces")
      .select("id, client_id, portal_project_id, clients(portal_client_id)")
      .eq("id", workspaceId)
      .single();
    if (!ws) return json({ error: "workspace not found" }, 404);
    let activePortalProjectId = firstString((ws as any).portal_project_id);
    const activePortalClientId = firstString((ws.clients as any)?.portal_client_id);

    // Auto-vincula workspace ao portal_project_id quando o caller informa
    // (fluxo do canvas /ops/projects/:portalProjectId). Quando o workspace
    // é o hub do cliente e não um projeto específico, usamos portal_client_id
    // para puxar TODOS os projetos desse cliente.
    if (!activePortalProjectId && requestedPortalProjectId) {
      await db.from("workspaces").update({ portal_project_id: requestedPortalProjectId, updated_at: new Date().toISOString() }).eq("id", workspaceId);
      ws = { ...ws, portal_project_id: requestedPortalProjectId } as typeof ws;
      activePortalProjectId = requestedPortalProjectId;
    }
    if (!activePortalProjectId && !activePortalClientId) return json({ ok: false, skipped: true, reason: "workspace/client not linked to portal" });

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
    const targetPortalProjectIds = new Set<string>();
    if (requestedPortalProjectId) targetPortalProjectIds.add(requestedPortalProjectId);
    else if (activePortalProjectId) targetPortalProjectIds.add(activePortalProjectId);

    // Fallback seguro: só puxa por cliente quando o workspace ainda não tem
    // portal_project_id. Workspace já vinculado = um projeto, sem misturar
    // outros projetos do mesmo cliente e sem duplicar grupos no canvas.
    if (targetPortalProjectIds.size === 0 && activePortalClientId) {
      for (const p of portalProjects) {
        const pid = firstString(p.id, p.project_id, p.uuid);
        const pclient = firstString(p.client_id, p.profile_id, p.customer_id, p.user_id, p.client?.id, p.profile?.id);
        if (pid && pclient === activePortalClientId) targetPortalProjectIds.add(pid);
      }
    }
    if (targetPortalProjectIds.size === 0) return json({ ok: false, skipped: true, reason: "no portal project found for workspace" });

    const tasks = sortByPosition(allTasks.filter((t) => {
      const pid = projectIdOfTask(t);
      return pid ? targetPortalProjectIds.has(pid) : false;
    }));

    const milestoneById = new Map<string, Record<string, any>>();
    for (const m of portalMilestones) {
      const mid = firstString(m.id, m.milestone_id, m.folder_id, m.portal_folder_id, m.uuid);
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
      const pos_x = clientBaseX + projectIndex * 1760;
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
        client_id: (ws as any).client_id,
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
      position: number;
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
          portal_position: args.position,
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
        client_id: (ws as any).client_id,
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
    const projectIdsFromTasks = tasks.map(projectIdOfTask).filter(Boolean) as string[];
    const projectIdsFromMilestones = portalMilestones
      .map(projectIdOfMilestone)
      .filter((pid): pid is string => !!pid && targetPortalProjectIds.has(pid));
    const projectsInOrder = Array.from(new Set([...targetPortalProjectIds, ...projectIdsFromTasks, ...projectIdsFromMilestones]));
    const milestoneOrderByProject = new Map<string, string[]>();

    for (const m of sortByPosition(portalMilestones)) {
      const milestoneProjectId = projectIdOfMilestone(m);
      if (!milestoneProjectId || !targetPortalProjectIds.has(milestoneProjectId)) continue;
      const projectIndex = Math.max(0, projectsInOrder.indexOf(milestoneProjectId));
      let projectNodeId = projectGroupCache.get(milestoneProjectId) ?? null;
      if (!projectGroupCache.has(milestoneProjectId)) {
        projectNodeId = await ensureProjectGroupNode(milestoneProjectId, projectIndex);
        projectGroupCache.set(milestoneProjectId, projectNodeId);
      }
      const portalMilestoneId = firstString(m.id, m.milestone_id, m.folder_id, m.portal_folder_id, m.uuid);
      const milestoneKey = milestoneKeyOf(m, portalMilestoneId ?? `milestone:${milestoneProjectId}`);
      const order = milestoneOrderByProject.get(milestoneProjectId) ?? [];
      if (!order.includes(milestoneKey)) order.push(milestoneKey);
      milestoneOrderByProject.set(milestoneProjectId, order);
      const milestoneIndex = order.indexOf(milestoneKey);
      const position = Number(m.position ?? m.order ?? m.sort_order ?? milestoneIndex);
      const cacheKey = `${milestoneProjectId}:${milestoneKey}`;
      if (!milestoneGroupCache.has(cacheKey)) {
        const milestoneNodeId = await ensureMilestoneGroupNode({
          portalProjectId: milestoneProjectId,
          projectNodeId,
          milestoneKey,
          portalMilestoneId: portalMilestoneId ?? null,
          title: milestoneTitleOf(m, {}, "Sem milestone"),
          status: firstString(m.status, "active").toLowerCase(),
          position: Number.isFinite(position) ? position : milestoneIndex,
          projectIndex,
          milestoneIndex,
        });
        milestoneGroupCache.set(cacheKey, milestoneNodeId);
      }
    }

    for (const t of tasks) {
      const portalTaskId = firstString(t.id, t.task_id, t.uuid);
      if (!portalTaskId) continue;
      const taskProjectId = firstString(projectIdOfTask(t), ws.portal_project_id);
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
      const milestonePositionRaw = Number(milestone?.position ?? milestone?.order ?? milestone?.sort_order ?? 0);
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
          position: Number.isFinite(milestonePositionRaw) ? milestonePositionRaw : milestoneIndex,
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
      const portalPosition = Number(t.position ?? t.order ?? t.sort_order ?? t.sequence ?? idx);
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
        portal_position: Number.isFinite(portalPosition) ? portalPosition : idx,
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

    await logSync({
      direction: "portal_to_ops",
      event: "pull_portal_tasks",
      status: "ok",
      workspaceId,
      clientId: (ws as any)?.client_id ?? null,
      portalProjectId: ws.portal_project_id ?? null,
      durationMs: stopwatch(),
      message: `pulled ${tasks.length} tasks (created=${created}, updated=${updated})`,
      payload: { total: tasks.length, created, updated, linked, projects: projectGroupCache.size, milestones: milestoneGroupCache.size },
      source: "ops",
    });

    // ─── Reconciliação: remove tasks/milestones do canvas que
    //     não existem mais no portal para esse projeto. ──────────
    let removedTasks = 0, removedMilestones = 0;
    try {
      const validTaskIds = new Set(tasks.map((t) => firstString(t.id, t.task_id, t.uuid)).filter(Boolean));
      const validMilestoneIds = new Set(
        portalMilestones
          .filter((m) => targetPortalProjectIds.has(projectIdOfMilestone(m) ?? ""))
          .map((m) => firstString(m.id, m.milestone_id, m.folder_id, m.portal_folder_id, m.uuid))
          .filter(Boolean) as string[],
      );

      const { data: existingTasks } = await db
        .from("canvas_nodes")
        .select("id, data")
        .eq("workspace_id", workspaceId)
        .eq("node_type", "task");
      const orphanTaskIds = (existingTasks ?? [])
        .filter((n: any) => {
          const d = (n.data ?? {}) as Record<string, any>;
          if (!d.from_portal || !d.portal_task_id) return false;
          const pPid = String(d.portal_project_id ?? "");
          if (pPid && !targetPortalProjectIds.has(pPid)) return false;
          return !validTaskIds.has(String(d.portal_task_id));
        })
        .map((n: any) => n.id);
      if (orphanTaskIds.length) {
        await db.from("canvas_nodes").delete().in("id", orphanTaskIds);
        removedTasks = orphanTaskIds.length;
      }

      const { data: existingMs } = await db
        .from("canvas_nodes")
        .select("id, data")
        .eq("workspace_id", workspaceId);
      const orphanMsIds = (existingMs ?? [])
        .filter((n: any) => {
          const d = (n.data ?? {}) as Record<string, any>;
          if (d.kind !== "milestone_group" || !d.from_portal || !d.portal_milestone_id) return false;
          const pPid = String(d.portal_project_id ?? "");
          if (pPid && !targetPortalProjectIds.has(pPid)) return false;
          return !validMilestoneIds.has(String(d.portal_milestone_id));
        })
        .map((n: any) => n.id);
      if (orphanMsIds.length) {
        await db.from("canvas_nodes").delete().in("id", orphanMsIds);
        removedMilestones = orphanMsIds.length;
      }
    } catch (err) {
      console.warn("reconcile error", err);
    }

    return json({ ok: true, total: tasks.length, created, updated, linked, projects: projectGroupCache.size, milestones: milestoneGroupCache.size, removedTasks, removedMilestones });
  } catch (err) {
    await logSync({
      direction: "portal_to_ops",
      event: "pull_portal_tasks",
      status: "error",
      message: err instanceof Error ? err.message : "internal error",
      source: "ops",
    });
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});
