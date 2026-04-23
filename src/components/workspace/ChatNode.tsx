import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageCircle, Sparkles } from "lucide-react";

export type ChatNodeFunction = "briefing" | "planning" | "production" | "analysis" | "free";
export type ChatNodeScope = "node" | "workspace" | "client";

export interface ChatNodeMessage {
  role: "user" | "assistant" | "system";
  content: string;
  createdAt?: string;
}

export interface ChatNodeData extends Record<string, unknown> {
  nodeId?: string;
  workspaceId?: string;
  clientId?: string;
  scope: ChatNodeScope;
  fn: ChatNodeFunction;
  label: string;
  messages: ChatNodeMessage[];
  connectedNodeIds: string[];
  isExpanded?: boolean;
  isProcessing?: boolean;
}

const FUNCTION_LABELS: Record<ChatNodeFunction, string> = {
  briefing: "Briefing",
  planning: "Planejamento",
  production: "Produção",
  analysis: "Análise",
  free: "Livre",
};

function ChatNodeComp({ data, selected }: NodeProps) {
  const d = data as ChatNodeData;
  const connectedCount = d.connectedNodeIds?.length ?? 0;

  return (
    <div className={`w-[320px] rounded-xl border bg-card px-4 py-3 shadow-sm ${selected ? "border-primary/70" : "border-border"}`}>
      <Handle type="target" position={Position.Left} className="node-handle node-handle-default" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary">
            <MessageCircle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{d.label || "Chat IA"}</p>
            <p className="text-[11px] text-muted-foreground">{FUNCTION_LABELS[d.fn] ?? "Livre"}</p>
          </div>
        </div>
        {d.isProcessing && <Sparkles className="h-4 w-4 animate-pulse text-primary" />}
      </div>
      <div className="rounded-lg border border-border/70 bg-muted/10 p-3 text-xs text-muted-foreground">
        {connectedCount > 0 ? `${connectedCount} node${connectedCount > 1 ? "s" : ""} conectado${connectedCount > 1 ? "s" : ""}` : "Conecte nodes para dar contexto ao chat."}
      </div>
      <Handle type="source" position={Position.Right} className="node-handle node-handle-default" />
    </div>
  );
}

export default memo(ChatNodeComp);