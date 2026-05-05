/**
 * backfill-nodes-to-portal — sincroniza TODOS os nodes existentes de um workspace
 * com o kanban do portal. Idempotente: o ops-webhook usa upsert por ops_node_id.
 *
 * Body: { workspaceId: string, clientId?: string }
 * Retorna: { ok, total, sent, skipped }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const COMPLETED = new Set(["done", "completed", "concluido"]);
function progressOf(status?: string | null, data?: Record<string, unknown> | null): number {
  const s = (status ?? "").toLowerCase();
  if (COMPLETED.has(s)) return 100;
  const ignore = new Set(["operationalMeta", "operational_meta", "_meta", "history"]);
  const entries = Object.entries(data ?? {}).filter(([k]) => !ignore.has(k));
  const total = entries.length || 1;
  const filled = entries.filter(([, v]) => {
    if (v == null) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v as object).length > 0;
    return true;
  }).length;
  const ratio = Math.min(filled / total, 1);
  if (s === "draft" || s === "" || s === "not_started") return Math.round(ratio * 33);
  if (s === "blocked" || s === "bloqueado") return Math.round(33 + ratio * 33);
  return Math.round(33 + ratio * 33);
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Não iniciada", not_started: "Não iniciada",
  active: "Em andamento", in_progress: "Em andamento",
  in_review: "Em revisão", blocked: "Bloqueada",
  done: "Concluída", completed: "Concluída",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const PORTAL_URL = Deno.env.get("PORTAL_WEBHOOK_URL") ?? "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook";
  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET");
  const PORTAL_ADMIN = Deno.env.get("PORTAL_ADMIN_USER_ID") ?? "";

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
      .select("id, portal_project_id, clients(portal_client_id)")
      .eq("id", workspaceId)
      .single();

    const portalProjectId = ws?.portal_project_id as string | null;
    const portalClientId = (ws?.clients as any)?.portal_client_id as string | null;
    if (!portalProjectId || !portalClientId) {
      return json({ ok: false, skipped: true, reason: "workspace not linked to portal" });
    }

    const { data: nodes } = await db
      .from("canvas_nodes")
      .select("id, title, node_type, status, data")
      .eq("workspace_id", workspaceId);

    const list = (nodes ?? []).filter((n) => {
      const t = (n.node_type ?? "").toLowerCase();
      // ignora client folders, ai_orb e chat_node — não viram tarefa
      return !["client", "ai_orb", "chat_node"].includes(t);
    });

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (PORTAL_SECRET) headers["x-webhook-secret"] = PORTAL_SECRET;

    let sent = 0, skipped = 0;
    for (const n of list) {
      const status = n.status ?? "draft";
      const progress = progressOf(status, n.data as Record<string, unknown> | null);
      const label = STATUS_LABELS[status.toLowerCase()] ?? status;
      // 1) garante que existe a tarefa no portal (idempotente via ops_node_id)
      const createdPayload = {
        event: "node_created",
        source: "ops",
        data: {
          project_id: portalProjectId,
          author_id: PORTAL_ADMIN || portalClientId,
          node_id: n.id,
          node_title: n.title ?? "node",
          node_type: n.node_type ?? null,
          status,
          message: `Tarefa "${n.title ?? "node"}"`,
          update_type: "task_created",
        },
      };
      // 2) atualiza progresso/status
      const updatedPayload = {
        event: "node_updated",
        source: "ops",
        data: {
          project_id: portalProjectId,
          author_id: PORTAL_ADMIN || portalClientId,
          message: `Tarefa "${n.title ?? "node"}" — ${label} (${progress}%)`,
          update_type: "task_progress",
          node_id: n.id,
          node_title: n.title ?? "node",
          node_type: n.node_type ?? null,
          status,
          progress,
        },
      };
      try {
        const r1 = await fetch(PORTAL_URL, { method: "POST", headers, body: JSON.stringify(createdPayload) });
        const r2 = await fetch(PORTAL_URL, { method: "POST", headers, body: JSON.stringify(updatedPayload) });
        if (r1.ok || r2.ok) sent++; else {
          console.error("[backfill-nodes-to-portal] portal rejected", { node_id: n.id, create_status: r1.status, update_status: r2.status, create_body: await r1.text(), update_body: await r2.text() });
          skipped++;
        }
      } catch (err) {
        console.error("[backfill-nodes-to-portal] portal fetch failed", err);
        skipped++;
      }
    }

    return json({ ok: true, total: list.length, sent, skipped });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});