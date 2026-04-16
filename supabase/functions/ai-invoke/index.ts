import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PROVIDER_TIMEOUT_MS = 60_000;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface InvokeBody {
  route_key: string;
  messages: AiMessage[];
  workspace_id?: string | null;
  client_id?: string | null;
  response_format?: "json_object" | "text";
  temperature?: number;
  input_summary?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth obrigatória ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonError("Autenticação obrigatória", 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonError("Token inválido ou expirado", 401);
  }
  const userId = userData.user.id;

  if (!LOVABLE_API_KEY) {
    console.error("[ai-invoke] LOVABLE_API_KEY ausente");
    return jsonError("Serviço de IA indisponível", 500);
  }

  let body: InvokeBody;
  try {
    body = await req.json();
  } catch {
    return jsonError("JSON inválido", 400);
  }

  if (!body?.route_key || typeof body.route_key !== "string") {
    return jsonError("route_key obrigatório", 400);
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return jsonError("messages obrigatório", 400);
  }

  // service_role para resolver rota e gravar log (RLS é admin-only nas tabelas de config)
  const adminClient = createClient(SUPABASE_URL, SERVICE_KEY);

  // Resolver rota → modelo → provider
  const { data: route, error: routeErr } = await adminClient
    .from("ai_routes")
    .select(
      "id, route_key, enabled, system_prompt, default_temperature, response_format, ai_models!inner(id, model_id, label, enabled, ai_providers!inner(id, slug, label, enabled))",
    )
    .eq("route_key", body.route_key)
    .maybeSingle();

  if (routeErr) {
    console.error("[ai-invoke] erro resolvendo rota:", routeErr);
    return jsonError("Falha ao resolver rota de IA", 500);
  }
  if (!route || !route.enabled) {
    return jsonError(`Rota '${body.route_key}' não encontrada ou desativada`, 404);
  }

  const model = route.ai_models as unknown as {
    id: string;
    model_id: string;
    label: string;
    enabled: boolean;
    ai_providers: { slug: string; label: string; enabled: boolean };
  };

  if (!model.enabled || !model.ai_providers?.enabled) {
    return jsonError("Modelo ou provider desativado", 503);
  }

  // Compor messages: route.system_prompt vence se existir, senão preserva system do client
  const finalMessages: AiMessage[] = [];
  if (route.system_prompt) {
    finalMessages.push({ role: "system", content: route.system_prompt });
  }
  for (const m of body.messages) {
    if (route.system_prompt && m.role === "system") continue;
    finalMessages.push(m);
  }

  const gatewayBody: Record<string, unknown> = {
    model: model.model_id,
    messages: finalMessages,
    temperature: body.temperature ?? route.default_temperature ?? 0.2,
  };
  const responseFormat = body.response_format ?? route.response_format;
  if (responseFormat === "json_object") {
    gatewayBody.response_format = { type: "json_object" };
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let gwResp: Response;
  try {
    gwResp = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(gatewayBody),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    const aborted = (err as Error)?.name === "AbortError";
    await logEvent(adminClient, {
      route_key: body.route_key,
      workspace_id: body.workspace_id ?? null,
      client_id: body.client_id ?? null,
      status: "error",
      model_label: `${model.ai_providers.slug}/${model.model_id}`,
      input_summary: body.input_summary ?? null,
      output_summary: null,
      error_message: aborted ? "timeout" : "fetch_error",
      created_by: userId,
      metadata: { latency_ms: Date.now() - startedAt },
    });
    return jsonError(aborted ? "Timeout da IA" : "Falha ao contatar IA", aborted ? 504 : 502);
  }
  clearTimeout(timeoutId);
  const latency = Date.now() - startedAt;

  if (!gwResp.ok) {
    const errText = await gwResp.text().catch(() => "");
    console.error("[ai-invoke] gateway error:", gwResp.status, errText);
    await logEvent(adminClient, {
      route_key: body.route_key,
      workspace_id: body.workspace_id ?? null,
      client_id: body.client_id ?? null,
      status: "error",
      model_label: `${model.ai_providers.slug}/${model.model_id}`,
      input_summary: body.input_summary ?? null,
      output_summary: null,
      error_message: `gateway_${gwResp.status}`,
      created_by: userId,
      metadata: { latency_ms: latency, body: errText.slice(0, 500) },
    });
    if (gwResp.status === 429) return jsonError("Limite de requisições excedido", 429);
    if (gwResp.status === 402) return jsonError("Créditos esgotados — adicione saldo no workspace", 402);
    return jsonError("Erro no gateway de IA", 502);
  }

  const gwJson = await gwResp.json().catch(() => null);
  const content: string | undefined = gwJson?.choices?.[0]?.message?.content;
  const usage = gwJson?.usage ?? null;

  if (!content) {
    await logEvent(adminClient, {
      route_key: body.route_key,
      workspace_id: body.workspace_id ?? null,
      client_id: body.client_id ?? null,
      status: "error",
      model_label: `${model.ai_providers.slug}/${model.model_id}`,
      input_summary: body.input_summary ?? null,
      output_summary: null,
      error_message: "empty_response",
      created_by: userId,
      metadata: { latency_ms: latency },
    });
    return jsonError("IA retornou resposta vazia", 502);
  }

  await logEvent(adminClient, {
    route_key: body.route_key,
    workspace_id: body.workspace_id ?? null,
    client_id: body.client_id ?? null,
    status: "success",
    model_label: `${model.ai_providers.slug}/${model.model_id}`,
    input_summary: body.input_summary ?? null,
    output_summary: content.slice(0, 500),
    error_message: null,
    created_by: userId,
    metadata: { latency_ms: latency, usage },
  });

  return new Response(JSON.stringify({ content, model: `${model.ai_providers.slug}/${model.model_id}`, usage }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

async function logEvent(
  client: ReturnType<typeof createClient>,
  payload: {
    route_key: string;
    workspace_id: string | null;
    client_id: string | null;
    status: string;
    model_label: string | null;
    input_summary: string | null;
    output_summary: string | null;
    error_message: string | null;
    created_by: string | null;
    metadata: Record<string, unknown>;
  },
) {
  const { error } = await client.from("ai_logs").insert({
    action_key: payload.route_key,
    workspace_id: payload.workspace_id,
    client_id: payload.client_id,
    status: payload.status,
    model_label: payload.model_label,
    input_summary: payload.input_summary,
    output_summary: payload.output_summary,
    error_message: payload.error_message,
    created_by: payload.created_by,
    metadata: payload.metadata,
  });
  if (error) console.error("[ai-invoke] falha gravando ai_logs:", error);
}
