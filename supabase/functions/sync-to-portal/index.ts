/**
 * sync-to-portal — bridge entre Aceleriq Ops e aceleriq.online
 * 
 * Recebe eventos do Ops e envia para o webhook do portal.
 * O portal tem uma edge function "ops-webhook" que recebe e escreve no banco dele.
 *
 * EVENTOS SUPORTADOS:
 *  - file_approved       → cria file no portal com approval_status: "approved"
 *  - node_completed      → cria update no projeto do portal
 *  - stage_advanced      → atualiza milestone no portal
 *  - workspace_created   → cria project no portal
 *  - asset_case_ready    → cria case_material no portal
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  // URL do webhook no portal aceleriq.online (Lovable Supabase)
  const PORTAL_WEBHOOK_URL = Deno.env.get("PORTAL_WEBHOOK_URL") ?? "";

  if (!PORTAL_WEBHOOK_URL) {
    return json({ error: "PORTAL_WEBHOOK_URL not configured", skipped: true });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    const body = await req.json() as {
      event: string;
      workspaceId: string;
      clientId: string;
      assetId?: string;
      nodeId?: string;
      stage?: string;
    };

    // Busca portal_client_id e portal_project_id do workspace
    const { data: ws } = await supabase
      .from("workspaces")
      .select("id, name, current_stage, metadata, clients(id, name, metadata)")
      .eq("id", body.workspaceId)
      .single();

    const wsMeta = (ws?.metadata as Record<string, unknown>) ?? {};
    const clientMeta = ((ws?.clients as any)?.metadata as Record<string, unknown>) ?? {};
    const portalProjectId = wsMeta.portal_project_id as string | undefined;
    const portalClientId = clientMeta.portal_client_id as string | undefined;

    if (!portalProjectId || !portalClientId) {
      return json({
        skipped: true,
        reason: "portal_project_id or portal_client_id not set in workspace/client metadata",
      });
    }

    let payload: Record<string, unknown> = {
      event: body.event,
      portal_project_id: portalProjectId,
      portal_client_id: portalClientId,
    };

    // Mount payload per event
    if (body.event === "file_approved" && body.assetId) {
      const { data: asset } = await supabase
        .from("assets")
        .select("title, external_url, storage_path, description, metadata")
        .eq("id", body.assetId)
        .single();

      const am = (asset?.metadata as Record<string, unknown>) ?? {};
      payload = {
        ...payload,
        file: {
          title: asset?.title ?? "Arquivo",
          file_url: (am.file_url as string) ?? asset?.external_url ?? "",
          file_name: asset?.title ?? "arquivo",
          description: asset?.description ?? null,
          folder: (am.folder as string) ?? "operacionais",
          approval_status: "approved",
          file_type: (am.file_type as string) ?? null,
        },
      };
    }

    if (body.event === "node_completed" && body.nodeId) {
      const { data: node } = await supabase
        .from("canvas_nodes")
        .select("title, description, node_type")
        .eq("id", body.nodeId)
        .single();

      payload = {
        ...payload,
        update: {
          message: `Entregavel concluido: ${node?.title ?? "node"}`,
          update_type: "task",
        },
      };
    }

    if (body.event === "stage_advanced") {
      payload = {
        ...payload,
        stage: body.stage,
        update: {
          message: `Etapa avancada: ${body.stage}`,
          update_type: "milestone",
        },
      };
    }

    // Send to portal webhook
    const res = await fetch(PORTAL_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return json({ error: "Portal webhook error: " + err }, 502);
    }

    return json({ ok: true, event: body.event });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
