/**
 * receive-lead — endpoint público (protegido por secret) que recebe leads do portal.
 *
 * O portal chama esta edge function quando um lead submete o quiz.
 * Salva em pending_leads pra o time do Ops importar como cliente quando quiser.
 *
 * NÃO precisa de secrets do portal — o portal chama aqui, não o contrário.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  // Valida secret compartilhado (o portal conhece esse valor)
  const SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";
  const received = req.headers.get("x-webhook-secret");
  if (!SECRET || received !== SECRET) {
    return new Response(JSON.stringify({
      error: "Unauthorized",
      hint: "Valide que o OPS_WEBHOOK_URL_SECRET configurado no portal é idêntico ao PORTAL_WEBHOOK_SECRET configurado no Ops",
    }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  try {
    const body = await req.json();
    const {
      token, portal_submission_id,
      lead_name, lead_email, lead_whatsapp, lead_company,
      positioning, differential, icp, main_pains, goals_12m, success_metric,
      revenue_range, team_size, maturity_digital, ai_readiness,
      icp_fit_score, recommended_plan,
      origin, submitted_at,
    } = body;

    if (!lead_name || !token) {
      return new Response(JSON.stringify({ error: "lead_name e token são obrigatórios" }),
        { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Upsert pelo token (idempotente — portal pode tentar reenviar sem criar duplicado)
    const { error } = await supabase.from("pending_leads").upsert({
      token,
      portal_submission_id,
      lead_name, lead_email, lead_whatsapp, lead_company,
      positioning, differential, icp, main_pains, goals_12m, success_metric,
      revenue_range, team_size, maturity_digital, ai_readiness,
      icp_fit_score: icp_fit_score ?? null,
      recommended_plan: recommended_plan ?? null,
      origin: origin ?? null,
      submitted_at: submitted_at ?? new Date().toISOString(),
      status: "pending",
    }, { onConflict: "token" });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, message: "Lead recebido com sucesso" }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({
      error: err instanceof Error ? err.message : "Erro desconhecido",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
