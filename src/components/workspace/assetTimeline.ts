/**
 * Helpers para eventos de timeline relacionados a Assets.
 *
 * IMPORTANTE: o schema atual de timeline_events trabalha com event_type livre,
 * mas usamos APENAS valores já presentes no produto (context_added) para
 * evitar quebrar consumidores existentes. Não inventar novos enums.
 */

import { getAssetTypeLabel, getValidationLabel } from "./assetConstants";

export const ASSET_TIMELINE_EVENT_TYPE = "context_added" as const;

interface BuildAssetEventInput {
  action: "created" | "validated" | "case_ready" | "status_changed";
  assetTitle: string;
  assetType: string;
  newStatus?: string;
  frontName?: string | null;
  taskTitle?: string | null;
  primaryUse?: string | null;
}

export function buildAssetEventTitle(input: BuildAssetEventInput): string {
  const { action, assetTitle } = input;
  switch (action) {
    case "created":
      return `Asset registrado: ${assetTitle}`;
    case "validated":
      return `Asset validado: ${assetTitle}`;
    case "case_ready":
      return `Asset pronto p/ case: ${assetTitle}`;
    case "status_changed":
      return `Asset atualizado: ${assetTitle}`;
  }
}

export function buildAssetEventDescription(input: BuildAssetEventInput): string {
  const parts: string[] = [];
  parts.push(`Tipo: ${getAssetTypeLabel(input.assetType)}`);
  if (input.newStatus) parts.push(`Status: ${getValidationLabel(input.newStatus)}`);
  if (input.frontName) parts.push(`Frente: ${input.frontName}`);
  if (input.taskTitle) parts.push(`Task: ${input.taskTitle}`);
  if (input.primaryUse) parts.push(`Uso: ${input.primaryUse}`);
  return parts.join(" · ");
}
