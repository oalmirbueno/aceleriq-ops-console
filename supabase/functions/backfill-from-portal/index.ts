/**
 * backfill-from-portal v4 — usa ops-clients-list do portal (service role, sem RLS).
 *
 * A estratégia anterior falhava porque user_roles/profiles retornam vazio
 * com anon key por RLS. A v4 chama a edge function ops-clients-list do portal
 * que usa service role e retorna TODOS os clientes.
 *
 * Depois busca briefings e projetos por client_id.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_BASE   = "https://gicbrgagstyvbaaumprj.supabase.co";
const PORTAL_FN_URL = `${PORTAL_BASE}/functions/v1`;
const PORTAL_REST   = `${PORTAL_BASE}/rest/v1`;

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
    const OPS_SECRET   = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";

    const ops = createClient(SUPABASE_URL, SERVICE_KEY);

    const portalHeaders = {
      "Content-Type": "application/json",
      "apikey": PORTAL_KEY,
      "Authorization": `Bearer ${PORTAL_KEY}`,
      "x-webhook-secret": OPS_SECRET,
    };

    // Helper REST do portal (anon key)
    async function portalGet(path: string): Promise<any[]> {
      const res = await fetch(`${PORTAL_REST}/${path}`, {
        headers: { "apikey": PORTAL_KEY, "Authorization": `Bearer ${PORTAL_KEY}`, "Accept": "application/json" },
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
      errors: [] as string[],
    };

    // ─── 1. Chama ops-clients-list (service role, retorna TODOS) ───
    let portalClients: Array<{ id: string; full_name: string; company_name: string | null; email: string | null; active_projects: number }> = [];

    try {
      const res = await fetch(`${PORTAL_FN_URL}/ops-clients-list`, {
        method: "POST",
        headers: portalHeaders,
      });
      if (res.ok) {
        const data = await res.json();
        portalClients = data.clients ?? [];
      }
    } catch (err) {
      stats.errors.push(`ops-clients-list falhou: ${err}`);
    }

    // Fallback: se ops-clients-list falhar, tenta briefings
    if (portalClients.length === 0) {
      const briefings = await portalGet("briefings?select=client_id&submitted=eq.true");
      const quizzes = await portalGet("quiz_submissions?select=user_id,lead_name,lead_email");
      
      const seenIds = new Set<string>();
      for (const b of briefings) {
        if (b.client_id && !seenIds.has(b.client_id)) {
          seenIds.add(b.client_id);
          portalClients.push({ id: b.client_id, full_name: "", company_name: null, email: null, active_projects: 0 });
        }
      }
      for (const q of quizzes) {
        if (q.user_id && !seenIds.has(q.user_id)) {
          seenIds.add(q.user_id);
          portalClients.push({ id: q.user_id, full_name: q.lead_name ?? "", company_name: null, email: q.lead_email ?? null, active_projects: 0 });
        }
      }
    }

    stats.clients_found = portalClients.length;

    if (portalClients.length === 0) {
      return new Response(JSON.stringify({
        ok: true, stats,
        summary: "Nenhum cliente encontrado no portal.",
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ─── 2. Busca briefings submetidos ────────────────────────────
    const briefings = await portalGet("briefings?select=*&submitted=eq.true");
    const briefingByClient = new Map<string, any>();
    briefings.forEach((b: any) => {
      if (b.client_id) briefingByClient.set(b.client_id, b);
    });

    // ─── 3. Busca projetos ────────────────────────────────────────
    const projects = await portalGet("projects?select=*&order=created_at.asc");
    const projectsByClient = new Map<string, any[]>();
    projects.forEach((p: any) => {
      const list = projectsByClient.get(p.client_id) ?? [];
      list.push(p);
      projectsByClient.set(p.client_id, list);
    });

    // ─── 4. Processa cada cliente ─────────────────────────────────
    for (const pc of portalClients) {
      try {
        const portalClientId = pc.id;
        const briefing = briefingByClient.get(portalClientId);
        const clientProjects = projectsByClient.get(portalClientId) ?? [];

        // Monta essential_briefing
        const eb: Record<string, any> = {};
        if (pc.full_name)    eb.client_name = pc.full_name;
        if (pc.company_name) eb.company     = pc.company_name;
        if (briefing?.responses && typeof briefing.responses === "object") {
          Object.assign(eb, briefing.responses);
        }
        if (clientProjects.length > 0) {
          const main = clientProjects[0];
          if (main.scope)       eb.scope       = main.scope;
          if (main.objectives)  eb.objectives  = main.objectives;
          if (main.description) eb.positioning  = eb.positioning || main.description;
        }

        const planName = inferPlanName(null);
        const projectType = clientProjects.length > 0
          ? inferOpsType(clientProjects[0].project_type)
          : "ai_first";

        // ── Upsert cliente ──
        const { data: existing } = await ops.from("clients")
          .select("id, metadata, plan_name, project_type")
          .eq("portal_client_id", portalClientId)
          .maybeSingle();

        let opsClientId: string;

        if (existing) {
          const currentMeta = (existing.metadata as Record<string, any>) ?? {};
          const currentEb   = (currentMeta.essential_briefing as Record<string, any>) ?? {};
          const mergedEb    = { ...eb, ...currentEb };

          await ops.from("clients").update({
            plan_name:    existing.plan_name    || planName,
            project_type: existing.project_type || projectType,
            metadata: {
              ...currentMeta,
              essential_briefing: mergedEb,
              lead_email:  currentMeta.lead_email  || pc.email || null,
              portal_sync_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          }).eq("id", existing.id);

          opsClientId = existing.id;
          stats.clients_updated++;
        } else {
          // Tenta vincular por email antes de criar
          let foundByEmail: string | null = null;
          if (pc.email) {
            const { data: byEmail } = await ops.from("clients")
              .select("id").eq("metadata->>lead_email", pc.email).maybeSingle();
            if (byEmail) {
              await ops.from("clients").update({
                portal_client_id: portalClientId,
                metadata: { ...((await ops.from("clients").select("metadata").eq("id", byEmail.id).single()).data?.metadata as any ?? {}), essential_briefing: eb, portal_sync_at: new Date().toISOString() },
              }).eq("id", byEmail.id);
              foundByEmail = byEmail.id;
              stats.clients_updated++;
            }
          }

          if (foundByEmail) {
            opsClientId = foundByEmail;
          } else {
            const name = pc.full_name || pc.email || `Cliente ${portalClientId.slice(0, 8)}`;
            const { data: newClient, error } = await ops.from("clients").insert({
              name,
              company_name:    pc.company_name || null,
              status:          "onboarding",
              plan_name:       planName,
              project_type:    projectType,
              portal_client_id: portalClientId,
              metadata: {
                essential_briefing: eb,
                lead_email:  pc.email || null,
                source:      "backfill_from_portal",
                portal_sync_at: new Date().toISOString(),
              },
            }).select("id").single();
            if (error) throw new Error(`criar: ${error.message}`);
            opsClientId = newClient!.id;
            stats.clients_created++;
          }
        }

        if (Object.keys(eb).length > 0) stats.briefings_merged++;

        // ── Garante workspace ──
        if (clientProjects.length === 0) {
          const { data: ws } = await ops.from("workspaces")
            .select("id").eq("client_id", opsClientId).limit(1).maybeSingle();
          if (!ws) {
            const name = pc.full_name || "Cliente Portal";
            await ops.from("workspaces").insert({
              client_id: opsClientId,
              name: `${name} — Workspace`,
              status: "setup",
              current_stage: "entrada",
              project_type: projectType,
              metadata: { portal_sync: { auto_created: true } },
            });
            stats.workspaces_created++;
          }
        } else {
          for (const proj of clientProjects) {
            const { data: ws } = await ops.from("workspaces")
              .select("id").eq("portal_project_id", proj.id).maybeSingle();
            if (ws) {
              await ops.from("workspaces").update({
                name: proj.name,
                summary: proj.description || null,
                updated_at: new Date().toISOString(),
              }).eq("id", ws.id);
              stats.workspaces_updated++;
            } else {
              await ops.from("workspaces").insert({
                client_id: opsClientId,
                name: proj.name,
                status: "setup",
                current_stage: "entrada",
                portal_project_id: proj.id,
                project_type: inferOpsType(proj.project_type),
                summary: proj.description || null,
                metadata: { portal_sync: { portal_project_id: proj.id, source: "backfill" } },
              });
              stats.workspaces_created++;
            }
          }
        }

      } catch (err) {
        stats.errors.push(`${pc.full_name || pc.id}: ${(err as Error).message?.slice(0, 100)}`);
      }
    }

    const summary = [
      `${stats.clients_found} no portal`,
      `${stats.clients_created} criados`,
      `${stats.clients_updated} atualizados`,
      `${stats.workspaces_created} workspaces criados`,
      `${stats.briefings_merged} briefings`,
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
