/**
 * Public briefing persistence via Edge Function.
 * All writes go through the server-side `public-briefing` function
 * which validates the token and uses service_role to write.
 * No direct anon writes to context_entries or timeline_events.
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

async function callPublicBriefing(payload: Record<string, unknown>): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("public-briefing", {
    body: payload,
  });

  if (error) {
    console.error("Edge function error:", error);
    return { data: null, error: error.message ?? "Edge function error" };
  }

  // The edge function returns JSON; supabase.functions.invoke auto-parses it
  if (data?.error) {
    return { data: null, error: data.error as string };
  }

  return { data: data as Record<string, unknown>, error: null };
}

/**
 * Load existing draft/submission from Supabase by source_token via edge function.
 */
export async function loadRemoteDraft(sourceToken: string): Promise<RemoteDraft | null> {
  const { data, error } = await callPublicBriefing({
    source_token: sourceToken,
    action: "load_draft",
  });

  if (error || !data?.draft) return null;

  const draft = data.draft as Record<string, unknown>;
  return {
    id: draft.id as string,
    answers: (draft.answers as Record<string, string>) ?? {},
    currentQuestion: (draft.currentQuestion as number) ?? 0,
    status: (draft.status as "draft" | "submitted") ?? "draft",
  };
}

/**
 * Save or create a draft via edge function.
 */
export async function saveRemoteDraft(
  sourceToken: string,
  _workspaceId: string,
  _clientId: string,
  draft: DraftData,
  _existingId?: string,
): Promise<string | null> {
  const { data, error } = await callPublicBriefing({
    source_token: sourceToken,
    action: "save_draft",
    draft_answers: draft.answers,
    current_question: draft.currentQuestion,
    answered_count: draft.answeredCount,
    total_questions: draft.totalQuestions,
  });

  if (error) {
    console.error("Failed to save remote draft:", error);
    return null;
  }

  return (data?.id as string) ?? null;
}

/**
 * Finalize the draft: submit via edge function.
 */
export async function submitRemoteBriefing(
  _existingId: string,
  sourceToken: string,
  content: string,
  signalsData: Record<string, unknown>,
  answeredCount: number,
  totalQuestions: number,
): Promise<boolean> {
  const { error } = await callPublicBriefing({
    source_token: sourceToken,
    action: "submit_briefing",
    content,
    signals_data: signalsData,
    answered_count: answeredCount,
    total_questions: totalQuestions,
  });

  if (error) {
    console.error("Failed to submit briefing:", error);
    return false;
  }

  return true;
}
