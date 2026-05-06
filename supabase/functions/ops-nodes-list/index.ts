/**
 * ops-nodes-list — endpoint chamado pelo Portal (pull-ops-nodes) a cada 30s.
 * Retorna TODOS os canvas_nodes (passado, atual, futuro) que tenham
 * portal_project_id setado. Autenticado por header x-webhook-secret.
 * v1.0.1 — deploy bump
 *
 * Body opcional: { project_id?: string | null }
 *   - se vier, filtra por aquele portal_project_id
 *   - senão retorna todos os nodes com portal_project_id não-nulo
 *
 * Resposta:
 *   { nodes: [{ ops_node_id, project_id, milestone_id, title, status,
 *               progress, node_type, updated_at }] }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const STATUS_MAP: Record<string, string> = {
  draft: "todo",
  not_started: "todo",
  todo: "todo",
  active: "active",
  doing: "active",
  in_progress: "active",
  em_andamento: "active",
  in_review: "in_review",
  review: "in_review",
  revisao: "in_review",
  blocked: "blocked",
  bloqueado: "blocked",
  done: "done",
  completed: "done",
  concluido: "done",
};

function mapStatus(raw: unknown): string {
  const s = String(raw ?? "").toLowerCase().trim();
  return STATUS_MAP[s] ?? "todo";
}

function pickString(...vals: unknown[]): string {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function computeProgress(status: string, data: Record<string, unknown> | null): number {
  if (status === "done") return 100;
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
  if (status === "todo") return Math.round(ratio * 33);
  if (status === "blocked") return Math.round(33 + ratio * 33);
  if (status === "in_review") return Math.round(66 + ratio * 33);
  return Math.round(33 + ratio * 33);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const SECRET = Deno.env.get("PORTAL_TO_OPS_SECRET") ?? "";
  const received = req.headers.get("x-webhook-secret") ?? "";
  if (!SECRET || received !== SECRET) return json({ error: "unauthorized" }, 401);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  const body = (await req.json().catch(() => ({}))) as { project_id?: string | null };
  const filterProjectId = pickString(body.project_id);

  // Busca em lotes para suportar workspaces grandes. Não filtramos direto por
  // data->>portal_project_id porque nodes criados dentro de um milestone podem
  // herdar o vínculo pelo parent_node_id.
  const pageSize = 1000;
  let from = 0;
  const collected: Record<string, unknown>[] = [];
  while (true) {
    let q = db
      .from("canvas_nodes")
      .select("id, workspace_id, node_type, status, title, data, updated_at, parent_node_id")
      .not("data", "is", null)
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    if (!data || data.length === 0) break;
    collected.push(...(data as Record<string, unknown>[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const byId = new Map(collected.map((row) => [row.id as string, row] as const));
  const fallbackWorkspaceProjects = new Set<string>();
  if (filterProjectId) {
    const { data: workspaces } = await db
      .from("workspaces")
      .select("id")
      .eq("portal_project_id", filterProjectId);
    (workspaces ?? []).forEach((ws: any) => { if (ws?.id) fallbackWorkspaceProjects.add(ws.id as string); });
  }
  const inheritedPortalMeta = (row: Record<string, unknown>) => {
    let portalProjectId = "";
    let portalMilestoneId = "";
    let cursor: Record<string, unknown> | undefined = row;
    const seen = new Set<string>();
    for (let depth = 0; cursor && depth < 6; depth++) {
      const cursorId = cursor.id as string | undefined;
      if (cursorId) {
        if (seen.has(cursorId)) break;
        seen.add(cursorId);
      }
      const data = (cursor.data ?? {}) as Record<string, unknown>;
      const kind = pickString((data as any).kind);
      portalProjectId ||= pickString((data as any).portal_project_id);
      portalMilestoneId ||= pickString((data as any).portal_milestone_id);
      if (portalProjectId && portalMilestoneId) break;
      cursor = byId.get(cursor.parent_node_id as string);
    }
    return { portalProjectId, portalMilestoneId };
  };

  const nodes = collected.map((row) => {
    const data = (row.data ?? {}) as Record<string, unknown>;
    // Não exporta containers/grupos (só tasks reais)
    const kind = pickString((data as any).kind);
    const status = mapStatus(row.status);
    const inherited = inheritedPortalMeta(row);
    const fallbackProjectId = filterProjectId && fallbackWorkspaceProjects.has(row.workspace_id as string) ? filterProjectId : "";
    return {
      ops_node_id: row.id as string,
      project_id: inherited.portalProjectId || fallbackProjectId,
      milestone_id: inherited.portalMilestoneId || null,
      title: pickString(row.title) || "Sem título",
      status,
      progress: computeProgress(status, data),
      node_type: pickString(row.node_type, kind) || "task",
      updated_at: row.updated_at as string,
      kind: kind || null,
    };
  }).filter((n) => n.project_id && (!filterProjectId || n.project_id === filterProjectId) && n.kind !== "project_group" && n.kind !== "milestone_group" && n.kind !== "client_folder");

  return json({ nodes });
});
