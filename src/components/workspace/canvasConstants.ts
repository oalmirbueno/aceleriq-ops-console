import {
  Building2, FileText, MessageSquare, FolderKanban, ListChecks,
  PackageCheck, BarChart3, Sparkles, Trophy, type LucideIcon,
} from "lucide-react";

export type CanvasNodeType =
  | "client" | "dossier" | "context" | "front" | "task"
  | "asset" | "metric" | "before_after" | "case"
  | "site" | "landing_page" | "automation" | "ai_agent"
  | "content" | "traffic" | "knowledge" | "diagnosis"
  | "ai_orb";

export type CanvasNodeStatus = "draft" | "active" | "blocked" | "done";

export interface CanvasNodeTypeConfig {
  value: CanvasNodeType;
  label: string;
  icon: LucideIcon;
  color: string;        // border + accent
  bg: string;           // soft bg
  linkedEntity: string | null; // entity table for vinculo
}

export const CANVAS_NODE_TYPES: CanvasNodeTypeConfig[] = [
  { value: "client",       label: "Cliente",      icon: Building2,    color: "border-border text-muted-foreground",   bg: "bg-muted/10",   linkedEntity: "clients" },
  { value: "dossier",      label: "Dossiê",       icon: FileText,     color: "border-border text-muted-foreground",       bg: "bg-muted/10",     linkedEntity: null },
  { value: "context",      label: "Contexto",     icon: MessageSquare,color: "border-border text-muted-foreground",     bg: "bg-muted/10",    linkedEntity: "context_entries" },
  { value: "front",        label: "Frente",       icon: FolderKanban, color: "border-primary/50 text-primary",       bg: "bg-primary/10",     linkedEntity: "operational_fronts" },
  { value: "task",         label: "Task",         icon: ListChecks,   color: "border-border text-muted-foreground", bg: "bg-muted/10",  linkedEntity: "tasks" },
  { value: "asset",        label: "Asset",        icon: PackageCheck, color: "border-border text-muted-foreground", bg: "bg-muted/10", linkedEntity: "assets" },
  { value: "metric",       label: "Métrica",      icon: BarChart3,    color: "border-border text-muted-foreground", bg: "bg-muted/10",  linkedEntity: "metric_snapshots" },
  { value: "before_after", label: "Before/After", icon: Sparkles,     color: "border-border text-muted-foreground",     bg: "bg-muted/10",    linkedEntity: "before_after_records" },
  { value: "case",         label: "Case",         icon: Trophy,       color: "border-border text-muted-foreground", bg: "bg-muted/10",  linkedEntity: "case_records" },
];

export function getCanvasTypeConfig(t: string): CanvasNodeTypeConfig {
  return CANVAS_NODE_TYPES.find((n) => n.value === t) ?? CANVAS_NODE_TYPES[0];
}

export const CANVAS_STATUS_OPTIONS: Array<{ value: CanvasNodeStatus; label: string; color: string }> = [
  { value: "draft",   label: "Rascunho", color: "bg-muted text-muted-foreground border-border" },
  { value: "active",  label: "Ativo",    color: "bg-muted/10 text-muted-foreground border-border" },
  { value: "blocked", label: "Bloqueado",color: "bg-muted/10 text-muted-foreground border-border" },
  { value: "done",    label: "Concluído",color: "bg-muted/10 text-muted-foreground border-border" },
];

export function getCanvasStatusConfig(s: string) {
  return CANVAS_STATUS_OPTIONS.find((o) => o.value === s) ?? CANVAS_STATUS_OPTIONS[0];
}

/** Tipos vinculáveis a entidades reais do workspace */
export const LINKABLE_TYPES: CanvasNodeType[] = ["context", "front", "task", "asset", "metric", "before_after", "case"];

/** Mapeamento entity_type -> rota da aba */
export const ENTITY_TAB_HINT: Record<string, string> = {
  operational_fronts: "producao",
  context_entries: "contexto",
  tasks: "tasks",
  assets: "assets",
  metric_snapshots: "metricas",
  before_after_records: "before-after",
  case_records: "case",
};
