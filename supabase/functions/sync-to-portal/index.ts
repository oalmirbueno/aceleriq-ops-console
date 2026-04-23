/**
 * sync-to-portal — envia eventos do Ops para o webhook do aceleriq.online
 *
 * Portal URL: https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook
 * Payload: { event, data }
 *
 * Eventos:
 *  - file_approved   → data: { client_id, uploaded_by, file_url, file_name, project_id?, folder?, file_type?, description? }
 *  - node_completed  → data: { project_id, author_id, message, update_type? }
 *  - stage_advanced  → data: { project_id, author_id, message }
 *
 * Env vars necessárias no Ops Supabase:
 *  - PORTAL_WEBHOOK_URL  = https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook
 *  - PORTAL_WEBHOOK_SECRET = (mesmo valor configurado no portal como OPS_WEBHOOK_SECRET)
 *  - PORTAL_ADMIN_USER_ID  = profile.id do admin no portal (author_id dos updates)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function sendToPortal(
  url: string,
  secret: string | undefined,
  event: string,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (secret) headers["x-webhook-secret"] = secret;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ event, data }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL        = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY         = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PORTAL_URL          = Deno.env.get("PORTAL_WEBHOOK_URL") ?? "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-webhook";
  const PORTAL_SECRET       = Deno.env.get("PORTAL_WEBHOOK_SECRET");
  const PORTAL_ADMIN_ID     = Deno.env.get("PORTAL_ADMIN_USER_ID") ?? "";

  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json() as {
      event: string;
      workspaceId: string;
      clientId: string;
      assetId?: string;
      nodeId?: string;
      stage?: string;
      message?: string;
    };

    // ── Busca IDs do portal vinculados ao workspace/client ──────────────
    const { data: ws } = await db
      .from("workspaces")
      .select("id, name, current_stage, portal_project_id, clients(id, name, portal_client_id)")
      .eq("id", body.workspaceId)
      .single();

    const portalProjectId = ws?.portal_project_id as string | null;
    const portalClientId  = (ws?.clients as any)?.portal_client_id as string | null;

    if (!portalClientId) {
      return json({ skipped: true, reason: "portal_client_id not set on client — link the client first" });
    }

    // ── Monta payload por evento ────────────────────────────────────────

    let event = body.event;
    let data: Record<string, unknown> = {};

    if (event === "file_approved" && body.assetId) {
      const { data: asset } = await db
        .from("assets")
        .select("title, external_url, storage_path, description, metadata")
        .eq("id", body.assetId)
        .single();

      const m = (asset?.metadata as Record<string, unknown>) ?? {};
      const fileUrl = (m.file_url as string) ?? asset?.external_url ?? "";
      const fileName = asset?.title ?? "arquivo";

      data = {
        client_id:        portalClientId,
        uploaded_by:      PORTAL_ADMIN_ID || portalClientId, // fallback to client
        file_url:         fileUrl,
        file_name:        fileName,
        project_id:       portalProjectId ?? undefined,
        folder:           (m.folder as string) ?? "operacionais",
        file_type:        (m.file_type as string) ?? null,
        description:      asset?.description ?? null,
        approval_status:  "approved",
      };
    }

    else if (event === "node_completed" && body.nodeId) {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      const { data: node } = await db
        .from("canvas_nodes")
        .select("title, node_type")
        .eq("id", body.nodeId)
        .single();

      data = {
        project_id:  portalProjectId,
        author_id:   PORTAL_ADMIN_ID || portalClientId,
        message:     `Entregável concluído: ${node?.title ?? "node"}`,
        update_type: "task",
      };
    }

    else if (event === "stage_advanced") {
      if (!portalProjectId) return json({ skipped: true, reason: "portal_project_id not set on workspace" });
      const stageLabels: Record<string, string> = {
        entrada: "Entrada", diagnostico: "Diagnóstico", estrutura_base: "Estrutura",
        planejamento: "Planejamento", producao: "Produção", ativacao: "Ativação",
        otimizacao: "Otimização", expansao: "Expansão",
      };
      const label = stageLabels[body.stage ?? ""] ?? body.stage ?? "nova etapa";
      data = {
        project_id:  portalProjectId,
        author_id:   PORTAL_ADMIN_ID || portalClientId,
        message:     body.message ?? `Projeto avançou para a etapa: ${label}`,
        update_type: "milestone",
      };
    }

    else {
      // Evento genérico — se tiver project_id envia como update
      if (portalProjectId && PORTAL_ADMIN_ID) {
        data = {
          project_id:  portalProjectId,
          author_id:   PORTAL_ADMIN_ID,
          message:     body.message ?? `Atualização operacional: ${event}`,
          update_type: "system",
        };
        event = "node_completed"; // reuse updates endpoint
      } else {
        return json({ skipped: true, reason: "unrecognized event and no fallback config" });
      }
    }

    // ── Envia ────────────────────────────────────────────────────────────
    const result = await sendToPortal(PORTAL_URL, PORTAL_SECRET, event, data);

    if (!result.ok) {
      console.error("[sync-to-portal] Portal error:", result.error);
      return json({ ok: false, error: result.error }, 502);
    }

    // Marca asset como sincronizado
    if (body.assetId) {
      const { data: curr } = await db.from("assets").select("metadata").eq("id", body.assetId).single();
      const m = ((curr?.metadata as Record<string, unknown>) ?? {});
      await db.from("assets").update({ metadata: { ...m, synced_to_portal: true } }).eq("id", body.assetId);
    }

    return json({ ok: true, event, portal_project_id: portalProjectId, portal_client_id: portalClientId });

  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "internal error" }, 500);
  }
});
