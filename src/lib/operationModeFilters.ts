import { useEffect, useState } from "react";

/**
 * Etapa 2 — Modo Operação Visual.
 *
 * Helper central de visibilidade do OPS. Não toca em banco, edge functions,
 * core de sync, backfill, receive-portal-sync nem pull-portal-tasks.
 * É puramente um filtro de leitura para a UI: o que é "real Portal" aparece;
 * legados/lixo/internos só aparecem com toggle administrativo ON.
 */

export const ARCHIVED_SYNC_STATUSES = new Set([
  "archived",
  "archived_legacy",
  "archived_test_data",
  "archived_dedupe",
  "deleted",
  "deleted_from_portal",
]);

export interface OperationModeToggles {
  /** Mostrar nodes internos do Ops (ops_only / hide_from_operation). */
  showInternal: boolean;
  /** Mostrar legados/lixo (sync_status arquivados, archived_at, deleted_at). */
  showLegacy: boolean;
  /** Mostrar registros sem vínculo válido com o Portal. */
  showUnlinked: boolean;
}

export const DEFAULT_OPERATION_TOGGLES: OperationModeToggles = {
  showInternal: false,
  showLegacy: false,
  showUnlinked: false,
};

const STORAGE_KEY = "ops:operation-mode-toggles:v1";
const EVENT = "ops:operation-mode-toggles:changed";

export function readOperationModeToggles(): OperationModeToggles {
  if (typeof window === "undefined") return DEFAULT_OPERATION_TOGGLES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_OPERATION_TOGGLES;
    const parsed = JSON.parse(raw) as Partial<OperationModeToggles>;
    return { ...DEFAULT_OPERATION_TOGGLES, ...parsed };
  } catch {
    return DEFAULT_OPERATION_TOGGLES;
  }
}

export function writeOperationModeToggles(next: OperationModeToggles) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

export function useOperationModeToggles(): [OperationModeToggles, (patch: Partial<OperationModeToggles>) => void] {
  const [state, setState] = useState<OperationModeToggles>(() => readOperationModeToggles());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onChange = () => setState(readOperationModeToggles());
    window.addEventListener(EVENT, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);
  const patch = (p: Partial<OperationModeToggles>) => {
    const next = { ...readOperationModeToggles(), ...p };
    writeOperationModeToggles(next);
    setState(next);
  };
  return [state, patch];
}

type RecordLike = Record<string, unknown> | null | undefined;

export interface OperationModeNodeShape {
  node_type?: string | null;
  archived_at?: string | null;
  deleted_at?: string | null;
  sync_status?: string | null;
  data?: RecordLike;
}

function dataKind(data: RecordLike) {
  return String((data as Record<string, unknown> | null | undefined)?.kind ?? "").toLowerCase();
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Vínculo válido com o Portal: task, milestone ou projeto. */
export function isPortalBoundNode(node: OperationModeNodeShape): boolean {
  const d = (node.data as Record<string, unknown> | null | undefined) ?? {};
  return isString(d.portal_task_id) || isString(d.portal_milestone_id) || isString(d.portal_project_id);
}

/** Marcado explicitamente como interno (não deve aparecer na operação). */
export function isInternalOpsOnlyNode(node: OperationModeNodeShape): boolean {
  const d = (node.data as Record<string, unknown> | null | undefined) ?? {};
  if (d.ops_only === true) return true;
  if (d.hide_from_operation === true) return true;
  if (d.OPS_ONLY_HIDE_FROM_OPERATION === true) return true;
  const tags = Array.isArray(d.tags) ? (d.tags as unknown[]).map((t) => String(t).toLowerCase()) : [];
  if (tags.includes("ops_only") || tags.includes("hide_from_operation")) return true;
  return false;
}

/** Arquivado/deletado em qualquer dimensão (timestamps ou sync_status). */
export function isArchivedOrDeletedNode(node: OperationModeNodeShape): boolean {
  if (node.archived_at) return true;
  if (node.deleted_at) return true;
  const ss = String(node.sync_status ?? "").toLowerCase();
  if (ARCHIVED_SYNC_STATUSES.has(ss)) return true;
  return false;
}

/** project_group/front legado sem vínculo Portal. */
export function isLegacyFrontWithoutPortal(node: OperationModeNodeShape): boolean {
  const d = (node.data as Record<string, unknown> | null | undefined) ?? {};
  const kind = dataKind(d);
  const type = String(node.node_type ?? "").toLowerCase();
  const looksLikeFront = kind === "project_group" || kind === "front" || type === "front";
  if (!looksLikeFront) return false;
  return !isString(d.portal_project_id);
}

/**
 * Predicado mestre. Retorna true se o node deve aparecer no Ops sob os
 * toggles atuais. Por padrão (todos OFF) só passa quem é "real Portal".
 * Pastas (client/project_group/milestone_group/ai_orb/chat_node) são
 * ignoradas aqui — quem decide se renderiza pasta é o consumidor.
 */
export function shouldShowInOperationMode(
  node: OperationModeNodeShape,
  toggles: OperationModeToggles = DEFAULT_OPERATION_TOGGLES,
): boolean {
  // Arquivado/deletado: oculto a menos que showLegacy ON
  if (isArchivedOrDeletedNode(node) && !toggles.showLegacy) return false;
  // Interno do Ops: oculto a menos que showInternal ON
  if (isInternalOpsOnlyNode(node) && !toggles.showInternal) return false;
  // Front/project_group legado sem Portal: oculto a menos que showLegacy ON
  if (isLegacyFrontWithoutPortal(node) && !toggles.showLegacy) return false;
  // Sem vínculo Portal: oculto a menos que showUnlinked ON
  if (!isPortalBoundNode(node) && !toggles.showUnlinked) return false;
  return true;
}
