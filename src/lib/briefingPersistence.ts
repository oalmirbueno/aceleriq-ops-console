/**
 * Supabase persistence for public briefing drafts.
 * Uses context_entries with metadata.source_token for upsert logic.
 * localStorage is kept only as a local cache fallback.
 */

import { supabase } from "@/integrations/supabase/client";

interface DraftData {
  answers: Record<string, string>;
  currentQuestion: number;
  answeredCount: number;
  totalQuestions: number;
}

interface RemoteDraft {
  id: string;
  answers: Record<string, string>;
  currentQuestion: number;
  status: "draft" | "submitted";
}

/**
 * Load existing draft/submission from Supabase by source_token.
 */
export async function loadRemoteDraft(sourceToken: string): Promise<RemoteDraft | null> {
  const { data, error } = await supabase
    .from("context_entries")
    .select("id, metadata")
    .eq("context_type", "briefing")
    .eq("metadata->>source_token", sourceToken)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  const meta = data.metadata as Record<string, unknown> | null;
  if (!meta) return null;

  return {
    id: data.id,
    answers: (meta.draft_answers as Record<string, string>) ?? {},
    currentQuestion: (meta.last_question_index as number) ?? 0,
    status: (meta.public_briefing_status as "draft" | "submitted") ?? "draft",
  };
}

/**
 * Save or create a draft in Supabase.
 * Uses upsert logic: if a row with this source_token exists, update it.
 * Otherwise create a new one.
 */
export async function saveRemoteDraft(
  sourceToken: string,
  workspaceId: string,
  clientId: string,
  draft: DraftData,
  existingId?: string,
): Promise<string | null> {
  const now = new Date().toISOString();

  const metadata: Record<string, unknown> = {
    briefing_kind: "enterprise_structuring",
    import_source: "client_form",
    parser_mode: "local_rules",
    source_token: sourceToken,
    public_briefing_status: "draft",
    draft_answers: draft.answers,
    draft_progress: {
      answered_count: draft.answeredCount,
      total_questions: draft.totalQuestions,
      last_question_index: draft.currentQuestion,
    },
    last_question_index: draft.currentQuestion,
    answered_count: draft.answeredCount,
    total_questions: draft.totalQuestions,
    last_saved_at: now,
  };

  if (existingId) {
    // Update existing draft
    const { error } = await supabase
      .from("context_entries")
      .update({
        metadata,
      })
      .eq("id", existingId);

    if (error) {
      console.error("Failed to update remote draft:", error);
      return null;
    }
    return existingId;
  }

  // Create new draft
  const { data, error } = await supabase
    .from("context_entries")
    .insert({
      workspace_id: workspaceId,
      client_id: clientId,
      context_type: "briefing",
      title: "Briefing de Estruturação Empresarial (rascunho)",
      content: "",
      source_label: "Preenchido pelo cliente",
      is_key_decision: false,
      tags: ["briefing", "enterprise_structuring", "client_draft"],
      metadata,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Failed to create remote draft:", error);
    return null;
  }
  return data.id;
}

/**
 * Finalize the draft: update content, signals, mark as submitted.
 */
export async function submitRemoteBriefing(
  existingId: string,
  content: string,
  signalsData: Record<string, unknown>,
  answeredCount: number,
  totalQuestions: number,
): Promise<boolean> {
  const now = new Date().toISOString();

  const metadata: Record<string, unknown> = {
    briefing_kind: "enterprise_structuring",
    import_source: "client_form",
    parser_mode: "local_rules",
    // Keep source_token from existing record — we merge via spread below
    public_briefing_status: "submitted",
    import_review_status: "pending_review",
    submitted_by_client: true,
    submitted_at: now,
    answers_count: answeredCount,
    total_questions: totalQuestions,
    last_saved_at: now,
    ...signalsData,
  };

  // We need to preserve source_token — read it first
  const { data: existing } = await supabase
    .from("context_entries")
    .select("metadata")
    .eq("id", existingId)
    .single();

  const existingMeta = (existing?.metadata as Record<string, unknown>) ?? {};
  const mergedMetadata = { ...existingMeta, ...metadata };
  // Remove draft-only fields
  delete mergedMetadata.draft_answers;
  delete mergedMetadata.draft_progress;
  delete mergedMetadata.last_question_index;

  const { error } = await supabase
    .from("context_entries")
    .update({
      title: "Briefing de Estruturação Empresarial",
      content,
      tags: ["briefing", "enterprise_structuring", "client_submitted"],
      metadata: mergedMetadata,
    })
    .eq("id", existingId);

  if (error) {
    console.error("Failed to submit briefing:", error);
    return false;
  }
  return true;
}
