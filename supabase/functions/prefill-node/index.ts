/**
 * prefill-node — auto-rascunha o conteúdo de um canvas_node específico.
 *
 * O cliente envia:
 *   - nodeId, workspaceId, clientId
 *   - blueprint: { kind, sections: [{id, title, fields: [{id,label,type,hint,decisionOnly}]}], sources, prefillPrompt }
 *
 * A função:
 *   1. Auth + acesso ao workspace
 *   2. Busca as fontes habilitadas (briefing consolidado, context_entries, métricas, fronts, cliente, anexos, siblings)
 *   3. Monta system prompt do blueprint + tool schema derivado das sections
 *   4. Chama Lovable AI Gateway com tool-calling forçado pra retornar JSON estruturado
 *   5. Persiste em canvas_nodes.metadata.prefill (cache)
 *   6. Retorna o payload
 *
 * Suporta cacheOnly=true (só lê o cache, não chama IA) e force=true (refaz mesmo com cache).
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

type FieldType = "text" | "textarea" | "list" | "kv" | "checklist" | "attachments";
type PrefillSource = "briefing" | "context" | "metrics" | "fronts" | "client" | "assets" | "siblings";

interface BlueprintField { id: string; label: string; type: FieldType; hint?: string; decisionOnly?: boolean }
interface BlueprintSection { id: string; title: string; description?: string; fields: BlueprintField[] }
interface BlueprintPayload {
  kind: string;
  purpose: string;
  sections: BlueprintSection[];
  sources: PrefillSource[];
  prefillPrompt: string;
}

interface ReqBody {
  nodeId: string;
  workspaceId: string;
  clientId: string;
  blueprint: BlueprintPayload;
  force?: boolean;
  cacheOnly?: boolean;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing Authorization header" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const body = (await req.json()) as ReqBody;
    if (!body.nodeId || !body.workspaceId || !body.clientId || !body.blueprint) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }
    const { nodeId, workspaceId, clientId, blueprint, force = false, cacheOnly = false } = body;

    // ── 1. Carrega o node alvo + checa cache
    const { data: node, error: nodeErr } = await supabase
      .from("canvas_nodes")
      .select("id, title, node_type, metadata, parent_node_id")
      .eq("id", nodeId)
      .maybeSingle();
    if (nodeErr || !node) return jsonResponse({ error: "Node not found" }, 404);

    const cached = (node.metadata as Record<string, unknown> | null)?.prefill ?? null;
    if (cacheOnly) return jsonResponse({ prefill: cached, cached: !!cached });
    if (cached && !force) return jsonResponse({ prefill: cached, cached: true });

    if (!LOVABLE_API_KEY) return jsonResponse({ error: "AI not configured" }, 500);

    // ── 2. Coleta fontes habilitadas
    const ctx: Record<string, unknown> = {};
    const sourcesUsed: PrefillSource[] = [];

    if (blueprint.sources.includes("client")) {
      const { data: client } = await supabase.from("clients")
        .select("name, segment, plan_name, website_url, notes")
        .eq("id", clientId).maybeSingle();
      if (client) { ctx.client = client; sourcesUsed.push("client"); }
    }

    if (blueprint.sources.includes("briefing")) {
      // procura briefing consolidado em context_entries.metadata.consolidated_briefing
      const { data: ents } = await supabase.from("context_entries")
        .select("metadata, content, title")
        .eq("client_id", clientId)
        .eq("context_type", "briefing")
        .order("created_at", { ascending: false })
        .limit(3);
      const consolidated = ents?.find((e) => (e.metadata as Record<string, unknown> | null)?.consolidated_briefing);
      if (consolidated) {
        ctx.briefing_consolidated = (consolidated.metadata as Record<string, unknown>).consolidated_briefing;
        sourcesUsed.push("briefing");
      } else if (ents && ents.length > 0) {
        ctx.briefing_raw = ents.slice(0, 2).map((e) => ({ title: e.title, content: e.content?.slice(0, 4000) }));
        sourcesUsed.push("briefing");
      }
    }

    if (blueprint.sources.includes("context")) {
      const { data: entries } = await supabase.from("context_entries")
        .select("title, content, context_type, metadata")
        .eq("client_id", clientId)
        .neq("context_type", "briefing")
        .order("created_at", { ascending: false })
        .limit(15);
      if (entries && entries.length > 0) {
        ctx.context_entries = entries.map((e) => ({
          type: e.context_type, title: e.title, content: (e.content ?? "").slice(0, 1500),
        }));
        sourcesUsed.push("context");
      }
    }

    if (blueprint.sources.includes("metrics")) {
      const { data: metrics } = await supabase.from("metric_snapshots")
        .select("metric_name, value, unit, captured_at, notes")
        .eq("client_id", clientId)
        .order("captured_at", { ascending: false })
        .limit(20);
      if (metrics && metrics.length > 0) { ctx.metrics = metrics; sourcesUsed.push("metrics"); }
    }

    if (blueprint.sources.includes("fronts")) {
      const { data: fronts, error: frontsErr } = await supabase
        .from("operational_fronts")
        .select("name, bucket_status")
        .eq("workspace_id", workspaceId)
        .limit(10);
      if (frontsErr) console.warn("fronts source failed:", frontsErr.message);
      if (fronts && fronts.length > 0) { ctx.fronts = fronts; sourcesUsed.push("fronts"); }
    }

    if (blueprint.sources.includes("siblings")) {
      // outros canvas_nodes do mesmo cliente que JÁ têm prefill
      const parent = node.parent_node_id;
      if (parent) {
        const { data: siblings } = await supabase.from("canvas_nodes")
          .select("id, title, node_type, metadata")
          .eq("parent_node_id", parent)
          .neq("id", nodeId)
          .limit(10);
        const filledSiblings = (siblings ?? [])
          .map((s) => {
            const pf = (s.metadata as Record<string, unknown> | null)?.prefill as Record<string, unknown> | undefined;
            if (!pf) return null;
            return { title: s.title, kind: s.node_type, sections: pf.sections };
          })
          .filter(Boolean);
        if (filledSiblings.length > 0) { ctx.siblings = filledSiblings; sourcesUsed.push("siblings"); }
      }
    }

    if (blueprint.sources.includes("assets")) {
      const att = (node.metadata as Record<string, unknown> | null)?.attachments;
      if (Array.isArray(att) && att.length > 0) {
        ctx.attachments = att.slice(0, 5);
        sourcesUsed.push("assets");
      }
    }

    // ── 3. Monta tool schema a partir das sections do blueprint
    const sectionsSchema: Record<string, unknown> = {};
    blueprint.sections.forEach((s) => {
      const fieldsSchema: Record<string, unknown> = {};
      // attachments fields are user-managed — IA não preenche, então removemos do schema
      const aiFields = s.fields.filter((f) => f.type !== "attachments");
      aiFields.forEach((f) => {
        const valueSchema: Record<string, unknown> = (() => {
          if (f.type === "text" || f.type === "textarea") return { type: "string" };
          if (f.type === "list") return { type: "array", items: { type: "string" } };
          if (f.type === "kv") return { type: "object", additionalProperties: { type: "string" } };
          if (f.type === "checklist") return {
            type: "array",
            items: {
              type: "object",
              properties: { id: { type: "string" }, text: { type: "string" }, done: { type: "boolean" } },
              required: ["id", "text", "done"],
            },
          };
          return { type: "string" };
        })();
        fieldsSchema[f.id] = {
          type: "object",
          description: `${f.label}${f.hint ? ` — ${f.hint}` : ""}${f.decisionOnly ? " [DECISÃO HUMANA: marque origin=empty se não souber]" : ""}`,
          properties: {
            value: valueSchema,
            origin: { type: "string", enum: ["auto", "client", "empty"] },
            citation: { type: "string", description: "Fonte da informação (ex: briefing §2, contexto X)" },
          },
          required: ["value", "origin"],
        };
      });
      // Sections that are 100% attachments-only — pular completamente do schema
      if (aiFields.length === 0) return;
      sectionsSchema[s.id] = {
        type: "object",
        description: `${s.title}${s.description ? ` — ${s.description}` : ""}`,
        properties: {
          fields: { type: "object", properties: fieldsSchema, required: aiFields.map((f) => f.id) },
          ai_notes: { type: "string", description: "Observações da IA sobre essa seção (opcional)" },
        },
        required: ["fields"],
      };
    });

    const requiredSections = blueprint.sections
      .filter((s) => s.fields.some((f) => f.type !== "attachments"))
      .map((s) => s.id);

    const toolSchema = {
      type: "function",
      function: {
        name: "fill_node_draft",
        description: `Preenche o rascunho do node tipo '${blueprint.kind}' com base no contexto do cliente.`,
        parameters: {
          type: "object",
          properties: { sections: { type: "object", properties: sectionsSchema, required: requiredSections } },
          required: ["sections"],
        },
      },
    };

    // ── 4. Chama IA
    const systemPrompt = [
      blueprint.prefillPrompt,
      "",
      "REGRAS UNIVERSAIS:",
      "- Use APENAS o contexto fornecido. Nunca invente fatos sobre orçamento, prazo, datas ou nomes próprios.",
      "- origin='client' = a info vem literal do cliente (form preenchido). origin='auto' = você inferiu do contexto. origin='empty' = falta info.",
      "- Para campos marcados [DECISÃO HUMANA], use origin='empty' a menos que o cliente tenha declarado explicitamente.",
      "- Cite a fonte em 'citation' quando vier de briefing, contexto ou métrica específica.",
      "- Seja conciso. Tom profissional, direto, sem floreio.",
      "- Para listas, prefira 3-5 itens de qualidade vs 10 itens vagos.",
    ].join("\n");

    const userPrompt = [
      `Tipo de node: ${blueprint.kind}`,
      `Propósito: ${blueprint.purpose}`,
      `Título atual do node: ${node.title}`,
      "",
      "CONTEXTO DISPONÍVEL:",
      JSON.stringify(ctx, null, 2),
      "",
      "Preencha CADA seção e CADA campo do tool schema 'fill_node_draft'.",
    ].join("\n");

    const aiResp = await fetch(AI_GATEWAY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        tools: [toolSchema],
        tool_choice: { type: "function", function: { name: "fill_node_draft" } },
      }),
    });

    if (aiResp.status === 429) return jsonResponse({ error: "Limite de IA atingido. Tente em 1 minuto." }, 429);
    if (aiResp.status === 402) return jsonResponse({ error: "Créditos de IA esgotados. Adicione em Settings > Workspace > Usage." }, 402);
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI error:", aiResp.status, t);
      return jsonResponse({ error: `AI gateway error ${aiResp.status}` }, 500);
    }

    const aiData = await aiResp.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return jsonResponse({ error: "IA não retornou estrutura esperada" }, 500);
    }

    let parsed: { sections: Record<string, { fields: Record<string, unknown>; ai_notes?: string }> };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (e) {
      return jsonResponse({ error: "JSON inválido da IA: " + (e as Error).message }, 500);
    }

    const payload = {
      blueprint_kind: blueprint.kind,
      sections: parsed.sections,
      method_state: cached && typeof cached === "object" ? (cached as Record<string, unknown>).method_state : {},
      sources_used: sourcesUsed,
      generated_at: new Date().toISOString(),
      ai_model: AI_MODEL,
      generated_by: user.id,
      schema_version: 1,
    };

    // ── 5. Persiste no node
    const newMetadata = { ...(node.metadata as Record<string, unknown> | null ?? {}), prefill: payload };
    const { error: updErr } = await supabase
      .from("canvas_nodes")
      .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
      .eq("id", nodeId);
    if (updErr) {
      console.error("update error:", updErr);
      // Não falha — devolve o payload mesmo assim
    }

    return jsonResponse({ prefill: payload, cached: false });
  } catch (e) {
    console.error("prefill-node error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
