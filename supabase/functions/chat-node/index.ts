/**
 * chat-node — edge function para o ChatNode do canvas.
 * Recebe: { messages, systemPrompt, workspaceId, clientId }
 * Retorna: { reply: string }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY não configurada" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization" }, 401);

    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await client.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json() as {
      messages: Array<{ role: string; content: string }>;
      systemPrompt: string;
      workspaceId: string;
      clientId: string;
    };

    if (!body.messages || !body.systemPrompt) {
      return json({ error: "messages e systemPrompt são obrigatórios" }, 400);
    }

    // Call Lovable AI Gateway
    const aiRes = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.4,
        max_tokens: 800,
        messages: [
          { role: "system", content: body.systemPrompt },
          ...body.messages.slice(-14).map((m) => ({
            role: m.role === "user" ? "user" : "assistant",
            content: m.content,
          })),
        ],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return json({ error: `AI Gateway error: ${aiRes.status} ${errText}` }, 502);
    }

    const aiData = await aiRes.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const reply = aiData.choices?.[0]?.message?.content ?? "Não consegui gerar uma resposta. Tente novamente.";
    return json({ reply });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro interno" }, 500);
  }
});
