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

/** Briefing kind labels for display */
const BRIEFING_LABELS: Record<string, string> = {
  enterprise_structuring: "Estruturação Empresarial",
  ai_automation: "Automação e IA",
};

function getBriefingLabel(kind: string): string {
  return BRIEFING_LABELS[kind] ?? kind;
}

/**
 * Decode the base64url briefing token and return { workspaceId, clientId, briefingType }.
 */
function decodeToken(token: string): { workspaceId: string; clientId: string; briefingType: string } | null {
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const payload = JSON.parse(json);
    if (
      typeof payload.workspaceId === "string" && payload.workspaceId.length > 0 &&
      typeof payload.clientId === "string" && payload.clientId.length > 0
    ) {
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

    const decoded = decodeToken(source_token);
    if (!decoded) {
      return jsonResponse({ error: "Token inválido" }, 403);
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
      const { data } = await supabase
        .from("context_entries")
        .select("id, metadata")
        .eq("context_type", "briefing")
        .eq("metadata->>source_token", source_token)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

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
      });
    }

    // ── SAVE DRAFT ──
    if (action === "save_draft") {
      const { draft_answers, current_question, answered_count, total_questions } = body;

      if (!draft_answers || typeof draft_answers !== "object") {
        return jsonResponse({ error: "draft_answers obrigatório" }, 400);
      }

      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from("context_entries")
        .select("id, metadata")
        .eq("context_type", "briefing")
        .eq("metadata->>source_token", source_token)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

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

    // ── SUBMIT BRIEFING ──
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
        .eq("metadata->>source_token", source_token)
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
      { error: e instanceof Error ? e.message : "Erro desconhecido" },
      500,
    );
  }
});
