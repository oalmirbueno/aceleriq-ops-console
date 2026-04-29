/**
 * backfill-from-portal v2 — importa TODOS os clientes do portal para o Ops
 * com contexto completo: profiles + projetos + briefings + milestones.
 *
 * Usa as queries corretas do portal:
 *  - user_roles (role=client) → identifica clientes
 *  - profiles → dados do cliente
 *  - projects → workspaces
 *  - briefings (submitted=true) → essential_briefing
 *  - milestones + updates → timeline_events
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/rest/v1";

function inferOpsType(t: string | null): string {
  const s = (t ?? "").toLowerCase();
  if (s.includes("site") || s.includes("website")) return "one_shot_site";
  if (s.includes("auto")) return "one_shot_automation";
  if (s.includes("agent") || s.includes("bot") || s.includes("chatbot")) return "one_shot_agent";
  if (s.includes("market") || s.includes("trafego") || s.includes("ads")) return "marketing_service";
  return "ai_first";
}

function inferPlanName(p: string | null): string {
  const s = (p ?? "").toLowerCase();
  if (s.includes("enterprise") || s.includes("escala")) return "enterprise";
  if (s.includes("growth") || s.includes("aceler")) return "growth";
  if (s.includes("marketing")) return "marketing";
  return "starter";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_KEY   = Deno.env.get("PORTAL_ANON_KEY") ?? "";

    if (!PORTAL_KEY) {
      return new Response(JSON.stringify({ error: "PORTAL_ANON_KEY não configurada" }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const ops = createClient(SUPABASE_URL, SERVICE_KEY);

    // Helper: busca REST do portal com auth
    async function portalGet(path: string): Promise<any[]> {
      const res = await fetch(`${PORTAL_BASE}/${path}`, {
        headers: {
          "apikey": PORTAL_KEY,
          "Authorization": `Bearer ${PORTAL_KEY}`,
          "Accept": "application/json",
        },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    }

    const stats = {
      clients_found: 0,
      clients_created: 0,
      clients_updated: 0,
      workspaces_created: 0,
      workspaces_updated: 0,
      briefings_merged: 0,
      milestones_synced: 0,
      errors: [] as string[],
    };

    // ─── 1. Pega IDs de todos os clientes (user_roles) ───────────
    const clientRoles = await portalGet("user_roles?select=user_id&role=eq.client");
    let clientIds = clientRoles.map((r: any) => r.user_id).filter(Boolean);

    // Fallback operacional: em produção, a anon key pode não enxergar user_roles
    // por RLS. Quando isso acontecer, usa briefings submitted como fonte de
    // client_id, que é a tabela real com dados do portal.
    if (clientIds.length === 0) {
      const briefingClientRows = await portalGet("briefings?select=client_id&submitted=eq.true");
      clientIds = Array.from(new Set(briefingClientRows.map((r: any) => r.client_id).filter(Boolean)));
    }

    stats.clients_found = clientIds.length;

    if (clientIds.length === 0) {
      return new Response(JSON.stringify({
        ok: true, stats,
        summary: "Nenhum cliente encontrado no portal. Verifique user_roles/briefings e as policies de leitura da PORTAL_ANON_KEY.",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── 2. Busca profiles dos clientes ──────────────────────────
    const profilesChunks: any[] = [];
    for (let i = 0; i < clientIds.length; i += 20) {
      const chunk = clientIds.slice(i, i + 20);
      const inFilter = chunk.map((id: string) => `"${id}"`).join(",");
      const batch = await portalGet(`profiles?select=*&id=in.(${chunk.join(",")})`);
      profilesChunks.push(...batch);
    }
    const profileById = new Map<string, any>();
    profilesChunks.forEach((p: any) => profileById.set(p.id, p));

    // ─── 3. Busca todos os projetos ───────────────────────────────
    const projects = await portalGet("projects?select=*&order=created_at.asc");
    const projectsByClient = new Map<string, any[]>();
    projects.forEach((p: any) => {
      const list = projectsByClient.get(p.client_id) ?? [];
      list.push(p);
      projectsByClient.set(p.client_id, list);
    });

    // ─── 4. Busca briefings submetidos ────────────────────────────
    const briefings = await portalGet("briefings?select=*&submitted=eq.true");
    const briefingByClient = new Map<string, any>();
    briefings.forEach((b: any) => {
      if (b.client_id && !briefingByClient.has(b.client_id)) {
        briefingByClient.set(b.client_id, b);
      }
    });
    const briefingByProject = new Map<string, any>();
    briefings.forEach((b: any) => {
      if (b.project_id && !briefingByProject.has(b.project_id)) {
        briefingByProject.set(b.project_id, b);
      }
    });

    // ─── 5. Busca milestones ──────────────────────────────────────
    const milestones = await portalGet("milestones?select=*&order=created_at.asc");
    const milestonesByProject = new Map<string, any[]>();
    milestones.forEach((m: any) => {
      const list = milestonesByProject.get(m.project_id) ?? [];
      list.push(m);
      milestonesByProject.set(m.project_id, list);
    });

    // ─── 6. Processa cada cliente ─────────────────────────────────
    for (const portalClientId of clientIds) {
      try {
        const profile = profileById.get(portalClientId);
        const briefingData = briefingByClient.get(portalClientId);
        const clientProjects = projectsByClient.get(portalClientId) ?? [];

        // Monta essential_briefing com tudo disponível
        const eb: Record<string, any> = {};

        // Campos do profile
        if (profile?.full_name)    eb.client_name    = profile.full_name;
        if (profile?.company_name) eb.company         = profile.company_name;
        if (profile?.phone)        eb.phone           = profile.phone;

        // Campos do briefing (responses é JSONB com todas as respostas)
        if (briefingData?.responses && typeof briefingData.responses === "object") {
          Object.assign(eb, briefingData.responses);
        }

        // Campos dos projetos (scope, objectives)
        if (clientProjects.length > 0) {
          const mainProject = clientProjects[0];
          if (mainProject.scope)      eb.scope      = mainProject.scope;
          if (mainProject.objectives) eb.objectives = mainProject.objectives;
          if (mainProject.description && !eb.positioning) {
            eb.positioning = mainProject.description;
          }
        }

        const planName = inferPlanName(profile?.plan_name ?? null);
        const projectType = clientProjects.length > 0
          ? inferOpsType(clientProjects[0].project_type)
          : "ai_first";

        // ── Upsert cliente no Ops ──
        const { data: existing } = await ops
          .from("clients")
          .select("id, metadata, plan_name, project_type, name")
          .eq("portal_client_id", portalClientId)
          .maybeSingle();

        let opsClientId: string;

        if (existing) {
          // Merge briefing sem sobrescrever manual
          const currentMeta = (existing.metadata as Record<string, any>) ?? {};
          const currentEb   = (currentMeta.essential_briefing as Record<string, any>) ?? {};
          const mergedEb    = { ...eb, ...currentEb }; // Ops manual tem prioridade

          await ops.from("clients").update({
            plan_name:    existing.plan_name    || planName,
            project_type: existing.project_type || projectType,
            metadata: {
              ...currentMeta,
              essential_briefing: mergedEb,
              lead_email:  currentMeta.lead_email  || profile?.email || null,
              lead_phone:  currentMeta.lead_phone  || profile?.phone || null,
              portal_sync_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);

          opsClientId = existing.id;
          stats.clients_updated++;
        } else {
          // Cria cliente novo
          const name = profile?.full_name || profile?.email || eb.companyName || eb.company || eb.client_name || `Cliente ${portalClientId.slice(0, 8)}`;
          const companyName = profile?.company_name || eb.companyName || eb.company || null;
          const { data: newClient, error } = await ops.from("clients").insert({
            name,
            company_name:  companyName,
            status:        "onboarding",
            plan_name:     planName,
            project_type:  projectType,
            portal_client_id: portalClientId,
            metadata: {
              essential_briefing: eb,
              lead_email:  profile?.email || null,
              lead_phone:  profile?.phone || null,
              source:      "backfill_from_portal",
              portal_sync_at: new Date().toISOString(),
            },
          }).select("id").single();

          if (error) throw new Error(`criar cliente: ${error.message}`);
          opsClientId = newClient!.id;
          stats.clients_created++;
        }

        if (Object.keys(eb).length > 0) stats.briefings_merged++;

        // ── Sync projetos como workspaces ──
        if (clientProjects.length === 0) {
          // Sem projetos: garante ao menos 1 workspace
          const { data: existingWs } = await ops.from("workspaces")
            .select("id").eq("client_id", opsClientId).limit(1).maybeSingle();

          if (!existingWs) {
            const name = profile?.full_name || eb.companyName || eb.company || eb.client_name || "Cliente Portal";
            const { data: ws } = await ops.from("workspaces").insert({
              client_id:     opsClientId,
              name:          `${name} — Workspace`,
              status:        "setup",
              current_stage: "entrada",
              project_type:  projectType,
              metadata: { portal_sync: { auto_created: true, portal_client_id: portalClientId } },
            }).select("id").single();

            if (ws) {
              await ops.from("timeline_events").insert({
                workspace_id: ws.id, client_id: opsClientId,
                event_type: "workspace_created",
                title: "Workspace criado via backfill do portal",
                happened_at: new Date().toISOString(),
              });
              stats.workspaces_created++;
            }
          }
        } else {
          for (const project of clientProjects) {
            // Briefing específico do projeto
            const projBriefing = briefingByProject.get(project.id);
            const projEb = { ...eb };
            if (projBriefing?.responses) Object.assign(projEb, projBriefing.responses);
            if (project.scope)      projEb.scope      = project.scope;
            if (project.objectives) projEb.objectives  = project.objectives;

            const { data: existingWs } = await ops.from("workspaces")
              .select("id").eq("portal_project_id", project.id).maybeSingle();

            if (existingWs) {
              // Atualiza workspace + contexto
              const { data: currentWs } = await ops.from("workspaces")
                .select("metadata").eq("id", existingWs.id).maybeSingle();
              const currentWsMeta = (currentWs?.metadata as Record<string, any>) ?? {};

              await ops.from("workspaces").update({
                name:    project.name,
                summary: project.description || null,
                status:  project.status === "completed" ? "completed"
                       : project.status === "active"    ? "active"
                       : "setup",
                metadata: {
                  ...currentWsMeta,
                  essential_briefing: projEb,
                  portal_sync: {
                    ...(currentWsMeta.portal_sync ?? {}),
                    portal_project_id:   project.id,
                    portal_project_type: project.project_type,
                    portal_progress:     project.progress,
                    portal_scope:        project.scope,
                    portal_objectives:   project.objectives,
                    last_synced_at:      new Date().toISOString(),
                  },
                },
                updated_at: new Date().toISOString(),
              }).eq("id", existingWs.id);
              stats.workspaces_updated++;

            } else {
              // Cria workspace novo
              const { data: ws, error: wsErr } = await ops.from("workspaces").insert({
                client_id:        opsClientId,
                name:             project.name,
                status:           "setup",
                current_stage:    "entrada",
                portal_project_id: project.id,
                project_type:     inferOpsType(project.project_type),
                summary:          project.description || null,
                metadata: {
                  essential_briefing: projEb,
                  portal_sync: {
                    portal_project_id:   project.id,
                    portal_project_type: project.project_type,
                    portal_progress:     project.progress,
                    portal_scope:        project.scope,
                    portal_objectives:   project.objectives,
                    created_at:          new Date().toISOString(),
                    source:              "backfill_from_portal",
                  },
                },
              }).select("id").single();

              if (wsErr) throw new Error(`criar workspace: ${wsErr.message}`);
              stats.workspaces_created++;

              // Timeline event
              await ops.from("timeline_events").insert({
                workspace_id: ws!.id, client_id: opsClientId,
                event_type: "workspace_created",
                title: `Workspace sincronizado: ${project.name}`,
                happened_at: new Date().toISOString(),
                metadata: { source: "backfill", portal_project_id: project.id },
              });

              // Sync milestones como timeline events
              const projectMilestones = milestonesByProject.get(project.id) ?? [];
              for (const ms of projectMilestones) {
                const { data: existingMs } = await ops.from("timeline_events")
                  .select("id").eq("workspace_id", ws!.id)
                  .eq("metadata->>portal_milestone_id", ms.id).maybeSingle();
                if (!existingMs) {
                  await ops.from("timeline_events").insert({
                    workspace_id: ws!.id, client_id: opsClientId,
                    event_type: "portal_milestone",
                    title: ms.title,
                    description: ms.description || null,
                    happened_at: ms.target_date || ms.created_at || new Date().toISOString(),
                    metadata: { source: "backfill", portal_milestone_id: ms.id },
                  });
                  stats.milestones_synced++;
                }
              }
            }
          }
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        stats.errors.push(`${portalClientId.slice(0, 8)}: ${msg.slice(0, 120)}`);
      }
    }

    const summary = [
      `${stats.clients_found} clientes no portal`,
      `${stats.clients_created} criados`,
      `${stats.clients_updated} atualizados`,
      `${stats.workspaces_created} workspaces criados`,
      `${stats.workspaces_updated} workspaces atualizados`,
      `${stats.briefings_merged} briefings mergeados`,
      `${stats.milestones_synced} milestones sincronizados`,
      stats.errors.length > 0 ? `${stats.errors.length} erros` : "zero erros",
    ].join(" | ");

    return new Response(JSON.stringify({ ok: true, stats, summary }),
      { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
