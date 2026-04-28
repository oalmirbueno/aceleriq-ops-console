/**
 * backfill-from-portal — importa TODOS os clientes do portal aceleriq.online
 * para o Ops com contexto completo.
 *
 * Diferente do receive-portal-sync (push passivo do portal), esta função faz
 * pull ativo: vai ao portal, busca tudo, e sincroniza.
 *
 * O que sincroniza:
 * - profiles do portal → clients no Ops (com plan, segment, metadata)
 * - briefing/quiz responses → essential_briefing
 * - projects → workspaces
 *
 * Regras:
 * - Não sobrescreve campos já preenchidos manualmente no Ops
 * - Usa portal_client_id como chave única (não duplica)
 * - Workspace só cria se não existir
 * - Idempotente — pode rodar múltiplas vezes
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// Mapeamento de plan_name do portal → Ops
function inferPlanName(portalPlan: string | null | undefined): string {
  if (!portalPlan) return "starter";
  const p = portalPlan.toLowerCase();
  if (p.includes("enterprise") || p.includes("escala") || p.includes("ia-first")) return "enterprise";
  if (p.includes("growth") || p.includes("aceleração") || p.includes("aceleracao")) return "growth";
  if (p.includes("marketing")) return "marketing";
  return "starter";
}

// Mapeamento de project_type do portal → Ops
function inferProjectType(portalType: string | null | undefined): string {
  if (!portalType) return "ai_first";
  const t = portalType.toLowerCase();
  if (t.includes("marketing")) return "marketing_service";
  if (t.includes("site")) return "one_shot_site";
  if (t.includes("auto")) return "one_shot_automation";
  if (t.includes("agent") || t.includes("agente")) return "one_shot_agent";
  if (t.includes("legacy")) return "legacy_marketing";
  return "ai_first";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const PORTAL_ANON_KEY = Deno.env.get("PORTAL_ANON_KEY") ?? "";
    const PORTAL_WEBHOOK_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
    const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co";

    if (!PORTAL_ANON_KEY || !PORTAL_WEBHOOK_SECRET) {
      return json({
        error: "PORTAL_ANON_KEY e PORTAL_WEBHOOK_SECRET são obrigatórios",
        hint: "Verifique as secrets no Supabase externo do Ops",
      }, 500);
    }

    const ops = createClient(SUPABASE_URL, SERVICE_KEY);

    // Helper pra chamar o portal com autenticação
    async function portalFetch(path: string): Promise<any> {
      const res = await fetch(`${PORTAL_BASE}/rest/v1/${path}`, {
        headers: {
          "apikey": PORTAL_ANON_KEY,
          "Authorization": `Bearer ${PORTAL_ANON_KEY}`,
          "Content-Type": "application/json",
          "x-webhook-secret": PORTAL_WEBHOOK_SECRET,
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Portal API ${path} falhou: ${res.status} — ${txt.slice(0, 200)}`);
      }
      return res.json();
    }

    // Estatísticas do relatório
    const stats = {
      profiles_found: 0,
      clients_created: 0,
      clients_updated: 0,
      workspaces_created: 0,
      workspaces_already_existed: 0,
      projects_synced: 0,
      briefings_merged: 0,
      errors: [] as string[],
    };

    // ─── 1. Busca todos os profiles do portal ─────────────────────
    let profiles: any[] = [];
    try {
      // Seleção conservadora: o portal atual não tem role/whatsapp em profiles.
      profiles = await portalFetch("profiles?select=*&order=created_at.desc");
    } catch (err) {
      stats.errors.push(`Não foi possível buscar profiles: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ─── 2. Busca todos os projetos do portal ─────────────────────
    let projects: any[] = [];
    try {
      projects = await portalFetch("projects?select=id,client_id,name,status,description,project_type,progress,scope,objectives,start_date,deadline,created_at&order=created_at.desc");
    } catch (err) {
      stats.errors.push(`Não foi possível buscar projects: ${err instanceof Error ? err.message : String(err)}`);
    }

    // ─── 3. Busca quiz_submissions (briefing do quiz) ──────────────
    let submissions: any[] = [];
    try {
      submissions = await portalFetch("quiz_submissions?select=*&order=created_at.desc");
    } catch {
      // quiz_submissions pode não existir ou ter nome diferente — ok
    }

    // Se o portal não tiver profiles populado, usa quiz_submissions como fonte
    // de perfis sintéticos para backfill inicial de clientes/leads.
    if (profiles.length === 0 && submissions.length > 0) {
      profiles = submissions.map((s) => ({
        id: s.user_id || s.token || s.id,
        email: s.lead_email ?? null,
        full_name: s.lead_name ?? s.lead_email ?? "Cliente Portal",
        company_name: s.lead_company ?? null,
        phone: s.lead_whatsapp ?? null,
        whatsapp: s.lead_whatsapp ?? null,
        created_at: s.submitted_at ?? s.created_at ?? null,
        metadata: { source_table: "quiz_submissions", quiz_submission_id: s.id, token: s.token },
        plan_name: s.recommended_plan ?? null,
        segment: null,
      }));
    }
    stats.profiles_found = profiles.length;

    // Index submissions por user_id/token/id para lookup rápido
    const submissionsByUser = new Map<string, any>();
    for (const s of submissions) {
      for (const key of [s.user_id, s.token, s.id]) {
        if (key && !submissionsByUser.has(key)) {
          submissionsByUser.set(key, s);
        }
      }
    }

    // Index projects por client_id
    const projectsByClient = new Map<string, any[]>();
    for (const p of projects) {
      if (!p.client_id) continue;
      const list = projectsByClient.get(p.client_id) ?? [];
      list.push(p);
      projectsByClient.set(p.client_id, list);
    }

    // ─── 4. Processa cada profile ─────────────────────────────────
    for (const profile of profiles) {
      try {
        const portalClientId = profile.id as string;
        if (!portalClientId) continue;

        // Monta essential_briefing do profile + quiz
        const quiz = submissionsByUser.get(portalClientId);
        const profileMeta = (profile.metadata as Record<string, unknown>) ?? {};

        const essentialBriefing: Record<string, string> = {};
        // Campos do quiz (mais detalhados)
        if (quiz) {
          if (quiz.positioning) essentialBriefing.positioning = quiz.positioning;
          if (quiz.differential) essentialBriefing.differential = quiz.differential;
          if (quiz.icp) essentialBriefing.icp = quiz.icp;
          if (quiz.main_pains) essentialBriefing.main_pains = quiz.main_pains;
          if (quiz.goals_12m) essentialBriefing.goals_12m = quiz.goals_12m;
          if (quiz.success_metric) essentialBriefing.success_metric = quiz.success_metric;
          if (quiz.revenue_range) essentialBriefing.revenue_range = quiz.revenue_range;
          if (quiz.team_size) essentialBriefing.team_size = quiz.team_size;
          if (quiz.maturity_digital) essentialBriefing.maturity_digital = quiz.maturity_digital;
          if (quiz.ai_readiness) essentialBriefing.ai_readiness = quiz.ai_readiness;
        }
        // Campos do profile.metadata (podem ter dados extras)
        if (profileMeta.positioning) essentialBriefing.positioning = essentialBriefing.positioning || String(profileMeta.positioning);
        if (profileMeta.goals) essentialBriefing.goals_12m = essentialBriefing.goals_12m || String(profileMeta.goals);

        const planName = inferPlanName(quiz?.recommended_plan ?? profile.plan_name);
        const projectType = inferProjectType(
          projectsByClient.get(portalClientId)?.[0]?.project_type,
        );

        // Verifica se cliente já existe no Ops
        const { data: existing } = await ops
          .from("clients")
          .select("id, metadata, plan_name, project_type")
          .eq("portal_client_id", portalClientId)
          .maybeSingle();

        let opsClientId: string;

        if (existing) {
          // Merge briefing sem sobrescrever campos já preenchidos manualmente
          const currentMeta = (existing.metadata as Record<string, unknown>) ?? {};
          const currentEb = (currentMeta.essential_briefing as Record<string, unknown>) ?? {};

          // Regra: Ops manual > portal (operador tem prioridade)
          const mergedEb = { ...essentialBriefing, ...currentEb };

          const { error: updateErr } = await ops.from("clients").update({
            // Só atualiza plan/type se estiver vazio no Ops
            plan_name: existing.plan_name || planName,
            project_type: existing.project_type || projectType,
            metadata: {
              ...currentMeta,
              essential_briefing: mergedEb,
              portal_sync_at: new Date().toISOString(),
              lead_email: (currentMeta.lead_email as string) || profile.email,
              lead_phone: (currentMeta.lead_phone as string) || profile.phone || profile.whatsapp,
            },
          }).eq("id", existing.id);
          if (updateErr) throw new Error(`Atualizar cliente: ${updateErr.message}`);

          opsClientId = existing.id;
          stats.clients_updated++;
          if (Object.keys(essentialBriefing).length > 0) stats.briefings_merged++;
        } else {
          // Cria cliente novo
          const name = profile.full_name || profile.email || "Cliente Portal";
          const { data: newClient, error: clientErr } = await ops
            .from("clients")
            .insert({
              name,
              company_name: profile.company_name ?? null,
              status: "onboarding",
              segment: profile.segment ?? null,
              plan_name: planName,
              project_type: projectType,
              portal_client_id: portalClientId,
              metadata: {
                essential_briefing: essentialBriefing,
                lead_email: profile.email,
                lead_phone: profile.phone ?? profile.whatsapp ?? null,
                source: "backfill_from_portal",
                portal_sync_at: new Date().toISOString(),
              },
            })
            .select("id")
            .single();

          if (clientErr) throw new Error(`Criar cliente: ${clientErr.message}`);
          opsClientId = newClient!.id;
          stats.clients_created++;

          if (Object.keys(essentialBriefing).length > 0) {
            stats.briefings_merged++;
          }
        }

        // ─── Sincroniza projetos do portal como workspaces ──────────
        const clientProjects = projectsByClient.get(portalClientId) ?? [];

        if (clientProjects.length === 0) {
          // Sem projeto no portal — garante que tem pelo menos 1 workspace
          const { data: existingWs } = await ops
            .from("workspaces")
            .select("id")
            .eq("client_id", opsClientId)
            .limit(1)
            .maybeSingle();

          if (!existingWs) {
            const name = profile.full_name || profile.email || "Cliente Portal";
            const { data: ws, error: wsErr } = await ops.from("workspaces").insert({
              client_id: opsClientId,
              name: `${name} — Workspace`,
              status: "setup",
              current_stage: "entrada",
              project_type: projectType,
              metadata: {
                portal_sync: {
                  auto_created: true,
                  source: "backfill_from_portal",
                  portal_client_id: portalClientId,
                },
              },
            }).select("id").single();

            if (wsErr) throw new Error(`Criar workspace: ${wsErr.message}`);
            if (ws) {
              await ops.from("timeline_events").insert({
                workspace_id: ws.id,
                client_id: opsClientId,
                event_type: "workspace_created",
                title: "Workspace criado via backfill do portal",
                happened_at: new Date().toISOString(),
              });
              stats.workspaces_created++;
            }
          } else {
            stats.workspaces_already_existed++;
          }
        } else {
          // Tem projetos — upsert por portal_project_id
          for (const project of clientProjects) {
            const { data: existingWs } = await ops
              .from("workspaces")
              .select("id")
              .eq("portal_project_id", project.id)
              .maybeSingle();

            if (existingWs) {
              // Atualiza dados do workspace existente
              const { error: wsUpdateErr } = await ops.from("workspaces").update({
                name: project.name,
                summary: project.description ?? null,
                metadata: {
                  portal_sync: {
                    portal_project_id: project.id,
                    portal_project_type: project.project_type,
                    portal_progress: project.progress,
                    last_synced_at: new Date().toISOString(),
                  },
                },
              }).eq("id", existingWs.id);
              if (wsUpdateErr) throw new Error(`Atualizar workspace: ${wsUpdateErr.message}`);
              stats.workspaces_already_existed++;
              stats.projects_synced++;
            } else {
              const pType = inferProjectType(project.project_type);
              const { data: ws, error: wsErr } = await ops.from("workspaces").insert({
                client_id: opsClientId,
                name: project.name,
                status: project.status ?? "setup",
                current_stage: "entrada",
                portal_project_id: project.id,
                project_type: pType,
                summary: project.description ?? null,
                metadata: {
                  portal_sync: {
                    portal_project_id: project.id,
                    portal_project_type: project.project_type,
                    portal_progress: project.progress,
                    created_at: new Date().toISOString(),
                    source: "backfill_from_portal",
                  },
                },
              }).select("id").single();

              if (wsErr) throw new Error(`Criar workspace de projeto: ${wsErr.message}`);
              if (ws) {
                await ops.from("timeline_events").insert({
                  workspace_id: ws.id,
                  client_id: opsClientId,
                  event_type: "workspace_created",
                  title: `Workspace sincronizado do portal: ${project.name}`,
                  happened_at: new Date().toISOString(),
                  metadata: { source: "backfill_from_portal", portal_project_id: project.id },
                });
                stats.workspaces_created++;
                stats.projects_synced++;
              }
            }
          }
        }
      } catch (profileErr) {
        const errMsg = profileErr instanceof Error ? profileErr.message : String(profileErr);
        stats.errors.push(`Profile ${profile.id ?? "?"}: ${errMsg.slice(0, 150)}`);
      }
    }

    return json({
      ok: true,
      stats,
      summary: `${stats.profiles_found} perfis | ${stats.clients_created} criados | ${stats.clients_updated} atualizados | ${stats.workspaces_created} workspaces criados | ${stats.errors.length} erros`,
    });
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }, 500);
  }
});
