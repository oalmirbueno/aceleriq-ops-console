/**
 * pull-portal-leads — busca ATIVAMENTE leads no portal aceleriq.online e
 * faz upsert em pending_leads. Garante que leads recentes apareçam mesmo
 * quando o webhook do portal falhou ou ainda não disparou.
 *
 * Fluxo:
 *   1. Chama endpoint "ops-leads-list" no portal (via mesmas creds do portal-proxy)
 *      com paginação até esgotar resultados (since opcional).
 *   2. Faz upsert por token em pending_leads (preserva status de leads já
 *      importados/descartados — só atualiza dados).
 *   3. Retorna { fetched, upserted, skipped, errors }.
 *
 * Idempotente: pode ser chamada quantas vezes for necessário.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PORTAL_BASE = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1";

interface PortalLead {
  token: string;
  portal_submission_id?: string | null;
  lead_name: string;
  lead_email?: string | null;
  lead_whatsapp?: string | null;
  lead_company?: string | null;
  positioning?: string | null;
  differential?: string | null;
  icp?: string | null;
  main_pains?: string | null;
  goals_12m?: string | null;
  success_metric?: string | null;
  revenue_range?: string | null;
  team_size?: string | null;
  maturity_digital?: string | null;
  ai_readiness?: string | null;
  icp_fit_score?: number | null;
  recommended_plan?: string | null;
  origin?: string | null;
  submitted_at?: string | null;
}

async function fetchPortalLeads(
  secret: string,
  anon: string,
  since: string | null,
): Promise<{ leads: PortalLead[]; warning?: string }> {
  const all: PortalLead[] = [];
  let cursor: string | null = null;
  let pageSize = 200;
  let pages = 0;

  while (pages < 50) {
    pages++;
    const body: Record<string, unknown> = { limit: pageSize };
    if (cursor) body.after = cursor;
    if (since) body.since = since;

    const res = await fetch(`${PORTAL_BASE}/ops-leads-list`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": secret,
        "apikey": anon,
        "Authorization": `Bearer ${anon}`,
      },
      body: JSON.stringify(body),
    });

    const ct = res.headers.get("content-type") ?? "";
    const text = await res.text();

    if (!res.ok) {
      // Page-size adaptation: if API rejects size, halve and retry
      if (res.status === 400 && /at most|too large|limit/i.test(text) && pageSize > 10) {
        pageSize = Math.max(10, Math.floor(pageSize / 2));
        continue;
      }
      // 404 = endpoint não existe ainda no portal — retorna o que tem com warning
      if (res.status === 404) {
        return {
          leads: all,
          warning: `O portal ainda não expõe a função "ops-leads-list". Crie essa edge function no portal aceleriq.online retornando { leads: PortalLead[], next_cursor?: string } para habilitar o pull ativo. Por enquanto, só leads enviados via webhook aparecem.`,
        };
      }
      throw new Error(`Portal respondeu ${res.status}: ${text.slice(0, 200)}`);
    }

    if (!ct.includes("application/json")) {
      throw new Error(`Portal devolveu non-JSON: ${text.slice(0, 200)}`);
    }

    const json = JSON.parse(text);
    const pageLeads = (json.leads ?? json.data ?? json.results ?? []) as PortalLead[];
    all.push(...pageLeads);

    cursor = (json.next_cursor as string | null)
      ?? (json.paging?.next?.after as string | null)
      ?? null;

    if (!cursor || pageLeads.length === 0 || pageLeads.length < pageSize) break;
  }

  return { leads: all };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const PORTAL_ANON = Deno.env.get("PORTAL_ANON_KEY") ?? "";

  if (!SECRET || !PORTAL_ANON) {
    return new Response(JSON.stringify({
      error: "Configuração faltando",
      hint: "Configure PORTAL_WEBHOOK_SECRET e PORTAL_ANON_KEY nos secrets do Ops.",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pega o submitted_at mais recente já existente — incremental fetch.
    // Se a tabela estiver vazia, puxa tudo.
    const { data: latest } = await supabase
      .from("pending_leads")
      .select("submitted_at")
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Janela de overlap pra cobrir leads que chegaram fora de ordem (1h)
    let since: string | null = null;
    if (latest?.submitted_at) {
      const t = new Date(latest.submitted_at).getTime() - 60 * 60 * 1000;
      since = new Date(t).toISOString();
    }

    // Permite forçar full refetch via body { full: true }
    let full = false;
    try {
      const body = await req.json();
      if (body?.full === true) full = true;
    } catch { /* sem body é ok */ }
    if (full) since = null;

    const { leads, warning } = await fetchPortalLeads(SECRET, PORTAL_ANON, since);

    let upserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const lead of leads) {
      if (!lead.token || !lead.lead_name) { skipped++; continue; }

      // Verifica se já está importado/descartado — não sobrescreve status
      const { data: existing } = await supabase
        .from("pending_leads")
        .select("id, status")
        .eq("token", lead.token)
        .maybeSingle();

      const payload = {
        token: lead.token,
        portal_submission_id: lead.portal_submission_id ?? null,
        lead_name: lead.lead_name,
        lead_email: lead.lead_email ?? null,
        lead_whatsapp: lead.lead_whatsapp ?? null,
        lead_company: lead.lead_company ?? null,
        positioning: lead.positioning ?? null,
        differential: lead.differential ?? null,
        icp: lead.icp ?? null,
        main_pains: lead.main_pains ?? null,
        goals_12m: lead.goals_12m ?? null,
        success_metric: lead.success_metric ?? null,
        revenue_range: lead.revenue_range ?? null,
        team_size: lead.team_size ?? null,
        maturity_digital: lead.maturity_digital ?? null,
        ai_readiness: lead.ai_readiness ?? null,
        icp_fit_score: lead.icp_fit_score ?? null,
        recommended_plan: lead.recommended_plan ?? null,
        origin: lead.origin ?? "portal_pull",
        submitted_at: lead.submitted_at ?? new Date().toISOString(),
        // Preserva status atual, ou marca como pending pra novos
        status: existing?.status ?? "pending",
      };

      const { error } = await supabase
        .from("pending_leads")
        .upsert(payload, { onConflict: "token" });

      if (error) errors.push(`${lead.lead_name}: ${error.message}`);
      else upserted++;
    }

    return new Response(JSON.stringify({
      ok: true,
      fetched: leads.length,
      upserted,
      skipped,
      errors,
      warning,
      since,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : String(err),
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});