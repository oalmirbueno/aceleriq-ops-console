import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ROUTE_KEY = "parse_briefing";

const DOSSIER_BLOCKS = [
  "identity",
  "offer",
  "commercial",
  "operational",
  "digital",
  "access",
  "diagnostic",
  "decisions",
];

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function sanitizeJsonPayload(raw: string): string {
  let s = raw.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  }
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) s = s.slice(first, last + 1);
  return s;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Autenticação obrigatória", 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: u, error: ue } = await supabase.auth.getUser();
  if (ue || !u?.user) return jsonError("Token inválido ou expirado", 401);

  let body: { text?: string; briefing_type?: string; workspace_id?: string; client_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON inválido", 400);
  }

  const text = body.text;
  if (!text || typeof text !== "string" || text.trim().length < 20) {
    return jsonError("Texto do briefing muito curto ou ausente", 400);
  }

  const briefingLabel = body.briefing_type === "sitebolt" ? "Briefing SiteBolt" : "Briefing Essencial";
  const userPrompt = `Tipo de briefing: ${briefingLabel}\n\nConteúdo do briefing:\n\n${text}`;

  // Chama ai-invoke (que resolve a rota → modelo → loga em ai_logs)
  const { data: invokeData, error: invokeError } = await supabase.functions.invoke("ai-invoke", {
    body: {
      route_key: ROUTE_KEY,
      messages: [{ role: "user", content: userPrompt }],
      response_format: "json_object",
      workspace_id: body.workspace_id ?? null,
      client_id: body.client_id ?? null,
      input_summary: `parse-briefing ${briefingLabel} (${text.length} chars)`,
    },
  });

  if (invokeError) {
    console.error("[parse-briefing] ai-invoke error:", invokeError);
    return jsonError("Falha ao processar briefing", 502);
  }
  if (invokeData?.error) {
    return jsonError(invokeData.error as string, 502);
  }

  const rawText = (invokeData?.content as string | undefined)?.trim();
  if (!rawText) return jsonError("IA não retornou dados estruturados", 502);

  let parsed: { sections?: unknown };
  try {
    parsed = JSON.parse(sanitizeJsonPayload(rawText));
  } catch (e) {
    console.error("[parse-briefing] JSON inválido:", e, rawText.slice(0, 500));
    return jsonError("Resposta da IA em formato inválido", 502);
  }

  const rawSections = Array.isArray(parsed?.sections) ? parsed.sections : [];
  const sections = rawSections
    .filter(
      (s: any) =>
        s &&
        typeof s.title === "string" &&
        s.title.trim().length > 0 &&
        typeof s.content === "string" &&
        s.content.trim().length > 0 &&
        typeof s.dossier_block === "string" &&
        DOSSIER_BLOCKS.includes(s.dossier_block),
    )
    .map((s: any) => ({
      title: s.title.trim().slice(0, 80),
      content: s.content.trim(),
      dossier_block: s.dossier_block,
    }));

  return new Response(JSON.stringify({ sections }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
