/**
 * receive-portal-sync v2 — recebe TODOS os dados do portal em tempo real.
 *
 * Aceita:
 * - Webhooks manuais (type: "project", "briefing", etc)
 * - Triggers automáticos do banco (type: "profiles", "projects", "briefings", "tasks", etc)
 * - Context enriquecido com dados do cliente
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { logSync, startTimer } from "../_shared/syncAudit.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function inferOpsType(portalType: string | null | undefined): string {
  const t = (portalType ?? "").toLowerCase();
  if (t.includes("site") || t.includes("website")) return "one_shot_site";
  if (t.includes("auto")) return "one_shot_automation";
  if (t.includes("agent") || t.includes("bot") || t.includes("ia") || t.includes("chatbot") || t.includes("agente")) return "one_shot_agent";
  if (t.includes("market") || t.includes("trafego") || t.includes("tráfego") || t.includes("ads") || t.includes("social")) return "marketing_service";
  if (t.includes("legacy") || t.includes("legado")) return "legacy_marketing";
  return "ai_first";
}

function inferPlanName(plan: string | null | undefined): string {
  const p = (plan ?? "").toLowerCase();
  if (p.includes("enterprise") || p.includes("escala")) return "enterprise";
  if (p.includes("growth") || p.includes("aceler")) return "growth";
  if (p.includes("marketing")) return "marketing";
  return "starter";
}

// Normaliza tipo — trigger do banco usa nome da tabela, webhook manual usa tipo semântico.
function normalizeType(type: string): string {
  const map: Record<string, string> = {
    profiles: "profile",
    profile: "profile",
    client: "profile",
    clients: "profile",
    quiz_submissions: "briefing",
    quiz_submission: "briefing",
    projects: "project",
    project: "project",
    briefings: "briefing",
    briefing: "briefing",
    milestones: "milestone",
    milestone: "milestone",
    folders: "milestone",
    folder: "milestone",
    updates: "update",
    update: "update",
    tasks: "task",
    task: "task",
    files: "file",
    file: "file",
  };
  const raw = type.toLowerCase();
  if (map[raw]) return map[raw];
  // Strip *_deleted / *_archived / *_created / *_updated suffixes used by event-style types.
  const stripped = raw.replace(/_(deleted|archived|created|updated|removed|soft_deleted)$/u, "");
  if (map[stripped]) return map[stripped];
  // Plural forms with suffix (e.g. "tasks_deleted")
  const singular = stripped.replace(/s$/u, "");
  if (map[singular]) return map[singular];
  return raw;
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function portalProjectIdOf(data: Record<string, unknown>): string | null {
  const milestone = (data.milestone && typeof data.milestone === "object") ? data.milestone as Record<string, unknown> : {};
  const folder = (data.folder && typeof data.folder === "object") ? data.folder as Record<string, unknown> : {};
  return firstString(data.project_id, data.portal_project_id, data.workspace_id, milestone.project_id, folder.project_id);
}

function portalMilestoneIdOf(data: Record<string, unknown>): string | null {
  const milestone = (data.milestone && typeof data.milestone === "object") ? data.milestone as Record<string, unknown> : {};
  const folder = (data.folder && typeof data.folder === "object") ? data.folder as Record<string, unknown> : {};
  return firstString(data.milestone_id, data.portal_milestone_id, data.folder_id, data.portal_folder_id, data.stage_id, data.phase_id, data.column_id, milestone.id, folder.id);
}

function compactRecord(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined && value !== ""));
}

function normalizeKindText(value: unknown) {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

function inferProfessionalKind(title: string, description: string | null, milestoneTitle: string | null) {
  const text = normalizeKindText(`${title} ${description ?? ""}`);
  const ctx = normalizeKindText(milestoneTitle ?? "");
  if (/case|print|documentar|evidencia|portfolio/.test(text)) return "case";
  if (/before after|antes depois/.test(text)) return "before_after";
  if (/landing|linktree|hotsite|pagina de links/.test(text)) return "landing_page";
  if (/shopify|e commerce|ecommerce|loja|checkout|site/.test(text)) return "site";
  if (/n8n|automacao|automatizar|fluxo|workflow|webhook/.test(text)) return "automacao";
  if (/integra|api|conectar|sincroniz/.test(text)) return "integracao";
  if (/agente|chatbot|bot|atendimento|resposta|prompt|gpt|\bia\b/.test(text)) return "agente";
  if (/metrica|monitor|dashboard|kpi|relatorio|analytics/.test(text)) return "metrica";
  if (/acesso|credencial|hostinger|senha|login/.test(text)) return "acessos";
  if (/email|disparo|newsletter/.test(text)) return "email_mkt";
  if (/trafego|ads|anuncio|campanha/.test(text)) return "trafego";
  if (/funil|jornada/.test(text)) return "funil";
  if (/conteudo|copy|roteiro|texto|post/.test(text)) return "conteudo";
  if (/video|reels|short/.test(text)) return "video";
  if (/imagem|criativo|arte|design/.test(text)) return "imagem";
  if (/social|instagram|whatsapp|telegram/.test(text)) return "social";
  if (/crm|pipeline|kanban/.test(text)) return "crm";
  if (/automacao|atendimento|n8n/.test(ctx)) return "automacao";
  if (/base|digital|estrutur|tecnic/.test(ctx)) return "integracao";
  if (/homolog|entrega|operacional|case/.test(ctx)) return "case";
  if (/trafego|ads|midia/.test(ctx)) return "trafego";
  if (/conteudo|criativo/.test(ctx)) return "conteudo";
  return "resultado";
}

function briefingFromRecord(data: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    "positioning",
    "differential",
    "icp",
    "main_pains",
    "goals_12m",
    "success_metric",
    "revenue_range",
    "team_size",
    "maturity_digital",
    "ai_readiness",
    "recommended_plan",
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (data[k] !== undefined && data[k] !== null && data[k] !== "") out[k] = data[k];
  }
  const responses = data.responses;
  if (responses && typeof responses === "object" && !Array.isArray(responses)) {
    Object.assign(out, responses as Record<string, unknown>);
  }
  return out;
}

async function findClientByEmail(supabase: any, email: string) {
  // Primeiro por metadata, depois por coluna email se existir.
  const { data: byMeta } = await supabase
    .from("clients")
    .select("id")
    .eq("metadata->>lead_email", email)
    .maybeSingle();
  if (byMeta) return byMeta;

  const { data: byEmail, error } = await supabase
    .from("clients")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (!error && byEmail) return byEmail;
  return null;
}

// Resolve client_id do Ops a partir de portal_client_id, context, ou pelo email.
async function resolveOpsClientId(
  supabase: any,
  portalClientId: string | null,
  context: Record<string, unknown>,
  autoCreate = true,
): Promise<string | null> {
  if (portalClientId) {
    const { data: byPortalId } = await supabase
      .from("clients")
      .select("id")
      .eq("portal_client_id", portalClientId)
      .maybeSingle();
    if (byPortalId) return byPortalId.id;
  }

  const email = firstString(context.client_email, context.lead_email, context.email);
  if (email) {
    const byEmail = await findClientByEmail(supabase, email);
    if (byEmail) {
      if (portalClientId) await supabase.from("clients").update({ portal_client_id: portalClientId }).eq("id", byEmail.id);
      return byEmail.id;
    }
  }

  if (!autoCreate || !portalClientId) return null;

  const name = firstString(context.client_full_name, context.full_name, context.name) || email || `Cliente ${portalClientId.slice(0, 8)}`;
  const insertPayload: Record<string, unknown> = {
    name,
    company_name: firstString(context.client_company, context.company_name),
    status: "onboarding",
    plan_name: inferPlanName(firstString(context.client_plan, context.plan_name)),
    portal_client_id: portalClientId,
    metadata: {
      lead_email: email,
      lead_phone: firstString(context.client_phone, context.phone, context.whatsapp),
      source: "portal_sync",
      auto_created_from_trigger: true,
    },
  };
  if (email) insertPayload.email = email;

  let { data: newClient, error } = await supabase.from("clients").insert(insertPayload).select("id").single();
  if (error && String(error.message ?? "").includes("email")) {
    // Algumas instalações têm índice único de email; tenta sem coluna email mantendo metadata.
    delete insertPayload.email;
    const retry = await supabase.from("clients").insert(insertPayload).select("id").single();
    newClient = retry.data;
    error = retry.error;
  }
  if (error) throw error;
  return newClient?.id ?? null;
}

async function ensureWorkspace(supabase: any, opsClientId: string, clientName: string, portalClientId: string | null, projectType = "ai_first", portalProjectId: string | null = null) {
  const { data: existingWs } = await supabase
    .from("workspaces")
    .select("id, portal_project_id, metadata")
    .eq("client_id", opsClientId)
    .limit(1)
    .maybeSingle();
  if (existingWs && (!portalProjectId || !existingWs.portal_project_id || existingWs.portal_project_id === portalProjectId)) {
    if (portalProjectId && !existingWs.portal_project_id) {
      const currentMeta = (existingWs.metadata as Record<string, unknown>) ?? {};
      await supabase.from("workspaces").update({
        portal_project_id: portalProjectId,
        metadata: {
          ...currentMeta,
          portal_sync: {
            ...((currentMeta.portal_sync as Record<string, unknown>) ?? {}),
            portal_project_id: portalProjectId,
            portal_client_id: portalClientId,
            linked_from: "portal_task_sync",
            last_synced_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      }).eq("id", existingWs.id);
    }
    return { workspaceId: existingWs.id, created: false };
  }

  const { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .insert({
      client_id: opsClientId,
      name: `${clientName} — Workspace`,
      status: "setup",
      current_stage: "entrada",
      project_type: projectType,
      metadata: {
        portal_sync: {
          auto_created: true,
          portal_project_id: portalProjectId,
          portal_client_id: portalClientId,
          source: "portal_sync",
          created_at: new Date().toISOString(),
        },
      },
      portal_project_id: portalProjectId,
    })
    .select("id")
    .single();
  if (wsErr) throw wsErr;

  await supabase.from("timeline_events").insert({
    workspace_id: ws!.id,
    client_id: opsClientId,
    event_type: "workspace_created",
    title: "Workspace criado automaticamente via portal",
    happened_at: new Date().toISOString(),
    metadata: { source: "portal_sync", portal_client_id: portalClientId },
  });

  return { workspaceId: ws!.id, created: true };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const BEARER_SECRET = Deno.env.get("PORTAL_TO_OPS_SECRET") ?? "";
  const received = req.headers.get("x-webhook-secret");
  const authHeader = req.headers.get("authorization") ?? "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  const okWebhook = SECRET && received === SECRET;
  const okBearer = BEARER_SECRET && bearer === BEARER_SECRET;
  if (!okWebhook && !okBearer) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const body = await req.json();
    const event = String(body.event ?? "");
    const evLower = event.toLowerCase();
    let inferredType = "";
    if (evLower.startsWith("task_")) inferredType = "tasks";
    else if (evLower.startsWith("milestone_") || evLower.startsWith("folder_")) inferredType = "milestones";
    else if (evLower.startsWith("project_")) inferredType = "projects";
    else if (evLower.startsWith("client_") || evLower.startsWith("profile_")) inferredType = "profiles";
    // Quando o event tem semântica clara (*_created/_updated/_deleted), ele é a
    // fonte de verdade do tipo lógico — body.type pode vir como "DELETE"/"UPDATE"
    // (estilo trigger do Postgres) e enganar o normalizeType, fazendo deletes
    // caírem no branch "ignored" final.
    const eventDrivesType = inferredType !== "" && /_(created|updated|deleted|archived|removed|soft_deleted)$/u.test(evLower);
    const rawType = String(eventDrivesType ? inferredType : (body.type ?? body.table ?? inferredType));
    const type = normalizeType(rawType);
    const dataSource = (body.data && typeof body.data === "object") ? body.data
      : (body.record && typeof body.record === "object") ? body.record
      : (body.old_record && typeof body.old_record === "object") ? body.old_record
      : (body.payload && typeof body.payload === "object") ? body.payload
      : null;
    const data = (dataSource ?? Object.fromEntries(Object.entries(body).filter(([key]) => !["event", "type", "table", "context", "source", "record", "old_record", "payload"].includes(key)))) as Record<string, unknown>;
    // Fallback: se ainda não temos id mas veio old_record/record, tenta extrair.
    if (!data.id) {
      const alt = (body.old_record ?? body.record ?? {}) as Record<string, unknown>;
      if (alt && typeof alt === "object" && alt.id) data.id = alt.id;
    }
    const context = (body.context ?? {}) as Record<string, unknown>;
    const source = String(body.source ?? "").toLowerCase();

    // Anti-loop: ignora eventos que vieram do próprio Ops (ricocheteados pelo portal).
    if (source === "ops") {
      return json({ ok: true, action: "ignored_self_origin" });
    }

    if (!rawType || !data || typeof data !== "object") {
      return json({ error: "type e data são obrigatórios" }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const isDeleteEvent =
      event === "DELETE" ||
      evLower.endsWith("_deleted") ||
      evLower.endsWith("_archived") ||
      data.deleted === true ||
      data.archived === true;
    const SOFT_DELETE_STATUS = "deleted_from_portal";
    const nowIso = new Date().toISOString();

    // ─── DELETE: profile/client/project ───────────────────────
    if (isDeleteEvent && (type === "profile" || type === "project" || type === "milestone" && false)) {
      // handled below per-type
    }

    if (isDeleteEvent && type === "profile") {
      const portalClientId = firstString(data.id, data.client_id, data.user_id);
      if (!portalClientId) return json({ error: "profile.id obrigatório para delete" }, 400);
      const { data: existingClient } = await supabase
        .from("clients")
        .select("id, deleted_at, sync_status")
        .eq("portal_client_id", portalClientId)
        .maybeSingle();
      if (!existingClient) {
        await logSync({
          direction: "portal_to_ops",
          event: "client_deleted",
          status: "skipped",
          message: "client_not_found",
          payload: { portal_client_id: portalClientId },
          source,
        });
        return json({ ok: true, action: "client_not_found", portal_client_id: portalClientId });
      }
      if ((existingClient as any).deleted_at || (existingClient as any).sync_status === SOFT_DELETE_STATUS) {
        await logSync({ direction: "portal_to_ops", event: "client_deleted", status: "skipped", clientId: existingClient.id, message: "already_deleted", source });
        return json({ ok: true, action: "already_deleted", client_id: existingClient.id });
      }
      // Soft delete: marca clientes, workspaces e canvas_nodes — preserva histórico.
      const { data: wss } = await supabase
        .from("workspaces").select("id").eq("client_id", existingClient.id);
      const wsIds = (wss ?? []).map((w: any) => w.id);
      if (wsIds.length) {
        await supabase.from("canvas_nodes")
          .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
          .in("workspace_id", wsIds).is("deleted_at", null);
        await supabase.from("workspaces")
          .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
          .in("id", wsIds);
      }
      const delRes = await supabase.from("clients")
        .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
        .eq("id", existingClient.id);
      await logSync({
        direction: "portal_to_ops",
        event: "client_deleted",
        status: delRes.error ? "error" : "ok",
        clientId: existingClient.id,
        message: delRes.error ? delRes.error.message : `client_soft_deleted (workspaces=${wsIds.length})`,
        payload: { portal_client_id: portalClientId, workspace_ids: wsIds },
        source,
      });
      if (delRes.error) return json({ error: delRes.error.message }, 500);
      return json({ ok: true, action: "client_soft_deleted", client_id: existingClient.id, workspaces_archived: wsIds.length });
    }

    if (isDeleteEvent && type === "project") {
      const portalProjectId = firstString(data.id);
      if (!portalProjectId) return json({ error: "project.id obrigatório para delete" }, 400);
      const { data: existingWs } = await supabase
        .from("workspaces")
        .select("id, client_id, deleted_at, sync_status")
        .eq("portal_project_id", portalProjectId)
        .maybeSingle();
      if (!existingWs) {
        return json({ ok: true, action: "workspace_not_found", portal_project_id: portalProjectId });
      }
      if ((existingWs as any).deleted_at || (existingWs as any).sync_status === SOFT_DELETE_STATUS) {
        await logSync({ direction: "portal_to_ops", event: "project_deleted", status: "skipped", workspaceId: existingWs.id, portalProjectId, message: "already_deleted", source });
        return json({ ok: true, action: "already_deleted", workspace_id: existingWs.id });
      }
      await supabase.from("canvas_nodes")
        .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
        .eq("workspace_id", existingWs.id).is("deleted_at", null);
      const delRes = await supabase.from("workspaces")
        .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
        .eq("id", existingWs.id);
      await logSync({
        direction: "portal_to_ops",
        event: "project_deleted",
        status: delRes.error ? "error" : "ok",
        workspaceId: existingWs.id,
        clientId: existingWs.client_id,
        portalProjectId,
        message: delRes.error ? delRes.error.message : "workspace_soft_deleted",
        source,
      });
      if (delRes.error) return json({ error: delRes.error.message }, 500);
      return json({ ok: true, action: "workspace_soft_deleted", workspace_id: existingWs.id });
    }

    // Milestone-level delete (early branch — antes de cair no fluxo de timeline)
    if (isDeleteEvent && type === "milestone") {
      const portalMilestoneId = firstString(data.id, data.milestone_id, data.folder_id, data.portal_folder_id);
      if (!portalMilestoneId) return json({ error: "milestone.id obrigatório para delete" }, 400);
      const { data: existingMs } = await supabase
        .from("canvas_nodes")
        .select("id, workspace_id, client_id, deleted_at, sync_status")
        .contains("data", { kind: "milestone_group", portal_milestone_id: portalMilestoneId })
        .maybeSingle();
      if (!existingMs) {
        await logSync({ direction: "portal_to_ops", event: "milestone_deleted", status: "skipped", message: "milestone_not_found", payload: { portal_milestone_id: portalMilestoneId }, source });
        return json({ ok: true, action: "milestone_not_found", portal_milestone_id: portalMilestoneId });
      }
      if ((existingMs as any).deleted_at || (existingMs as any).sync_status === SOFT_DELETE_STATUS) {
        return json({ ok: true, action: "already_deleted", node_id: existingMs.id });
      }
      // Soft-delete tasks filhas também (evita órfãs visíveis no canvas).
      await supabase.from("canvas_nodes")
        .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
        .eq("parent_node_id", existingMs.id).is("deleted_at", null);
      const delRes = await supabase.from("canvas_nodes")
        .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
        .eq("id", existingMs.id);
      await logSync({
        direction: "portal_to_ops", event: "milestone_deleted",
        status: delRes.error ? "error" : "ok",
        workspaceId: existingMs.workspace_id, clientId: existingMs.client_id,
        nodeId: existingMs.id, portalMilestoneId,
        message: delRes.error ? delRes.error.message : "milestone_soft_deleted",
        source,
      });
      if (delRes.error) return json({ error: delRes.error.message }, 500);
      return json({ ok: true, action: "milestone_soft_deleted", node_id: existingMs.id });
    }

    // Task-level delete (early branch — antes do bloco de timeline)
    if (isDeleteEvent && type === "task") {
      const portalTaskId = firstString(data.id, data.task_id);
      if (!portalTaskId) return json({ error: "task.id obrigatório para delete" }, 400);
      const { data: existingTask } = await supabase
        .from("canvas_nodes")
        .select("id, workspace_id, client_id, deleted_at, sync_status")
        .contains("data", { portal_task_id: portalTaskId })
        .maybeSingle();
      if (!existingTask) {
        await logSync({ direction: "portal_to_ops", event: "task_deleted", status: "skipped", message: "task_not_found", portalTaskId, source });
        return json({ ok: true, action: "task_not_found", portal_task_id: portalTaskId });
      }
      if ((existingTask as any).deleted_at || (existingTask as any).sync_status === SOFT_DELETE_STATUS) {
        return json({ ok: true, action: "already_deleted", node_id: existingTask.id });
      }
      const delRes = await supabase.from("canvas_nodes")
        .update({ deleted_at: nowIso, sync_status: SOFT_DELETE_STATUS, updated_at: nowIso })
        .eq("id", existingTask.id);
      await logSync({
        direction: "portal_to_ops", event: "task_deleted",
        status: delRes.error ? "error" : "ok",
        workspaceId: existingTask.workspace_id, clientId: existingTask.client_id,
        nodeId: existingTask.id, portalTaskId,
        message: delRes.error ? delRes.error.message : "task_soft_deleted",
        source,
      });
      if (delRes.error) return json({ error: delRes.error.message }, 500);
      return json({ ok: true, action: "task_soft_deleted", node_id: existingTask.id });
    }

    if (event === "DELETE" && !["task", "profile", "project", "milestone"].includes(type)) {
      return json({ ok: true, action: "delete_ignored", type_received: rawType });
    }

    // ─── Guard: ignora updates não-delete de entidades já soft-deletadas ──
    // (evita ressuscitação acidental por update tardio do portal)
    if (!isDeleteEvent && type === "profile") {
      const pcid = firstString(data.id, data.client_id, data.user_id);
      if (pcid) {
        const { data: c } = await supabase.from("clients").select("id, deleted_at, sync_status").eq("portal_client_id", pcid).maybeSingle();
        if (c && ((c as any).deleted_at || (c as any).sync_status === SOFT_DELETE_STATUS)) {
          return json({ ok: true, action: "skipped_already_deleted", entity: "client", client_id: c.id });
        }
      }
    }
    if (!isDeleteEvent && type === "project") {
      const ppid = firstString(data.id);
      if (ppid) {
        const { data: w } = await supabase.from("workspaces").select("id, deleted_at, sync_status").eq("portal_project_id", ppid).maybeSingle();
        if (w && ((w as any).deleted_at || (w as any).sync_status === SOFT_DELETE_STATUS)) {
          return json({ ok: true, action: "skipped_already_deleted", entity: "workspace", workspace_id: w.id });
        }
      }
    }

    // ─── PROFILE / CLIENT ─────────────────────────────────────
    if (type === "profile") {
      const portalClientId = firstString(data.id, data.client_id, data.user_id);
      if (!portalClientId) return json({ error: "profile.id/client_id/user_id obrigatório" }, 400);

      const email = firstString(data.email, data.lead_email, context.client_email);
      const name = firstString(data.full_name, data.name, data.lead_name, context.client_full_name) || email || "Cliente do Portal";
      const phone = firstString(data.phone, data.whatsapp, data.lead_whatsapp, context.client_phone);
      const company = firstString(data.company_name, data.lead_company, context.client_company);
      const planName = inferPlanName(firstString(data.plan_name, context.client_plan));

      const { data: existingClient } = await supabase
        .from("clients")
        .select("id, metadata, plan_name, project_type")
        .eq("portal_client_id", portalClientId)
        .maybeSingle();

      let opsClientId: string;
      let action = "updated";

      if (existingClient) {
        const currentMeta = (existingClient.metadata as Record<string, unknown>) ?? {};
        const { error } = await supabase.from("clients").update({
          name,
          company_name: company ?? null,
          plan_name: existingClient.plan_name || planName,
          metadata: {
            ...currentMeta,
            lead_email: (currentMeta.lead_email as string) || email,
            lead_phone: (currentMeta.lead_phone as string) || phone,
            source: currentMeta.source || "portal_sync",
            portal_sync_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        }).eq("id", existingClient.id);
        if (error) throw error;
        opsClientId = existingClient.id;
      } else {
        const byEmail = email ? await findClientByEmail(supabase, email) : null;
        if (byEmail) {
          const { error } = await supabase.from("clients").update({ portal_client_id: portalClientId, updated_at: new Date().toISOString() }).eq("id", byEmail.id);
          if (error) throw error;
          opsClientId = byEmail.id;
          action = "linked_by_email";
        } else {
          const insertPayload: Record<string, unknown> = {
            name,
            company_name: company ?? null,
            status: "onboarding",
            segment: (data.segment as string) ?? null,
            plan_name: planName,
            portal_client_id: portalClientId,
            metadata: {
              lead_email: email,
              lead_phone: phone,
              source: "portal_sync",
              created_from_portal: true,
              essential_briefing: data.briefing ?? {},
              portal_sync_at: new Date().toISOString(),
            },
          };
          if (email) insertPayload.email = email;

          let { data: newClient, error } = await supabase.from("clients").insert(insertPayload).select("id").single();
          if (error && String(error.message ?? "").includes("email")) {
            delete insertPayload.email;
            const retry = await supabase.from("clients").insert(insertPayload).select("id").single();
            newClient = retry.data;
            error = retry.error;
          }
          if (error) throw error;
          opsClientId = newClient!.id;
          action = "created";
        }
      }

      const ws = await ensureWorkspace(supabase, opsClientId, name, portalClientId);
      return json({ ok: true, action: ws.created ? `${action}_with_workspace` : action, client_id: opsClientId, workspace_id: ws.workspaceId, workspace_created: ws.created });
    }

    // ─── PROJECT ──────────────────────────────────────────────
    if (type === "project") {
      const portalProjectId = firstString(data.id);
      if (!portalProjectId) return json({ error: "project.id obrigatório" }, 400);
      const portalClientId = firstString(data.client_id, data.user_id);
      const opsClientId = await resolveOpsClientId(supabase, portalClientId, context, true);
      if (!opsClientId) return json({ error: "Não foi possível resolver ou criar cliente", portal_client_id: portalClientId }, 404);

      const opsType = inferOpsType(data.project_type as string | null);
      const { data: existing } = await supabase
        .from("workspaces")
        .select("id")
        .eq("portal_project_id", portalProjectId)
        .maybeSingle();

      const payload = {
        name: (data.name as string) || "Projeto do Portal",
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
      };

      if (existing) {
        const { error } = await supabase.from("workspaces").update(payload).eq("id", existing.id);
        if (error) throw error;
        return json({ ok: true, action: "updated", workspace_id: existing.id });
      }

      const { data: ws, error } = await supabase.from("workspaces")
        .insert({
          client_id: opsClientId,
          ...payload,
          current_stage: "entrada",
          portal_project_id: portalProjectId,
          project_type: opsType,
        })
        .select("id")
        .single();
      if (error) throw error;
      return json({ ok: true, action: "created", workspace_id: ws?.id });
    }

    // ─── BRIEFING / QUIZ_SUBMISSIONS ──────────────────────────
    if (type === "briefing") {
      const portalClientId = firstString(data.client_id, data.user_id, data.profile_id, data.token, data.id);
      const enrichedContext = {
        ...context,
        client_email: context.client_email ?? data.lead_email,
        client_full_name: context.client_full_name ?? data.lead_name,
        client_company: context.client_company ?? data.lead_company,
        client_phone: context.client_phone ?? data.lead_whatsapp,
        client_plan: context.client_plan ?? data.recommended_plan,
      };
      const opsClientId = await resolveOpsClientId(supabase, portalClientId, enrichedContext, true);
      if (!opsClientId) return json({ error: "Cliente não encontrado" }, 404);

      const { data: client } = await supabase
        .from("clients")
        .select("id, metadata")
        .eq("id", opsClientId)
        .maybeSingle();
      if (!client) return json({ error: "Cliente não encontrado" }, 404);

      const currentMeta = (client.metadata as Record<string, unknown>) ?? {};
      const currentEb = (currentMeta.essential_briefing as Record<string, unknown>) ?? {};
      const incoming = briefingFromRecord(data);
      const merged = { ...incoming, ...currentEb, last_portal_briefing_sync: new Date().toISOString() };

      const { error } = await supabase.from("clients")
        .update({ metadata: { ...currentMeta, essential_briefing: merged, portal_sync_at: new Date().toISOString() } })
        .eq("id", opsClientId);
      if (error) throw error;

      const clientName = firstString(enrichedContext.client_full_name, data.lead_name, data.email) || "Cliente do Portal";
      const ws = await ensureWorkspace(supabase, opsClientId, clientName, portalClientId);
      return json({ ok: true, action: "briefing_merged", client_id: opsClientId, workspace_id: ws.workspaceId, workspace_created: ws.created });
    }

    // ─── MILESTONE / UPDATE / TASK / FILE → TIMELINE ──────────
    if (["milestone", "update", "task", "file"].includes(type)) {
      const portalProjectId = portalProjectIdOf(data);
      let ws: { id: string; client_id: string } | null = null;
      if (portalProjectId) {
        const { data: foundWs } = await supabase
          .from("workspaces")
          .select("id, client_id")
          .eq("portal_project_id", portalProjectId)
          .maybeSingle();
        ws = foundWs;
      }

      let opsClientId = ws?.client_id ?? null;
      if (!opsClientId) {
        opsClientId = await resolveOpsClientId(supabase, firstString(data.client_id, data.user_id), context, true);
      }
      if (!opsClientId) return json({ ok: true, action: "ignored_no_client", type_received: rawType });

      if (!ws) {
        const clientName = firstString(context.client_full_name, data.client_name) || "Cliente do Portal";
        const ensured = await ensureWorkspace(supabase, opsClientId, clientName, firstString(data.client_id, data.user_id), "ai_first", portalProjectId);
        ws = { id: ensured.workspaceId, client_id: opsClientId };
      }

      const title = firstString(data.title, data.name, data.message) || (type === "update" ? "Update do portal" : `${type} do portal`);
      const description = firstString(data.description, data.message, data.content);
      const happenedAt = firstString(data.target_date, data.created_at, data.updated_at) || new Date().toISOString();

      // ── MILESTONE: cria/atualiza/remove a pasta milestone_group correspondente ──
      if (type === "milestone") {
        const portalMilestoneId = firstString(data.id, data.milestone_id, data.folder_id, data.portal_folder_id);
        const isDeleted = event === "milestone_deleted" || event === "folder_deleted" || event === "DELETE" || data.deleted === true;
        if (isDeleted && portalMilestoneId) {
          await supabase.from("canvas_nodes").delete()
            .eq("workspace_id", ws.id)
            .contains("data", { kind: "milestone_group", portal_milestone_id: portalMilestoneId });
        } else if (portalMilestoneId) {
          // Garante o project_group pai
          let projectGroupId: string | null = null;
          if (portalProjectId) {
            const { data: pg } = await supabase
              .from("canvas_nodes")
              .select("id")
              .eq("workspace_id", ws.id)
              .contains("data", { kind: "project_group", portal_project_id: portalProjectId })
              .maybeSingle();
            projectGroupId = pg?.id ?? null;
            if (!projectGroupId) {
              const { data: clientNode } = await supabase
                .from("canvas_nodes").select("id, pos_x, pos_y").eq("workspace_id", ws.id).eq("node_type", "client").eq("client_id", ws.client_id).order("created_at", { ascending: true }).limit(1).maybeSingle();
              const { data: createdPg } = await supabase.from("canvas_nodes").insert({
                workspace_id: ws.id, client_id: ws.client_id,
                parent_node_id: clientNode?.id ?? null, node_type: "front",
                title: firstString(data.project_title, data.project_name) ?? "Projeto do portal",
                status: "active",
                pos_x: Number(clientNode?.pos_x ?? 80), pos_y: Number(clientNode?.pos_y ?? 0) + 190,
                data: { kind: "project_group", from_portal: true, portal_project_id: portalProjectId, stage: "producao" },
              }).select("id").single();
              projectGroupId = createdPg?.id ?? null;
            }
          }
          const portalStatus = (firstString(data.status, "active") ?? "active").toLowerCase();
          const opsStatus = portalStatus === "completed" || portalStatus === "done" ? "done" : "active";
          const position = Number(data.position ?? data.order ?? data.sort_order ?? 0);
          const { data: existingMs } = await supabase
            .from("canvas_nodes").select("id, data").eq("workspace_id", ws.id)
            .contains("data", { kind: "milestone_group", portal_milestone_id: portalMilestoneId })
            .maybeSingle();
          const msPayload = compactRecord({
            kind: "milestone_group", from_portal: true,
            portal_project_id: portalProjectId ?? undefined,
            portal_milestone_id: portalMilestoneId,
            portal_folder_id: portalMilestoneId,
            milestone_key: portalMilestoneId,
            portal_position: Number.isFinite(position) ? position : 0,
            portal_status: portalStatus, stage: "producao",
          });
          if (existingMs?.id) {
            await supabase.from("canvas_nodes").update({
              title, status: opsStatus, parent_node_id: projectGroupId,
              updated_at: new Date().toISOString(),
              data: { ...((existingMs.data as Record<string, unknown>) ?? {}), ...msPayload },
            }).eq("id", existingMs.id);
          } else {
            await supabase.from("canvas_nodes").insert({
              workspace_id: ws.id, client_id: ws.client_id,
              parent_node_id: projectGroupId, node_type: "front",
              title, status: opsStatus,
              pos_x: 112, pos_y: 360,
              data: msPayload,
            });
          }
        }
      }

      // ── TASK: cria/atualiza/remove node correspondente no canvas ────
      if (type === "task") {
        const portalTaskId = firstString(data.id, data.task_id);
        const portalMilestoneId = portalMilestoneIdOf(data);
        const milestoneKey = portalMilestoneId ?? `no-milestone:${portalProjectId ?? ws.id}`;
        const milestoneTitle = firstString(data.milestone_title, data.milestone_name, data.folder_title, data.folder_name, data.stage_title, data.phase_title, data.column_title) ?? "Sem milestone";
        const portalStatus = (firstString(data.status, data.kanban_status) ?? "draft").toLowerCase();
        const inferredKind = inferProfessionalKind(title, description, milestoneTitle);
        // mapeia status do kanban → ops
        const statusMap: Record<string, string> = {
          todo: "draft", "to-do": "draft", "to_do": "draft", backlog: "draft",
          doing: "active", "in-progress": "active", "in_progress": "active", andamento: "active",
          review: "in_review", revisao: "in_review", "em-revisao": "in_review",
          blocked: "blocked", bloqueada: "blocked", bloqueado: "blocked",
          done: "done", concluida: "done", concluido: "done", finalizada: "done",
        };
        const opsStatus = statusMap[portalStatus] ?? portalStatus;

        const isDeleted = event === "task_deleted" || event === "DELETE" || data.deleted === true;
        if (isDeleted && portalTaskId) {
          const delRes = await supabase.from("canvas_nodes").delete()
            .eq("workspace_id", ws.id)
            .contains("data", { portal_task_id: portalTaskId });
          await logSync({
            direction: "portal_to_ops",
            event: "task_deleted",
            status: delRes.error ? "error" : "ok",
            workspaceId: ws.id,
            clientId: ws.client_id,
            portalProjectId: portalProjectId ?? null,
            portalTaskId,
            portalMilestoneId,
            message: delRes.error ? delRes.error.message : "deleted by portal",
            source,
          });
        } else if (portalTaskId) {
          const projectId = portalProjectId ?? firstString(data.project_id, data.workspace_id) ?? "portal-project";
          let projectGroupId: string | null = null;
          const { data: projectGroup } = await supabase
            .from("canvas_nodes")
            .select("id, data")
            .eq("workspace_id", ws.id)
            .contains("data", { kind: "project_group", portal_project_id: projectId })
            .maybeSingle();
          if (projectGroup?.id) projectGroupId = projectGroup.id;
          else {
            const { data: clientNode } = await supabase
              .from("canvas_nodes")
              .select("id, pos_x, pos_y")
              .eq("workspace_id", ws.id)
              .eq("node_type", "client")
              .eq("client_id", ws.client_id)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();
            const { data: createdGroup } = await supabase.from("canvas_nodes").insert({
              workspace_id: ws.id,
              client_id: ws.client_id,
              parent_node_id: clientNode?.id ?? null,
              node_type: "front",
              title: firstString(data.project_title, data.project_name) ?? "Projeto do portal",
              status: "active",
              pos_x: Number(clientNode?.pos_x ?? 80),
              pos_y: Number(clientNode?.pos_y ?? 0) + 190,
              data: { kind: "project_group", from_portal: true, portal_project_id: projectId, stage: "producao" },
            }).select("id").single();
            projectGroupId = createdGroup?.id ?? null;
          }

          let milestoneGroupId: string | null = null;
          const milestoneContains = portalMilestoneId
            ? { kind: "milestone_group", portal_milestone_id: portalMilestoneId }
            : { kind: "milestone_group", portal_project_id: projectId, milestone_key: milestoneKey };
          const { data: milestoneGroup } = await supabase
            .from("canvas_nodes")
            .select("id, data")
            .eq("workspace_id", ws.id)
            .contains("data", milestoneContains)
            .maybeSingle();
          if (milestoneGroup?.id) milestoneGroupId = milestoneGroup.id;
          else {
            const { count } = await supabase.from("canvas_nodes").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).contains("data", { kind: "milestone_group", portal_project_id: projectId });
            const { data: createdMilestone } = await supabase.from("canvas_nodes").insert({
              workspace_id: ws.id,
              client_id: ws.client_id,
              parent_node_id: projectGroupId,
              node_type: "front",
              title: milestoneTitle,
              status: "active",
              pos_x: 112,
              pos_y: 360 + (count ?? 0) * 420,
              data: compactRecord({ kind: "milestone_group", from_portal: true, portal_project_id: projectId, portal_milestone_id: portalMilestoneId ?? undefined, portal_folder_id: portalMilestoneId ?? undefined, milestone_key: milestoneKey, stage: "producao" }),
            }).select("id").single();
            milestoneGroupId = createdMilestone?.id ?? null;
          }

          // procura node existente por portal_task_id em data
          const { data: existing } = await supabase
            .from("canvas_nodes")
            .select("id, data, updated_at")
            .eq("workspace_id", ws.id)
            .contains("data", { portal_task_id: portalTaskId })
            .limit(1)
            .maybeSingle();

          if (existing) {
            const currentData = (existing.data as Record<string, unknown>) ?? {};
            // Consistência: descarta payload mais antigo que o estado atual.
            // Compara updated_at do payload do portal contra o portal_updated_at
            // gravado no node. Se o evento atual for mais velho, ignora — evita
            // que UPDATE atrasado sobrescreva um status mais novo.
            const incomingTs = Date.parse(firstString(data.updated_at, data.modified_at) || "") || 0;
            const lastPortalTs = Date.parse(String(currentData.portal_updated_at ?? "")) || 0;
            if (incomingTs && lastPortalTs && incomingTs < lastPortalTs) {
              await logSync({
                direction: "portal_to_ops",
                event: "task_upsert",
                status: "skipped",
                workspaceId: ws.id,
                clientId: ws.client_id,
                nodeId: existing.id,
                portalProjectId: projectId,
                portalTaskId,
                portalMilestoneId,
                message: "stale_portal_event",
                payload: { incoming_updated_at: data.updated_at, current_portal_updated_at: currentData.portal_updated_at, incoming_status: portalStatus, current_status: existing && (existing as any).status },
                source,
              });
              return json({ ok: true, skipped: "stale_portal_event", portalTaskId });
            }
            const prevStatus = (existing as any)?.status ?? null;
            const updRes = await supabase.from("canvas_nodes").update({
              title,
              status: opsStatus,
              parent_node_id: milestoneGroupId,
              updated_at: new Date().toISOString(),
              data: compactRecord({
                ...currentData,
                portal_task_id: portalTaskId,
                portal_project_id: projectId,
                portal_milestone_id: portalMilestoneId ?? undefined,
                portal_folder_id: portalMilestoneId ?? undefined,
                milestone_key: milestoneKey,
                milestone_title: milestoneTitle,
                kind: (currentData.kind && currentData.kind !== "checklist") ? currentData.kind : inferredKind,
                from_portal: true,
                portal_updated_at: incomingTs ? new Date(incomingTs).toISOString() : new Date().toISOString(),
              }),
            }).eq("id", existing.id);
            await logSync({
              direction: "portal_to_ops",
              event: "task_upsert",
              status: updRes.error ? "error" : "ok",
              workspaceId: ws.id,
              clientId: ws.client_id,
              nodeId: existing.id,
              portalProjectId: projectId,
              portalTaskId,
              portalMilestoneId,
              message: updRes.error ? updRes.error.message : `task_updated ${prevStatus ?? "?"}→${opsStatus}`,
              payload: { title, status_in: portalStatus, status_out: opsStatus, milestone_key: milestoneKey, milestone_title: milestoneTitle },
              source,
            });
          } else {
            // posição: empilha verticalmente abaixo do canvas (operador arrasta depois)
            const { count } = await supabase
              .from("canvas_nodes")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", ws.id);
            const idx = count ?? 0;
            const insRes = await supabase.from("canvas_nodes").insert({
              workspace_id: ws.id,
              client_id: ws.client_id,
              parent_node_id: milestoneGroupId,
              node_type: "task",
              title,
              description,
              status: opsStatus,
              pos_x: 80 + (idx % 6) * 320,
              pos_y: 800 + Math.floor(idx / 6) * 220,
              data: compactRecord({ from_portal: true, portal_task_id: portalTaskId, portal_project_id: projectId, portal_milestone_id: portalMilestoneId ?? undefined, portal_folder_id: portalMilestoneId ?? undefined, milestone_key: milestoneKey, milestone_title: milestoneTitle, kind: inferredKind, checklist: [], touched_at: null }),
            }).select("id").single();
            const created = insRes.data as { id: string } | null;
            await logSync({
              direction: "portal_to_ops",
              event: "task_upsert",
              status: insRes.error ? "error" : "ok",
              workspaceId: ws.id,
              clientId: ws.client_id,
              nodeId: created?.id ?? null,
              portalProjectId: projectId,
              portalTaskId,
              portalMilestoneId,
              message: insRes.error ? insRes.error.message : "task_created",
              payload: { title, status: opsStatus, milestone_key: milestoneKey, milestone_title: milestoneTitle },
              source,
            });

            // Callback de pareamento: avisa o portal que o node foi criado, com portal_task_id.
            // Portal usa isso pra setar tasks.ops_node_id e fechar o vínculo.
            if (created?.id) {
              try {
                await supabase.functions.invoke("sync-to-portal", {
                  body: {
                    event: "node_created",
                    workspaceId: ws.id,
                    clientId: ws.client_id,
                    nodeId: created.id,
                    nodeTitle: title,
                    nodeType: "checklist",
                    status: opsStatus,
                    portalTaskId,
                    portalProjectId: projectId,
                    source: "ops",
                  },
                });
              } catch (e) {
                console.error("[receive-portal-sync] pairing callback failed:", e);
              }
            }
          }
        }
      }

      const { error } = await supabase.from("timeline_events").insert({
        workspace_id: ws.id,
        client_id: ws.client_id,
        event_type: `portal_${type}`,
        title,
        description,
        happened_at: happenedAt,
        metadata: { source: "portal_sync", portal_id: data.id, raw_type: rawType, event },
      });
      if (error) throw error;

      return json({ ok: true, action: "timeline_event_created", type });
    }

    // Safety net final: deletes nunca podem cair em "ignored". Se chegou aqui
    // com isDeleteEvent=true significa que algo no payload não bateu — devolve
    // delete_unhandled com debug pra Portal corrigir, mas com status estável.
    if (isDeleteEvent) {
      await logSync({
        direction: "portal_to_ops",
        event: event || "unknown_delete",
        status: "skipped",
        message: "delete_unhandled",
        payload: { rawType, type, event, has_id: !!data.id },
        source,
      });
      return json({ ok: true, action: "delete_unhandled", type_received: rawType, event, hint: "delete event reached final branch — type/id missing" });
    }
    // Tipo desconhecido — aceita silenciosamente.
    return json({ ok: true, action: "ignored", type_received: rawType });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
