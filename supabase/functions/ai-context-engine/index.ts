/**
 * ai-context-engine v2 — motor unificado de IA com Gemini direto.
 *
 * Todos os outros edge functions (chat, orb, prefill) usam este.
 * Reúne contexto completo do cliente/workspace/node e chama Gemini.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gemini-2.5-pro": { input: 1.25, output: 10.00 },
  "gemini-2.5-flash": { input: 0.30, output: 2.50 },
  "gemini-2.5-flash-lite": { input: 0.10, output: 0.40 },
};

function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const p = MODEL_PRICING[model];
  if (!p) return 0;
  return (inputTokens / 1_000_000) * p.input + (outputTokens / 1_000_000) * p.output;
}

interface RequestBody {
  scope: "workspace" | "node" | "client" | "flow";
  clientId?: string;
  workspaceId?: string;
  nodeId?: string;
  connectedNodeIds?: string[];
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  agentSystemPrompt: string;
  agentId: string;
  model?: string;
  feature: string;
  responseFormat?: "text" | "json";
  temperature?: number;
}

async function buildContext(supabase: any, body: RequestBody) {
  const parts: string[] = [];
  const stats: Record<string, number> = {
    nodes: 0, connected_nodes: 0, context_entries: 0,
    timeline_events: 0, metric_snapshots: 0, briefings: 0,
  };

  // CLIENTE
  if (body.clientId) {
    const { data: client } = await supabase.from("clients")
      .select("id, name, company_name, segment, plan_name, project_type, website, instagram, notes, metadata")
      .eq("id", body.clientId).maybeSingle();
    if (client) {
      parts.push(`# CLIENTE: ${client.name}`);
      if (client.company_name) parts.push(`Empresa: ${client.company_name}`);
      if (client.segment) parts.push(`Segmento: ${client.segment}`);
      parts.push(`Plano: ${client.plan_name ?? "—"}`);
      if (client.project_type) parts.push(`Tipo: ${client.project_type}`);
      if (client.website) parts.push(`Site: ${client.website}`);
      if (client.notes) parts.push(`Notas: ${client.notes}`);
      const eb = client.metadata?.essential_briefing;
      if (eb && typeof eb === "object") {
        parts.push(`\n## BRIEFING ESSENCIAL`);
        ["positioning", "differential", "icp", "main_pains", "goals_12m", "success_metric", "revenue_range", "team_size", "maturity_digital", "ai_readiness"].forEach(k => {
          if (eb[k]) parts.push(`— ${k}: ${eb[k]}`);
        });
      }
    }
  }

  // WORKSPACE
  if (body.workspaceId) {
    const { data: ws } = await supabase.from("workspaces")
      .select("id, name, status, current_stage, summary, project_type, metadata")
      .eq("id", body.workspaceId).maybeSingle();
    if (ws) {
      parts.push(`\n# WORKSPACE: ${ws.name}`);
      parts.push(`Status: ${ws.status} | Etapa: ${ws.current_stage}`);
      if (ws.summary) parts.push(`\n## RESUMO\n${ws.summary}`);
    }
  }

  // DOSSIÊ
  if (body.clientId) {
    const { data: contexts } = await supabase.from("context_entries")
      .select("context_type, title, content, tags, created_at")
      .eq("client_id", body.clientId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (contexts?.length) {
      stats.context_entries = contexts.length;
      parts.push(`\n# DOSSIÊ (${contexts.length} entradas)`);
      for (const c of contexts.slice(0, 20)) {
        parts.push(`— [${c.context_type}] ${c.title}: ${String(c.content ?? "").slice(0, 400)}`);
      }
    }
  }

  // NODES
  if (body.workspaceId) {
    const { data: nodes } = await supabase.from("canvas_nodes")
      .select("id, title, node_type, description, status, data")
      .eq("workspace_id", body.workspaceId).limit(100);
    if (nodes?.length) {
      stats.nodes = nodes.length;
      parts.push(`\n# CANVAS (${nodes.length} nodes)`);
      const byKind: Record<string, any[]> = {};
      for (const n of nodes) {
        const k = (n.data as any)?.kind ?? n.node_type;
        if (!byKind[k]) byKind[k] = [];
        byKind[k].push(n);
      }
      for (const [kind, list] of Object.entries(byKind)) {
        parts.push(`\n## ${kind} (${list.length})`);
        for (const n of (list as any[]).slice(0, 12)) {
          const icon = n.status === "done" || n.status === "concluido" ? "✓" : n.status === "active" ? "▸" : "○";
          const desc = n.description ? ` — ${String(n.description).slice(0, 200)}` : "";
          parts.push(`${icon} ${n.title}${desc}`);
        }
      }
    }

    // NODES CONECTADOS
    if (body.nodeId) {
      const { data: edges } = await supabase.from("canvas_edges")
        .select("source_node_id, target_node_id, label")
        .eq("workspace_id", body.workspaceId)
        .or(`source_node_id.eq.${body.nodeId},target_node_id.eq.${body.nodeId}`);
      if (edges?.length) {
        const ids = new Set<string>();
        for (const e of edges) {
          if (e.source_node_id !== body.nodeId) ids.add(e.source_node_id);
          if (e.target_node_id !== body.nodeId) ids.add(e.target_node_id);
        }
        if (ids.size > 0) {
          const { data: cnodes } = await supabase.from("canvas_nodes")
            .select("id, title, node_type, description, data")
            .in("id", Array.from(ids));
          if (cnodes?.length) {
            stats.connected_nodes = cnodes.length;
            parts.push(`\n# NODES CONECTADOS (${cnodes.length})`);
            for (const cn of cnodes) {
              const kind = (cn.data as any)?.kind ?? cn.node_type;
              const desc = cn.description ? ` — ${String(cn.description).slice(0, 250)}` : "";
              parts.push(`[${kind}] ${cn.title}${desc}`);
              // Inclui dados específicos do node
              if (cn.data && typeof cn.data === "object") {
                const details: string[] = [];
                for (const [k, v] of Object.entries(cn.data)) {
                  if (typeof v === "string" && v.length > 0 && v.length < 300 && k !== "kind") {
                    details.push(`  ${k}: ${v}`);
                  }
                }
                if (details.length > 0) parts.push(details.slice(0, 6).join("\n"));
              }
            }
          }
        }
      }
    }
  }

  // TIMELINE
  if (body.workspaceId) {
    const { data: timeline } = await supabase.from("timeline_events")
      .select("event_type, title, description, happened_at")
      .eq("workspace_id", body.workspaceId)
      .order("happened_at", { ascending: false }).limit(20);
    if (timeline?.length) {
      stats.timeline_events = timeline.length;
      parts.push(`\n# TIMELINE (${timeline.length})`);
      for (const e of timeline.slice(0, 15)) {
        const date = new Date(e.happened_at).toLocaleDateString("pt-BR");
        parts.push(`[${date}] ${e.title}${e.description ? `: ${String(e.description).slice(0, 150)}` : ""}`);
      }
    }
  }

  // MÉTRICAS
  if (body.workspaceId || body.clientId) {
    const q = supabase.from("metric_snapshots")
      .select("metric_name, value, unit, captured_at")
      .order("captured_at", { ascending: true });
    const { data: snaps } = body.workspaceId ? await q.eq("workspace_id", body.workspaceId) : await q.eq("client_id", body.clientId);
    if (snaps?.length) {
      stats.metric_snapshots = snaps.length;
      parts.push(`\n# MÉTRICAS (${snaps.length})`);
      const byM: Record<string, any[]> = {};
      for (const s of snaps) {
        if (!byM[s.metric_name]) byM[s.metric_name] = [];
        byM[s.metric_name].push(s);
      }
      for (const [name, list] of Object.entries(byM)) {
        const f = (list as any[])[0];
        const l = (list as any[])[(list as any[]).length - 1];
        const u = f.unit ? ` ${f.unit}` : "";
        if ((list as any[]).length === 1) {
          parts.push(`— ${name}: ${f.value}${u}`);
        } else {
          const delta = l.value - f.value;
          const pct = f.value !== 0 ? ((delta / f.value) * 100).toFixed(1) : "—";
          parts.push(`— ${name}: ${f.value}${u} → ${l.value}${u} (${delta >= 0 ? "+" : ""}${pct}%)`);
        }
      }
    }
  }

  return { contextString: parts.join("\n"), stats };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const body = await req.json() as RequestBody;
    if (!body.message || !body.agentSystemPrompt) {
      return new Response(JSON.stringify({ error: "message e agentSystemPrompt obrigatórios" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { contextString, stats } = await buildContext(supabase, body);

    const contents: any[] = [];
    if (body.history) {
      for (const h of body.history) {
        contents.push({ role: h.role === "assistant" ? "model" : "user", parts: [{ text: h.content }] });
      }
    }
    const userMessage = contextString ? `${contextString}\n\n---\n\n${body.message}` : body.message;
    contents.push({ role: "user", parts: [{ text: userMessage }] });

    const modelToUse = body.model || "gemini-2.5-flash";
    const generationConfig: any = {
      temperature: body.temperature ?? 0.7,
      maxOutputTokens: 8192,
    };
    if (body.responseFormat === "json") generationConfig.responseMimeType = "application/json";

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${GEMINI_API_KEY}`;
    const geminiRes = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: body.agentSystemPrompt }] },
        generationConfig,
      }),
    });

    // Fallback pra Flash se Pro falhar
    let finalRes = geminiRes;
    let finalModel = modelToUse;
    if (!geminiRes.ok && modelToUse.includes("pro")) {
      const fbUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const fb = await fetch(fbUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents, systemInstruction: { parts: [{ text: body.agentSystemPrompt }] }, generationConfig }),
      });
      if (fb.ok) { finalRes = fb; finalModel = "gemini-2.5-flash"; }
    }

    if (!finalRes.ok) {
      const errText = await finalRes.text();
      return new Response(JSON.stringify({
        error: "Gemini API failed",
        status: finalRes.status,
        detail: errText.slice(0, 300),
      }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const data = await finalRes.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "Sem resposta.";
    const usage = data.usageMetadata ?? {};
    const inputTokens = usage.promptTokenCount ?? 0;
    const outputTokens = usage.candidatesTokenCount ?? 0;
    const costUsd = calculateCost(finalModel, inputTokens, outputTokens);

    // Log de uso
    try {
      await supabase.from("ai_usage_log").insert({
        client_id: body.clientId ?? null,
        workspace_id: body.workspaceId ?? null,
        feature: body.feature,
        model_used: finalModel,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        cost_usd: costUsd,
        status: "success",
        metadata: { agent_id: body.agentId, context_stats: stats },
      });
    } catch { /* não bloqueia */ }

    return new Response(JSON.stringify({
      answer,
      model_used: finalModel,
      tokens: { input: inputTokens, output: outputTokens },
      cost_usd: costUsd,
      context_stats: stats,
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
