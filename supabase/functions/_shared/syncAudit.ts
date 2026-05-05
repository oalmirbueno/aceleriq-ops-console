// Shared audit logger for bidirectional sync events.
// Writes a row in public.sync_audit_log via service role.
// Never throws — auditing must not break the actual sync flow.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

export type SyncDirection = "portal_to_ops" | "ops_to_portal" | "internal";
export type SyncStatus = "ok" | "skipped" | "error";

export interface SyncAuditEntry {
  direction: SyncDirection;
  event: string;
  status: SyncStatus;
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

let _client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

const SECRET_KEYS = new Set([
  "authorization", "apikey", "x-webhook-secret", "service_role_key",
  "service_role", "password", "token", "access_token", "refresh_token",
  "secret", "api_key",
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > 4) return "[deep]";
  if (typeof value === "string") return value.length > 4000 ? `${value.slice(0, 4000)}…[truncated]` : value;
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(k.toLowerCase())) { out[k] = "[redacted]"; continue; }
    out[k] = sanitize(v, depth + 1);
  }
  return out;
}

export async function logSync(entry: SyncAuditEntry): Promise<void> {
  try {
    const db = getClient();
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
      payload: entry.payload != null ? sanitize(entry.payload) : null,
      response: entry.response != null ? sanitize(entry.response) : null,
      duration_ms: entry.durationMs ?? null,
      source: entry.source ?? null,
    };
    // Fire-and-forget; don't await blocking caller path.
    await db.from("sync_audit_log").insert(row);
  } catch (err) {
    console.warn("[syncAudit] insert failed", err instanceof Error ? err.message : err);
  }
}

export function startTimer() {
  const t0 = Date.now();
  return () => Date.now() - t0;
}
