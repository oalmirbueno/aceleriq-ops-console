import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const BRIEFING_LABELS: Record<string, string> = {
  enterprise_structuring: "Estruturação Empresarial",
  ai_automation: "Automação e IA",
};

function getBriefingLabel(kind: string): string {
  return BRIEFING_LABELS[kind] ?? kind;
}

/** HMAC-SHA256 verify */
async function hmacVerify(data: string, signature: string, secret: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"],
  );
  // Decode base64url signature
  const sigB64 = signature.replace(/-/g, "+").replace(/_/g, "/");
  const sigBytes = Uint8Array.from(atob(sigB64), c => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(data));
}

/**
 * Decode and verify a signed token: <payloadBase64url>.<signatureBase64url>
 * Returns parsed payload or null if invalid/expired.
 */
async function decodeAndVerifyToken(
  token: string,
  secret: string,
): Promise<{ workspaceId: string; clientId: string; briefingType: string } | null> {
  const dotIdx = token.lastIndexOf(".");
  if (dotIdx === -1) return null;

  const payloadB64 = token.substring(0, dotIdx);
  const signature = token.substring(dotIdx + 1);

  // Decode payload
  let payload: any;
  try {
    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    payload = JSON.parse(atob(padded));
  } catch {
    return null;
  }

  // Verify signature
  const payloadJson = JSON.stringify({
    workspaceId: payload.workspaceId,
    clientId: payload.clientId,
    briefingType: payload.briefingType,
    iat: payload.iat,
    exp: payload.exp,
  });

  const valid = await hmacVerify(payloadJson, signature, secret);
  if (!valid) return null;

  // Check expiration
  if (typeof payload.exp === "number" && Date.now() > payload.exp) {
    return null;
  }

  if (!payload.workspaceId || !payload.clientId) return null;

  return {
    workspaceId: payload.workspaceId,
    clientId: payload.clientId,
    briefingType: payload.briefingType ?? "enterprise_structuring",
  };
}

/**
 * Legacy token fallback: decode unsigned base64url token.
 * This is temporary compatibility for already-issued links.
 * Legacy tokens are only accepted for load_draft and save_draft (not submit).
 */
function decodeLegacyToken(token: string): { workspaceId: string; clientId: string; briefingType: string } | null {
  // Signed tokens contain a dot; legacy ones don't
  if (token.includes(".")) return null;
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded));
    if (typeof payload.workspaceId === "string" && typeof payload.clientId === "string") {
      return {
        workspaceId: payload.workspaceId,
        clientId: payload.clientId,
        briefingType: payload.briefingType ?? "enterprise_structuring",
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function validateTokenPayload(
  supabase: ReturnType<typeof createClient>,
  workspaceId: string,
  clientId: string,
): Promise<boolean> {
  const { data: ws } = await supabase
    .from("workspaces")
    .select("id")
    .eq("id", workspaceId)
    .eq("client_id", clientId)
    .maybeSingle();
  return !!ws;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { source_token, action } = body;

    if (!source_token || typeof source_token !== "string") {
      return jsonResponse({ error: "Token ausente" }, 400);
    }

    if (!action || !["load_draft", "save_draft", "submit_briefing"].includes(action)) {
      return jsonResponse({ error: "Ação inválida" }, 400);
    }

    const secret = Deno.env.get("PUBLIC_BRIEFING_TOKEN_SECRET");
    if (!secret) {
      console.error("PUBLIC_BRIEFING_TOKEN_SECRET not configured");
      return jsonResponse({ error: "Configuração de segurança ausente" }, 500);
    }

    // Try signed token first
    let decoded = await decodeAndVerifyToken(source_token, secret);
    let isLegacy = false;

    // Fallback to legacy for draft operations only (limited compatibility)
    if (!decoded) {
      decoded = decodeLegacyToken(source_token);
      if (decoded) {
        isLegacy = true;
        // Legacy tokens cannot submit — only load and save drafts
        if (action === "submit_briefing") {
          return jsonResponse({ error: "Token expirado ou inválido. Solicite um novo link ao seu consultor." }, 403);
        }
      }
    }

    if (!decoded) {
      return jsonResponse({ error: "Token inválido ou expirado" }, 403);
    }

    const briefingKind = decoded.briefingType;
    const briefingLabel = `Briefing de ${getBriefingLabel(briefingKind)}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const valid = await validateTokenPayload(supabase, decoded.workspaceId, decoded.clientId);
    if (!valid) {
      return jsonResponse({ error: "Token não corresponde a um workspace válido" }, 403);
    }

    // ── LOAD DRAFT ──
    if (action === "load_draft") {
      // For signed tokens, search by workspace+client+type; for legacy, by source_token
      const query = supabase
        .from("context_entries")
        .select("id, metadata")
        .eq("context_type", "briefing")
        .eq("workspace_id", decoded.workspaceId)
        .eq("client_id", decoded.clientId)
        .order("created_at", { ascending: false })
        .limit(1);

      // Legacy tokens use source_token match; signed tokens match by workspace/client
      if (isLegacy) {
        query.eq("metadata->>source_token", source_token);
      }

      const { data } = await query.maybeSingle();

      if (!data) {
        return jsonResponse({ draft: null });
      }

      const meta = data.metadata as Record<string, unknown> | null;
      return jsonResponse({
        draft: {
          id: data.id,
          answers: (meta?.draft_answers as Record<string, string>) ?? {},
          currentQuestion: (meta?.last_question_index as number) ?? 0,
          status: (meta?.public_briefing_status as string) ?? "draft",
        },
        ...(isLegacy ? { legacy_token: true } : {}),
      });
    }

    // ── SAVE DRAFT ──
    if (action === "save_draft") {
      const { draft_answers, current_question, answered_count, total_questions } = body;

      if (!draft_answers || typeof draft_answers !== "object") {
        return jsonResponse({ error: "draft_answers obrigatório" }, 400);
      }

      const now = new Date().toISOString();

      const existingQuery = supabase
        .from("context_entries")
        .select("id, metadata")
        .eq("context_type", "briefing")
        .eq("workspace_id", decoded.workspaceId)
        .eq("client_id", decoded.clientId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (isLegacy) {
        existingQuery.eq("metadata->>source_token", source_token);
      }

      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        const existingMeta = existing.metadata as Record<string, unknown> | null;
        if (existingMeta?.public_briefing_status === "submitted") {
          return jsonResponse({ error: "Briefing já foi enviado", id: existing.id }, 409);
        }
      }

      const metadata: Record<string, unknown> = {
        briefing_kind: briefingKind,
        import_source: "client_form",
        parser_mode: "local_rules",
        source_token,
        public_briefing_status: "draft",
        draft_answers,
        draft_progress: {
          answered_count: answered_count ?? 0,
          total_questions: total_questions ?? 0,
          last_question_index: current_question ?? 0,
        },
        last_question_index: current_question ?? 0,
        answered_count: answered_count ?? 0,
        total_questions: total_questions ?? 0,
        last_saved_at: now,
      };

      if (existing) {
        const { error } = await supabase
          .from("context_entries")
          .update({ metadata })
          .eq("id", existing.id);

        if (error) {
          console.error("Update draft error:", error);
          return jsonResponse({ error: "Erro ao salvar rascunho" }, 500);
        }
        return jsonResponse({ id: existing.id });
      }

      const { data: created, error } = await supabase
        .from("context_entries")
        .insert({
          workspace_id: decoded.workspaceId,
          client_id: decoded.clientId,
          context_type: "briefing",
          title: `${briefingLabel} (rascunho)`,
          content: "",
          source_label: "Preenchido pelo cliente",
          is_key_decision: false,
          tags: ["briefing", briefingKind, "client_draft"],
          metadata,
        })
        .select("id")
        .single();

      if (error || !created) {
        console.error("Create draft error:", error);
        return jsonResponse({ error: "Erro ao criar rascunho" }, 500);
      }
      return jsonResponse({ id: created.id });
    }

    // ── SUBMIT BRIEFING ── (signed tokens only — legacy blocked above)
    if (action === "submit_briefing") {
      const { content, signals_data, answered_count, total_questions } = body;

      if (!content || typeof content !== "string") {
        return jsonResponse({ error: "Conteúdo do briefing obrigatório" }, 400);
      }

      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from("context_entries")
        .select("id, metadata")
        .eq("context_type", "briefing")
        .eq("workspace_id", decoded.workspaceId)
        .eq("client_id", decoded.clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        const existingMeta = existing.metadata as Record<string, unknown> | null;
        if (existingMeta?.public_briefing_status === "submitted") {
          return jsonResponse({ error: "Briefing já foi enviado", id: existing.id }, 409);
        }
      }

      const submissionMetadata: Record<string, unknown> = {
        briefing_kind: briefingKind,
        import_source: "client_form",
        parser_mode: "local_rules",
        source_token,
        public_briefing_status: "submitted",
        import_review_status: "pending_review",
        submitted_by_client: true,
        submitted_at: now,
        answers_count: answered_count ?? 0,
        total_questions: total_questions ?? 0,
        last_saved_at: now,
        ...(signals_data ?? {}),
      };

      let docId: string;

      if (existing) {
        const { error } = await supabase
          .from("context_entries")
          .update({
            title: briefingLabel,
            content,
            tags: ["briefing", briefingKind, "client_submitted"],
            metadata: submissionMetadata,
          })
          .eq("id", existing.id);

        if (error) {
          console.error("Submit update error:", error);
          return jsonResponse({ error: "Erro ao enviar briefing" }, 500);
        }
        docId = existing.id;
      } else {
        const { data: created, error } = await supabase
          .from("context_entries")
          .insert({
            workspace_id: decoded.workspaceId,
            client_id: decoded.clientId,
            context_type: "briefing",
            title: briefingLabel,
            content,
            source_label: "Preenchido pelo cliente",
            is_key_decision: false,
            tags: ["briefing", briefingKind, "client_submitted"],
            metadata: submissionMetadata,
          })
          .select("id")
          .single();

        if (error || !created) {
          console.error("Submit insert error:", error);
          return jsonResponse({ error: "Erro ao enviar briefing" }, 500);
        }
        docId = created.id;
      }

      // Timeline event
      const { error: tlError } = await supabase.from("timeline_events").insert({
        workspace_id: decoded.workspaceId,
        client_id: decoded.clientId,
        event_type: "context_added",
        title: `Cliente preencheu o ${briefingLabel}`,
        description: `${answered_count ?? 0} de ${total_questions ?? 0} perguntas respondidas · Pendente de revisão`,
        happened_at: now,
      });

      if (tlError) {
        console.error("Timeline insert error (non-blocking):", tlError);
      }

      return jsonResponse({ id: docId, status: "submitted" });
    }

    return jsonResponse({ error: "Ação não reconhecida" }, 400);
  } catch (e) {
    console.error("public-briefing error:", e);
    return jsonResponse(
      { error: "Erro interno" },
      500,
    );
  }
});
