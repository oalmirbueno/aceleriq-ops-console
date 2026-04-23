/**
 * portal-proxy — chama endpoints do aceleriq.online com o secret guardado server-side.
 * O frontend Ops chama esta função; ela repassa para o portal com autenticação.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const PORTAL_BASE   = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";
  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";

  try {
    const { path, body: reqBody } = await req.json() as { path: string; body?: unknown };

    const res = await fetch(`${PORTAL_BASE}/${path}`, {
      method: reqBody ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": PORTAL_SECRET,
      },
      body: reqBody ? JSON.stringify(reqBody) : undefined,
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "proxy error" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
