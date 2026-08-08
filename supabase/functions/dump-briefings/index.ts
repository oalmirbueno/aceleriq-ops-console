import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dump-key",
};

const DUMP_KEY = "b7f2c9a1-recover-stop-briefings";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  if (url.searchParams.get("key") !== DUMP_KEY) {
    return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const [{ data: clients }, { data: entries }, { data: workspaces }] = await Promise.all([
    supabase.from("clients").select("id, name, company_name"),
    supabase.from("context_entries").select("*").eq("context_type", "briefing").order("created_at", { ascending: false }),
    supabase.from("workspaces").select("id, client_id, name"),
  ]);
  return new Response(JSON.stringify({ clients, entries, workspaces }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
