/**
 * verify-portal-realtime — diagnóstico do canal realtime Portal ⇄ Ops.
 *
 * Checa:
 *   1. ops-webhook do Portal está acessível (HEAD/POST de teste)
 *   2. Endpoint `ops-realtime-status` do Portal (se exposto) confirma que
 *      `tasks` está em `supabase_realtime` e tem REPLICA IDENTITY FULL
 *   3. sync_audit_log tem evento `task_upsert` (direction=portal_to_ops)
 *      nas últimas N horas para o workspace solicitado
 *
 * Body: { workspaceId?: string, lookbackMinutes?: number }
 * Resposta: { ok, checks: [...], lastUpsertAt, alert? }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";

type Check = {
  id: string;
  label: string;
  status: "ok" | "warn" | "fail";
  detail?: string;
  data?: unknown;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
    const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";
    const PORTAL_HOOK = Deno.env.get("PORTAL_WEBHOOK_URL") ?? `${PORTAL_BASE}/ops-webhook`;

    const body = (await req.json().catch(() => ({}))) as {
      workspaceId?: string;
      lookbackMinutes?: number;
    };
    const lookback = Math.max(1, Math.min(1440, body.lookbackMinutes ?? 60));
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    const checks: Check[] = [];

    // 1) Secrets presentes
    if (!PORTAL_SECRET) checks.push({ id: "secret", label: "PORTAL_WEBHOOK_SECRET", status: "fail", detail: "ausente" });
    else checks.push({ id: "secret", label: "PORTAL_WEBHOOK_SECRET", status: "ok" });

    // 2) Ping no ops-webhook do Portal (ping no-op, source=ops para anti-loop)
    let webhookStatus: Check;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-webhook-secret": PORTAL_SECRET,
      };
      if (PORTAL_ANON) {
        headers.apikey = PORTAL_ANON;
        headers.Authorization = `Bearer ${PORTAL_ANON}`;
      }
      const t0 = Date.now();
      const res = await fetch(PORTAL_HOOK, {
        method: "POST",
        headers,
        body: JSON.stringify({ event: "ping", source: "ops_verify", data: { ping: true } }),
      });
      const text = await res.text();
      const ms = Date.now() - t0;
      webhookStatus = res.ok
        ? { id: "webhook", label: "ops-webhook (Portal)", status: "ok", detail: `${res.status} em ${ms}ms`, data: text.slice(0, 200) }
        : { id: "webhook", label: "ops-webhook (Portal)", status: "fail", detail: `HTTP ${res.status}`, data: text.slice(0, 300) };
    } catch (err) {
      webhookStatus = { id: "webhook", label: "ops-webhook (Portal)", status: "fail", detail: err instanceof Error ? err.message : "fetch failed" };
    }
    checks.push(webhookStatus);

    // 3) Realtime status no Portal (endpoint opcional ops-realtime-status)
    let realtimeCheck: Check;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "x-webhook-secret": PORTAL_SECRET,
      };
      if (PORTAL_ANON) {
        headers.apikey = PORTAL_ANON;
        headers.Authorization = `Bearer ${PORTAL_ANON}`;
      }
      const res = await fetch(`${PORTAL_BASE}/ops-realtime-status`, { method: "POST", headers, body: "{}" });
      if (res.status === 404) {
        realtimeCheck = { id: "realtime", label: "tasks em supabase_realtime", status: "warn", detail: "Portal não expõe ops-realtime-status (não fatal)" };
      } else {
        const data = await res.json().catch(() => ({}));
        const inPub = !!(data as any).in_publication;
        const fullIdentity = !!(data as any).replica_identity_full;
        const opsIdx = !!(data as any).ops_node_id_index;
        const okAll = inPub && fullIdentity;
        realtimeCheck = {
          id: "realtime",
          label: "tasks em supabase_realtime",
          status: okAll ? "ok" : "fail",
          detail: okAll ? `pub=on · replica=full${opsIdx ? " · idx" : ""}` : `pub=${inPub} · replica_full=${fullIdentity}`,
          data,
        };
      }
    } catch (err) {
      realtimeCheck = { id: "realtime", label: "tasks em supabase_realtime", status: "warn", detail: err instanceof Error ? err.message : "verificação indisponível" };
    }
    checks.push(realtimeCheck);

    // 4) Últimos upserts vindo do Portal no sync_audit_log
    const since = new Date(Date.now() - lookback * 60_000).toISOString();
    let q = db
      .from("sync_audit_log")
      .select("created_at, status, message, workspace_id, portal_task_id")
      .eq("direction", "portal_to_ops")
      .eq("event", "task_upsert")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(50);
    if (body.workspaceId) q = q.eq("workspace_id", body.workspaceId);
    const { data: rows, error } = await q;

    let lastUpsertAt: string | null = null;
    let inboundCheck: Check;
    if (error) {
      inboundCheck = { id: "inbound", label: "Upserts Portal→Ops", status: "warn", detail: error.message };
    } else if (!rows || rows.length === 0) {
      inboundCheck = {
        id: "inbound",
        label: "Upserts Portal→Ops",
        status: "fail",
        detail: `Nenhum task_upsert nos últimos ${lookback}min${body.workspaceId ? " neste workspace" : ""}`,
      };
    } else {
      lastUpsertAt = rows[0].created_at as string;
      const okCount = rows.filter((r) => r.status === "ok").length;
      inboundCheck = {
        id: "inbound",
        label: "Upserts Portal→Ops",
        status: okCount > 0 ? "ok" : "warn",
        detail: `${okCount}/${rows.length} ok · último ${lastUpsertAt}`,
      };
    }
    checks.push(inboundCheck);

    const failed = checks.filter((c) => c.status === "fail");
    const warned = checks.filter((c) => c.status === "warn");
    const ok = failed.length === 0;

    let alert: string | null = null;
    if (failed.length > 0) {
      alert = `Realtime Portal⇄Ops com falha: ${failed.map((f) => f.label).join(", ")}`;
    } else if (warned.length > 0 && !lastUpsertAt) {
      alert = `Sem upserts recentes do Portal — confira se a tabela tasks está publicada para realtime.`;
    }

    return json({
      ok,
      lookbackMinutes: lookback,
      lastUpsertAt,
      alert,
      checks,
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});