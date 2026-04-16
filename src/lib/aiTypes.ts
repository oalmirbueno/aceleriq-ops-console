/**
 * Lightweight admin-side types for AI Management MVP.
 * Schema lives in DB; these mirror only what the admin UI consumes.
 */

export type RouteResponseFormat = "text" | "json_object";

export interface AiProvider {
  id: string;
  slug: string;
  label: string;
  secret_env_name: string | null;
  enabled: boolean;
  created_at: string;
}

export interface AiModel {
  id: string;
  provider_id: string;
  model_id: string;
  label: string;
  enabled: boolean;
  created_at: string;
  ai_providers?: { slug: string; label: string } | null;
}

export interface AiRoute {
  id: string;
  route_key: string;
  description: string | null;
  model_id: string;
  enabled: boolean;
  system_prompt: string | null;
  default_temperature: number;
  response_format: RouteResponseFormat;
  created_at: string;
  ai_models?: {
    model_id: string;
    label: string;
    ai_providers?: { slug: string; label: string } | null;
  } | null;
}

export interface AiLogRow {
  id: string;
  workspace_id: string | null;
  client_id: string | null;
  action_key: string;
  input_summary: string | null;
  output_summary: string | null;
  status: string;
  model_label: string | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  created_by: string | null;
}
