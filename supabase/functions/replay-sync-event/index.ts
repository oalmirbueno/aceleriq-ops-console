/**
 * replay-sync-event — reenvia ao Portal um evento gravado em sync_audit_log.
 *
 * Body: { auditId: string }
 *
 * Estratégia:
 *   - direction=ops_to_portal: extrai { event, data } do payload original e
 *     posta de novo no PORTAL_WEBHOOK_URL com o mesmo secret/anon. Source é
 *     forçado a "ops_replay" para o Portal poder distinguir do fluxo normal.
 *   - direction=portal_to_ops: re-injeta o payload no `receive-portal-sync`
 *     localmente, útil pra ressincronizar quando o webhook do Portal estava
 *     fora do ar quando o evento original chegou.
 *
 * Sempre grava uma nova entrada em sync_audit_log com event=`<orig>__replay`
 * para deixar trilha auditável.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logSync, startTimer } from "../_shared/syncAudit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";

type AuditRow = {
  id: string;
  direction: string;
  event: string;
  status: string;
  workspace_id: string | null;
  client_id: string | null;
  node_id: string | null;
  portal_project_id: string | null;
  portal_task_id: string | null;
  portal_milestone_id: string | null;
  payload: unknown;
  source: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Extrai { event, data } a partir do payload gravado no audit log. */
function buildPortalPayload(row: AuditRow): { event: string; data: Record<string, unknown> } | null {
  const payload = asRecord(row.payload);
  // Caso ideal: o payload já foi gravado no formato de webhook.
  if (typeof payload.event === "string" && payload.data && typeof payload.data === "object") {
    return { event: payload.event, data: payload.data as Record<string, unknown> };
  }
  // Reconstroi a partir do evento auditado (forma usada por sync-to-portal).
  const evt = row.event;
  if (evt === "node_created" || evt === "node_updated" || evt === "node_deleted") {
    const data: Record<string, unknown> = {
      project_id: row.portal_project_id ?? payload.project_id,
      node_id: row.node_id ?? payload.node_id,
      portal_task_id: row.portal_task_id ?? payload.portal_task_id,
      portal_milestone_id: row.portal_milestone_id ?? payload.portal_milestone_id,
      ...payload,
    };
    return { event: evt, data };
  }
  if (evt === "task_upsert" || evt === "task_deleted") {
    return {
      event: evt === "task_upsert" ? "task_updated" : "task_deleted",
      data: {
        portal_task_id: row.portal_task_id,
        portal_project_id: row.portal_project_id,
        portal_milestone_id: row.portal_milestone_id,
        ...payload,
      },
    };
  }
  if (evt === "project_progress") {
    return {
      event: "project_progress",
      data: {
        project_id: row.portal_project_id ?? payload.project_id,
        ...payload,
      },
    };
  }
  // Fallback: usa o evento original e o payload cru — Portal decide se aceita.
  return { event: evt, data: payload };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
    const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";
    const PORTAL_HOOK = Deno.env.get("PORTAL_WEBHOOK_URL") ?? `${PORTAL_BASE}/ops-webhook`;

    // Auth — usa o JWT do usuário pra garantir que só logado executa replay.
    const authHeader = req.headers.get("Authorization") ?? "";
    const auth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const { auditId } = (await req.json().catch(() => ({}))) as { auditId?: string };
    if (!auditId) return json({ error: "auditId required" }, 400);

    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: row, error } = await db
      .from("sync_audit_log")
      .select("*")
      .eq("id", auditId)
      .maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!row) return json({ error: "audit entry not found" }, 404);

    const built = buildPortalPayload(row as AuditRow);
    if (!built) return json({ error: "payload original não pode ser reconstruído" }, 422);

    const stop = startTimer();

    // Fluxo Portal → Ops: re-injeta no receive-portal-sync local.
    if (row.direction === "portal_to_ops") {
      const reinject = await fetch(`${SUPABASE_URL}/functions/v1/receive-portal-sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": PORTAL_SECRET,
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ event: built.event, type: "task", data: built.data, source: "ops_replay" }),
      });
      const text = await reinject.text();
      await logSync({
        direction: "internal",
        event: `${row.event}__replay`,
        status: reinject.ok ? "ok" : "error",
        workspaceId: row.workspace_id,
        clientId: row.client_id,
        nodeId: row.node_id,
        portalProjectId: row.portal_project_id,
        portalTaskId: row.portal_task_id,
        portalMilestoneId: row.portal_milestone_id,
        httpStatus: reinject.status,
        message: `replay portal_to_ops · audit=${row.id}`,
        payload: built,
        response: text.slice(0, 1000),
        durationMs: stop(),
        source: "ops_replay",
      });
      return json({
        ok: reinject.ok,
        direction: "portal_to_ops",
        httpStatus: reinject.status,
        response: text.slice(0, 1000),
      });
    }

    // Fluxo Ops → Portal: re-posta no webhook do Portal.
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-webhook-secret": PORTAL_SECRET,
    };
    if (PORTAL_ANON) {
      headers.apikey = PORTAL_ANON;
      headers.Authorization = `Bearer ${PORTAL_ANON}`;
    }
    const res = await fetch(PORTAL_HOOK, {
      method: "POST",
      headers,
      body: JSON.stringify({ event: built.event, data: built.data, source: "ops_replay" }),
    });
    const text = await res.text();

    await logSync({
      direction: "ops_to_portal",
      event: `${row.event}__replay`,
      status: res.ok ? "ok" : "error",
      workspaceId: row.workspace_id,
      clientId: row.client_id,
      nodeId: row.node_id,
      portalProjectId: row.portal_project_id,
      portalTaskId: row.portal_task_id,
      portalMilestoneId: row.portal_milestone_id,
      httpStatus: res.status,
      message: `replay ops_to_portal · audit=${row.id}`,
      payload: built,
      response: text.slice(0, 1000),
      durationMs: stop(),
      source: "ops_replay",
    });

    return json({
      ok: res.ok,
      direction: "ops_to_portal",
      httpStatus: res.status,
      event: built.event,
      response: text.slice(0, 1000),
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});