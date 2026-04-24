/**
 * receive-portal-sync — recebe projects + briefings + milestones + files + updates
 * do portal aceleriq.online e cria/atualiza no Ops automaticamente.
 *
 * Fluxo:
 *   1. Portal chama esta função com payload contendo { type, data }
 *   2. Ops cria/atualiza registros locais usando upsert
 *   3. Ops liga com client correspondente via portal_client_id
 *
 * Tipos suportados:
 *   - "project" → cria workspace no Ops
 *   - "briefing" → atualiza essential_briefing do cliente
 *   - "milestone" → cria/atualiza timeline_event
 *   - "file" → registra como file metadata
 *   - "update" → cria timeline_event
 *   - "task" → (futuro) cria canvas_node do tipo task
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// Mapeamento de project_type do portal -> project_type do Ops
function inferOpsType(portalType: string | null): string {
  const t = (portalType ?? "").toLowerCase();
  if (t.includes("site") || t.includes("website")) return "one_shot_site";
  if (t.includes("auto")) return "one_shot_automation";
  if (t.includes("agent") || t.includes("bot") || t.includes("ia") || t.includes("chatbot")) return "one_shot_agent";
  if (t.includes("market") || t.includes("trafego") || t.includes("ads") || t.includes("social")) return "marketing_service";
  if (t.includes("legacy") || t.includes("legado")) return "legacy_marketing";
  return "ai_first";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const received = req.headers.get("x-webhook-secret");
  if (!SECRET || received !== SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const { type, data } = body as { type: string; data: Record<string, unknown> };

    if (!type || !data) {
      return new Response(JSON.stringify({ error: "type e data são obrigatórios" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ─── PROJECT ──────────────────────────────────────────────
    if (type === "project") {
      const portalProjectId = data.id as string;
      const portalClientId = data.client_id as string;

      // Busca cliente no Ops via portal_client_id
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("portal_client_id", portalClientId)
        .maybeSingle();

      if (!client) {
        return new Response(JSON.stringify({
          error: "Cliente não vinculado",
          hint: `O profile ${portalClientId} no portal não está vinculado a nenhum cliente no Ops. Vincule primeiro.`,
        }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const opsType = inferOpsType(data.project_type as string | null);

      // Upsert por portal_project_id
      const { data: existing } = await supabase
        .from("workspaces")
        .select("id")
        .eq("portal_project_id", portalProjectId)
        .maybeSingle();

      if (existing) {
        // Update existente
        const { error } = await supabase.from("workspaces")
          .update({
            name: data.name as string,
            status: (data.status as string) ?? "setup",
            summary: (data.description as string) ?? null,
            updated_at: new Date().toISOString(),
            metadata: {
              portal_sync: {
                portal_project_id: portalProjectId,
                portal_project_type: data.project_type,
                portal_progress: data.progress,
                portal_scope: data.scope,
                portal_objectives: data.objectives,
                portal_start_date: data.start_date,
                portal_deadline: data.deadline,
                last_synced_at: new Date().toISOString(),
              },
            },
          })
          .eq("id", existing.id);
        if (error) throw error;
        return new Response(JSON.stringify({ ok: true, action: "updated", workspace_id: existing.id }),
          { headers: { ...cors, "Content-Type": "application/json" } });
      } else {
        // Insert novo
        const { data: ws, error } = await supabase.from("workspaces")
          .insert({
            client_id: client.id,
            name: data.name as string,
            status: (data.status as string) ?? "setup",
            current_stage: "entrada",
            summary: (data.description as string) ?? null,
            portal_project_id: portalProjectId,
            project_type: opsType,
            metadata: {
              portal_sync: {
                portal_project_id: portalProjectId,
                portal_project_type: data.project_type,
                portal_progress: data.progress,
                portal_scope: data.scope,
                portal_objectives: data.objectives,
                portal_start_date: data.start_date,
                portal_deadline: data.deadline,
                last_synced_at: new Date().toISOString(),
              },
            },
          })
          .select("id")
          .single();
        if (error) throw error;
        return new Response(JSON.stringify({ ok: true, action: "created", workspace_id: ws?.id }),
          { headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    // ─── BRIEFING ─────────────────────────────────────────────
    if (type === "briefing") {
      const portalClientId = data.client_id as string;
      const responses = data.responses as Record<string, unknown>;

      const { data: client } = await supabase
        .from("clients")
        .select("id, metadata")
        .eq("portal_client_id", portalClientId)
        .maybeSingle();

      if (!client) {
        return new Response(JSON.stringify({ error: "Cliente não vinculado" }),
          { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const currentMeta = (client.metadata as Record<string, unknown>) ?? {};
      const currentEb = (currentMeta.essential_briefing as Record<string, unknown>) ?? {};

      // Merge respostas do briefing no essential_briefing (sem sobrescrever campos já preenchidos manualmente)
      const merged = { ...responses, ...currentEb, last_portal_briefing_sync: new Date().toISOString() };

      const { error } = await supabase.from("clients")
        .update({ metadata: { ...currentMeta, essential_briefing: merged } })
        .eq("id", client.id);
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, action: "merged" }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── MILESTONE → TIMELINE ─────────────────────────────────
    if (type === "milestone" || type === "update") {
      const portalProjectId = data.project_id as string;

      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, client_id")
        .eq("portal_project_id", portalProjectId)
        .maybeSingle();

      if (!ws) {
        return new Response(JSON.stringify({ error: "Workspace não encontrado pro project_id do portal" }),
          { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
      }

      const title = type === "milestone" ? (data.title as string) : "Update do portal";
      const description = (data.description as string) ?? (data.message as string) ?? null;
      const happenedAt = (data.target_date as string) ?? (data.created_at as string) ?? new Date().toISOString();

      const { error } = await supabase.from("timeline_events").insert({
        workspace_id: ws.id,
        client_id: ws.client_id,
        event_type: type === "milestone" ? "portal_milestone" : "portal_update",
        title,
        description,
        happened_at: happenedAt,
        metadata: { source: "portal_sync", portal_id: data.id },
      });
      if (error) throw error;

      return new Response(JSON.stringify({ ok: true, action: "timeline_event_created" }),
        { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── Tipo desconhecido ────────────────────────────────────
    return new Response(JSON.stringify({ error: `Tipo "${type}" não suportado` }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
