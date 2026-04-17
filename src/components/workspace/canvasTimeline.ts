/**
 * Helpers para timeline do Canvas.
 *
 * IMPORTANTE: usar APENAS event_type já compatível com o schema real do projeto
 * (context_added). Diferenciamos a camada Canvas pelo prefixo no título.
 */
import { getCanvasTypeConfig } from "./canvasConstants";

export const CANVAS_TIMELINE_EVENT_TYPE = "context_added" as const;

interface BuildCanvasEventInput {
  action: "node_created" | "node_connected" | "task_from_node";
  nodeTitle: string;
  nodeType?: string;
  targetTitle?: string;
  taskTitle?: string;
}

export function buildCanvasTitle(input: BuildCanvasEventInput): string {
  switch (input.action) {
    case "node_created":   return `Canvas: node criado — ${input.nodeTitle}`;
    case "node_connected": return `Canvas: conexão — ${input.nodeTitle} → ${input.targetTitle ?? "?"}`;
    case "task_from_node": return `Canvas: task gerada — ${input.taskTitle ?? input.nodeTitle}`;
  }
}

export function buildCanvasDescription(input: BuildCanvasEventInput): string {
  const parts: string[] = [];
  if (input.nodeType) parts.push(`Tipo: ${getCanvasTypeConfig(input.nodeType).label}`);
  switch (input.action) {
    case "node_created":   parts.push("Origem: Canvas operacional"); break;
    case "node_connected": parts.push(`Conexão entre nodes do Canvas`); break;
    case "task_from_node": parts.push(`Task originada de node do Canvas`); break;
  }
  return parts.join(" · ");
}
