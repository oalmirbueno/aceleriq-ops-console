import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const auth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await auth.auth.getUser();
    if (!userData.user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      workspaceId?: string; portalTaskId?: string; event?: string;
      status?: string; direction?: string; limit?: number;
    };
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);
    const db = createClient(SUPABASE_URL, SERVICE_KEY);
    let q = db.from("sync_audit_log").select("*").order("created_at", { ascending: false }).limit(limit);
    if (body.workspaceId) q = q.eq("workspace_id", body.workspaceId);
    if (body.portalTaskId) q = q.eq("portal_task_id", body.portalTaskId);
    if (body.event) q = q.eq("event", body.event);
    if (body.status) q = q.eq("status", body.status);
    if (body.direction) q = q.eq("direction", body.direction);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, total: data?.length ?? 0, entries: data ?? [] });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});
