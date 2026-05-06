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
import { logSync, startTimer } from "../_shared/syncAudit.ts";

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
      .select("id, node_type, status, title, data, updated_at, parent_node_id")
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
      portalMilestoneId ||= pickNonEmptyString((data as any).portal_milestone_id, kind === "milestone_group" ? (data as any).id : undefined);
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
    return {
      ops_node_id: row.id as string,
      project_id: inherited.portalProjectId,
      milestone_id: inherited.portalMilestoneId || null,
      title: pickNonEmptyString(row.title) || "Sem título",
      status: mappedStatus,
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
    };

    const rawEvent = String(body.event ?? "").trim().toLowerCase();

    // Compatibilidade temporária: enquanto o deploy externo não registra a nova
    // função ops-nodes-list, o Portal pode chamar sync-to-portal com este evento.
    if (rawEvent === "ops_nodes_list" || rawEvent === "ops-nodes-list") {
      const receivedSecret = req.headers.get("x-webhook-secret") ?? "";
      const expectedSecret = Deno.env.get("PORTAL_TO_OPS_SECRET") ?? "";
      if (!expectedSecret || receivedSecret !== expectedSecret) return json({ error: "unauthorized" }, 401);
      const nodes = await listOpsNodes(db, (body.data?.project_id as string | undefined) ?? body.portalProjectId);
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
      .select("id, name, current_stage, portal_project_id, clients(id, name, portal_client_id)")
      .eq("id", body.workspaceId)
      .single();

    let portalProjectId = ws?.portal_project_id as string | null;
    const portalClientId  = (ws?.clients as any)?.portal_client_id as string | null;

    // Quando há nodeId, sobrepõe portal_project_id pelo registrado no node
    // (suporta múltiplos projetos vinculados no mesmo canvas).
    let nodeRow: { title?: string; node_type?: string; status?: string; data?: Record<string, unknown> | null } | null = null;
    if (body.nodeId) {
      const { data: n } = await db
        .from("canvas_nodes")
        .select("title, node_type, status, data")
        .eq("id", body.nodeId)
        .maybeSingle();
      nodeRow = (n as any) ?? null;
      const ndata = (nodeRow?.data ?? {}) as Record<string, unknown>;
      const ndPid = (ndata.portal_project_id as string | undefined) ?? null;
      if (ndPid) portalProjectId = ndPid;
    }
    // Combina data do node persistido + body.data (fallback para payload direto)
    const bodyData = (body.data ?? {}) as Record<string, unknown>;
    const nodeData = { ...(bodyData ?? {}), ...((nodeRow?.data ?? {}) as Record<string, unknown>) };
    const nodePortalTaskId = (nodeData.portal_task_id as string | undefined) ?? body.portalTaskId ?? null;
    const nodePortalMilestoneId = (nodeData.portal_milestone_id as string | undefined) ?? null;
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
    if (!portalClientId && !projectScopedEvents.has(rawEvent)) {
      return json({ skipped: true, reason: "portal_client_id not set on client — link the client first" });
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
      const { data: node } = await db
        .from("canvas_nodes")
        .select("title, node_type")
        .eq("id", body.nodeId)
        .single();

      data = {
        project_id:  portalProjectId,
        author_id:   PORTAL_ADMIN_ID || portalClientId,
        message:     `Entregável concluído: ${node?.title ?? "node"}`,
        update_type: "task",
      };
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
      data = {
        project_id: portalProjectId,
        author_id:  PORTAL_ADMIN_ID || portalClientId,
        node_id:    body.nodeId,
        message:    `Tarefa removida do canvas`,
        update_type: "task_deleted",
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
      const targetProjectId = (body as any).portalProjectId ?? portalProjectId;
      if (!targetProjectId) return json({ skipped: true, reason: "portal_project_id missing" });
      const progress = typeof body.progress === "number" ? Math.max(0, Math.min(100, Math.round(body.progress))) : null;
      if (progress === null) return json({ skipped: true, reason: "progress missing" });
      event = "node_completed"; // Portal atual aceita progresso como update do projeto.
      // Versão monotônica enviada pelo Ops; o Portal usa pra descartar
      // updates fora de ordem (out-of-order delivery).
      const progressVersion = typeof body.progress_version === "number" ? body.progress_version : null;
      const calculatedAt = typeof body.calculated_at === "string" ? body.calculated_at : new Date().toISOString();
      data = {
        project_id:  targetProjectId,
        author_id:   PORTAL_ADMIN_ID || portalClientId,
        message:     body.message ?? `Progresso do projeto: ${progress}%`,
        update_type: "project_progress",
        progress,
        ...(progressVersion !== null ? { progress_version: progressVersion } : {}),
        calculated_at: calculatedAt,
      };
    }

    else if (event === "client_progress") {
      if (!portalClientId) return json({ skipped: true, reason: "portal_client_id missing" });
      const progress = typeof body.progress === "number" ? Math.max(0, Math.min(100, Math.round(body.progress))) : null;
      if (progress === null) return json({ skipped: true, reason: "progress missing" });
      event = "node_completed"; // Portal atual aceita progresso como update do cliente.
      const progressVersion = typeof body.progress_version === "number" ? body.progress_version : null;
      const calculatedAt = typeof body.calculated_at === "string" ? body.calculated_at : new Date().toISOString();
      data = {
        client_id:   portalClientId,
        author_id:   PORTAL_ADMIN_ID || portalClientId,
        message:     body.message ?? `Progresso geral da conta: ${progress}%`,
        update_type: "client_progress",
        progress,
        ...(progressVersion !== null ? { progress_version: progressVersion } : {}),
        calculated_at: calculatedAt,
      };
    }

    else {
      // Evento genérico — se tiver project_id envia como update
      if (portalProjectId && PORTAL_ADMIN_ID) {
        data = {
          project_id:  portalProjectId,
          author_id:   PORTAL_ADMIN_ID,
          message:     body.message ?? `Atualização operacional: ${event}`,
          update_type: "system",
        };
        event = "node_completed"; // reuse updates endpoint
      } else {
        return json({ skipped: true, reason: "unrecognized event and no fallback config" });
      }
    }

    // ── Envia ────────────────────────────────────────────────────────────
    const stopwatch = startTimer();
    const result = await sendToPortal(PORTAL_URL, PORTAL_SECRET, PORTAL_ANON_KEY, event, data, body.source ?? "ops");
    const elapsed = stopwatch();

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
