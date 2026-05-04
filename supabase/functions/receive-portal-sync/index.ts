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

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
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
    updates: "update",
    update: "update",
    tasks: "task",
    task: "task",
    files: "file",
    file: "file",
  };
  return map[type.toLowerCase()] ?? type.toLowerCase();
}

function firstString(...values: unknown[]): string | null {
  for (const v of values) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
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

async function ensureWorkspace(supabase: any, opsClientId: string, clientName: string, portalClientId: string | null, projectType = "ai_first") {
  const { data: existingWs } = await supabase
    .from("workspaces")
    .select("id")
    .eq("client_id", opsClientId)
    .limit(1)
    .maybeSingle();
  if (existingWs) return { workspaceId: existingWs.id, created: false };

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
          portal_client_id: portalClientId,
          source: "portal_sync",
          created_at: new Date().toISOString(),
        },
      },
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
    const rawType = String(body.type ?? "");
    const type = normalizeType(rawType);
    const data = (body.data ?? {}) as Record<string, unknown>;
    const context = (body.context ?? {}) as Record<string, unknown>;
    const event = String(body.event ?? "");
    const source = String(body.source ?? "").toLowerCase();

    // Anti-loop: ignora eventos que vieram do próprio Ops (ricocheteados pelo portal).
    if (source === "ops") {
      return json({ ok: true, action: "ignored_self_origin" });
    }

    if (!rawType || !data || typeof data !== "object") {
      return json({ error: "type e data são obrigatórios" }, 400);
    }

    if (event === "DELETE") {
      return json({ ok: true, action: "delete_ignored", type_received: rawType });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
      const portalProjectId = firstString(data.project_id, data.workspace_id);
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
        const ensured = await ensureWorkspace(supabase, opsClientId, clientName, firstString(data.client_id, data.user_id));
        ws = { id: ensured.workspaceId, client_id: opsClientId };
      }

      const title = firstString(data.title, data.name, data.message) || (type === "update" ? "Update do portal" : `${type} do portal`);
      const description = firstString(data.description, data.message, data.content);
      const happenedAt = firstString(data.target_date, data.created_at, data.updated_at) || new Date().toISOString();

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

      // ── TASK: cria/atualiza/remove node correspondente no canvas ────
      if (type === "task") {
        const portalTaskId = firstString(data.id, data.task_id);
        const portalStatus = (firstString(data.status, data.kanban_status) ?? "draft").toLowerCase();
        // mapeia status do kanban → ops
        const statusMap: Record<string, string> = {
          todo: "draft", "to-do": "draft", "to_do": "draft", backlog: "draft",
          doing: "active", "in-progress": "active", "in_progress": "active", andamento: "active",
          review: "in_review", revisao: "in_review", "em-revisao": "in_review",
          blocked: "blocked", bloqueada: "blocked", bloqueado: "blocked",
          done: "done", concluida: "done", concluido: "done", finalizada: "done",
        };
        const opsStatus = statusMap[portalStatus] ?? portalStatus;

        const isDeleted = event === "task_deleted" || data.deleted === true;
        if (isDeleted && portalTaskId) {
          await supabase.from("canvas_nodes").delete()
            .eq("workspace_id", ws.id)
            .contains("data", { portal_task_id: portalTaskId });
        } else if (portalTaskId) {
          // procura node existente por portal_task_id em data
          const { data: existing } = await supabase
            .from("canvas_nodes")
            .select("id, data")
            .eq("workspace_id", ws.id)
            .contains("data", { portal_task_id: portalTaskId })
            .maybeSingle();

          if (existing) {
            await supabase.from("canvas_nodes").update({
              title,
              status: opsStatus,
              updated_at: new Date().toISOString(),
              data: { ...((existing.data as Record<string, unknown>) ?? {}), portal_task_id: portalTaskId, from_portal: true },
            }).eq("id", existing.id);
          } else {
            // posição: empilha verticalmente abaixo do canvas (operador arrasta depois)
            const { count } = await supabase
              .from("canvas_nodes")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", ws.id);
            const idx = count ?? 0;
            const { data: created } = await supabase.from("canvas_nodes").insert({
              workspace_id: ws.id,
              client_id: ws.client_id,
              parent_node_id: null,
              node_type: "checklist",
              title,
              description,
              status: opsStatus,
              pos_x: 80 + (idx % 6) * 320,
              pos_y: 800 + Math.floor(idx / 6) * 220,
              data: { from_portal: true, portal_task_id: portalTaskId, touched_at: null },
            }).select("id").single();

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

      return json({ ok: true, action: "timeline_event_created", type });
    }

    // Tipo desconhecido — aceita silenciosamente.
    return json({ ok: true, action: "ignored", type_received: rawType });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Erro desconhecido" }, 500);
  }
});
