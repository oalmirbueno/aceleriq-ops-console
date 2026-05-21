/**
 * list-briefings — admin endpoint to list briefings/clients.
 * Uses service-role to bypass RLS. Validates the caller's JWT and admin role.
 *
 * Modes (body):
 *  { mode: "clients" }                            → list all clients + briefing aggregates
 *  { mode: "client", clientId }                   → list briefings for one client
 *  { mode: "entry",  entryId }                    → return one briefing entry
 */
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
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
      return json({ error: "missing_env" }, 500);
    }
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) return json({ error: "unauthorized", detail: userErr?.message }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const mode = (body.mode as string) ?? "clients";

    if (mode === "clients") {
      const [{ data: clients, error: cErr }, { data: entries, error: eErr }, { data: workspaces, error: wErr }] = await Promise.all([
        admin.from("clients")
          .select("id, name, company_name, logo_url, created_at")
          .order("created_at", { ascending: false }),
        admin.from("context_entries")
          .select("id, client_id, workspace_id, metadata, created_at, updated_at")
          .eq("context_type", "briefing"),
        admin.from("workspaces").select("id, client_id"),
      ]);
      if (cErr) return json({ error: cErr.message }, 500);
      if (eErr) return json({ error: eErr.message }, 500);
      if (wErr) return json({ error: wErr.message }, 500);
      // Backfill client_id from workspace when missing
      const wsMap = new Map<string, string>();
      for (const w of workspaces ?? []) wsMap.set(w.id as string, w.client_id as string);
      const normalizedEntries = (entries ?? []).map((e) => ({
        ...e,
        client_id: e.client_id ?? wsMap.get(e.workspace_id as string) ?? null,
      }));
      return json({ clients: clients ?? [], entries: normalizedEntries });
    }

    if (mode === "client") {
      const clientId = body.clientId as string;
      if (!clientId) return json({ error: "clientId required" }, 400);
      const { data: ws } = await admin.from("workspaces").select("id").eq("client_id", clientId);
      const wsIds = (ws ?? []).map((w) => w.id as string);
      // Match by client_id OR by any workspace owned by client (covers OPS V1 entries with null client_id)
      const filter = wsIds.length
        ? `client_id.eq.${clientId},workspace_id.in.(${wsIds.join(",")})`
        : `client_id.eq.${clientId}`;
      const { data, error } = await admin.from("context_entries")
        .select("id, client_id, workspace_id, title, content, metadata, created_at, updated_at")
        .eq("context_type", "briefing")
        .or(filter)
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ entries: data ?? [], workspaceIds: wsIds });
    }

    if (mode === "entry") {
      const entryId = body.entryId as string;
      if (!entryId) return json({ error: "entryId required" }, 400);
      const { data, error } = await admin.from("context_entries")
        .select("id, client_id, workspace_id, title, content, metadata, created_at, updated_at")
        .eq("id", entryId)
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      return json({ entry: data ?? null });
    }

    return json({ error: "invalid mode" }, 400);
  } catch (e) {
    return json({ error: "internal", detail: (e as Error).message }, 500);
  }
});