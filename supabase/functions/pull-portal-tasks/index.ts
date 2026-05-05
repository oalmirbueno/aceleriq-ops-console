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
  done: "done",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";
  const PORTAL_URL_HOOK = Deno.env.get("PORTAL_WEBHOOK_URL") ?? `${PORTAL_BASE}/ops-webhook`;

  try {
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

    const res = await fetch(`${PORTAL_BASE}/ops-tasks-list`, {
      method: "POST",
      headers: portalHeaders,
      body: JSON.stringify({ project_id: ws.portal_project_id, limit: 500 }),
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
    const tasks: Array<Record<string, unknown>> = Array.isArray(body?.tasks) ? body.tasks : Array.isArray(body) ? body : [];

    let created = 0, updated = 0, linked = 0;

    for (const t of tasks) {
      const portalTaskId = String(t.id ?? t.task_id ?? "");
      if (!portalTaskId) continue;
      const opsNodeId = (t.ops_node_id as string | null) ?? null;
      const title = (t.title as string) ?? (t.name as string) ?? "Tarefa do portal";
      const portalStatus = String(t.status ?? "todo").toLowerCase();
      const opsStatus = STATUS_MAP[portalStatus] ?? "draft";

      if (opsNodeId) {
        const { data: existing } = await db.from("canvas_nodes").select("id").eq("id", opsNodeId).maybeSingle();
        if (existing) {
          await db.from("canvas_nodes").update({ title, status: opsStatus, updated_at: new Date().toISOString() }).eq("id", opsNodeId);
          updated++;
          continue;
        }
      }

      const { data: existingByTask } = await db
        .from("canvas_nodes")
        .select("id, data")
        .eq("workspace_id", workspaceId)
        .contains("data", { portal_task_id: portalTaskId })
        .maybeSingle();

      if (existingByTask) {
        await db.from("canvas_nodes").update({
          title, status: opsStatus, updated_at: new Date().toISOString(),
          data: { ...((existingByTask.data as Record<string, unknown>) ?? {}), portal_task_id: portalTaskId, from_portal: true },
        }).eq("id", existingByTask.id);
        updated++;
        continue;
      }

      const { count } = await db.from("canvas_nodes").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId);
      const idx = count ?? 0;
      const { data: newNode } = await db.from("canvas_nodes").insert({
        workspace_id: workspaceId,
        client_id: ws.client_id,
        parent_node_id: null,
        node_type: "checklist",
        title,
        status: opsStatus,
        pos_x: 80 + (idx % 6) * 320,
        pos_y: 800 + Math.floor(idx / 6) * 220,
        data: { from_portal: true, portal_task_id: portalTaskId, kind: "checklist", checklist: [] },
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
