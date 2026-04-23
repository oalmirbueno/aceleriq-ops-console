/**
 * portal-proxy — chama endpoints do aceleriq.online com o secret guardado server-side.
 *
 * O frontend do Ops chama esta função que:
 *  1. Adiciona o header `x-webhook-secret` (nunca exposto ao browser)
 *  2. Sempre envia POST (compatibilidade com edge functions do Supabase)
 *  3. Propaga erros REAIS do portal para facilitar debug
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

  if (!PORTAL_SECRET) {
    return new Response(JSON.stringify({
      error: "PORTAL_WEBHOOK_SECRET não configurado no Supabase do Ops. Vá em Settings → Edge Functions → Secrets e adicione."
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const { path, body: reqBody } = await req.json() as { path: string; body?: unknown };

    if (!path) {
      return new Response(JSON.stringify({ error: "Path não informado" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ALWAYS POST — Supabase edge functions esperam POST por padrão
    const res = await fetch(`${PORTAL_BASE}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": PORTAL_SECRET,
      },
      body: JSON.stringify(reqBody ?? {}),
    });

    const contentType = res.headers.get("content-type") ?? "";
    const rawText = await res.text();

    // Tenta parsear como JSON; se falhar, retorna texto bruto com status real
    let parsed: unknown;
    if (contentType.includes("application/json")) {
      try { parsed = JSON.parse(rawText); }
      catch { parsed = { error: "Resposta inválida do portal", raw: rawText.slice(0, 200) }; }
    } else {
      parsed = {
        error: `Portal respondeu ${res.status} ${res.statusText}`,
        raw: rawText.slice(0, 200),
        hint: rawText.includes("Function not found")
          ? `A edge function "${path}" não existe no portal. Deploy ela no aceleriq.online.`
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
