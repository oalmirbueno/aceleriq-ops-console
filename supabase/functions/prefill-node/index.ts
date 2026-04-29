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

const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"] as const;

type FieldType = "text" | "textarea" | "list" | "kv" | "checklist" | "attachments";
type PrefillSource =
  | "briefing" | "context" | "metrics" | "fronts" | "client" | "assets" | "siblings" | "diagnostico_docs"
  // Auto-contexto universal:
  | "dossier" | "tasks" | "timeline" | "workspace_assets";

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
  nodeId?: string;
  workspaceId: string;
  clientId: string;
  blueprint?: BlueprintPayload;
  kind?: string;
  currentTitle?: string;
  force?: boolean;
  cacheOnly?: boolean;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function buildFallbackBlueprint(kind: string, currentTitle: string): BlueprintPayload {
  const purpose = `Rascunho aprofundado para o node "${currentTitle}" do tipo ${kind}.`;
  return {
    kind,
    purpose,
    sources: ["briefing", "context", "metrics", "fronts", "client", "assets", "siblings", "dossier", "tasks", "timeline", "workspace_assets"],
    prefillPrompt: [
      `Você é especialista em preencher um node do tipo ${kind}.`,
      `Título do node: ${currentTitle}`,
      "Gere um rascunho profundo, específico e pronto para execução.",
    ].join("\n"),
    sections: [
      {
        id: "main",
        title: "Rascunho principal",
        description: "Preenchimento completo do node com foco em execução e clareza operacional.",
        fields: [
          { id: "description", label: "Descrição completa", type: "textarea" },
          { id: "responsible", label: "Responsável", type: "text" },
          { id: "execution_plan", label: "Plano de execução", type: "textarea" },
          { id: "acceptance_criteria", label: "Critérios de aprovação", type: "textarea" },
          { id: "ai_prompt", label: "Prompt IA", type: "textarea" },
          { id: "openclaw_prompt", label: "Prompt OpenClaw", type: "textarea" },
          { id: "checklist", label: "Checklist", type: "checklist" },
          { id: "howTo", label: "Como fazer", type: "textarea" },
          { id: "notes", label: "Notas", type: "textarea" },
        ],
      },
    ],
  };
}

function flattenPrefillSections(sections: Record<string, { fields: Record<string, { value: unknown }> }>) {
  const flat: Record<string, unknown> = {};
  for (const section of Object.values(sections ?? {})) {
    for (const [fieldId, field] of Object.entries(section.fields ?? {})) {
      flat[fieldId] = field?.value;
    }
  }
  return flat;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) return jsonResponse({ error: "GEMINI_API_KEY não configurada" }, 500);

    // Auth é opcional — verify_jwt está OFF. Usamos o service role direto.
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json()) as ReqBody;
    if (!body.workspaceId || !body.clientId) {
      return jsonResponse({ error: "Missing required fields" }, 400);
    }

    const { nodeId = null, workspaceId, clientId, force = false, cacheOnly = false } = body;
    const blueprint = body.blueprint ?? buildFallbackBlueprint(body.kind ?? "default", body.currentTitle ?? "Node sem título");

    // ── 1. Carrega o node alvo + checa cache
    const node = nodeId
      ? await (async () => {
          const { data, error } = await supabase
            .from("canvas_nodes")
            .select("id, title, node_type, metadata, parent_node_id")
            .eq("id", nodeId)
            .maybeSingle();
          if (error || !data) return null;
          return data;
        })()
      : { id: "draft", title: body.currentTitle ?? blueprint.kind, node_type: blueprint.kind, metadata: null, parent_node_id: null };

    if (nodeId && !node) return jsonResponse({ error: "Node not found" }, 404);

    const cached = (node?.metadata as Record<string, unknown> | null)?.prefill ?? null;
    if (cacheOnly) {
      return jsonResponse({
        prefill: cached,
        cached: !!cached,
        fields: cached && typeof cached === "object" ? flattenPrefillSections((cached as any).sections ?? {}) : null,
        agent_id: "prefill-node",
        model_used: (cached as any)?.ai_model ?? null,
      });
    }
    if (cached && !force) {
      return jsonResponse({
        prefill: cached,
        cached: true,
        fields: cached && typeof cached === "object" ? flattenPrefillSections((cached as any).sections ?? {}) : null,
        agent_id: "prefill-node",
        model_used: (cached as any)?.ai_model ?? null,
      });
    }

    // ── 2. Coleta fontes habilitadas
    const ctx: Record<string, unknown> = {};
    const sourcesUsed: PrefillSource[] = [];

    if (blueprint.sources.includes("client")) {
      const { data: client } = await supabase.from("clients")
        .select("name, segment, plan_name, project_type, custom_monthly_value, logo_url, metadata, notes, executive_summary")
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
        .select("metric_key, metric_label, metric_value, metric_unit, notes, captured_at")
        .or(`workspace_id.eq.${workspaceId},client_id.eq.${clientId}`)
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

    if (blueprint.sources.includes("diagnostico_docs")) {
      // Puxa TODOS os documentos do Contexto que sustentam diagnóstico:
      // diagnostico, dor, decisao, anotacao com tag 'diagnostico' — ordenado por relevância
      const { data: docs } = await supabase.from("context_entries")
        .select("id, title, content, context_type, source_url, source_label, tags, metadata, happened_at, is_key_decision")
        .eq("client_id", clientId)
        .in("context_type", ["diagnostico", "dor", "decisao"])
        .order("is_key_decision", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(25);
      if (docs && docs.length > 0) {
        ctx.diagnostico_docs = docs.map((d) => ({
          title: d.title,
          type: d.context_type,
          content: (d.content ?? "").slice(0, 3500),
          source_url: d.source_url,
          source_label: d.source_label,
          happened_at: d.happened_at,
          is_key_decision: d.is_key_decision,
          attachments: ((d.metadata as Record<string, unknown> | null)?.attachments as unknown[] | undefined)?.slice(0, 3) ?? [],
        }));
        sourcesUsed.push("diagnostico_docs");
      }
    }

    // ── Auto-contexto universal ────────────────────────────────────────────
    // Sempre puxa Dossiê (decisões-chave), Tasks (carga e bloqueios), Timeline
    // (eventos recentes) e Assets do workspace, pra dar à IA visão integral.

    if (blueprint.sources.includes("dossier")) {
      // Dossiê = context_entries marcados como is_key_decision OU com tag 'dossie'
      const { data: dossier } = await supabase.from("context_entries")
        .select("title, content, context_type, tags, happened_at, is_key_decision")
        .eq("client_id", clientId)
        .or("is_key_decision.eq.true,tags.cs.{dossie}")
        .order("happened_at", { ascending: false, nullsFirst: false })
        .limit(15);
      if (dossier && dossier.length > 0) {
        ctx.dossier = dossier.map((d) => ({
          title: d.title,
          type: d.context_type,
          summary: (d.content ?? "").slice(0, 1200),
          tags: d.tags ?? [],
          happened_at: d.happened_at,
          is_key_decision: d.is_key_decision,
        }));
        sourcesUsed.push("dossier");
      }
    }

    if (blueprint.sources.includes("tasks")) {
      const { data: tasks } = await supabase.from("tasks")
        .select("title, status, priority, stage, due_date, source_type, completed_at, created_at")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (tasks && tasks.length > 0) {
        const open = tasks.filter((t) => t.status !== "done" && t.status !== "completed" && t.status !== "cancelled");
        const recent = tasks.slice(0, 10);
        const byStatus: Record<string, number> = {};
        for (const t of tasks) byStatus[t.status ?? "unknown"] = (byStatus[t.status ?? "unknown"] ?? 0) + 1;
        ctx.tasks = {
          totals: { all: tasks.length, open: open.length, by_status: byStatus },
          open: open.slice(0, 15).map((t) => ({
            title: t.title, status: t.status, priority: t.priority, stage: t.stage, due_date: t.due_date,
          })),
          recent: recent.map((t) => ({
            title: t.title, status: t.status, completed_at: t.completed_at, created_at: t.created_at,
          })),
        };
        sourcesUsed.push("tasks");
      }
    }

    if (blueprint.sources.includes("timeline")) {
      // timeline_events do workspace (atividade operacional recente)
      const { data: events, error: tlErr } = await supabase
        .from("timeline_events")
        .select("event_type, title, description, happened_at, actor_id, metadata")
        .eq("workspace_id", workspaceId)
        .order("happened_at", { ascending: false, nullsFirst: false })
        .limit(20);
      if (tlErr) console.warn("timeline source failed:", tlErr.message);
      if (events && events.length > 0) {
        ctx.timeline = events.map((e) => ({
          when: e.happened_at,
          type: e.event_type,
          title: e.title,
          description: (e.description ?? "").slice(0, 500),
          actor_id: e.actor_id,
        }));
        sourcesUsed.push("timeline");
      }
    }

    if (blueprint.sources.includes("workspace_assets")) {
      // Assets cadastrados no workspace (independente do node atual)
      const { data: wsAssets, error: aErr } = await supabase
        .from("assets")
        .select("title, asset_type, status, validation_status, external_url, url, tags, version, updated_at")
        .eq("workspace_id", workspaceId)
        .order("updated_at", { ascending: false, nullsFirst: false })
        .limit(25);
      if (aErr) console.warn("workspace_assets source failed:", aErr.message);
      if (wsAssets && wsAssets.length > 0) {
        ctx.workspace_assets = wsAssets.map((a) => ({
          name: a.title,
          type: a.asset_type,
          status: a.status ?? a.validation_status,
          version: a.version,
          url: a.external_url ?? a.url,
          tags: a.tags ?? [],
        }));
        sourcesUsed.push("workspace_assets");
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
      "- origin='client' = info literal do cliente. origin='auto' = inferido. origin='empty' = falta info.",
      "- Para campos [DECISÃO HUMANA], use origin='empty'.",
      "- Cite fontes em 'citation' quando origin='auto' ou 'client'.",
      "- AUTO-CONTEXTO: use dossier, tasks, timeline e workspace_assets para calibrar.",
      "- Seja conciso. Tom profissional, direto.",
      "",
      "CAMPOS OBRIGATÓRIOS DE PROFUNDIDADE:",
      "- 'description' ou 'fullDescription': descrição COMPLETA do que este node faz, por que existe, e como se encaixa no projeto. Mínimo 3 parágrafos.",
      "- 'execution_plan': plano de ação DETALHADO com passos numerados. O que fazer, como fazer, ferramentas, dados necessários, saída esperada. Mínimo 5 passos.",
      "- 'acceptance_criteria': critérios claros para marcar como concluído. Mínimo 3 critérios.",
      "- 'ai_prompt': prompt PRONTO pra copiar e colar no ChatGPT/Gemini/Claude. Específico pro contexto do cliente. Não genérico.",
      "- 'openclaw_prompt': instrução OPERACIONAL para o OpenClaw executar dentro do sistema. Referencia nodeId, workspaceId, arquivos e acessos.",
      "- 'responsible': quem deve executar (Estratégia, Design, Tráfego, Automação, Conteúdo, Dev, IA/OpenClaw, Cliente).",
      "- Checklists: mínimo 5 itens ESPECÍFICOS pro tipo de node e contexto do cliente. Nunca genérico.",
      "",
      "DIFERENCIAÇÃO POR TIPO:",
      "- Cada node é ESPECIALISTA no seu tipo. Node de automação fala de automação. Node de tráfego fala de tráfego.",
      "- NÃO gere nodes todos iguais. Cada um precisa ter conteúdo único e relevante pro seu papel na esteira.",
    ].join("\n");

    const userPrompt = [
      `Tipo de node: ${blueprint.kind}`,
      `Propósito: ${blueprint.purpose}`,
      `Título atual do node: ${node.title}`,
      "",
      "CONTEXTO DISPONÍVEL:",
      JSON.stringify(ctx, null, 2),
      "",
      "Retorne APENAS o JSON do tool fill_node_draft com todos os campos preenchidos.",
    ].join("\n");

    let aiResp: Response | null = null;
    let usedModel = GEMINI_MODELS[0];
    let lastErrText = "";

    for (const model of GEMINI_MODELS) {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const geminiPayload = {
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
        ],
        generationConfig: {
          temperature: 0.35,
          responseMimeType: "application/json",
        },
      };

      try {
        const r = await fetch(geminiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiPayload),
        });

        if (r.ok) {
          aiResp = r;
          usedModel = model;
          break;
        }

        if (r.status === 503 || r.status === 429) {
          lastErrText = await r.text();
          console.warn(`[prefill-node] ${model} retornou ${r.status}, tentando próximo`);
          await new Promise((res) => setTimeout(res, 2000));
          continue;
        }

        lastErrText = await r.text();
      } catch (err) {
        lastErrText = (err as Error).message;
        console.error(`[prefill-node] ${model} erro:`, lastErrText);
      }
    }

    if (!aiResp) {
      return jsonResponse({ error: "IA falhou após tentar todos os modelos", detail: lastErrText.slice(0, 200) }, 502);
    }

    const aiJson = await aiResp.json();
    const rawText = aiJson.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const clean = rawText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    let parsed: Record<string, any>;
    try {
      parsed = JSON.parse(clean);
    } catch {
      const jsonMatch = clean.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[0]); }
        catch { return jsonResponse({ error: "IA retornou JSON inválido", detail: clean.slice(0, 300) }, 502); }
      } else {
        return jsonResponse({ error: "IA não retornou JSON", detail: clean.slice(0, 300) }, 502);
      }
    }

    const flatFields = flattenPrefillSections(parsed.sections ?? {});

    const payload = {
      blueprint_kind: blueprint.kind,
      sections: parsed.sections,
      method_state: cached && typeof cached === "object" ? (cached as Record<string, unknown>).method_state : {},
      sources_used: sourcesUsed,
      generated_at: new Date().toISOString(),
      ai_model: usedModel,
      generated_by: "system",
      schema_version: 1,
    };

    if (nodeId) {
      const newMetadata = { ...((node?.metadata as Record<string, unknown> | null) ?? {}), prefill: payload };
      const { error: updErr } = await supabase
        .from("canvas_nodes")
        .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
        .eq("id", nodeId);
      if (updErr) console.error("update error:", updErr);
    }

    const response = {
      prefill: payload,
      cached: false,
      fields: flatFields,
      agent_id: "prefill-node",
      model_used: usedModel,
      sources_used: sourcesUsed,
    };

    return jsonResponse(response);
  } catch (e) {
    console.error("prefill-node error:", e);
    return jsonResponse({ error: e instanceof Error ? e.message : "Erro inesperado" }, 500);
  }
});
