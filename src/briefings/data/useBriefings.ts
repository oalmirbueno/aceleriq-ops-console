import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BriefingKind } from "@/lib/briefingToken";

export interface BriefingClient {
  id: string;
  name: string;
  company_name: string | null;
  logo_url: string | null;
  created_at: string;
  totals: {
    drafts: number;
    submitted: number;
  };
  lastActivity: string | null;
}

export interface BriefingEntry {
  id: string;
  client_id: string;
  workspace_id: string;
  title: string;
  content: string | null;
  created_at: string;
  updated_at: string | null;
  briefingKind: BriefingKind;
  status: "draft" | "submitted";
  answeredCount: number;
  totalQuestions: number;
  submittedAt: string | null;
  metadata: Record<string, unknown> | null;
}

function parseEntry(row: Record<string, unknown>): BriefingEntry {
  const meta = (row.metadata as Record<string, unknown> | null) ?? {};
  const kind = (meta.briefing_kind as BriefingKind) ?? (meta.briefing_type as BriefingKind) ?? "enterprise_structuring";
  const status = meta.public_briefing_status === "submitted" ? "submitted" : "draft";
  const progress = (meta.draft_progress as Record<string, number> | undefined) ?? {};
  return {
    id: row.id as string,
    client_id: row.client_id as string,
    workspace_id: row.workspace_id as string,
    title: (row.title as string) ?? "Briefing",
    content: (row.content as string) ?? null,
    created_at: row.created_at as string,
    updated_at: (row.updated_at as string) ?? null,
    briefingKind: kind,
    status,
    answeredCount: (meta.answers_count as number) ?? (meta.answered_count as number) ?? progress.answered_count ?? 0,
    totalQuestions: (meta.total_questions as number) ?? progress.total_questions ?? 0,
    submittedAt: (meta.submitted_at as string) ?? null,
    metadata: meta,
  };
}

/** Lista todos os clientes com agregados de briefings. */
export function useBriefingClients() {
  return useQuery({
    queryKey: ["briefings", "clients"],
    queryFn: async (): Promise<BriefingClient[]> => {
      const { data: res, error } = await supabase.functions.invoke("list-briefings", {
        body: { mode: "clients" },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error as string);
      const clients = (res?.clients ?? []) as Array<Record<string, unknown>>;
      const entries = (res?.entries ?? []) as Array<Record<string, unknown>>;

      const byClient = new Map<string, { drafts: number; submitted: number; last: string | null }>();
      for (const row of entries ?? []) {
        const meta = (row.metadata as Record<string, unknown> | null) ?? {};
        const status = meta.public_briefing_status === "submitted" ? "submitted" : "draft";
        const cid = row.client_id as string;
        const acc = byClient.get(cid) ?? { drafts: 0, submitted: 0, last: null };
        if (status === "submitted") acc.submitted += 1;
        else acc.drafts += 1;
        const ts = (row.updated_at as string) ?? (row.created_at as string);
        if (!acc.last || (ts && ts > acc.last)) acc.last = ts;
        byClient.set(cid, acc);
      }

      return (clients ?? []).map((c) => {
        const agg = byClient.get(c.id as string) ?? { drafts: 0, submitted: 0, last: null };
        return {
          id: c.id as string,
          name: c.name as string,
          company_name: (c.company_name as string) ?? null,
          logo_url: (c.logo_url as string) ?? null,
          created_at: c.created_at as string,
          totals: { drafts: agg.drafts, submitted: agg.submitted },
          lastActivity: agg.last,
        };
      });
    },
    staleTime: 30_000,
  });
}

export function useBriefingClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["briefings", "client", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, company_name, logo_url, created_at")
        .eq("id", clientId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useClientBriefings(clientId: string | undefined) {
  return useQuery({
    queryKey: ["briefings", "entries", clientId],
    enabled: !!clientId,
    queryFn: async (): Promise<BriefingEntry[]> => {
      const { data: res, error } = await supabase.functions.invoke("list-briefings", {
        body: { mode: "client", clientId },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error as string);
      return ((res?.entries ?? []) as Array<Record<string, unknown>>).map(parseEntry);
    },
  });
}

export function useBriefingEntry(entryId: string | undefined) {
  return useQuery({
    queryKey: ["briefings", "entry", entryId],
    enabled: !!entryId,
    queryFn: async (): Promise<BriefingEntry | null> => {
      const { data: res, error } = await supabase.functions.invoke("list-briefings", {
        body: { mode: "entry", entryId },
      });
      if (error) throw error;
      if (res?.error) throw new Error(res.error as string);
      return res?.entry ? parseEntry(res.entry as Record<string, unknown>) : null;
    },
  });
}

/**
 * Garante um workspace ativo para o cliente. Usa o mais recente; se não houver, cria.
 * Necessário porque o token de briefing exige workspaceId.
 */
export async function ensureClientWorkspace(clientId: string, clientName: string): Promise<string> {
  const { data: existing } = await supabase
    .from("workspaces")
    .select("id")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("workspaces")
    .insert({
      client_id: clientId,
      name: `${clientName} — Briefings`,
      status: "setup",
      current_stage: "entrada",
    })
    .select("id")
    .single();
  if (error) throw error;
  return created.id as string;
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; company_name?: string | null }) => {
      const slugBase = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const slug = `${slugBase || "cliente"}-${Date.now().toString(36)}`;
      const { data, error } = await supabase
        .from("clients")
        .insert({
          name: input.name.trim(),
          slug,
          company_name: input.company_name?.trim() || null,
          status: "active",
        })
        .select("id, name")
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["briefings", "clients"] });
    },
  });
}