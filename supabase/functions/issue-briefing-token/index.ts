/**
 * issue-briefing-token — server-side issuance of signed public briefing tokens.
 * Only authenticated internal users can call this.
 * Token is HMAC-SHA256 signed with PUBLIC_BRIEFING_TOKEN_SECRET and includes expiration.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** HMAC-SHA256 sign a string and return base64url */
async function hmacSign(data: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Default token TTL: 30 days */
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth gate ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Autenticação obrigatória" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData?.user) {
    return jsonResponse({ error: "Token inválido ou expirado" }, 401);
  }

  // ── Input ──
  const { workspaceId, clientId, briefingType } = await req.json();
  if (!workspaceId || !clientId) {
    return jsonResponse({ error: "workspaceId e clientId obrigatórios" }, 400);
  }

  const kind = briefingType ?? "enterprise_structuring";
  const secret = Deno.env.get("PUBLIC_BRIEFING_TOKEN_SECRET");
  if (!secret) {
    return jsonResponse({ error: "Chave de assinatura não configurada" }, 500);
  }

  // ── Build signed token ──
  const iat = Date.now();
  const exp = iat + TOKEN_TTL_MS;

  const payload = JSON.stringify({ workspaceId, clientId, briefingType: kind, iat, exp });
  const payloadB64 = btoa(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const signature = await hmacSign(payload, secret);
  const signedToken = `${payloadB64}.${signature}`;

  return jsonResponse({ token: signedToken, expiresAt: new Date(exp).toISOString() });
});
