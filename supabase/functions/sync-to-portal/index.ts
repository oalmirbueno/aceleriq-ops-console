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

async function sendToPortal(
  url: string,
  secret: string | undefined,
  event: string,
  data: Record<string, unknown>,
  source?: string,
): Promise<{ ok: boolean; error?: string; status?: number; body?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-webhook-secret"] = secret;

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
  done: "done",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY         = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PORTAL_URL          = Deno.env.get("PORTAL_WEBHOOK_URL") ?? "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook";
  const PORTAL_SECRET       = Deno.env.get("PORTAL_WEBHOOK_SECRET");
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
      portalTaskId?: string;
      source?: string;
      limit?: number;
    };

    // ── Busca IDs do portal vinculados ao workspace/client ──────────────
    const { data: ws } = await db
      .from("workspaces")
      .select("id, name, current_stage, portal_project_id, clients(id, name, portal_client_id)")
      .eq("id", body.workspaceId)
      .single();

    const portalProjectId = ws?.portal_project_id as string | null;
    const portalClientId  = (ws?.clients as any)?.portal_client_id as string | null;

    if (!portalClientId) {
      return json({ skipped: true, reason: "portal_client_id not set on client — link the client first" });
    }

    // ── Monta payload por evento ────────────────────────────────────────

    let event = String(body.event ?? "").trim().toLowerCase();
    let data: Record<string, unknown> = {};

    if (event === "pull_portal_tasks") {
      if (!portalProjectId) return json({ ok: false, error: "portal_project_id not set on workspace" }, 400);
      if (!PORTAL_SECRET) return json({ ok: false, error: "PORTAL_WEBHOOK_SECRET not configured" }, 500);

      const res = await fetch(`${PORTAL_BASE}/ops-tasks-list`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-webhook-secret": PORTAL_SECRET },
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

        const { data: existing } = opsNodeId
          ? await db.from("canvas_nodes").select("id, data").eq("id", opsNodeId).maybeSingle()
          : await db.from("canvas_nodes").select("id, data").eq("workspace_id", body.workspaceId).contains("data", { portal_task_id: portalTaskId }).maybeSingle();

        if (existing) {
          const currentData = (existing.data as Record<string, unknown>) ?? {};
          await db.from("canvas_nodes").update({ title, status, data: { ...currentData, portal_task_id: portalTaskId, from_portal: true }, updated_at: new Date().toISOString() }).eq("id", existing.id);
          updated++;
        } else {
          const { count } = await db.from("canvas_nodes").select("id", { count: "exact", head: true }).eq("workspace_id", body.workspaceId);
          const idx = count ?? 0;
          await db.from("canvas_nodes").insert({
            workspace_id: body.workspaceId,
            client_id: body.clientId,
            parent_node_id: null,
            node_type: "task",
            title,
            status,
            pos_x: 80 + (idx % 6) * 320,
            pos_y: 820 + Math.floor(idx / 6) * 180,
            data: { from_portal: true, portal_task_id: portalTaskId, kind: "checklist", checklist: [] },
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
        project_id:  portalProjectId,
        author_id:   PORTAL_ADMIN_ID || portalClientId,
        message,
        update_type: "task_progress",
        // campos para o ops-webhook v2 fazer upsert na tabela tasks
        node_id:     body.nodeId,
        node_title:  title,
        node_type:   body.nodeType ?? null,
        status:      body.status ?? null,
        previous_status: body.previousStatus ?? null,
        progress,
      };
      // mantém event="node_updated" — quando portal atualizar o webhook, fará upsert em tasks.
      // Se portal ainda não suporta, ele simplesmente ignora.
    }

    else if (event === "node_created" && body.nodeId) {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      const { data: node } = await db
        .from("canvas_nodes")
        .select("title, node_type, status, data")
        .eq("id", body.nodeId)
        .maybeSingle();
      data = {
        project_id: portalProjectId,
        author_id:  PORTAL_ADMIN_ID || portalClientId,
        node_id:    body.nodeId,
        node_title: body.nodeTitle ?? node?.title ?? "node",
        node_type:  body.nodeType ?? node?.node_type ?? null,
        portal_task_id: body.portalTaskId ?? null,
        status:     body.status ?? node?.status ?? "draft",
        progress:   body.progress ?? computeNodeProgress(node?.status, node?.data as Record<string, unknown> | null),
        message:    `Nova tarefa criada: ${body.nodeTitle ?? node?.title ?? "node"}`,
        update_type: "task_created",
      };
    }

    else if (event === "node_deleted" && body.nodeId) {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      data = {
        project_id: portalProjectId,
        author_id:  PORTAL_ADMIN_ID || portalClientId,
        node_id:    body.nodeId,
        message:    `Tarefa removida do canvas`,
        update_type: "task_deleted",
      };
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
    const result = await sendToPortal(PORTAL_URL, PORTAL_SECRET, event, data, body.source ?? "ops");

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
