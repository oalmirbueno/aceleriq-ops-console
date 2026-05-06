/**
 * sync-to-portal — envia eventos do Ops para o webhook do aceleriq.online
 *
 * Portal URL: https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook
 * Payload: { event, data }
 *
 * Eventos:
 *  - file_approved   → data: { client_id, uploaded_by, file_url, file_name, project_id?, folder?, file_type?, description? }
 *  - node_completed  → data: { project_id, author_id, message, update_type? }
 *  - stage_advanced  → data: { project_id, author_id, message }
 *
 * Env vars necessárias no Ops Supabase:
 *  - PORTAL_WEBHOOK_URL  = https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook
 *  - PORTAL_WEBHOOK_SECRET = (mesmo valor configurado no portal como OPS_WEBHOOK_SECRET)
 *  - PORTAL_ADMIN_USER_ID  = profile.id do admin no portal (author_id dos updates)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

// ── Inline helpers (standalone — sem dependência de _shared) ──────────────
function startTimer() {
  const t0 = Date.now();
  return () => Date.now() - t0;
}

const _AUDIT_SECRET_KEYS = new Set([
  "authorization", "apikey", "x-webhook-secret", "service_role_key",
  "service_role", "password", "token", "access_token", "refresh_token",
  "secret", "api_key",
]);
function _auditSanitize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 4) return "[deep]";
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…[truncated]` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => _auditSanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (_AUDIT_SECRET_KEYS.has(k.toLowerCase())) { out[k] = "[redacted]"; continue; }
    out[k] = _auditSanitize(v, depth + 1);
  }
  return out;
}

interface SyncAuditEntry {
  direction: "portal_to_ops" | "ops_to_portal" | "internal";
  event: string;
  status: "ok" | "skipped" | "error";
  workspaceId?: string | null;
  clientId?: string | null;
  nodeId?: string | null;
  portalProjectId?: string | null;
  portalTaskId?: string | null;
  portalMilestoneId?: string | null;
  httpStatus?: number | null;
  message?: string | null;
  payload?: unknown;
  response?: unknown;
  durationMs?: number | null;
  source?: string | null;
}

let _auditClient: ReturnType<typeof createClient> | null = null;
function _getAuditClient() {
  if (_auditClient) return _auditClient;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _auditClient = createClient(url, key, { auth: { persistSession: false } });
  return _auditClient;
}

async function logSync(entry: SyncAuditEntry): Promise<void> {
  try {
    const db = _getAuditClient();
    if (!db) return;
    const row = {
      direction: entry.direction,
      event: entry.event,
      status: entry.status,
      workspace_id: entry.workspaceId ?? null,
      client_id: entry.clientId ?? null,
      node_id: entry.nodeId ?? null,
      portal_project_id: entry.portalProjectId ?? null,
      portal_task_id: entry.portalTaskId ?? null,
      portal_milestone_id: entry.portalMilestoneId ?? null,
      http_status: entry.httpStatus ?? null,
      message: entry.message ?? null,
      payload: entry.payload != null ? _auditSanitize(entry.payload) : null,
      response: entry.response != null ? _auditSanitize(entry.response) : null,
      duration_ms: entry.durationMs ?? null,
      source: entry.source ?? null,
    };
    // Tenta sync_audit_log (nome usado pelo módulo original); se não existir, tenta sync_audit.
    const r1 = await db.from("sync_audit_log").insert(row);
    if ((r1 as any)?.error) {
      await db.from("sync_audit").insert(row);
    }
  } catch (_err) {
    // Auditoria nunca pode quebrar o fluxo principal.
  }
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 500) }; }
}

const COMPLETED = new Set(["done", "completed", "concluido"]);
function computeNodeProgress(status?: string | null, data?: Record<string, unknown> | null): number {
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

const OPS_TO_KANBAN_STATUS: Record<string, string> = {
  draft: "todo", not_started: "todo", todo: "todo", backlog: "todo",
  active: "active", doing: "active", in_progress: "active", em_andamento: "active",
  in_review: "in_review", review: "in_review", revisao: "in_review", revisão: "in_review",
  blocked: "blocked", bloqueado: "blocked", bloqueada: "blocked",
  done: "done", completed: "done", concluido: "done", concluída: "done", concluida: "done",
};

function mapOpsKanbanStatus(raw: unknown): string {
  return OPS_TO_KANBAN_STATUS[String(raw ?? "").toLowerCase().trim()] ?? "todo";
}

function pickNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

async function listOpsNodes(db: ReturnType<typeof createClient>, projectId?: string | null) {
  const pageSize = 1000;
  let from = 0;
  const collected: Record<string, unknown>[] = [];

  while (true) {
    const { data, error } = await db
      .from("canvas_nodes")
      .select("id, workspace_id, node_type, status, title, data, updated_at, parent_node_id")
      .not("data", "is", null)
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;
    collected.push(...(data as Record<string, unknown>[]));
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const filterProjectId = pickNonEmptyString(projectId);
  const fallbackWorkspaceProjects = new Set<string>();
  if (filterProjectId) {
    const { data: workspaces } = await db
      .from("workspaces")
      .select("id")
      .eq("portal_project_id", filterProjectId);
    (workspaces ?? []).forEach((ws: any) => { if (ws?.id) fallbackWorkspaceProjects.add(ws.id as string); });
    collected.forEach((row) => {
      const data = (row.data ?? {}) as Record<string, unknown>;
      if (pickNonEmptyString((data as any).portal_project_id) === filterProjectId && row.workspace_id) {
        fallbackWorkspaceProjects.add(row.workspace_id as string);
      }
    });
  }
  const byId = new Map(collected.map((row) => [row.id as string, row] as const));
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
      const kind = pickNonEmptyString((data as any).kind);
      portalProjectId ||= pickNonEmptyString((data as any).portal_project_id);
      portalMilestoneId ||= pickNonEmptyString((data as any).portal_milestone_id, filterProjectId ? (data as any).milestone_node_id : undefined, kind === "milestone_group" ? (data as any).id : undefined);
      if (portalProjectId && portalMilestoneId) break;
      cursor = byId.get(cursor.parent_node_id as string);
    }
    return { portalProjectId, portalMilestoneId };
  };
  return collected.map((row) => {
    const nodeData = (row.data ?? {}) as Record<string, unknown>;
    const kind = pickNonEmptyString((nodeData as any).kind);
    const mappedStatus = mapOpsKanbanStatus(row.status);
    const inherited = inheritedPortalMeta(row);
      const fallbackProjectId = filterProjectId && fallbackWorkspaceProjects.has(row.workspace_id as string) ? filterProjectId : "";
    return {
      ops_node_id: row.id as string,
        project_id: inherited.portalProjectId || fallbackProjectId,
      milestone_id: inherited.portalMilestoneId || null,
      title: pickNonEmptyString(row.title) || "Sem título",
      status: mappedStatus,
        kanban_status: opsStatusToPortal(row.status as string | undefined),
      progress: computeNodeProgress(mappedStatus, nodeData),
      node_type: pickNonEmptyString(row.node_type, kind) || "task",
      updated_at: row.updated_at as string,
      kind: kind || null,
    };
  }).filter((node) =>
    node.project_id &&
    (!filterProjectId || node.project_id === filterProjectId) &&
    node.kind !== "project_group" &&
    node.kind !== "milestone_group" &&
    node.kind !== "client_folder"
  );
}

async function sendToPortal(
  url: string,
  secret: string | undefined,
  anonKey: string | undefined,
  event: string,
  data: Record<string, unknown>,
  source?: string,
): Promise<{ ok: boolean; error?: string; status?: number; body?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-webhook-secret"] = secret;
  if (anonKey) {
    headers.apikey = anonKey;
    headers.Authorization = `Bearer ${anonKey}`;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, data, source: source ?? "ops" }),
    });
    const text = await res.text();
    if (!res.ok) return { ok: false, status: res.status, body: text, error: `HTTP ${res.status}: ${text}` };
    return { ok: true, status: res.status, body: text.slice(0, 500) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";
// deploy-bump v7: garante que projectScopedEvents bypassa portal_client_id check
const TASK_STATUS_TO_OPS: Record<string, string> = {
  todo: "draft", backlog: "draft",
  doing: "active", in_progress: "active",
  review: "in_review",
  blocked: "blocked",
  done: "done", completed: "done", concluido: "done", concluída: "done", concluida: "done",
};

function opsStatusToPortal(status?: string | null): string {
  const s = String(status ?? "active").toLowerCase();
  if (["done", "completed", "concluido", "concluída", "concluida"].includes(s)) return "done";
  if (["blocked", "bloqueado", "bloqueada"].includes(s)) return "blocked";
  if (["in_review", "review", "revisao", "revisão"].includes(s)) return "review";
  if (["draft", "not_started", "todo", "backlog"].includes(s)) return "todo";
  return "doing";
}

function cleanObject(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ""));
}

function normalizeKindText(value: unknown) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function inferKind(title: string, description: string | null, labels: unknown[] = []) {
  const text = normalizeKindText(`${title} ${description ?? ""} ${labels.join(" ")}`);
  if (/case|print|documentar|evidencia|portfolio/.test(text)) return "case";
  if (/before after|antes depois/.test(text)) return "before_after";
  if (/landing|linktree|hotsite|pagina de links/.test(text)) return "landing_page";
  if (/shopify|e commerce|ecommerce|loja|checkout|site/.test(text)) return "site";
  if (/n8n|automacao|automatizar|fluxo|workflow|webhook/.test(text)) return "automacao";
  if (/integra|api|conectar|sincroniz/.test(text)) return "integracao";
  if (/agente|chatbot|bot|atendimento|resposta|prompt|gpt|\bia\b/.test(text)) return "agente";
  if (/metrica|monitor|dashboard|kpi|relatorio|analytics/.test(text)) return "metrica";
  if (/acesso|credencial|hostinger|senha|login/.test(text)) return "acessos";
  if (/email|disparo|newsletter/.test(text)) return "email_mkt";
  if (/trafego|ads|anuncio|campanha/.test(text)) return "trafego";
  if (/funil|jornada/.test(text)) return "funil";
  if (/conteudo|copy|roteiro|texto|post/.test(text)) return "conteudo";
  if (/video|reels|short/.test(text)) return "video";
  if (/imagem|criativo|arte|design/.test(text)) return "imagem";
  if (/social|instagram|whatsapp|telegram/.test(text)) return "social";
  if (/crm|pipeline|kanban/.test(text)) return "crm";
  return "resultado";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY         = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PORTAL_URL          = Deno.env.get("PORTAL_WEBHOOK_URL") ?? "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook";
  const PORTAL_SECRET       = Deno.env.get("PORTAL_WEBHOOK_SECRET");
  const PORTAL_ANON_KEY     = Deno.env.get("PORTAL_ANON_KEY") ?? "";
  const PORTAL_ADMIN_ID     = Deno.env.get("PORTAL_ADMIN_USER_ID") ?? "";

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json() as {
      event: string;
      workspaceId: string;
      clientId: string;
      assetId?: string;
      nodeId?: string;
      stage?: string;
      message?: string;
      nodeTitle?: string;
      nodeType?: string;
      status?: string;
      previousStatus?: string;
      progress?: number;
      progress_version?: number;
      calculated_at?: string;
      portalTaskId?: string;
      source?: string;
      limit?: number;
      portalProjectId?: string;
      data?: Record<string, unknown>;
      event_id?: string;
    };

    const rawEvent = String(body.event ?? "").trim().toLowerCase();

    // ── Anti-loop / idempotência por event_id ────────────────────────────
    // Se este evento foi originado pelo próprio Portal (source==="portal")
    // e já existe registro inbound em sync_events, NÃO reenviamos pro Portal.
    // Se já houve outbound para o mesmo event_id, também não reenviamos.
    const incomingSource = String(body.source ?? "ops").toLowerCase();
    const eventId =
      typeof body.event_id === "string" && body.event_id.length > 0
        ? body.event_id
        : `ops:${rawEvent}:${body.nodeId ?? body.workspaceId ?? "x"}:${Date.now()}`;

    try {
      const { data: prior } = await db
        .from("sync_events")
        .select("event_id, direction, source")
        .eq("event_id", eventId)
        .limit(1);
      if (prior && prior.length > 0) {
        return json({ skipped: true, reason: "event_id already processed (anti-loop)", event_id: eventId });
      }
    } catch (_e) { /* tabela pode não existir ainda; segue */ }
    if (incomingSource === "portal") {
      // O OPS não devolve para o Portal um evento que o Portal originou.
      try {
        await db.from("sync_events").insert({
          event_id: eventId,
          source: "portal",
          direction: "inbound",
          entity_type: "node",
          entity_id: body.nodeId ?? null,
          action: rawEvent.replace(/^node_/, "") || "updated",
          payload: body as unknown as Record<string, unknown>,
        });
      } catch (_e) { /* ignore */ }
      return json({ skipped: true, reason: "echo from portal — not re-sending", event_id: eventId });
    }

    // v4: aceita node_id/ops_node_id vindo dentro de body.data como fallback,
    // garantindo que node_created/node_updated/node_deleted não caiam no else genérico.
    if (!body.nodeId) {
      const fromData = (body.data as Record<string, unknown> | undefined) ?? {};
      const candidate = (fromData.node_id ?? fromData.ops_node_id) as string | undefined;
      if (typeof candidate === "string" && candidate) body.nodeId = candidate;
    }
    console.log("[sync-to-portal v6] event=", rawEvent, "nodeId=", body.nodeId ?? null, "workspaceId=", body.workspaceId, "portalProjectId=", body.portalProjectId);

    // Compatibilidade temporária: enquanto o deploy externo não registra a nova
    // função ops-nodes-list, o Portal pode chamar sync-to-portal com este evento.
    if (rawEvent === "ops_nodes_list" || rawEvent === "ops-nodes-list") {
      const receivedSecret = req.headers.get("x-webhook-secret") ?? "";
      const expectedSecret = Deno.env.get("PORTAL_TO_OPS_SECRET") ?? "";
      if (!expectedSecret || receivedSecret !== expectedSecret) return json({ error: "unauthorized" }, 401);
      const nodes = await listOpsNodes(db as any, (body.data?.project_id as string | undefined) ?? body.portalProjectId);
      return json({ nodes });
    }

    // ── Listagem de projetos do portal (não exige vínculo de cliente) ─────
    if (rawEvent === "list_portal_projects") {
      if (!PORTAL_SECRET) return json({ ok: false, error: "PORTAL_WEBHOOK_SECRET not configured" }, 500);
      const res = await fetch(`${PORTAL_BASE}/ops-projects-list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": PORTAL_SECRET,
          ...(PORTAL_ANON_KEY ? { apikey: PORTAL_ANON_KEY, Authorization: `Bearer ${PORTAL_ANON_KEY}` } : {}),
        },
        body: JSON.stringify({}),
      });
      const raw = await res.text();
      if (!res.ok) return json({ ok: false, error: `portal ops-projects-list ${res.status}`, raw: raw.slice(0, 300) }, 502);
      let parsed: any; try { parsed = JSON.parse(raw); } catch { parsed = { projects: [] }; }
      return json({ ok: true, projects: parsed.projects ?? [] });
    }

    // ── Busca IDs do portal vinculados ao workspace/client ──────────────
    const { data: ws } = await db
      .from("workspaces")
      .select("id, name, current_stage, client_id, portal_project_id, clients(id, name, email, portal_client_id, created_at)")
      .eq("id", body.workspaceId)
      .single();

    let portalProjectId = ws?.portal_project_id as string | null;
    let portalClientId  = (ws?.clients as any)?.portal_client_id as string | null;
    const opsClientId   = (ws as any)?.client_id as string | null;
    const opsClientName = (ws?.clients as any)?.name as string | null;
    const opsClientEmail = (ws?.clients as any)?.email as string | null;
    const opsClientCreatedAt = (ws?.clients as any)?.created_at as string | null;

    // Quando há nodeId, sobrepõe portal_project_id pelo registrado no node
    // (suporta múltiplos projetos vinculados no mesmo canvas).
    let nodeRow: { title?: string; node_type?: string; status?: string; data?: Record<string, unknown> | null; parent_node_id?: string | null } | null = null;
    let inheritedNodeMeta: Record<string, unknown> = {};
    if (body.nodeId) {
      const { data: n } = await db
        .from("canvas_nodes")
        .select("title, node_type, status, data, parent_node_id")
        .eq("id", body.nodeId)
        .maybeSingle();
      nodeRow = (n as any) ?? null;
      const ndata = (nodeRow?.data ?? {}) as Record<string, unknown>;
      const ndPid = (ndata.portal_project_id as string | undefined) ?? null;
      if (ndPid) portalProjectId = ndPid;
      let parentId = nodeRow?.parent_node_id ?? null;
      const seenParents = new Set<string>();
      for (let depth = 0; parentId && depth < 6; depth++) {
        if (seenParents.has(parentId)) break;
        seenParents.add(parentId);
        const { data: parent } = await db
          .from("canvas_nodes")
          .select("id, parent_node_id, data")
          .eq("id", parentId)
          .maybeSingle();
        const pdata = ((parent as any)?.data ?? {}) as Record<string, unknown>;
        const kind = String(pdata.kind ?? "").toLowerCase();
        if (!inheritedNodeMeta.portal_project_id && typeof pdata.portal_project_id === "string") inheritedNodeMeta.portal_project_id = pdata.portal_project_id;
        if (!inheritedNodeMeta.portal_milestone_id && typeof pdata.portal_milestone_id === "string") inheritedNodeMeta.portal_milestone_id = pdata.portal_milestone_id;
        if (!inheritedNodeMeta.portal_folder_id && typeof pdata.portal_folder_id === "string") inheritedNodeMeta.portal_folder_id = pdata.portal_folder_id;
        if (!inheritedNodeMeta.milestone_key && typeof pdata.milestone_key === "string") inheritedNodeMeta.milestone_key = pdata.milestone_key;
        if (kind === "milestone_group" && !inheritedNodeMeta.portal_milestone_id && typeof (parent as any)?.id === "string") inheritedNodeMeta.portal_milestone_id = (parent as any).id;
        parentId = ((parent as any)?.parent_node_id as string | null | undefined) ?? null;
      }
      if (!portalProjectId && typeof inheritedNodeMeta.portal_project_id === "string") portalProjectId = inheritedNodeMeta.portal_project_id as string;
    }
    // Combina data do node persistido + body.data (fallback para payload direto)
    const bodyData = (body.data ?? {}) as Record<string, unknown>;
    const nodeData = { ...inheritedNodeMeta, ...((nodeRow?.data ?? {}) as Record<string, unknown>), ...(bodyData ?? {}) };
    const nodePortalTaskId = (nodeData.portal_task_id as string | undefined) ?? body.portalTaskId ?? null;
    const nodePortalMilestoneId = ((nodeData.portal_milestone_id ?? nodeData.milestone_id ?? nodeData.milestone_node_id) as string | undefined) ?? null;
    const nodePortalFolderId = (nodeData.portal_folder_id as string | undefined) ?? nodePortalMilestoneId;
    if (body.portalProjectId) portalProjectId = body.portalProjectId;
    // Fallback: portal_project_id pode estar em body.data (caso o nodeRow não tenha sido lido)
    if (!portalProjectId && typeof bodyData.portal_project_id === "string") {
      portalProjectId = bodyData.portal_project_id as string;
    }

    const projectScopedEvents = new Set([
      "node_created", "node_updated", "node_completed", "node_deleted",
      "stage_advanced", "project_progress", "file_approved", "pull_portal_tasks",
    ]);
    // v3: project-scoped events só precisam de portal_project_id; client_id é opcional.
    // Auto-link tentativa: se faltar portal_client_id e o evento depende disso,
    // tentamos resolver/criar no Portal usando ops_client_id como chave estável.
    async function ensurePortalClientId(): Promise<string | null> {
      if (portalClientId) return portalClientId;
      if (!opsClientId || !PORTAL_SECRET) return null;
      try {
        const res = await fetch(`${PORTAL_BASE}/ops-resolve-client`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-webhook-secret": PORTAL_SECRET,
            ...(PORTAL_ANON_KEY ? { apikey: PORTAL_ANON_KEY, Authorization: `Bearer ${PORTAL_ANON_KEY}` } : {}),
          },
          body: JSON.stringify({
            ops_client_id: opsClientId,
            name: opsClientName,
            email: opsClientEmail,
            created_at: opsClientCreatedAt,
          }),
        });
        if (!res.ok) return null;
        const j = await res.json().catch(() => ({})) as { portal_client_id?: string };
        if (j.portal_client_id) {
          portalClientId = j.portal_client_id;
          await db.from("clients").update({ portal_client_id: j.portal_client_id }).eq("id", opsClientId);
          return j.portal_client_id;
        }
      } catch (err) { console.warn("[sync-to-portal] auto-link client failed", err); }
      return null;
    }
    if (!portalClientId && !projectScopedEvents.has(rawEvent)) {
      const linked = await ensurePortalClientId();
      if (!linked) {
        return json({
          skipped: true,
          reason: "portal_client_id not set and auto-link failed (missing ops-resolve-client on Portal or insufficient client data)",
          event: rawEvent,
          ops_client_id: opsClientId,
        });
      }
    }

    // ── Monta payload por evento ────────────────────────────────────────

    let event = rawEvent;
    let data: Record<string, unknown> = {};

    if (event === "pull_portal_tasks") {
      if (!portalProjectId) return json({ ok: false, error: "portal_project_id not set on workspace" }, 400);
      if (!PORTAL_SECRET) return json({ ok: false, error: "PORTAL_WEBHOOK_SECRET not configured" }, 500);

      const { data: clientNode } = await db
        .from("canvas_nodes")
        .select("id")
        .eq("workspace_id", body.workspaceId)
        .eq("node_type", "client")
        .or(`linked_entity_id.eq.${body.clientId},client_id.eq.${body.clientId}`)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      const parentNodeId = clientNode?.id ?? null;

      const res = await fetch(`${PORTAL_BASE}/ops-tasks-list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": PORTAL_SECRET,
          ...(PORTAL_ANON_KEY ? { apikey: PORTAL_ANON_KEY, Authorization: `Bearer ${PORTAL_ANON_KEY}` } : {}),
        },
        body: JSON.stringify({ project_id: portalProjectId, limit: Math.min(Math.max(Number(body.limit) || 200, 1), 500) }),
      });
      const raw = await res.text();
      if (!res.ok) return json({ ok: false, error: `portal ops-tasks-list ${res.status}`, raw: raw.slice(0, 300) }, 502);
      let parsed: any = {};
      try { parsed = JSON.parse(raw); } catch { return json({ ok: false, error: "invalid portal tasks json" }, 502); }
      const tasks: Array<Record<string, unknown>> = Array.isArray(parsed.tasks) ? parsed.tasks : [];
      let created = 0, updated = 0;
      for (const task of tasks) {
        const portalTaskId = String(task.id ?? "");
        if (!portalTaskId) continue;
        const title = String(task.title ?? "Tarefa do portal");
        const status = TASK_STATUS_TO_OPS[String(task.status ?? "backlog").toLowerCase()] ?? "draft";
        const opsNodeId = typeof task.ops_node_id === "string" ? task.ops_node_id : null;
        const description = (task.description ?? task.notes ?? null) as string | null;
        const priority    = (task.priority ?? null) as string | null;
        const dueDate     = (task.due_date ?? task.dueDate ?? null) as string | null;
        const assignee    = (task.assignee_id ?? task.assignee ?? null) as string | null;
        const portalPosition = Number(task.position ?? task.order ?? 0);
        const portalStatusRaw = String(task.status ?? "backlog").toLowerCase();
        const checklist = Array.isArray(task.checklist) ? task.checklist : [];
        const labels   = Array.isArray(task.labels)   ? task.labels   : [];
        const inferredKind = inferKind(title, description, labels);

        const { data: existing } = opsNodeId
          ? await db.from("canvas_nodes").select("id, data").eq("id", opsNodeId).maybeSingle()
          : await db.from("canvas_nodes").select("id, data").eq("workspace_id", body.workspaceId).contains("data", { portal_task_id: portalTaskId }).maybeSingle();

        if (existing) {
          const currentData = (existing.data as Record<string, unknown>) ?? {};
          await db.from("canvas_nodes").update({
            client_id: body.clientId,
            parent_node_id: parentNodeId,
            title,
            status,
            description,
            data: {
              ...currentData,
              portal_task_id: portalTaskId,
              portal_project_id: portalProjectId,
              from_portal: true,
              portal_status: portalStatusRaw,
              kind: (currentData.kind && currentData.kind !== "checklist") ? currentData.kind : inferredKind,
              priority,
              due_date: dueDate,
              assignee,
              labels,
              checklist: checklist.length > 0 ? checklist : (currentData.checklist ?? []),
            },
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          updated++;
        } else {
          const { count } = await db.from("canvas_nodes").select("id", { count: "exact", head: true }).eq("workspace_id", body.workspaceId);
          const idx = count ?? 0;
          await db.from("canvas_nodes").insert({
            workspace_id: body.workspaceId,
            client_id: body.clientId,
            parent_node_id: parentNodeId,
            node_type: "task",
            title,
            status,
            description,
            pos_x: 80 + (idx % 6) * 320,
            pos_y: 820 + Math.floor(idx / 6) * 180,
            data: {
              from_portal: true,
              portal_task_id: portalTaskId,
              portal_project_id: portalProjectId,
              portal_status: portalStatusRaw,
              kind: inferredKind,
              checklist,
              priority,
              due_date: dueDate,
              assignee,
              labels,
              stage: "producao",
            },
          });
          created++;
        }
      }
      return json({ ok: true, event, portal_project_id: portalProjectId, portal_client_id: portalClientId, total: tasks.length, created, updated });
    }

    if (event === "file_approved" && body.assetId) {
      const { data: asset } = await db
        .from("assets")
        .select("title, external_url, storage_path, description, metadata")
        .eq("id", body.assetId)
        .single();

      const m = (asset?.metadata as Record<string, unknown>) ?? {};
      const fileUrl = (m.file_url as string) ?? asset?.external_url ?? "";
      const fileName = asset?.title ?? "arquivo";

      data = {
        client_id:        portalClientId,
        uploaded_by:      PORTAL_ADMIN_ID || portalClientId, // fallback to client
        file_url:         fileUrl,
        file_name:        fileName,
        project_id:       portalProjectId ?? undefined,
        folder:           (m.folder as string) ?? "operacionais",
        file_type:        (m.file_type as string) ?? null,
        description:      asset?.description ?? null,
        approval_status:  "approved",
      };
    }

    else if (event === "node_completed" && body.nodeId) {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      event = "node_updated";
      const title = body.nodeTitle ?? nodeRow?.title ?? "node";
      data = cleanObject({
        id: nodePortalTaskId ?? undefined,
        project_id: portalProjectId,
        ops_workspace_id: body.workspaceId,
        ops_client_id: opsClientId ?? undefined,
        author_id: PORTAL_ADMIN_ID || portalClientId || undefined,
        client_id: portalClientId ?? undefined,
        message: `Tarefa "${title}" — Concluída (100%)`,
        update_type: "task_progress",
        node_id: body.nodeId,
        node_title: title,
        node_type: body.nodeType ?? nodeRow?.node_type ?? null,
        status: "done",
        kanban_status: "done",
        title,
        ops_node_id: body.nodeId,
        previous_status: body.previousStatus ?? null,
        progress: 100,
        portal_task_id: nodePortalTaskId,
        portal_milestone_id: nodePortalMilestoneId,
        milestone_id: nodePortalMilestoneId,
        portal_folder_id: nodePortalFolderId,
        folder_id: nodePortalFolderId,
      });
    }

    else if (event === "node_updated" && body.nodeId) {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      const authorId = PORTAL_ADMIN_ID || portalClientId || undefined;

      const statusLabels: Record<string, string> = {
        draft: "Não iniciada",
        not_started: "Não iniciada",
        active: "Em andamento",
        in_progress: "Em andamento",
        in_review: "Em revisão",
        blocked: "Bloqueada",
        done: "Concluída",
        completed: "Concluída",
      };
      const statusLabel = statusLabels[(body.status ?? "").toLowerCase()] ?? body.status ?? "atualizada";
      const progress = typeof body.progress === "number" ? body.progress : null;
      const title = body.nodeTitle ?? "node";
      const message = progress !== null
        ? `Tarefa "${title}" — ${statusLabel} (${progress}%)`
        : `Tarefa "${title}" — ${statusLabel}`;

      data = {
        id: nodePortalTaskId ?? undefined,
        project_id:  portalProjectId,
        ops_workspace_id: body.workspaceId,
        ops_client_id: opsClientId ?? undefined,
        author_id:   authorId,
        client_id:   portalClientId ?? undefined,
        message,
        update_type: "task_progress",
        // campos para o ops-webhook v2 fazer upsert na tabela tasks
        node_id:     body.nodeId,
        node_title:  title,
        node_type:   body.nodeType ?? null,
        status:      body.status ?? null,
        kanban_status: opsStatusToPortal(body.status),
        title,
        ops_node_id: body.nodeId,
        previous_status: body.previousStatus ?? null,
        progress,
        portal_task_id: nodePortalTaskId,
        portal_milestone_id: nodePortalMilestoneId,
        milestone_id: nodePortalMilestoneId,
        portal_folder_id: nodePortalFolderId,
        folder_id: nodePortalFolderId,
      };
      data = cleanObject(data);
      // mantém event="node_updated" — quando portal atualizar o webhook, fará upsert em tasks.
      // Se portal ainda não suporta, ele simplesmente ignora.
    }

    else if (event === "node_created" && body.nodeId) {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      const node = nodeRow;
      const authorId = PORTAL_ADMIN_ID || portalClientId || undefined;
      data = {
        id: nodePortalTaskId ?? undefined,
        project_id: portalProjectId,
        ops_workspace_id: body.workspaceId,
        ops_client_id: opsClientId ?? undefined,
        author_id:  authorId,
        client_id:  portalClientId ?? undefined,
        node_id:    body.nodeId,
        node_title: body.nodeTitle ?? node?.title ?? "node",
        node_type:  body.nodeType ?? node?.node_type ?? null,
        portal_task_id: nodePortalTaskId,
        portal_milestone_id: nodePortalMilestoneId,
        milestone_id: nodePortalMilestoneId,
        portal_folder_id: nodePortalFolderId,
        folder_id: nodePortalFolderId,
        status:     body.status ?? node?.status ?? "draft",
        kanban_status: opsStatusToPortal(body.status ?? node?.status ?? "active"),
        title:      body.nodeTitle ?? node?.title ?? "node",
        ops_node_id: body.nodeId,
        progress:   body.progress ?? computeNodeProgress(node?.status, node?.data as Record<string, unknown> | null),
        message:    `Nova tarefa criada: ${body.nodeTitle ?? node?.title ?? "node"}`,
        update_type: "task_created",
      };
      data = cleanObject(data);
    }

    else if (event === "node_deleted" && body.nodeId) {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      // Soft delete local: marca o node como deletado e preserva o registro
      // para evitar que o backfill o recrie no Portal.
      try {
        await db.from("canvas_nodes")
          .update({ deleted_at: new Date().toISOString(), sync_status: "deleted" })
          .eq("id", body.nodeId);
      } catch (_e) { /* coluna pode não existir antes do SQL; ignora */ }
      data = {
        project_id: portalProjectId,
        ops_workspace_id: body.workspaceId,
        ops_client_id: opsClientId ?? undefined,
        author_id:  PORTAL_ADMIN_ID || portalClientId,
        node_id:    body.nodeId,
        message:    `Tarefa removida do canvas`,
        update_type: "task_deleted",
        deleted_at: new Date().toISOString(),
        portal_task_id: nodePortalTaskId,
        portal_milestone_id: nodePortalMilestoneId,
        milestone_id: nodePortalMilestoneId,
        portal_folder_id: nodePortalFolderId,
        folder_id: nodePortalFolderId,
      };
      data = cleanObject(data);
    }

    else if (event === "stage_advanced") {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      const stageLabels: Record<string, string> = {
        entrada: "Entrada", diagnostico: "Diagnóstico", estrutura_base: "Estrutura",
        planejamento: "Planejamento", producao: "Produção", ativacao: "Ativação",
        otimizacao: "Otimização", expansao: "Expansão",
      };
      const label = stageLabels[body.stage ?? ""] ?? body.stage ?? "nova etapa";
      data = {
        project_id:  portalProjectId,
        author_id:   PORTAL_ADMIN_ID || portalClientId,
        message:     body.message ?? `Projeto avançou para a etapa: ${label}`,
        update_type: "milestone",
      };
    }

    else if (event === "project_progress") {
    else if (event === "project_progress" || event === "client_progress") {
      // Portal webhook ainda não suporta estes eventos (responde 400 "Unknown event type").
      // Em vez de quebrar com 502, apenas registramos como skipped — o progresso
      // do projeto/cliente continua sendo derivado pelo próprio Portal a partir
      // dos node_updated/node_completed.
      return json({
        skipped: true,
        reason: `portal does not accept ${event} yet`,
        event,
      });
    }

    else {
      // v5: nunca degradar evento desconhecido/node_* para node_completed.
      // Esse fallback mascarava payload incompleto e criava só timeline, sem card no Kanban.
      console.warn("[sync-to-portal v5] skipped unhandled event", rawEvent, "body=", JSON.stringify(body).slice(0, 500));
      return json({ skipped: true, reason: `unhandled event: ${rawEvent}`, debug: "v5-no-generic-node_completed" });
    }

    // ── Envia ────────────────────────────────────────────────────────────
    const stopwatch = startTimer();
    // Inclui event_id no payload para o Portal também detectar e ignorar eco.
    (data as Record<string, unknown>).event_id = eventId;
    (data as Record<string, unknown>).sync_origin = "ops";
    const result = await sendToPortal(PORTAL_URL, PORTAL_SECRET, PORTAL_ANON_KEY, event, data, body.source ?? "ops");
    const elapsed = stopwatch();

    // Registra outbound (idempotente — se já existir, apenas ignora)
    try {
      await db.from("sync_events").insert({
        event_id: eventId,
        source: "ops",
        direction: "outbound",
        entity_type: "node",
        entity_id: body.nodeId ?? null,
        action: event.replace(/^node_/, "") || "updated",
        payload: data,
      });
      if (body.nodeId) {
        await db.from("canvas_nodes")
          .update({ last_synced_at: new Date().toISOString(), last_event_id: eventId, sync_origin: "ops", sync_status: result.ok ? "ok" : "error", sync_error: result.ok ? null : (result.error ?? null) })
          .eq("id", body.nodeId);
      }
    } catch (_e) { /* ignore */ }

    await logSync({
      direction: "ops_to_portal",
      event,
      status: result.ok ? "ok" : "error",
      workspaceId: body.workspaceId,
      clientId: body.clientId,
      nodeId: body.nodeId ?? null,
      portalProjectId: portalProjectId ?? null,
      portalTaskId: nodePortalTaskId ?? body.portalTaskId ?? null,
      portalMilestoneId: nodePortalMilestoneId,
      httpStatus: result.status ?? null,
      durationMs: elapsed,
      message: result.ok ? null : result.error ?? "portal_error",
      payload: data,
      response: result.body ? safeJson(result.body) : null,
      source: body.source ?? "ops",
    });

    if (!result.ok) {
      console.error("[sync-to-portal] Portal error:", result.error);
      return json({ ok: false, error: result.error }, 502);
    }

    // Marca asset como sincronizado
    if (body.assetId) {
      const { data: curr } = await db.from("assets").select("metadata").eq("id", body.assetId).single();
      const m = ((curr?.metadata as Record<string, unknown>) ?? {});
      await db.from("assets").update({ metadata: { ...m, synced_to_portal: true } }).eq("id", body.assetId);
    }

    return json({ ok: true, event, portal_project_id: portalProjectId, portal_client_id: portalClientId, portal_response: result.body });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});
