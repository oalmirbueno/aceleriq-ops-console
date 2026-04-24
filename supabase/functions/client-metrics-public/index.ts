/**
 * client-metrics-public — expõe métricas do cliente para o portal mostrar ao próprio cliente.
 * NÃO retorna: Health Score, ICP-Fit, notas internas.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

const AI_WEIGHTS: Record<string, number> = {
  ia: 2.0, agente: 2.0, ai_orb: 2.0,
  automacao: 1.5, integracao: 1.3, metrica: 1.2,
};
const AI_TARGETS: Record<string, number> = { starter: 15, growth: 50, enterprise: 85 };

function nodeKind(n: { node_type: string; data?: Record<string, unknown> | null }): string {
  if (n.node_type === "ai_orb") return "ai_orb";
  const d = (n.data as Record<string, unknown> | null) ?? {};
  return (d.kind as string) ?? n.node_type;
}

function calculateAIFirst(nodes: any[], planName: string | null) {
  const op = nodes.filter((n) => n.node_type !== "client" && n.node_type !== "front");
  const target = (planName && AI_TARGETS[planName]) ?? AI_TARGETS.starter;
  if (op.length === 0) return { score: 0, target, totalNodes: 0, aiNodes: 0, automationNodes: 0, status: "no_data" };
  let aiPoints = 0, totalPoints = 0, aiNodes = 0, automationNodes = 0;
  for (const n of op) {
    const k = nodeKind(n);
    const w = AI_WEIGHTS[k] ?? 1.0;
    totalPoints += 1;
    if (w > 1) aiPoints += w;
    if (["ia", "agente", "ai_orb"].includes(k)) aiNodes += 1;
    if (k === "automacao") automationNodes += 1;
  }
  const score = Math.min(100, Math.round((aiPoints / totalPoints) * 50));
  const delta = score - target;
  const status = delta >= 5 ? "above" : delta >= -10 ? "on_track" : "below";
  return { score, target, totalNodes: op.length, aiNodes, automationNodes, status };
}

const INVERTED_HINTS = ["custo","cost","cpl","cpa","cpc","tempo","time","ciclo","churn","bounce","abandono"];
function isInverted(name: string) {
  return INVERTED_HINTS.some((h) => name.toLowerCase().includes(h));
}

function computeBeforeAfter(snapshots: any[]) {
  const byMetric = new Map<string, any[]>();
  for (const s of snapshots) {
    const k = s.metric_name.trim().toLowerCase();
    if (!byMetric.has(k)) byMetric.set(k, []);
    byMetric.get(k)!.push(s);
  }
  const results: any[] = [];
  for (const [, list] of byMetric) {
    if (list.length < 2) continue;
    const sorted = list.slice().sort((a, b) =>
      new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );
    const baseline = sorted[0];
    const current = sorted[sorted.length - 1];
    const delta = current.value - baseline.value;
    const deltaPct = baseline.value !== 0 ? (delta / Math.abs(baseline.value)) * 100 : null;
    const inverted = isInverted(current.metric_name);
    let status: string;
    if (Math.abs(deltaPct ?? 0) < 2) status = "stable";
    else if ((delta > 0 && !inverted) || (delta < 0 && inverted)) status = "improved";
    else status = "regressed";
    results.push({
      metric_name: current.metric_name,
      unit: current.unit,
      baseline_value: baseline.value,
      current_value: current.value,
      delta, deltaPct, status,
      baseline_date: baseline.captured_at,
      current_date: current.captured_at,
    });
  }
  return results.sort((a: any, b: any) => {
    const order: Record<string, number> = { improved: 0, stable: 1, regressed: 2 };
    return (order[a.status] ?? 3) - (order[b.status] ?? 3);
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  if (SECRET && req.headers.get("x-webhook-secret") !== SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }
  try {
    const { portal_client_id } = await req.json();
    if (!portal_client_id) {
      return new Response(JSON.stringify({ error: "portal_client_id obrigatório" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { data: client } = await supabase
      .from("clients")
      .select("id, name, company_name, plan_name, status, current_stage")
      .eq("portal_client_id", portal_client_id)
      .maybeSingle();
    if (!client) {
      return new Response(JSON.stringify({ error: "Cliente não vinculado ao portal" }),
        { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const [nodesRes, snapshotsRes, casesRes, workspacesRes] = await Promise.all([
      supabase.from("canvas_nodes").select("node_type, data, status").eq("client_id", client.id),
      supabase.from("metric_snapshots").select("metric_name, value, unit, captured_at").eq("client_id", client.id).order("captured_at"),
      supabase.from("case_records").select("id, title, summary, status, updated_at").eq("client_id", client.id).eq("status", "approved"),
      supabase.from("workspaces").select("id, current_stage").eq("client_id", client.id),
    ]);
    const nodes = (nodesRes.data ?? []) as any[];
    const aiFirst = calculateAIFirst(nodes, client.plan_name as string | null);
    const snapshots = (snapshotsRes.data ?? []) as any[];
    const beforeAfter = computeBeforeAfter(snapshots);
    const STAGES = ["entrada","diagnostico","estrutura_base","planejamento","producao","ativacao","otimizacao","expansao"];
    const ws = (workspacesRes.data ?? [])[0];
    const stageIdx = ws ? STAGES.indexOf(ws.current_stage as string) : 0;
    const progressPct = Math.round(((stageIdx + 1) / STAGES.length) * 100);
    const deliveredCount = nodes.filter((n) => n.status === "done" || n.status === "concluido").length;

    return new Response(JSON.stringify({
      client: {
        id: client.id,
        name: client.name,
        company_name: client.company_name,
        plan_name: client.plan_name,
        current_stage: ws?.current_stage ?? client.current_stage,
      },
      ai_first_score: aiFirst,
      before_after: {
        metrics: beforeAfter,
        improved_count: beforeAfter.filter((m: any) => m.status === "improved").length,
        stable_count: beforeAfter.filter((m: any) => m.status === "stable").length,
      },
      cases_approved: casesRes.data ?? [],
      journey: {
        current_stage: ws?.current_stage ?? "entrada",
        stage_index: stageIdx + 1,
        total_stages: STAGES.length,
        progress_pct: progressPct,
        delivered_count: deliveredCount,
      },
    }), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "erro" }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
