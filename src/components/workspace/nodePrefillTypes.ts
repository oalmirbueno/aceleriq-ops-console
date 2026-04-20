/**
 * Tipos compartilhados entre o hook useNodePrefill, a edge function
 * `prefill-node` e os drawers especializados.
 */
import type { PrefillSource } from "./nodeBlueprints";

/** Origem do conteúdo de uma seção/campo (mostrada como badge) */
export type FieldOrigin =
  | "auto"        // IA preencheu a partir do contexto
  | "client"      // Veio direto do cliente (form público) — confiança máxima
  | "edited"      // Usuário sobrescreveu
  | "empty"       // IA marcou como vazio (faltou contexto ou é decisão humana)
  | "fallback";   // IA indisponível — drawer abriu vazio

/** Conteúdo de um campo individual dentro de uma section */
export interface PrefillFieldValue {
  /** Valor — string para text/textarea, string[] para list, Record<string,string> para kv,
   *  Array<{id,text,done}> para checklist */
  value: string | string[] | Record<string, string> | Array<{ id: string; text: string; done: boolean }>;
  origin: FieldOrigin;
  /** Origem citada quando aplicável (ex: "briefing consolidado", "form público §3") */
  citation?: string;
}

/** Conteúdo de uma section: mapa fieldId → valor preenchido */
export interface PrefillSectionContent {
  fields: Record<string, PrefillFieldValue>;
  /** Notas livres da IA sobre essa seção (mostradas em um colapsável) */
  ai_notes?: string;
}

/** Estado do checklist do método (separado das sections — é fixo por blueprint) */
export interface MethodChecklistState {
  [itemId: string]: { done: boolean; checked_at?: string; checked_by?: string };
}

/** Payload completo persistido em canvas_nodes.metadata.prefill */
export interface NodePrefillPayload {
  blueprint_kind: string;
  /** Conteúdo por sectionId */
  sections: Record<string, PrefillSectionContent>;
  /** Estado do checklist do método */
  method_state?: MethodChecklistState;
  /** Quais fontes foram efetivamente usadas (vs as habilitadas no blueprint) */
  sources_used: PrefillSource[];
  /** ISO timestamp da geração */
  generated_at: string;
  /** Modelo de IA usado */
  ai_model: string;
  /** Usuário que disparou */
  generated_by?: string;
  /** Versão do schema — pra suportar migração depois */
  schema_version: 1;
}

/** Resposta da edge function `prefill-node` */
export interface PrefillNodeResponse {
  prefill: NodePrefillPayload | null;
  cached: boolean;
  error?: string;
}
