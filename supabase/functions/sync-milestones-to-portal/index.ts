// sync-milestones-to-portal — standalone, escopo: somente milestones.
// version: sync-milestones-to-portal-v1
//
// Eventos:
//   { event: "version_check" }
//   { event: "dry_run", workspaceId?: string, milestoneId?: string }
//   { event: "apply", confirm: true, workspaceId: string, milestoneId?: string, limit?: number }
//   { event: "apply_one", confirm: true, milestoneId: string }     // shortcut p/ um milestone só
//
// Regras:
//   - apply EXIGE confirm:true + (workspaceId ou milestoneId).
//   - Sem global apply (sem workspace e sem milestone => 400).
//   - Não cria task. Não roda backfill de nodes filhos.
//   - Idempotente por ops_milestone_id no Portal (upsert no ops-webhook).
//   - Após sucesso, salva data.portal_milestone_id no canvas_node OPS.
//   - Não apaga, não arquiva nada nesse v1 (delete/archive vem depois).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const VERSION = "sync-milestones-to-portal-v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

function isMilestoneGroup(n: any): boolean {
  const dt = (n?.data ?? {}) as any;
  return String(dt.kind ?? "").toLowerCase() === "milestone_group";
}

async function loadMilestoneNodes(db: any, workspaceId?: string, milestoneId?: string) {
  let q = db
    .from("canvas_nodes")
    .select("id, workspace_id, client_id, node_type, status, title, data, parent_node_id, pos_x, pos_y, archived_at, deleted_at, sync_status, portal_milestone_id, created_at, updated_at");
  if (milestoneId) q = q.eq("id", milestoneId);
  else if (workspaceId) q = q.eq("workspace_id", workspaceId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).filter(isMilestoneGroup);
}

async function getWorkspace(db: any, workspaceId: string) {
  const { data, error } = await db
    .from("workspaces")
    .select("id, name, client_id, portal_project_id")
    .eq("id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

async function sendToPortal(url: string, secret: string, anonKey: string, payload: any) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-webhook-secret"] = secret;
  if (anonKey) { headers.apikey = anonKey; headers.Authorization = `Bearer ${anonKey}`; }
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  return { ok: res.ok, status: res.status, body: parsed ?? text };
}

function extractPortalMilestoneId(body: any): string | null {
  if (!body || typeof body !== "object") return null;
  const candidates = [
    body.portal_milestone_id,
    body.milestone_id,
    body.id,
    body?.data?.portal_milestone_id,
    body?.data?.milestone_id,
    body?.data?.id,
    body?.milestone?.id,
    body?.result?.portal_milestone_id,
    body?.result?.id,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return null;
}

function buildMilestonePayload(node: any, ws: any, eventName: string) {
  const dt = (node.data ?? {}) as any;
  return {
    event: eventName,
    source: "ops",
    data: {
      ops_milestone_id: node.id,
      ops_workspace_id: node.workspace_id,
      ops_client_id: node.client_id ?? ws?.client_id ?? null,
      portal_project_id: ws?.portal_project_id ?? dt.portal_project_id ?? null,
      portal_milestone_id: node.portal_milestone_id ?? dt.portal_milestone_id ?? null,
      title: node.title ?? "Sem título",
      status: node.status ?? "active",
      position: typeof node.pos_y === "number" ? node.pos_y : 0,
      stage: dt.stage ?? null,
      milestone_key: dt.milestone_key ?? null,
      inbox_default: dt.inbox_default === true,
      created_at: node.created_at ?? null,
      updated_at: node.updated_at ?? new Date().toISOString(),
      sync_origin: "ops",
      event_id: `ms:${node.id}:${Date.now()}`,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const PORTAL_URL = Deno.env.get("PORTAL_WEBHOOK_URL") ?? "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook";
  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ ok: false, error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);

  const body = await req.json().catch(() => ({} as any));
  const event = String((body as any).event ?? "").trim().toLowerCase();

  if (event === "" || event === "version_check") {
    return json({
      ok: true,
      function: "sync-milestones-to-portal",
      version: VERSION,
      events: ["version_check", "dry_run", "apply", "apply_one"],
      portal_url: PORTAL_URL,
      portal_secret_configured: Boolean(PORTAL_SECRET),
      rules: {
        apply_requires: ["confirm:true", "workspaceId or milestoneId"],
        global_apply: false,
        deletes: false,
        archives: false,
        creates_tasks: false,
        idempotency_key: "ops_milestone_id",
        portal_event: "milestone.upserted",
      },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ── DRY RUN ────────────────────────────────────────────────────────
  if (event === "dry_run" || event === "dryrun") {
    const workspaceId = String((body as any).workspaceId ?? (body as any).workspace_id ?? "").trim();
    const milestoneId = String((body as any).milestoneId ?? (body as any).milestone_id ?? "").trim();
    try {
      const nodes = await loadMilestoneNodes(db, workspaceId || undefined, milestoneId || undefined);
      const out: any[] = [];
      for (const n of nodes) {
        const dt = (n.data ?? {}) as any;
        const ws = n.workspace_id ? await getWorkspace(db, n.workspace_id) : null;
        out.push({
          ops_milestone_id: n.id,
          workspace_id: n.workspace_id,
          workspace_name: ws?.name ?? null,
          portal_project_id: ws?.portal_project_id ?? null,
          title: n.title,
          has_portal_milestone_id: Boolean(n.portal_milestone_id || dt.portal_milestone_id),
          would_create: !(n.portal_milestone_id || dt.portal_milestone_id),
          would_update: Boolean(n.portal_milestone_id || dt.portal_milestone_id),
          archived: Boolean(n.archived_at || n.deleted_at),
        });
      }
      return json({
        ok: true, version: VERSION, mode: "dry_run", read_only: true,
        scope: { workspaceId: workspaceId || null, milestoneId: milestoneId || null },
        total: out.length, milestones: out,
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // ── APPLY ──────────────────────────────────────────────────────────
  if (event === "apply" || event === "apply_one") {
    const confirm = (body as any).confirm === true;
    const workspaceId = String((body as any).workspaceId ?? (body as any).workspace_id ?? "").trim();
    const milestoneId = String((body as any).milestoneId ?? (body as any).milestone_id ?? "").trim();
    const limitRaw = Number((body as any).limit ?? 50);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 200) : 50;

    if (!confirm) return json({ ok: false, error: "confirm:true is required" }, 400);
    if (!workspaceId && !milestoneId) {
      return json({ ok: false, error: "workspaceId or milestoneId is required (no global apply)" }, 400);
    }
    if (!PORTAL_SECRET) return json({ ok: false, error: "PORTAL_WEBHOOK_SECRET not configured in Edge Function secrets" }, 500);

    try {
      const nodes = await loadMilestoneNodes(db, workspaceId || undefined, milestoneId || undefined);
      const slice = nodes.slice(0, limit);

      const wsCache = new Map<string, any>();
      async function getWs(wsId: string) {
        if (wsCache.has(wsId)) return wsCache.get(wsId);
        const w = await getWorkspace(db, wsId);
        wsCache.set(wsId, w);
        return w;
      }

      const results: any[] = [];
      const errors: any[] = [];

      for (const n of slice) {
        try {
          const ws = n.workspace_id ? await getWs(n.workspace_id) : null;
          if (!ws?.portal_project_id) {
            errors.push({ ops_milestone_id: n.id, error: "workspace has no portal_project_id; vincule o projeto primeiro" });
            continue;
          }
          const payload = buildMilestonePayload(n, ws, "milestone.upserted");
          const sent = await sendToPortal(PORTAL_URL, PORTAL_SECRET, PORTAL_ANON, payload);
          if (!sent.ok) {
            errors.push({ ops_milestone_id: n.id, status: sent.status, error: typeof sent.body === "string" ? sent.body : JSON.stringify(sent.body).slice(0, 500) });
            continue;
          }
          const portalMilestoneId = extractPortalMilestoneId(sent.body);
          let saved = false;
          if (portalMilestoneId) {
            const dt = (n.data ?? {}) as any;
            const newData = { ...dt, portal_milestone_id: portalMilestoneId, last_milestone_sync_at: new Date().toISOString() };
            const upd: any = { data: newData, updated_at: new Date().toISOString() };
            // tenta também a coluna estável se existir
            upd.portal_milestone_id = portalMilestoneId;
            const { error: upErr } = await db.from("canvas_nodes").update(upd).eq("id", n.id);
            if (upErr) {
              // fallback sem coluna
              const { error: upErr2 } = await db.from("canvas_nodes").update({ data: newData, updated_at: new Date().toISOString() }).eq("id", n.id);
              if (upErr2) {
                errors.push({ ops_milestone_id: n.id, error: `portal ok mas falhou salvar local: ${upErr2.message}` });
              } else { saved = true; }
            } else { saved = true; }
          }
          results.push({
            ops_milestone_id: n.id,
            workspace_id: n.workspace_id,
            portal_project_id: ws.portal_project_id,
            title: n.title,
            portal_response_status: sent.status,
            portal_milestone_id: portalMilestoneId,
            saved_locally: saved,
            note: portalMilestoneId ? "ok" : "portal respondeu sem portal_milestone_id; verifique o ops-webhook",
          });
        } catch (e) {
          errors.push({ ops_milestone_id: n.id, error: e instanceof Error ? e.message : String(e) });
        }
      }

      return json({
        ok: true,
        version: VERSION,
        mode: event,
        scope: { workspaceId: workspaceId || null, milestoneId: milestoneId || null, limit_used: limit },
        total_processed: slice.length,
        synced_count: results.filter((r) => r.portal_milestone_id).length,
        results, errors,
        portal_event: "milestone.upserted",
        nothing_deleted: true,
        nothing_archived: true,
        tasks_skipped: true,
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  return json({ ok: false, error: `unknown event: ${event}`, supported: ["version_check", "dry_run", "apply", "apply_one"] }, 400);
});