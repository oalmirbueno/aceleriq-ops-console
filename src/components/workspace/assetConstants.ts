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
  registered: "bg-muted/10 text-muted-foreground border-border",
  validated: "bg-muted/10 text-muted-foreground border-border",
  case_ready: "bg-muted/10 text-muted-foreground border-border",
};

export const ASSET_TYPE_COLORS: Record<AssetType, string> = {
  deliverable_link: "bg-muted/10 text-muted-foreground border-border",
  operational_proof: "bg-muted/10 text-muted-foreground border-border",
  result_evidence: "bg-muted/10 text-muted-foreground border-border",
  case_material: "bg-muted/10 text-muted-foreground border-border",
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
