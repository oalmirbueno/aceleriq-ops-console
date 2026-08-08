// Recuperação forense READ-ONLY do briefing completo da Stop Informática.
// Não escreve em nenhuma tabela. Apenas lê endpoints do Portal e o OPS.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-webhook-secret": PORTAL_SECRET,
    apikey: PORTAL_ANON,
    Authorization: `Bearer ${PORTAL_ANON}`,
  };

  const result: Record<string, unknown> = { ok: true, readOnly: true };

  // 1) Portal: full export bruto (só as chaves e o que for da Stop)
  try {
    const res = await fetch(`${PORTAL_BASE}/ops-full-export`, { method: "POST", headers });
    const body = await res.json().catch(() => null) as Record<string, any> | null;
    result.portalStatus = res.status;
    result.portalKeys = body ? Object.keys(body) : [];
    if (body) {
      const stopIds = [
        "6a847578-ba39-44cd-be61-08e34e18e4c9",
        "626fe41b-2ed0-4236-9e6b-6bb9a39b6417",
        "aecf2cdf-dffc-47dc-a1cb-4244cfdc1295",
      ];
      const hits: Record<string, unknown[]> = {};
      for (const [k, v] of Object.entries(body)) {
        if (!Array.isArray(v)) continue;
        const matches = (v as any[]).filter((row) => {
          const s = JSON.stringify(row ?? {}).toLowerCase();
          return stopIds.some((id) => s.includes(id)) || s.includes("stop inform") || s.includes("stopinform");
        });
        if (matches.length) hits[k] = matches;
      }
      result.portalCounts = Object.fromEntries(
        Object.entries(body).map(([k, v]) => [k, Array.isArray(v) ? v.length : typeof v]),
      );
      result.portalStopHits = hits;
    }
  } catch (e) {
    result.portalError = String(e);
  }

  // 2) OPS: varredura read-only de tabelas que podem guardar respostas
  try {
    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const ops: Record<string, unknown> = {};
    const { data: ce } = await sb.from("context_entries").select("*").limit(500);
    ops.context_entries = ce ?? [];
    const { data: cl } = await sb.from("clients").select("*").limit(500);
    ops.clients = (cl ?? []).filter((c: any) =>
      JSON.stringify(c).toLowerCase().includes("stop")
    );
    const { data: ws } = await sb.from("workspaces").select("*").limit(500);
    ops.workspaces = ws ?? [];
    result.ops = ops;
  } catch (e) {
    result.opsError = String(e);
  }

  return json(result);
});