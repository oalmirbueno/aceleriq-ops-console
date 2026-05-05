/**
 * backfill-from-portal v5 — usa ops-full-export do portal.
 * Puxa TUDO: profiles, projects, briefings, milestones, tasks, updates.
 * Cria clientes, workspaces, timeline events, essential_briefing completo.
 * (redeploy trigger)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function firstString(...values: unknown[]) {
  for (const value of values) {
    const str = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (str) return str;
  }
  return "";
}

function projectIdOf(record: any) {
  return firstString(record?.project_id, record?.portal_project_id, record?.workspace_id, record?.project?.id, record?.milestone?.project_id, record?.folder?.project_id);
}

function milestoneIdOf(record: any) {
  return firstString(record?.milestone_id, record?.portal_milestone_id, record?.folder_id, record?.portal_folder_id, record?.stage_id, record?.phase_id, record?.column_id, record?.milestone?.id, record?.folder?.id);
}

function portalStatusToOps(status: unknown) {
  const s = String(status ?? "").toLowerCase();
  if (["done", "completed", "concluido", "concluida", "concluída", "finalizada"].includes(s)) return "done";
  if (["doing", "active", "in_progress", "in-progress", "andamento"].includes(s)) return "active";
  if (["blocked", "bloqueado", "bloqueada"].includes(s)) return "blocked";
  return "draft";
}

function sortPortalItems<T extends Record<string, any>>(items: T[]) {
  return items.slice().sort((a, b) => {
    const ap = Number(a.position ?? a.order ?? a.sort_order ?? a.sequence ?? 9999);
    const bp = Number(b.position ?? b.order ?? b.sort_order ?? b.sequence ?? 9999);
    if (Number.isFinite(ap) && Number.isFinite(bp) && ap !== bp) return ap - bp;
    return String(a.created_at ?? a.title ?? a.name ?? a.id ?? "").localeCompare(String(b.created_at ?? b.title ?? b.name ?? b.id ?? ""));
  });
}

async function materializeProjectCanvas(ops: any, args: {
  workspaceId: string; opsClientId: string; clientName: string; project: any; milestones: any[]; tasks: any[];
}) {
  const projectId = firstString(args.project?.id, args.project?.project_id, args.project?.uuid);
  if (!projectId) return { projects: 0, milestones: 0, tasks: 0 };
  const now = new Date().toISOString();
  const { data: existingClient } = await ops.from("canvas_nodes")
    .select("id, pos_x, pos_y")
    .eq("workspace_id", args.workspaceId)
    .eq("node_type", "client")
    .or(`linked_entity_id.eq.${args.opsClientId},client_id.eq.${args.opsClientId}`)
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  let clientNode = existingClient;
  if (!clientNode?.id) {
    const { data: createdClient } = await ops.from("canvas_nodes").insert({
      workspace_id: args.workspaceId,
      client_id: args.opsClientId,
      linked_entity_id: args.opsClientId,
      linked_entity_type: "clients",
      node_type: "client",
      title: args.clientName,
      status: "active",
      pos_x: 80,
      pos_y: 0,
      data: { kind: "client", from_portal: true },
    }).select("id, pos_x, pos_y").single();
    clientNode = createdClient;
  }
  const baseX = Number(clientNode?.pos_x ?? 80);
  const baseY = Number(clientNode?.pos_y ?? 0);
  const projectTitle = firstString(args.project?.name, args.project?.title, args.project?.project_name, "Projeto do Portal");
  const projectStatus = firstString(args.project?.status, args.project?.state, "active");
  const { data: existingProject } = await ops.from("canvas_nodes")
    .select("id, data")
    .eq("workspace_id", args.workspaceId)
    .contains("data", { kind: "project_group", portal_project_id: projectId })
    .order("created_at", { ascending: true })
    .limit(1).maybeSingle();
  let projectNodeId = existingProject?.id ?? null;
  const projectPayload = { kind: "project_group", from_portal: true, portal_project_id: projectId, portal_status: projectStatus, stage: "producao" };
  if (projectNodeId) {
    await ops.from("canvas_nodes").update({ parent_node_id: clientNode?.id ?? null, title: projectTitle, status: portalStatusToOps(projectStatus) === "done" ? "done" : "active", pos_x: baseX, pos_y: baseY + 190, updated_at: now, data: { ...((existingProject.data as Record<string, unknown>) ?? {}), ...projectPayload } }).eq("id", projectNodeId);
  } else {
    const { data: createdProject } = await ops.from("canvas_nodes").insert({ workspace_id: args.workspaceId, client_id: args.opsClientId, parent_node_id: clientNode?.id ?? null, node_type: "front", title: projectTitle, status: portalStatusToOps(projectStatus) === "done" ? "done" : "active", pos_x: baseX, pos_y: baseY + 190, data: projectPayload }).select("id").single();
    projectNodeId = createdProject?.id ?? null;
  }
  let milestonesCount = 0, tasksCount = 0;
  const milestoneNodeByKey = new Map<string, string | null>();
  const projectMilestones = sortPortalItems(args.milestones.filter((m) => projectIdOf(m) === projectId));
  for (const [index, ms] of projectMilestones.entries()) {
    const portalMilestoneId = firstString(ms.id, ms.milestone_id, ms.folder_id, ms.portal_folder_id, ms.uuid);
    const milestoneKey = firstString(portalMilestoneId, ms.key, ms.slug, ms.title, ms.name, `milestone-${index}`);
    const title = firstString(ms.title, ms.name, ms.folder_name, `Milestone ${index + 1}`);
    const contains = portalMilestoneId ? { kind: "milestone_group", portal_milestone_id: portalMilestoneId } : { kind: "milestone_group", portal_project_id: projectId, milestone_key: milestoneKey };
    const { data: existingMs } = await ops.from("canvas_nodes").select("id, data").eq("workspace_id", args.workspaceId).contains("data", contains).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const data = { ...((existingMs?.data as Record<string, unknown>) ?? {}), kind: "milestone_group", from_portal: true, portal_project_id: projectId, portal_milestone_id: portalMilestoneId || undefined, milestone_key: milestoneKey, portal_position: Number(ms.position ?? ms.order ?? ms.sort_order ?? index), portal_status: firstString(ms.status, "active"), stage: "producao" };
    const payload = { parent_node_id: projectNodeId, title, status: portalStatusToOps(ms.status ?? "active") === "draft" ? "active" : portalStatusToOps(ms.status ?? "active"), pos_x: baseX + 32 + index * 360, pos_y: baseY + 350, updated_at: now, data };
    let milestoneNodeId = existingMs?.id ?? null;
    if (milestoneNodeId) await ops.from("canvas_nodes").update(payload).eq("id", milestoneNodeId);
    else {
      const { data: createdMs } = await ops.from("canvas_nodes").insert({ workspace_id: args.workspaceId, client_id: args.opsClientId, node_type: "front", ...payload }).select("id").single();
      milestoneNodeId = createdMs?.id ?? null;
    }
    milestoneNodeByKey.set(portalMilestoneId || milestoneKey, milestoneNodeId);
    milestonesCount++;
  }
  const projectTasks = sortPortalItems(args.tasks.filter((t) => projectIdOf(t) === projectId));
  for (const [index, task] of projectTasks.entries()) {
    const portalTaskId = firstString(task.id, task.task_id, task.uuid);
    if (!portalTaskId) continue;
    const taskMilestoneId = milestoneIdOf(task);
    const milestoneNodeId = milestoneNodeByKey.get(taskMilestoneId) ?? null;
    const { data: existingTask } = await ops.from("canvas_nodes").select("id, data").eq("workspace_id", args.workspaceId).contains("data", { portal_task_id: portalTaskId }).order("created_at", { ascending: true }).limit(1).maybeSingle();
    const data = { ...((existingTask?.data as Record<string, unknown>) ?? {}), kind: ((existingTask?.data as Record<string, unknown> | null)?.kind ?? "checklist"), from_portal: true, portal_task_id: portalTaskId, portal_project_id: projectId, portal_milestone_id: taskMilestoneId || undefined, milestone_key: taskMilestoneId || undefined, portal_status: firstString(task.status, task.kanban_status, "todo"), portal_position: Number(task.position ?? task.order ?? task.sort_order ?? index), stage: "producao" };
    const payload = { parent_node_id: milestoneNodeId ?? projectNodeId, title: firstString(task.title, task.name, "Tarefa do Portal"), status: portalStatusToOps(task.status ?? task.kanban_status), description: task.description ?? task.notes ?? null, pos_x: baseX + 64 + (index % Math.max(projectMilestones.length, 1)) * 360, pos_y: baseY + 480 + Math.floor(index / Math.max(projectMilestones.length, 1)) * 136, updated_at: now, data };
    if (existingTask?.id) await ops.from("canvas_nodes").update(payload).eq("id", existingTask.id);
    else await ops.from("canvas_nodes").insert({ workspace_id: args.workspaceId, client_id: args.opsClientId, node_type: "task", ...payload });
    tasksCount++;
  }
  return { projects: 1, milestones: milestonesCount, tasks: tasksCount };
}

function inferOpsType(t: string | null): string {
  const s = (t ?? "").toLowerCase();
  if (s.includes("site")) return "one_shot_site";
  if (s.includes("auto")) return "one_shot_automation";
  if (s.includes("agent") || s.includes("bot") || s.includes("chatbot")) return "one_shot_agent";
  if (s.includes("market") || s.includes("trafego") || s.includes("ads")) return "marketing_service";
  return "ai_first";
}

function inferPlan(p: string | null): string {
  const s = (p ?? "").toLowerCase();
  if (s.includes("enterprise") || s.includes("escala")) return "enterprise";
  if (s.includes("growth") || s.includes("aceler")) return "growth";
  return "starter";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const requestBody = (await req.json().catch(() => ({}))) as { workspaceId?: string; portalProjectId?: string };
    const requestedWorkspaceId = firstString(requestBody.workspaceId);
    const requestedPortalProjectId = firstString(requestBody.portalProjectId);
    const ops = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";

    // ─── 1. Chama ops-full-export do portal ───────────────────────
    const exportRes = await fetch(
      "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-full-export",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-webhook-secret": SECRET,
          "apikey": Deno.env.get("PORTAL_ANON_KEY") ?? "",
          "Authorization": `Bearer ${Deno.env.get("PORTAL_ANON_KEY") ?? ""}`,
        },
      }
    );

    if (!exportRes.ok) {
      const txt = await exportRes.text();
      return new Response(JSON.stringify({ error: `ops-full-export falhou: ${exportRes.status}`, detail: txt.slice(0, 300) }),
        { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const portal = await exportRes.json();
    const profiles:   any[] = portal.profiles   ?? [];
    const projects:   any[] = portal.projects   ?? [];
    const briefings:  any[] = portal.briefings  ?? [];
    const milestones: any[] = portal.milestones ?? [];
    const tasks:      any[] = portal.tasks      ?? [];
    const updates:    any[] = portal.updates    ?? [];

    const stats = {
      portal_counts: portal._meta?.counts ?? {},
      clients_created: 0, clients_updated: 0,
      workspaces_created: 0, workspaces_updated: 0,
      briefings_merged: 0, milestones_synced: 0, tasks_synced: 0, updates_synced: 0,
      canvas_projects_synced: 0, canvas_milestones_synced: 0, canvas_tasks_synced: 0,
      errors: [] as string[],
    };

    // ─── Indexar dados do portal ──────────────────────────────────
    const projectsByClient = new Map<string, any[]>();
    projects.forEach(p => {
      const l = projectsByClient.get(p.client_id) ?? [];
      l.push(p);
      projectsByClient.set(p.client_id, l);
    });

    const briefingByClient = new Map<string, any>();
    const briefingByProject = new Map<string, any>();
    briefings.forEach(b => {
      if (b.client_id && !briefingByClient.has(b.client_id)) briefingByClient.set(b.client_id, b);
      if (b.project_id && !briefingByProject.has(b.project_id)) briefingByProject.set(b.project_id, b);
    });

    const milestonesByProject = new Map<string, any[]>();
    milestones.forEach(m => {
      const projectId = projectIdOf(m);
      if (!projectId) return;
      const l = milestonesByProject.get(projectId) ?? [];
      l.push(m);
      milestonesByProject.set(projectId, l);
    });

    const tasksByProject = new Map<string, any[]>();
    tasks.forEach(t => {
      const projectId = projectIdOf(t);
      if (!projectId) return;
      const l = tasksByProject.get(projectId) ?? [];
      l.push(t);
      tasksByProject.set(projectId, l);
    });

    const updatesByProject = new Map<string, any[]>();
    updates.forEach(u => {
      const l = updatesByProject.get(u.project_id) ?? [];
      l.push(u);
      updatesByProject.set(u.project_id, l);
    });

    // ─── 2. Processa cada profile ─────────────────────────────────
    for (const profile of profiles) {
      try {
        const pid = profile.id;
        const clientProjects = projectsByClient.get(pid) ?? [];
        const briefing = briefingByClient.get(pid);

        // Monta essential_briefing completo
        const eb: Record<string, any> = {};
        if (profile.full_name)    eb.client_name = profile.full_name;
        if (profile.company_name) eb.company     = profile.company_name;
        if (profile.phone)        eb.phone       = profile.phone;
        if (profile.email)        eb.email       = profile.email;

        // Briefing responses (15+ keys)
        if (briefing?.responses && typeof briefing.responses === "object") {
          Object.assign(eb, briefing.responses);
        }

        // Dados do projeto principal
        if (clientProjects.length > 0) {
          const main = clientProjects[0];
          if (main.scope)       eb.scope       = eb.scope       || main.scope;
          if (main.objectives)  eb.objectives  = eb.objectives  || main.objectives;
          if (main.description) eb.positioning = eb.positioning || main.description;
          if (main.project_type) eb.project_type = main.project_type;
        }

        const plan = inferPlan(profile.plan_name);
        const pType = clientProjects.length > 0 ? inferOpsType(clientProjects[0].project_type) : "ai_first";

        // ── Upsert cliente ──────────────────────────────────────
        const { data: existing } = await ops.from("clients")
          .select("id, metadata, plan_name, project_type")
          .eq("portal_client_id", pid).maybeSingle();

        let opsClientId: string;

        if (existing) {
          const cm = (existing.metadata as Record<string, any>) ?? {};
          const ce = (cm.essential_briefing as Record<string, any>) ?? {};
          const merged = { ...eb, ...ce }; // Ops manual tem prioridade

          await ops.from("clients").update({
            plan_name:    existing.plan_name    || plan,
            project_type: existing.project_type || pType,
            company_name: (existing as any).company_name || profile.company_name || null,
            metadata: {
              ...cm,
              essential_briefing: merged,
              lead_email:    cm.lead_email    || profile.email  || null,
              lead_phone:    cm.lead_phone    || profile.phone  || null,
              portal_sync_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);
          opsClientId = existing.id;
          stats.clients_updated++;
        } else {
          // Tenta vincular por email
          let found: string | null = null;
          if (profile.email) {
            const { data: byEmail } = await ops.from("clients")
              .select("id, metadata").eq("metadata->>lead_email", profile.email).maybeSingle();
            if (byEmail) {
              const cm = (byEmail.metadata as Record<string, any>) ?? {};
              const ce = (cm.essential_briefing as Record<string, any>) ?? {};
              await ops.from("clients").update({
                portal_client_id: pid,
                company_name: (byEmail as any).company_name || profile.company_name || null,
                metadata: { ...cm, essential_briefing: { ...eb, ...ce }, portal_sync_at: new Date().toISOString() },
              }).eq("id", byEmail.id);
              found = byEmail.id;
              stats.clients_updated++;
            }
          }

          if (found) {
            opsClientId = found;
          } else {
            const name = profile.full_name || profile.email || `Cliente ${pid.slice(0, 8)}`;
            const { data: nc, error } = await ops.from("clients").insert({
              name,
              company_name: profile.company_name || null,
              status: "onboarding",
              plan_name: plan,
              project_type: pType,
              portal_client_id: pid,
              metadata: {
                essential_briefing: eb,
                lead_email: profile.email || null,
                lead_phone: profile.phone || null,
                source: "backfill_from_portal",
                portal_sync_at: new Date().toISOString(),
              },
            }).select("id").single();
            if (error) throw new Error(error.message);
            opsClientId = nc!.id;
            stats.clients_created++;
          }
        }

        if (Object.keys(eb).length > 2) stats.briefings_merged++;

        // ── Sync projetos → workspaces ──────────────────────────
        if (clientProjects.length === 0) {
          // Garante workspace básico
          const { data: ws } = await ops.from("workspaces")
            .select("id").eq("client_id", opsClientId).limit(1).maybeSingle();
          if (!ws) {
            await ops.from("workspaces").insert({
              client_id: opsClientId,
              name: `${profile.full_name || "Cliente"} — Workspace`,
              status: "setup", current_stage: "entrada", project_type: pType,
              metadata: { portal_sync: { auto_created: true } },
            });
            stats.workspaces_created++;
          }
        } else {
          for (const proj of clientProjects) {
            if (requestedPortalProjectId && firstString(proj.id, proj.project_id, proj.uuid) !== requestedPortalProjectId) continue;
            const projBriefing = briefingByProject.get(proj.id);
            const projEb = { ...eb };
            if (projBriefing?.responses) Object.assign(projEb, projBriefing.responses);
            if (proj.scope)      projEb.scope      = proj.scope;
            if (proj.objectives) projEb.objectives  = proj.objectives;

            const { data: existWs } = await ops.from("workspaces")
              .select("id").eq("portal_project_id", proj.id).maybeSingle();

            let wsId: string;

            if (existWs) {
              if (requestedWorkspaceId && existWs.id !== requestedWorkspaceId) continue;
              await ops.from("workspaces").update({
                name: proj.name,
                summary: proj.description || null,
                status: proj.status === "completed" ? "completed" : proj.status === "active" ? "active" : "setup",
                project_type: inferOpsType(proj.project_type),
                metadata: {
                  essential_briefing: projEb,
                  portal_sync: {
                    portal_project_id: proj.id,
                    portal_project_type: proj.project_type,
                    portal_progress: proj.progress,
                    portal_scope: proj.scope,
                    portal_objectives: proj.objectives,
                    portal_start_date: proj.start_date,
                    portal_deadline: proj.deadline,
                    last_synced_at: new Date().toISOString(),
                  },
                },
                updated_at: new Date().toISOString(),
              }).eq("id", existWs.id);
              wsId = existWs.id;
              stats.workspaces_updated++;
            } else {
              const { data: nw, error } = await ops.from("workspaces").insert({
                client_id: opsClientId,
                name: proj.name,
                status: "setup", current_stage: "entrada",
                portal_project_id: proj.id,
                project_type: inferOpsType(proj.project_type),
                summary: proj.description || null,
                metadata: {
                  essential_briefing: projEb,
                  portal_sync: {
                    portal_project_id: proj.id,
                    portal_project_type: proj.project_type,
                    portal_progress: proj.progress,
                    portal_scope: proj.scope,
                    portal_objectives: proj.objectives,
                    source: "backfill",
                  },
                },
              }).select("id").single();
              if (error) throw new Error(error.message);
              wsId = nw!.id;
              stats.workspaces_created++;
            }

            const canvasSync = await materializeProjectCanvas(ops, {
              workspaceId: wsId,
              opsClientId,
              clientName: profile.full_name || profile.company_name || "Cliente",
              project: proj,
              milestones,
              tasks,
            });
            stats.canvas_projects_synced += canvasSync.projects;
            stats.canvas_milestones_synced += canvasSync.milestones;
            stats.canvas_tasks_synced += canvasSync.tasks;

            // ── Sync milestones → timeline_events ──
            for (const ms of (milestonesByProject.get(proj.id) ?? [])) {
              const { data: ex } = await ops.from("timeline_events")
                .select("id").eq("workspace_id", wsId)
                .eq("payload->>portal_milestone_id", ms.id).maybeSingle();
              if (!ex) {
                await ops.from("timeline_events").insert({
                  workspace_id: wsId, client_id: opsClientId,
                  event_type: "manual_note",
                  title: `[Portal milestone] ${ms.title}`, description: ms.description || null,
                  happened_at: ms.target_date || ms.created_at || new Date().toISOString(),
                  payload: { source: "backfill", portal_milestone_id: ms.id, status: ms.status, kind: "portal_milestone" },
                });
                stats.milestones_synced++;
              }
            }

            // ── Sync tasks → timeline_events ──
            for (const task of (tasksByProject.get(proj.id) ?? [])) {
              const status = (task.status ?? "").toLowerCase();
              const { data: ex } = await ops.from("timeline_events")
                .select("id").eq("workspace_id", wsId)
                .eq("payload->>portal_task_id", task.id).maybeSingle();
              if (!ex) {
                await ops.from("timeline_events").insert({
                  workspace_id: wsId, client_id: opsClientId,
                  event_type: ["completed", "done"].includes(status) ? "task_completed" : "task_created",
                  title: `[Portal task] ${task.title}`, description: task.description || null,
                  happened_at: task.created_at || new Date().toISOString(),
                  payload: { source: "backfill", portal_task_id: task.id, priority: task.priority, status: task.status, kind: "portal_task" },
                });
                stats.tasks_synced++;
              }
            }

            // ── Sync updates → timeline_events ──
            for (const upd of (updatesByProject.get(proj.id) ?? [])) {
              const { data: ex } = await ops.from("timeline_events")
                .select("id").eq("workspace_id", wsId)
                .eq("payload->>portal_update_id", upd.id).maybeSingle();
              if (!ex) {
                await ops.from("timeline_events").insert({
                  workspace_id: wsId, client_id: opsClientId,
                  event_type: "manual_note",
                  title: `[Portal update] ${(upd.message ?? "Update do portal").slice(0, 180)}`,
                  happened_at: upd.created_at || new Date().toISOString(),
                  payload: { source: "backfill", portal_update_id: upd.id, update_type: upd.update_type, kind: "portal_update" },
                });
                stats.updates_synced++;
              }
            }
          }
        }
      } catch (err) {
        stats.errors.push(`${profile.full_name || profile.id}: ${(err as Error).message?.slice(0, 100)}`);
      }
    }

    const summary = [
      `Portal: ${profiles.length} clientes, ${projects.length} projetos, ${briefings.length} briefings, ${milestones.length} milestones, ${tasks.length} tasks, ${updates.length} updates`,
      `Ops: ${stats.clients_created} criados, ${stats.clients_updated} atualizados, ${stats.workspaces_created} ws criados, ${stats.workspaces_updated} ws atualizados`,
      `${stats.briefings_merged} briefings, ${stats.milestones_synced} milestones, ${stats.tasks_synced} tasks, ${stats.updates_synced} updates sincronizados`,
      stats.errors.length > 0 ? `${stats.errors.length} erros` : "zero erros",
    ].join(" | ");

    // ─── Reconciliação de deleções ──────────────────────────────
    // Qualquer cliente/workspace do Ops com portal_client_id ou
    // portal_project_id que não existe mais no portal é removido.
    const portalProfileIds = new Set(profiles.map((p: any) => String(p.id)).filter(Boolean));
    const portalProjectIds = new Set(projects.map((p: any) => String(p.id)).filter(Boolean));

    const reconcile = { clients_deleted: 0, workspaces_deleted: 0, errors: [] as string[] };

    try {
      const { data: opsClients } = await ops
        .from("clients")
        .select("id, portal_client_id")
        .not("portal_client_id", "is", null);
      const orphanClientIds = (opsClients ?? [])
        .filter((c: any) => c.portal_client_id && !portalProfileIds.has(String(c.portal_client_id)))
        .map((c: any) => c.id);
      if (orphanClientIds.length) {
        const { data: wss } = await ops.from("workspaces").select("id").in("client_id", orphanClientIds);
        const wsIds = (wss ?? []).map((w: any) => w.id);
        if (wsIds.length) {
          await ops.from("canvas_edges").delete().in("workspace_id", wsIds);
          await ops.from("canvas_nodes").delete().in("workspace_id", wsIds);
          await ops.from("timeline_events").delete().in("workspace_id", wsIds);
          await ops.from("workspaces").delete().in("id", wsIds);
          reconcile.workspaces_deleted += wsIds.length;
        }
        await ops.from("clients").delete().in("id", orphanClientIds);
        reconcile.clients_deleted += orphanClientIds.length;
      }

      const { data: opsWs } = await ops
        .from("workspaces")
        .select("id, portal_project_id")
        .not("portal_project_id", "is", null);
      const orphanWsIds = (opsWs ?? [])
        .filter((w: any) => w.portal_project_id && !portalProjectIds.has(String(w.portal_project_id)))
        .map((w: any) => w.id);
      if (orphanWsIds.length) {
        await ops.from("canvas_edges").delete().in("workspace_id", orphanWsIds);
        await ops.from("canvas_nodes").delete().in("workspace_id", orphanWsIds);
        await ops.from("timeline_events").delete().in("workspace_id", orphanWsIds);
        await ops.from("workspaces").delete().in("id", orphanWsIds);
        reconcile.workspaces_deleted += orphanWsIds.length;
      }
    } catch (err) {
      reconcile.errors.push((err as Error).message?.slice(0, 200) ?? "reconcile error");
    }

    const finalSummary = `${summary} | reconcile: ${reconcile.clients_deleted} clients, ${reconcile.workspaces_deleted} workspaces removidos`;
    return new Response(JSON.stringify({ ok: true, stats, reconcile, summary: finalSummary }),
      { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
