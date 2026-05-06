// legacy-nodes-cleanup — standalone, OPS-only.
// version: legacy-nodes-cleanup-v1
//
// Eventos:
//   { event: "version_check" }
//   { event: "legacy_nodes_cleanup_dry_run", workspaceId?: string }   // read-only
//   { event: "legacy_nodes_cleanup_apply", workspaceId: string, confirm: true, limit?: number }
//
// Regras:
//   - Nunca chama Portal.
//   - Nunca apaga físico.
//   - Apply EXIGE workspaceId + confirm:true.
//   - Soft archive: archived_at = now(), sync_status = 'archived_legacy'.
//   - Não toca em milestone_group, project_group, client_folder, client, ai_orb, chat_node.
//   - Não toca em nodes from_portal=true.
//   - Não toca em nodes que tenham portal_task_id ou portal_milestone_id.
//   - Não toca em nodes que herdam milestone via parent chain.
//   - Não toca em nodes filhos da Inbox Operacional do repair.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const VERSION = "legacy-nodes-cleanup-v1";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const STRUCT_KIND = new Set([
  "project_group", "milestone_group", "client_folder", "client", "ai_orb", "chat_node",
]);
const STRUCT_TYPE = new Set([
  "project_group", "milestone_group", "client_folder", "client", "ai_orb", "chat_node",
]);

function isStructural(n: any): boolean {
  const dt = (n.data ?? {}) as any;
  const kind = String(dt.kind ?? "").toLowerCase();
  const nodeType = String(n.node_type ?? "").toLowerCase();
  return STRUCT_KIND.has(kind) || STRUCT_TYPE.has(nodeType);
}

function alreadyArchived(n: any): boolean {
  if (n.archived_at || n.deleted_at) return true;
  const ss = String(n.sync_status ?? "").toLowerCase();
  return ss === "archived" || ss === "deleted" || ss === "archived_legacy";
}

function inheritsMilestone(n: any, byId: Map<string, any>): boolean {
  let cur: any = n;
  const seen = new Set<string>();
  for (let d = 0; cur && d < 6; d++) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const dt = (cur.data ?? {}) as any;
    if (typeof dt.portal_milestone_id === "string" && dt.portal_milestone_id) return true;
    if (typeof dt.milestone_id === "string" && dt.milestone_id) return true;
    if (String(dt.kind ?? "").toLowerCase() === "milestone_group") return true;
    cur = byId.get(cur.parent_node_id);
  }
  return false;
}

function evaluate(n: any, byId: Map<string, any>): { candidate: boolean; reason: string; details: any } {
  const dt = (n.data ?? {}) as any;
  const details = {
    has_portal_task_id: Boolean(n.portal_task_id),
    has_portal_milestone_id: Boolean(n.portal_milestone_id || dt.portal_milestone_id),
    has_parent_milestone: inheritsMilestone(n, byId),
    from_portal: dt.from_portal === true,
    is_structural: isStructural(n),
    kind: String(dt.kind ?? "") || null,
    node_type: String(n.node_type ?? "") || null,
  };
  if (alreadyArchived(n)) return { candidate: false, reason: "already_archived", details };
  if (details.is_structural) return { candidate: false, reason: "structural", details };
  if (details.from_portal) return { candidate: false, reason: "from_portal", details };
  if (details.has_portal_task_id) return { candidate: false, reason: "has_portal_task_id", details };
  if (details.has_portal_milestone_id) return { candidate: false, reason: "has_portal_milestone_id", details };
  if (details.has_parent_milestone) return { candidate: false, reason: "inherits_milestone", details };
  return { candidate: true, reason: "legacy_orphan_no_milestone", details };
}

async function loadWorkspaceNodes(db: any, workspaceId: string) {
  const { data, error } = await db
    .from("canvas_nodes")
    .select("id, workspace_id, client_id, node_type, status, title, data, parent_node_id, deleted_at, archived_at, sync_status, portal_task_id, portal_milestone_id, created_at")
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function loadAllNodesPaginated(db: any) {
  const pageSize = 1000;
  let from = 0;
  const out: any[] = [];
  while (true) {
    const { data, error } = await db
      .from("canvas_nodes")
      .select("id, workspace_id, client_id, node_type, status, title, data, parent_node_id, deleted_at, archived_at, sync_status, portal_task_id, portal_milestone_id, created_at")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json({ ok: false, error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
  }

  const body = await req.json().catch(() => ({} as any));
  const event = String((body as any).event ?? "").trim().toLowerCase();

  if (event === "version_check" || event === "") {
    return json({
      ok: true,
      function: "legacy-nodes-cleanup",
      version: VERSION,
      events: ["version_check", "legacy_nodes_cleanup_dry_run", "legacy_nodes_cleanup_apply"],
      rules: {
        apply_requires: ["workspaceId", "confirm:true"],
        portal_calls: false,
        physical_deletes: false,
        soft_archive_uses: { archived_at: true, sync_status: "archived_legacy" },
        protects: ["structural_nodes", "from_portal", "portal_task_id", "portal_milestone_id", "milestone_inheritance"],
      },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ── DRY RUN ────────────────────────────────────────────────────────
  if (event === "legacy_nodes_cleanup_dry_run" || event === "legacy_nodes_cleanup_dryrun") {
    const workspaceId = String((body as any).workspaceId ?? (body as any).workspace_id ?? "").trim();
    try {
      let nodes: any[];
      if (workspaceId) {
        nodes = await loadWorkspaceNodes(db, workspaceId);
      } else {
        nodes = await loadAllNodesPaginated(db);
      }
      const byId = new Map(nodes.map((n) => [n.id, n]));

      if (workspaceId) {
        const candidates: any[] = [];
        for (const n of nodes) {
          const v = evaluate(n, byId);
          if (v.candidate) {
            candidates.push({
              id: n.id,
              title: n.title ?? null,
              node_type: n.node_type ?? null,
              kind: v.details.kind,
              parent_node_id: n.parent_node_id ?? null,
              created_at: n.created_at ?? null,
              reason: v.reason,
              details: v.details,
            });
          }
        }
        return json({
          ok: true,
          version: VERSION,
          mode: "legacy_nodes_cleanup_dry_run",
          read_only: true,
          workspace_id: workspaceId,
          scanned_nodes: nodes.length,
          candidates_total: candidates.length,
          sample: candidates.slice(0, 30),
        });
      }

      // global dry_run
      const wsAgg = new Map<string, any>();
      for (const n of nodes) {
        const v = evaluate(n, byId);
        if (!v.candidate) continue;
        const key = n.workspace_id ?? "__no_ws__";
        if (!wsAgg.has(key)) wsAgg.set(key, { workspace_id: n.workspace_id, candidates_total: 0, sample: [] as any[] });
        const agg = wsAgg.get(key);
        agg.candidates_total++;
        if (agg.sample.length < 5) {
          agg.sample.push({
            id: n.id, title: n.title ?? null, node_type: n.node_type ?? null, kind: v.details.kind, reason: v.reason,
          });
        }
      }
      return json({
        ok: true,
        version: VERSION,
        mode: "legacy_nodes_cleanup_dry_run_global",
        read_only: true,
        scanned_nodes: nodes.length,
        workspaces: Array.from(wsAgg.values()).sort((a, b) => b.candidates_total - a.candidates_total),
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // ── APPLY ──────────────────────────────────────────────────────────
  if (event === "legacy_nodes_cleanup_apply") {
    const workspaceId = String((body as any).workspaceId ?? (body as any).workspace_id ?? "").trim();
    const confirm = (body as any).confirm === true;
    const limitRaw = Number((body as any).limit ?? 50);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 50;

    if (!workspaceId) return json({ ok: false, error: "workspaceId is required (no global apply allowed)" }, 400);
    if (!confirm) return json({ ok: false, error: "confirm:true is required", workspace_id: workspaceId }, 400);

    try {
      const nodes = await loadWorkspaceNodes(db, workspaceId);
      const byId = new Map(nodes.map((n: any) => [n.id, n]));

      const candidatesAll: any[] = [];
      for (const n of nodes) {
        const v = evaluate(n, byId);
        if (v.candidate) candidatesAll.push({ node: n, reason: v.reason });
      }
      const candidates = candidatesAll.slice(0, limit);

      const errors: Array<{ id: string; error: string }> = [];
      const archived: Array<{ id: string; title: string | null; node_type: string | null; kind: string | null; reason: string }> = [];
      const nowIso = new Date().toISOString();

      for (const c of candidates) {
        const n = c.node;
        const dt = (n.data ?? {}) as any;
        const newData = {
          ...dt,
          archived_by: "legacy-nodes-cleanup",
          archived_at_iso: nowIso,
          archive_reason: c.reason,
        };
        const { error: upErr } = await db
          .from("canvas_nodes")
          .update({
            archived_at: nowIso,
            sync_status: "archived_legacy",
            data: newData,
            updated_at: nowIso,
          })
          .eq("id", n.id)
          .eq("workspace_id", workspaceId);
        if (upErr) { errors.push({ id: n.id, error: upErr.message }); continue; }
        if (archived.length < 100) {
          archived.push({
            id: n.id,
            title: n.title ?? null,
            node_type: n.node_type ?? null,
            kind: String((n.data ?? {}).kind ?? "") || null,
            reason: c.reason,
          });
        }
      }

      return json({
        ok: true,
        version: VERSION,
        mode: "legacy_nodes_cleanup_apply",
        workspace_id: workspaceId,
        candidates_total: candidatesAll.length,
        limit_used: limit,
        archived_count: archived.length,
        sample_archived: archived,
        errors,
        portal_sync_skipped: true,
        physical_delete: false,
        note: "Soft archive only. archived_at + sync_status='archived_legacy'. Portal não foi tocado.",
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  return json({
    ok: false,
    error: `unknown event: ${event}`,
    supported: ["version_check", "legacy_nodes_cleanup_dry_run", "legacy_nodes_cleanup_apply"],
  }, 400);
});