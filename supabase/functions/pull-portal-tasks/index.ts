/**
 * pull-portal-tasks — busca ATIVAMENTE tasks no portal e cria/atualiza
 * canvas_nodes correspondentes no Ops. Idempotente (match por portal_task_id
 * dentro de canvas_nodes.data, ou por ops_node_id).
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
  todo: "draft", backlog: "draft",
  doing: "active", in_progress: "active",
  review: "in_review",
  blocked: "blocked",
  done: "done", completed: "done", concluido: "done", concluída: "done", concluida: "done",
};

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
      .select("id, client_id, portal_project_id")
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

    // Carrega lista de projetos do portal para sabermos os nomes/títulos
    let portalProjects: Record<string, any>[] = [];
    try {
      const projRes = await fetch(`${PORTAL_BASE}/ops-projects-list`, {
        method: "POST", headers: portalHeaders, body: JSON.stringify({}),
      });
      if (projRes.ok) {
        const pj = await projRes.json().catch(() => ({}));
        portalProjects = Array.isArray(pj?.projects) ? pj.projects : Array.isArray(pj) ? pj : [];
      }
    } catch { /* fallback silencioso */ }

    // Localiza node "client" (folder) deste cliente no workspace
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

    // Garante 1 node "projeto" por portal_project_id presente nas tasks
    // (e também para o portal_project_id do workspace).
    async function ensureProjectGroupNode(portalProjectId: string): Promise<string | null> {
      // 1) Busca por marcador em data
      const { data: existing } = await db
        .from("canvas_nodes")
        .select("id")
        .eq("workspace_id", workspaceId)
        .contains("data", { kind: "project_group", portal_project_id: portalProjectId })
        .maybeSingle();
      if (existing?.id) return existing.id;

      const projMeta = portalProjects.find((p) => String(p?.id ?? "") === portalProjectId);
      const projTitle = String(projMeta?.name ?? projMeta?.title ?? "Projeto do portal");
      const projStatus = String(projMeta?.status ?? "active");

      // posiciona ao lado/abaixo do client node
      const baseX = (clientNode?.pos_x ?? 80);
      const baseY = (clientNode?.pos_y ?? 80) + 220;

      // descobre quantos project_groups ja existem para deslocar X
      const { count: groupCount } = await db
        .from("canvas_nodes")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .contains("data", { kind: "project_group" });
      const idx = groupCount ?? 0;

      const { data: created } = await db.from("canvas_nodes").insert({
        workspace_id: workspaceId,
        client_id: ws.client_id,
        parent_node_id: clientNodeId,
        node_type: "front",
        title: projTitle,
        status: projStatus === "completed" ? "done" : "active",
        pos_x: baseX + idx * 360,
        pos_y: baseY,
        data: {
          kind: "project_group",
          from_portal: true,
          portal_project_id: portalProjectId,
          portal_status: projStatus,
          stage: "producao",
        },
      }).select("id").single();
      return created?.id ?? null;
    }

    const res = await fetch(`${PORTAL_BASE}/ops-tasks-list`, {
      method: "POST",
      headers: portalHeaders,
      // sem project_id → portal devolve TODAS as tasks (filtramos por client localmente)
      body: JSON.stringify({ limit: 500 }),
    });
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 404) {
        return json({ ok: false, warning: "Portal não expõe ops-tasks-list ainda.", raw: text.slice(0, 200) });
      }
      return json({ error: `portal ${res.status}`, raw: text.slice(0, 300) }, 502);
    }
    let body: any = {};
    try { body = JSON.parse(text); } catch { return json({ error: "invalid portal json" }, 502); }
    const allTasks: Array<Record<string, any>> = Array.isArray(body?.tasks) ? body.tasks : Array.isArray(body) ? body : [];

    // Mantém só tasks dos projetos deste cliente (ou do projeto principal vinculado).
    const clientPortalProjectIds = new Set<string>([String(ws.portal_project_id)]);
    for (const p of portalProjects) {
      const pid = String(p?.id ?? "");
      const pclient = String(p?.client_id ?? p?.profile_id ?? p?.customer_id ?? "");
      // se projeto pertence ao mesmo cliente do projeto vinculado, inclui
      const linkedProject = portalProjects.find((x) => String(x?.id ?? "") === String(ws.portal_project_id));
      const linkedClient = String(linkedProject?.client_id ?? linkedProject?.profile_id ?? linkedProject?.customer_id ?? "");
      if (pid && pclient && linkedClient && pclient === linkedClient) {
        clientPortalProjectIds.add(pid);
      }
    }

    const tasks = allTasks.filter((t) => {
      const pid = String(t.project_id ?? t.portal_project_id ?? "");
      return pid ? clientPortalProjectIds.has(pid) : true;
    });

    let created = 0, updated = 0, linked = 0;
    const projectGroupCache = new Map<string, string | null>();
    const taskCounters = new Map<string, number>();

    for (const t of tasks) {
      const portalTaskId = String(t.id ?? t.task_id ?? "");
      if (!portalTaskId) continue;
      const opsNodeId = (t.ops_node_id as string | null) ?? null;
      const title = (t.title as string) ?? (t.name as string) ?? "Tarefa do portal";
      const portalStatus = String(t.status ?? "todo").toLowerCase();
      const opsStatus = STATUS_MAP[portalStatus] ?? "draft";
      const taskProjectId = String(t.project_id ?? t.portal_project_id ?? ws.portal_project_id);

      // garante node de projeto
      let projectNodeId = projectGroupCache.get(taskProjectId) ?? null;
      if (!projectGroupCache.has(taskProjectId)) {
        projectNodeId = await ensureProjectGroupNode(taskProjectId);
        projectGroupCache.set(taskProjectId, projectNodeId);
      }

      const description = (t.description ?? t.notes ?? null) as string | null;
      const priority    = (t.priority ?? null) as string | null;
      const dueDate     = (t.due_date ?? t.dueDate ?? null) as string | null;
      const checklist   = Array.isArray(t.checklist) ? t.checklist : [];
      const labels      = Array.isArray(t.labels) ? t.labels : [];

      if (opsNodeId) {
        const { data: existing } = await db.from("canvas_nodes").select("id").eq("id", opsNodeId).maybeSingle();
        if (existing) {
          await db.from("canvas_nodes").update({
            title, status: opsStatus,
            parent_node_id: projectNodeId,
            description,
            updated_at: new Date().toISOString(),
          }).eq("id", opsNodeId);
          updated++;
          continue;
        }
      }

      const { data: existingByTask } = await db
        .from("canvas_nodes")
        .select("id, data")
        .eq("workspace_id", workspaceId)
        .contains("data", { portal_task_id: portalTaskId })
        .limit(1)
        .maybeSingle();

      if (existingByTask) {
        const cur = (existingByTask.data as Record<string, unknown>) ?? {};
        await db.from("canvas_nodes").update({
          title, status: opsStatus,
          parent_node_id: projectNodeId,
          description,
          updated_at: new Date().toISOString(),
          data: {
            ...cur,
            portal_task_id: portalTaskId,
            portal_project_id: taskProjectId,
            from_portal: true,
            portal_status: portalStatus,
            priority, due_date: dueDate, labels,
            checklist: checklist.length > 0 ? checklist : (cur.checklist ?? []),
          },
        }).eq("id", existingByTask.id);
        updated++;
        continue;
      }

      const counterKey = taskProjectId;
      const idx = taskCounters.get(counterKey) ?? 0;
      taskCounters.set(counterKey, idx + 1);

      // posicionamento empilhado abaixo do project group
      const baseX = (clientNode?.pos_x ?? 80);
      const groupIdx = Array.from(projectGroupCache.keys()).indexOf(taskProjectId);
      const colX = baseX + Math.max(0, groupIdx) * 360;

      const { data: newNode } = await db.from("canvas_nodes").insert({
        workspace_id: workspaceId,
        client_id: ws.client_id,
        parent_node_id: projectNodeId,
        node_type: "task",
        title,
        status: opsStatus,
        description,
        pos_x: colX,
        pos_y: ((clientNode?.pos_y ?? 80) + 360) + idx * 150,
        data: {
          from_portal: true,
          portal_task_id: portalTaskId,
          portal_project_id: taskProjectId,
          portal_status: portalStatus,
          kind: "checklist",
          checklist,
          priority, due_date: dueDate, labels,
          stage: "producao",
        },
      }).select("id").single();
      created++;

      if (newNode?.id) {
        try {
          await fetch(PORTAL_URL_HOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-webhook-secret": PORTAL_SECRET },
            body: JSON.stringify({
              event: "node_created",
              source: "ops",
              data: {
                project_id: ws.portal_project_id,
                node_id: newNode.id,
                node_title: title,
                node_type: "checklist",
                status: opsStatus,
                portal_task_id: portalTaskId,
                update_type: "task_created",
              },
            }),
          });
          linked++;
        } catch { /* ignore */ }
      }
    }

    return json({ ok: true, total: tasks.length, created, updated, linked });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});
