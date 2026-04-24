/**
 * portal-proxy — chama endpoints do aceleriq.online com autenticação correta.
 *
 * Envia:
 *   - x-webhook-secret (secret compartilhado)
 *   - apikey + Authorization Bearer (anon key do portal — requerido pelo Supabase)
 *   - Content-Type application/json
 *
 * Sempre POST. Propaga erros do portal de forma legível.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const PORTAL_BASE     = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";
  const PORTAL_SECRET   = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const PORTAL_ANON_KEY = Deno.env.get("PORTAL_ANON_KEY") ?? "";

  // Validações de configuração
  if (!PORTAL_SECRET) {
    return new Response(JSON.stringify({
      error: "PORTAL_WEBHOOK_SECRET não configurado no Supabase do Ops.",
      hint: "Vá em Settings → Edge Functions → Secrets do Ops e adicione a secret com o mesmo valor do OPS_WEBHOOK_SECRET configurado no portal.",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (!PORTAL_ANON_KEY) {
    return new Response(JSON.stringify({
      error: "PORTAL_ANON_KEY não configurado no Supabase do Ops.",
      hint: "Pegue a anon/public key do Supabase do aceleriq.online (Settings → API → anon public key) e adicione como secret PORTAL_ANON_KEY no Supabase do Ops.",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const { path, body: reqBody } = await req.json() as { path: string; body?: unknown };

    if (!path) {
      return new Response(JSON.stringify({ error: "Path não informado" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const res = await fetch(`${PORTAL_BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": PORTAL_SECRET,
        "apikey": PORTAL_ANON_KEY,
        "Authorization": `Bearer ${PORTAL_ANON_KEY}`,
      },
      body: JSON.stringify(reqBody ?? {}),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const rawText = await res.text();

    let parsed: unknown;
    if (contentType.includes("application/json")) {
      try { parsed = JSON.parse(rawText); }
      catch { parsed = { error: "Resposta inválida do portal", raw: rawText.slice(0, 200) }; }
    } else {
      parsed = {
        error: `Portal respondeu ${res.status} ${res.statusText}`,
        raw: rawText.slice(0, 200),
        hint: rawText.includes("Function not found") || res.status === 404
          ? `A edge function "${path}" não existe no portal. Você precisa criar ela no Lovable do aceleriq.online.`
          : res.status === 401
            ? "Autenticação falhou. Verifique se OPS_WEBHOOK_SECRET no portal é IGUAL ao PORTAL_WEBHOOK_SECRET no Ops, e se PORTAL_ANON_KEY está configurado no Ops."
            : undefined,
      };
    }

    return new Response(JSON.stringify(parsed), {
      status: res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({
      error: "Erro ao comunicar com o portal",
      detail: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
