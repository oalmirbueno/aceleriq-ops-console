// repair-legacy-nodes — standalone, OPS-only.
// version: repair-legacy-nodes-v1
//
// Eventos suportados:
//   { event: "version_check" }
//   { event: "dry_run", workspaceId: "<uuid>" }                     // workspace opcional; sem ele faz scan global READ-ONLY
//   { event: "apply", workspaceId: "<uuid>", confirm: true, limit?: number }
//
// Regras:
//   - Nunca chama Portal.
//   - Nunca apaga, nunca arquiva.
//   - apply EXIGE workspaceId + confirm:true.
//   - Só mexe em canvas_nodes do OPS.
//   - Cria milestone_group "Inbox Operacional" no workspace se não existir,
//     e anexa nodes órfãos a ele (parent_node_id + data.milestone_id).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const VERSION = "repair-legacy-nodes-v1";
const DEFAULT_TITLE = "Inbox Operacional";

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
const TASK_KINDS = new Set([
  "task", "checklist", "case", "before_after", "landing_page", "site",
  "automacao", "integracao", "agente", "metrica", "acessos", "email_mkt",
  "trafego", "funil", "conteudo", "video", "imagem", "social", "crm",
  "resultado", "reuniao", "decisao", "objetivo", "briefing", "lancamento",
]);

function inheritMilestone(row: any, byNodeId: Map<string, any>): string {
  let mid = "";
  let cur: any = row;
  const seen = new Set<string>();
  for (let d = 0; cur && d < 6; d++) {
    if (seen.has(cur.id)) break;
    seen.add(cur.id);
    const dt = (cur.data ?? {}) as any;
    if (typeof dt.portal_milestone_id === "string" && dt.portal_milestone_id) { mid = dt.portal_milestone_id; break; }
    if (typeof dt.milestone_id === "string" && dt.milestone_id) { mid = dt.milestone_id; break; }
    if (String(dt.kind ?? "").toLowerCase() === "milestone_group") { mid = cur.id; break; }
    cur = byNodeId.get(cur.parent_node_id);
  }
  return mid;
}

function isCandidate(n: any, byNodeId: Map<string, any>): boolean {
  if (n.deleted_at || n.archived_at || n.sync_status === "deleted" || n.sync_status === "archived") return false;
  const dt = (n.data ?? {}) as any;
  const kind = String(dt.kind ?? "").toLowerCase();
  const nodeType = String(n.node_type ?? "").toLowerCase();
  if (STRUCT_KIND.has(kind) || STRUCT_TYPE.has(nodeType)) return false;
  const isTaskish = nodeType === "task" || TASK_KINDS.has(kind) || (!kind && nodeType !== "front");
  if (!isTaskish) return false;
  const ownMid = (typeof dt.portal_milestone_id === "string" && dt.portal_milestone_id)
    || (typeof dt.milestone_id === "string" && dt.milestone_id) || "";
  if (ownMid) return false;
  if (inheritMilestone(n, byNodeId)) return false;
  return true;
}

async function loadWorkspaceNodes(db: any, workspaceId: string) {
  const { data, error } = await db
    .from("canvas_nodes")
    .select("id, workspace_id, client_id, node_type, status, title, data, parent_node_id, deleted_at, archived_at, sync_status, pos_x, pos_y")
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
      .select("id, workspace_id, client_id, node_type, status, title, data, parent_node_id, deleted_at, archived_at, sync_status, pos_x, pos_y")
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return out;
}

function findExistingInbox(nodes: any[]): string | null {
  for (const n of nodes) {
    const dt = (n.data ?? {}) as any;
    const kind = String(dt.kind ?? "").toLowerCase();
    const title = String(n.title ?? "").trim().toLowerCase();
    if (kind === "milestone_group" && title === DEFAULT_TITLE.toLowerCase()) return n.id;
  }
  return null;
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
      function: "repair-legacy-nodes",
      version: VERSION,
      events: ["version_check", "dry_run", "apply"],
      rules: {
        apply_requires: ["workspaceId", "confirm:true"],
        portal_calls: false,
        deletes: false,
        archives: false,
        default_milestone_title: DEFAULT_TITLE,
      },
    });
  }

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ── DRY RUN ───────────────────────────────────────────────────────────
  if (event === "dry_run" || event === "dryrun") {
    const workspaceId = String((body as any).workspaceId ?? (body as any).workspace_id ?? "").trim();
    try {
      let nodes: any[];
      if (workspaceId) {
        nodes = await loadWorkspaceNodes(db, workspaceId);
      } else {
        nodes = await loadAllNodesPaginated(db);
      }
      const byNodeId = new Map(nodes.map((n) => [n.id, n]));

      if (workspaceId) {
        const { data: ws } = await db.from("workspaces").select("id, name, client_id, portal_project_id").eq("id", workspaceId).maybeSingle();
        const inbox = findExistingInbox(nodes);
        const candidates = nodes.filter((n) => isCandidate(n, byNodeId));
        return json({
          ok: true,
          version: VERSION,
          mode: "dry_run",
          read_only: true,
          workspace_id: workspaceId,
          workspace_name: ws?.name ?? null,
          portal_project_id: ws?.portal_project_id ?? null,
          existing_default_milestone_node_id: inbox,
          would_create_default_milestone: !inbox,
          default_milestone_title: DEFAULT_TITLE,
          candidates_total: candidates.length,
          sample: candidates.slice(0, 20).map((n) => ({
            id: n.id, title: n.title ?? null, node_type: n.node_type ?? null,
            kind: String((n.data ?? {}).kind ?? "") || null,
          })),
        });
      }

      // global dry_run
      const wsAgg = new Map<string, any>();
      for (const n of nodes) {
        if (!isCandidate(n, byNodeId)) continue;
        const key = n.workspace_id ?? "__no_ws__";
        if (!wsAgg.has(key)) wsAgg.set(key, { workspace_id: n.workspace_id, candidates_total: 0 });
        wsAgg.get(key).candidates_total++;
      }
      return json({
        ok: true,
        version: VERSION,
        mode: "dry_run_global",
        read_only: true,
        scanned_nodes: nodes.length,
        workspaces: Array.from(wsAgg.values()).sort((a, b) => b.candidates_total - a.candidates_total),
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  // ── APPLY ─────────────────────────────────────────────────────────────
  if (event === "apply") {
    const workspaceId = String((body as any).workspaceId ?? (body as any).workspace_id ?? "").trim();
    const confirm = (body as any).confirm === true;
    const limitRaw = Number((body as any).limit ?? 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 1000) : 10;

    if (!workspaceId) return json({ ok: false, error: "workspaceId is required (no global apply allowed)" }, 400);
    if (!confirm) return json({ ok: false, error: "confirm:true is required", workspace_id: workspaceId }, 400);

    try {
      const { data: ws, error: wsErr } = await db
        .from("workspaces")
        .select("id, name, client_id, portal_project_id")
        .eq("id", workspaceId)
        .maybeSingle();
      if (wsErr) return json({ ok: false, error: wsErr.message }, 500);
      if (!ws) return json({ ok: false, error: "workspace not found", workspace_id: workspaceId }, 404);

      const nodes = await loadWorkspaceNodes(db, workspaceId);
      const byNodeId = new Map(nodes.map((n: any) => [n.id, n]));

      // 1) milestone existente?
      let inboxNodeId: string | null = findExistingInbox(nodes);
      let createdMilestone = false;

      // 2) cria se não existe
      if (!inboxNodeId) {
        let projectGroupId: string | null = null;
        for (const n of nodes as any[]) {
          const dt = (n.data ?? {}) as any;
          if (String(dt.kind ?? "").toLowerCase() === "project_group") { projectGroupId = n.id; break; }
        }
        let maxY = 360;
        let countMs = 0;
        for (const n of nodes as any[]) {
          const dt = (n.data ?? {}) as any;
          if (String(dt.kind ?? "").toLowerCase() === "milestone_group") {
            countMs++;
            const py = Number((n as any).pos_y ?? 0);
            if (Number.isFinite(py) && py > maxY) maxY = py;
          }
        }
        const newPosY = countMs > 0 ? maxY + 420 : 360;

        const { data: created, error: createErr } = await db
          .from("canvas_nodes")
          .insert({
            workspace_id: workspaceId,
            client_id: ws.client_id ?? null,
            parent_node_id: projectGroupId,
            node_type: "front",
            title: DEFAULT_TITLE,
            status: "active",
            pos_x: 112,
            pos_y: newPosY,
            data: {
              kind: "milestone_group",
              from_portal: false,
              stage: "producao",
              portal_project_id: ws.portal_project_id ?? undefined,
              milestone_key: `inbox_operacional:${workspaceId}`,
              inbox_default: true,
            },
          })
          .select("id")
          .single();
        if (createErr) return json({ ok: false, error: `failed to create milestone: ${createErr.message}`, workspace_id: workspaceId }, 500);
        inboxNodeId = created?.id ?? null;
        createdMilestone = true;
        if (!inboxNodeId) return json({ ok: false, error: "milestone created but id missing" }, 500);
      }

      // 3) candidatos
      const candidatesAll = nodes.filter((n: any) => n.id !== inboxNodeId && isCandidate(n, byNodeId));
      const candidates = candidatesAll.slice(0, limit);

      // 4) anexa
      const errors: Array<{ id: string; error: string }> = [];
      const attached: Array<{ id: string; title: string | null; node_type: string | null; kind: string | null }> = [];
      for (const n of candidates) {
        const dt = (n.data ?? {}) as any;
        const newData = {
          ...dt,
          milestone_id: inboxNodeId,
          attached_by: "repair-legacy-nodes",
          attached_at: new Date().toISOString(),
        };
        const { error: upErr } = await db
          .from("canvas_nodes")
          .update({
            parent_node_id: inboxNodeId,
            data: newData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", n.id)
          .eq("workspace_id", workspaceId);
        if (upErr) { errors.push({ id: n.id, error: upErr.message }); continue; }
        if (attached.length < 50) {
          attached.push({
            id: n.id,
            title: n.title ?? null,
            node_type: n.node_type ?? null,
            kind: String((n.data ?? {}).kind ?? "") || null,
          });
        }
      }

      return json({
        ok: true,
        version: VERSION,
        mode: "apply",
        workspace_id: workspaceId,
        workspace_name: ws.name ?? null,
        portal_project_id: ws.portal_project_id ?? null,
        default_milestone_node_id: inboxNodeId,
        default_milestone_title: DEFAULT_TITLE,
        created_milestone: createdMilestone,
        candidates_total: candidatesAll.length,
        limit_used: limit,
        nodes_attached: attached.length,
        sample_attached: attached,
        errors,
        portal_sync_skipped: true,
        note: "Apenas OPS. Nada enviado ao Portal, nada deletado, nada arquivado.",
      });
    } catch (e) {
      return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }

  return json({ ok: false, error: `unknown event: ${event}`, supported: ["version_check", "dry_run", "apply"] }, 400);
});
