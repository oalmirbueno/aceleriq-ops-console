/**
 * Constants for Assets / Provas Operacionais
 */

export type AssetType = "deliverable_link" | "operational_proof" | "result_evidence" | "case_material";
export type ValidationStatus = "draft" | "registered" | "validated" | "case_ready";

export const ASSET_TYPE_OPTIONS: Array<{ value: AssetType; label: string; hint: string }> = [
  { value: "deliverable_link", label: "Entregável", hint: "Link ou referência de entrega ao cliente" },
  { value: "operational_proof", label: "Prova Operacional", hint: "Evidência de execução interna" },
  { value: "result_evidence", label: "Evidência de Resultado", hint: "Métrica, print ou registro de impacto" },
  { value: "case_material", label: "Material de Case", hint: "Before/after, depoimento, visual para case" },
];

export const VALIDATION_STATUS_OPTIONS: Array<{ value: ValidationStatus; label: string }> = [
  { value: "draft", label: "Rascunho" },
  { value: "registered", label: "Registrado" },
  { value: "validated", label: "Validado" },
  { value: "case_ready", label: "Pronto p/ Case" },
];

export const VALIDATION_COLORS: Record<ValidationStatus, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  registered: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  validated: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  case_ready: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  deliverable_link: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  operational_proof: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  result_evidence: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  case_material: "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

export function getAssetTypeLabel(t: AssetType | string): string {
  return ASSET_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}

export function getAssetTypeColor(t: AssetType | string): string {
  return ASSET_TYPE_COLORS[t as AssetType] ?? "";
}

export function getValidationLabel(s: ValidationStatus | string): string {
  return VALIDATION_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s;
}

export function getValidationColor(s: ValidationStatus | string): string {
  return VALIDATION_COLORS[s as ValidationStatus] ?? "";
}
