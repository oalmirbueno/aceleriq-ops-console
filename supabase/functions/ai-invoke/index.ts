import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PROVIDER_TIMEOUT_MS = 60_000;

/**
 * Provider registry — mapeia provider.slug → caller direto (sem Lovable Gateway).
 * Lê o secret pelo nome configurado em ai_providers.secret_env_name.
 *
 * MVP: apenas Google Gemini (texto/LLM).
 */
const PROVIDER_CALLERS: Record<
  string,
  (args: ProviderCallArgs) => Promise<ProviderCallResult>
> = {
  google: callGoogleGemini,
};

interface ProviderCallArgs {
  apiKey: string;
  modelId: string;
  messages: AiMessage[];
  temperature: number;
  responseFormat?: "json_object" | "text";
  signal: AbortSignal;
}

interface ProviderCallResult {
  ok: boolean;
  status: number;
  content?: string;
  usage?: unknown;
  errorMessage?: string;
  errorBody?: string;
}

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

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData?.user) {
    return jsonError("Token inválido ou expirado", 401);
  }
  const userId = userData.user.id;

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
      "id, route_key, enabled, system_prompt, default_temperature, response_format, ai_models!inner(id, model_id, label, enabled, ai_providers!inner(id, slug, label, enabled, secret_env_name))",
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
    ai_providers: {
      slug: string;
      label: string;
      enabled: boolean;
      secret_env_name: string | null;
    };
  };

  if (!model.enabled || !model.ai_providers?.enabled) {
    return jsonError("Modelo ou provider desativado", 503);
  }

  const providerSlug = model.ai_providers.slug;
  const caller = PROVIDER_CALLERS[providerSlug];
  if (!caller) {
    return jsonError(`Provider '${providerSlug}' não suportado neste MVP`, 501);
  }

  const secretName = model.ai_providers.secret_env_name;
  if (!secretName) {
    console.error(`[ai-invoke] provider ${providerSlug} sem secret_env_name configurado`);
    return jsonError("Provider sem secret configurado", 500);
  }
  const apiKey = Deno.env.get(secretName);
  if (!apiKey) {
    console.error(`[ai-invoke] secret ${secretName} ausente no ambiente`);
    return jsonError(`Credencial ${secretName} não disponível`, 500);
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

  const responseFormat = body.response_format ?? route.response_format;
  const temperature = body.temperature ?? route.default_temperature ?? 0.2;
  const modelLabel = `${providerSlug}/${model.model_id}`;

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  let result: ProviderCallResult;
  try {
    result = await caller({
      apiKey,
      modelId: model.model_id,
      messages: finalMessages,
      temperature,
      responseFormat,
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
      model_label: modelLabel,
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

  if (!result.ok) {
    console.error(`[ai-invoke] provider error (${providerSlug}):`, result.status, result.errorBody?.slice(0, 500));
    await logEvent(adminClient, {
      route_key: body.route_key,
      workspace_id: body.workspace_id ?? null,
      client_id: body.client_id ?? null,
      status: "error",
      model_label: modelLabel,
      input_summary: body.input_summary ?? null,
      output_summary: null,
      error_message: result.errorMessage ?? `provider_${result.status}`,
      created_by: userId,
      metadata: { latency_ms: latency, body: result.errorBody?.slice(0, 500) },
    });
    if (result.status === 429) return jsonError("Limite de requisições do provider excedido", 429);
    if (result.status === 401 || result.status === 403) return jsonError("Credencial do provider inválida", 502);
    return jsonError("Erro no provider de IA", 502);
  }

  if (!result.content) {
    await logEvent(adminClient, {
      route_key: body.route_key,
      workspace_id: body.workspace_id ?? null,
      client_id: body.client_id ?? null,
      status: "error",
      model_label: modelLabel,
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
    model_label: modelLabel,
    input_summary: body.input_summary ?? null,
    output_summary: result.content.slice(0, 500),
    error_message: null,
    created_by: userId,
    metadata: { latency_ms: latency, usage: result.usage ?? null },
  });

  return new Response(
    JSON.stringify({ content: result.content, model: modelLabel, usage: result.usage ?? null }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

/* ─── Provider: Google Gemini (REST direto, sem Lovable Gateway) ─── */

async function callGoogleGemini(args: ProviderCallArgs): Promise<ProviderCallResult> {
  // Extrai system instruction (Gemini usa campo separado)
  const systemMsgs = args.messages.filter((m) => m.role === "system");
  const convo = args.messages.filter((m) => m.role !== "system");

  const contents = convo.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const generationConfig: Record<string, unknown> = {
    temperature: args.temperature,
  };
  if (args.responseFormat === "json_object") {
    generationConfig.responseMimeType = "application/json";
  }

  const reqBody: Record<string, unknown> = {
    contents,
    generationConfig,
  };
  if (systemMsgs.length > 0) {
    reqBody.systemInstruction = {
      role: "user",
      parts: [{ text: systemMsgs.map((m) => m.content).join("\n\n") }],
    };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    args.modelId,
  )}:generateContent?key=${encodeURIComponent(args.apiKey)}`;

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
    signal: args.signal,
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    return {
      ok: false,
      status: resp.status,
      errorMessage: `gemini_${resp.status}`,
      errorBody: errText,
    };
  }

  const json = await resp.json().catch(() => null);
  const content: string | undefined = json?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? "")
    .join("")
    .trim();

  return {
    ok: true,
    status: resp.status,
    content,
    usage: json?.usageMetadata ?? null,
  };
}

async function logEvent(
  client: SupabaseClient<any, "public", any>,
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
