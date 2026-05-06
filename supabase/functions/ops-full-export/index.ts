/**
 * ops-full-export — alias compatível para o Portal.
 * Internamente delega para a mesma lógica de ops-nodes-list (export global).
 * Aceita os mesmos filtros opcionais.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), { status: 405, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const target = `${SUPABASE_URL}/functions/v1/ops-nodes-list`;
  const body = await req.text();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-webhook-secret": req.headers.get("x-webhook-secret") ?? "",
  };
  if (ANON_KEY) {
    headers.apikey = ANON_KEY;
    headers.Authorization = `Bearer ${ANON_KEY}`;
  }

  const res = await fetch(target, { method: "POST", headers, body: body || "{}" });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { ...cors, "Content-Type": "application/json" } });
});
