import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  MessageCircle, Send, Sparkles, ChevronDown, ChevronUp,
  Brain, Layers, FileText, X, Loader2, RotateCcw,
  Maximize2, Minimize2, MoreHorizontal, Copy, Download, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import MarkdownMessage from "./MarkdownMessage";
import { toast } from "@/hooks/use-toast";

// ─── Types ──────────────────────────────────────────────────

export type ChatNodeScope = "node" | "flow" | "workspace";
export type ChatNodeFunction =
  | "planning" | "briefing" | "production" | "analysis" | "free";

export type ChatNodeSize = "S" | "M" | "L" | "XL";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  action?: {
    type: "fill_node" | "create_node" | "suggest";
    label: string;
    payload?: Record<string, unknown>;
  };
}

export interface ChatNodeData extends Record<string, unknown> {
  scope: ChatNodeScope;
  fn: ChatNodeFunction;
  label: string;
  messages: ChatMessage[];
  connectedNodeIds: string[];
  workspaceId: string;
  clientId: string;
  isExpanded: boolean;
  isProcessing: boolean;
  systemContext?: string;
  size?: ChatNodeSize;
}

// ─── Meta ───────────────────────────────────────────────────

const SCOPE_META: Record<ChatNodeScope, { label: string; color: string; bg: string }> = {
  node:      { label: "Node",      color: "#5B9FFF", bg: "rgba(91,159,255,0.08)" },
  flow:      { label: "Fluxo",     color: "#B87AFF", bg: "rgba(184,122,255,0.08)" },
  workspace: { label: "Workspace", color: "#00FF88", bg: "rgba(0,255,136,0.08)" },
};

const FN_META: Record<ChatNodeFunction, { label: string; icon: string; hint: string }> = {
  planning:   { label: "Planejamento",  icon: "🧠", hint: "OKRs, roadmap, priorização" },
  briefing:   { label: "Briefing",      icon: "✦",  hint: "Perguntas e preenchimento" },
  production: { label: "Produção",      icon: "⚙",  hint: "Organizar e produzir" },
  analysis:   { label: "Análise",       icon: "◎",  hint: "Diagnóstico e insights" },
  free:       { label: "Livre",         icon: "💬",  hint: "Conversa sem função fixa" },
};

const SIZE_PRESETS: Record<ChatNodeSize, { width: number; messagesHeight: number; label: string }> = {
  S:  { width: 320, messagesHeight: 260, label: "Pequeno" },
  M:  { width: 420, messagesHeight: 380, label: "Médio" },
  L:  { width: 560, messagesHeight: 500, label: "Grande" },
  XL: { width: 720, messagesHeight: 640, label: "Extra" },
};

// ─── System prompts por função ───────────────────────────────

function buildSystemPrompt(fn: ChatNodeFunction, scope: ChatNodeScope, context: string): string {
  const scopeDesc = scope === "node" ? "neste node específico"
    : scope === "flow" ? "neste fluxo de nodes conectados"
    : "em todo o workspace do cliente";

  const base = `Você é o assistente operacional interno da Aceleriq — especialista em estruturação empresarial, marketing digital e implantação de sistemas.

Você está trabalhando ${scopeDesc}. Você tem acesso ao contexto REAL do cliente abaixo. Use-o para PERSONALIZAR cada resposta.

## FORMATAÇÃO OBRIGATÓRIA
- Português direto, prático, orientado a resultado
- NÃO use asteriscos duplos para negrito (**assim**). Ficam literais e feios
- Para ênfase, use MAIÚSCULAS pontuais em palavras-chave
- Listas com hífen "-", NÃO asterisco
- Quebras de linha generosas entre ideias
- Seja CONCISO — respostas longas aborrecem

## REGRA ABSOLUTA
Nunca invente dados. Se não souber algo, pergunte.`;

  const fnPrompts: Record<ChatNodeFunction, string> = {
    planning: `${base}

## MODO PLANEJAMENTO
Objetivo: ajudar o time a planejar e priorizar.
- OKRs SMART com métricas claras
- Roadmap 30/60/90 dias
- Priorização por impacto × esforço
- Identifique 1-3 ações concretas por resposta`,
    briefing: `${base}

## MODO BRIEFING
Objetivo: fazer perguntas estratégicas que destravem o cliente.
- Perguntas abertas que geram reflexão
- Identifique gaps no contexto atual
- Sugira o próximo entregável a produzir
- Máximo 3 perguntas por resposta`,
    production: `${base}

## MODO PRODUÇÃO
Objetivo: organizar e produzir entregáveis reais.
- Estrutura clara: o que fazer, como, quando
- Checklists numerados quando aplicável
- Referencie nodes conectados quando pertinente
- Prefira output pronto pra copiar e usar`,
    analysis: `${base}

## MODO ANÁLISE
Objetivo: diagnosticar o estado atual e apontar insights.
- Identifique gargalos e padrões
- Quantifique quando possível (% de avanço, frentes ativas)
- Separe dados de interpretação
- 1 insight central + 2-3 secundários`,
    free: `${base}

## MODO LIVRE
Conversa aberta. Seja útil, conciso, prático.`,
  };

  return `${fnPrompts[fn]}

---

CONTEXTO DO CLIENTE:
${context || "(sem contexto carregado — peça ao usuário para conectar nodes de contexto)"}`;
}

// ─── Buscar contexto de nodes conectados ─────────────────────

async function fetchConnectedContext(
  connectedNodeIds: string[],
  workspaceId: string,
  clientId: string,
): Promise<string> {
  if (connectedNodeIds.length === 0) return "";
  const { data: nodes } = await supabase
    .from("canvas_nodes")
    .select("title, node_type, description, data")
    .in("id", connectedNodeIds);
  if (!nodes?.length) return "";

  const parts: string[] = [];
  parts.push(`NODES CONECTADOS (${nodes.length}):`);
  for (const n of nodes) {
    parts.push(`- [${n.node_type}] ${n.title}${n.description ? `: ${String(n.description).slice(0, 200)}` : ""}`);
    if (n.data && typeof n.data === "object") {
      for (const [k, v] of Object.entries(n.data).slice(0, 5)) {
        if (typeof v === "string" && v.length > 10 && v.length < 300 && k !== "kind") {
          parts.push(`    ${k}: ${v.slice(0, 200)}`);
        }
      }
    }
  }
  return parts.join("\n");
}

// ─── AI Call via ai-context-engine ───────────────────────────

async function callAI(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  workspaceId: string,
  clientId: string,
  fn?: string,
  model?: string,
  nodeId?: string,
  connectedNodeIds?: string[],
): Promise<{ reply: string; modelUsed?: string; costUsd?: number; contextStats?: Record<string, number> }> {
  const history = messages.slice(0, -1).map((m) => ({
    role: (m.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
    content: m.content,
  }));
  const lastMessage = messages[messages.length - 1]?.content ?? "";

  const { data, error } = await supabase.functions.invoke("ai-context-engine", {
    body: {
      scope: connectedNodeIds && connectedNodeIds.length > 0 ? "flow" : "node",
      clientId,
      workspaceId,
      nodeId,
      connectedNodeIds,
      message: lastMessage,
      history,
      agentSystemPrompt: systemPrompt,
      agentId: fn ?? "general",
      model: model || "gemini-2.5-flash",
      feature: `chat_node_${fn ?? "free"}`,
      temperature: 0.7,
    },
  });

  if (error) throw new Error(error.message ?? "Erro na edge function");
  if (data?.error) throw new Error(data.error);
  return {
    reply: data?.answer ?? "Sem resposta.",
    modelUsed: data?.model_used,
    costUsd: data?.cost_usd,
    contextStats: data?.context_stats,
  };
}

// ─── ChatNode Component ──────────────────────────────────────

function ChatNodeComp({ data, selected, id: nodeId }: NodeProps) {
  const d = data as ChatNodeData;
  const scopeMeta = SCOPE_META[d.scope ?? "node"];
  const fnMeta = FN_META[d.fn ?? "free"];
  const [expanded, setExpanded] = useState(d.isExpanded ?? true);
  const [size, setSize] = useState<ChatNodeSize>(d.size ?? "M");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(d.messages ?? []);
  const [processing, setProcessing] = useState(false);
  const [scope, setScope] = useState<ChatNodeScope>(d.scope ?? "node");
  const [fn, setFn] = useState<ChatNodeFunction>(d.fn ?? "free");
  const [selectedModel, setSelectedModel] = useState<string>(
    () => localStorage.getItem("aceleriq_preferred_model") ?? ""
  );
  const [showSettings, setShowSettings] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<string>("");

  // Fecha menu ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    contextRef.current = "";
  }, [d.connectedNodeIds, scope]);

  const persist = useCallback(async (patch: Partial<ChatNodeData>) => {
    if (!d.workspaceId || !nodeId) return;
    const { data: current } = await supabase.from("canvas_nodes").select("data").eq("id", nodeId).maybeSingle();
    const currentData = (current?.data as Record<string, unknown>) ?? {};
    await supabase.from("canvas_nodes").update({
      data: { ...currentData, ...patch },
      updated_at: new Date().toISOString(),
    }).eq("id", nodeId);
  }, [d.workspaceId, nodeId]);

  const changeSize = (newSize: ChatNodeSize) => {
    setSize(newSize);
    persist({ size: newSize });
  };

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || processing) return;
    setInput("");
    setProcessing(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    try {
      if (!contextRef.current && d.workspaceId && d.clientId) {
        contextRef.current = await fetchConnectedContext(
          d.connectedNodeIds ?? [], d.workspaceId, d.clientId
        );
      }

      const systemPrompt = buildSystemPrompt(fn, scope, contextRef.current);
      const history = newMessages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const { reply } = await callAI(
        history, systemPrompt, d.workspaceId, d.clientId,
        fn, selectedModel, nodeId, d.connectedNodeIds
      );

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);

      if (d.workspaceId) {
        await persist({ messages: finalMessages, isExpanded: true });
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Erro: ${err instanceof Error ? err.message : "desconhecido"}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, messages, processing, fn, scope, d, nodeId, selectedModel, persist]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearHistory = () => {
    if (!confirm("Limpar todas as mensagens deste chat?")) return;
    setMessages([]);
    persist({ messages: [] });
    setShowMenu(false);
  };

  const copyAllConversation = () => {
    const text = messages.map(m =>
      `[${m.role === "user" ? "Você" : "Aceleriq AI"}]\n${m.content}`
    ).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Conversa copiada" });
    setShowMenu(false);
  };

  const downloadConversation = () => {
    const text = `# Conversa — ${fnMeta.label} (${scopeMeta.label})\n\nGerado: ${new Date().toLocaleString("pt-BR")}\n\n---\n\n` +
      messages.map(m => `## ${m.role === "user" ? "Você" : "Aceleriq AI"}\n\n${m.content}`).join("\n\n---\n\n");
    const blob = new Blob([text], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aceleriq-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Conversa baixada" });
    setShowMenu(false);
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Mensagem copiada" });
  };

  const currentPreset = SIZE_PRESETS[size];

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === "user";
    return (
      <div
        key={msg.id}
        style={{
          display: "flex",
          flexDirection: isUser ? "row-reverse" : "row",
          gap: 6,
          marginBottom: 10,
          alignItems: "flex-start",
        }}
        className="group/msg"
      >
        {!isUser && (
          <div style={{
            width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
            background: `linear-gradient(135deg, ${scopeMeta.color}30, ${scopeMeta.color}10)`,
            border: `1px solid ${scopeMeta.color}40`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 10, color: scopeMeta.color,
          }}>
            {fnMeta.icon}
          </div>
        )}
        <div style={{ maxWidth: "85%", minWidth: 0, flex: 1 }}>
          <div style={{
            background: isUser ? "rgba(255,255,255,0.06)" : `${scopeMeta.color}08`,
            border: `0.5px solid ${isUser ? "rgba(255,255,255,0.08)" : `${scopeMeta.color}20`}`,
            borderRadius: isUser ? "12px 3px 12px 12px" : "3px 12px 12px 12px",
            padding: "8px 11px",
            fontSize: 11.5,
            color: "#D8E0D0",
            lineHeight: 1.6,
            wordWrap: "break-word",
          }}>
            {isUser ? (
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
            ) : (
              <div className="chat-markdown">
                <MarkdownMessage content={msg.content} />
              </div>
            )}
          </div>
          {/* Actions por mensagem (aparecem no hover) */}
          {!isUser && (
            <div
              style={{
                display: "flex", gap: 4, marginTop: 3, fontSize: 9,
                opacity: 0, transition: "opacity 0.15s",
              }}
              className="group-hover/msg:!opacity-100"
            >
              <button
                onClick={(e) => { e.stopPropagation(); copyMessage(msg.content); }}
                style={{
                  display: "flex", alignItems: "center", gap: 3,
                  background: "transparent", border: "none", color: "#7A8870",
                  cursor: "pointer", padding: "2px 4px", borderRadius: 3,
                }}
              >
                <Copy size={9} /> Copiar
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        width: expanded ? currentPreset.width : 200,
        background: "#0E1009",
        border: selected ? `1.5px solid ${scopeMeta.color}` : `0.5px solid ${scopeMeta.color}30`,
        borderRadius: 14,
        boxShadow: selected
          ? `0 0 0 1px ${scopeMeta.color}20, 0 8px 32px rgba(0,0,0,0.5)`
          : "0 2px 12px rgba(0,0,0,0.3)",
        fontFamily: "'Outfit', sans-serif",
        transition: "width 0.25s ease, border-color 0.2s",
        overflow: "visible", // overflow visible pro menu dropdown aparecer
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Left} id="l" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Left} id="l" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="target" position={Position.Top} id="t" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Top} id="t" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="target" position={Position.Right} id="r" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} id="r" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="target" position={Position.Bottom} id="b" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} id="b" style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderBottom: `0.5px solid ${scopeMeta.color}15`,
        background: `linear-gradient(135deg, ${scopeMeta.color}06, transparent)`,
        borderTopLeftRadius: 14, borderTopRightRadius: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{
            width: 26, height: 26, borderRadius: 7,
            background: `${scopeMeta.color}12`,
            border: `0.5px solid ${scopeMeta.color}35`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13,
          }}>
            <MessageCircle size={13} color={scopeMeta.color} />
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 600, color: "#E8EDE0", lineHeight: 1.2 }}>
              {fnMeta.icon} {fnMeta.label}
            </div>
            <div style={{ fontSize: 9, color: scopeMeta.color, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {scopeMeta.label} · {size}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 3, position: "relative" }}>
          {/* Botão SIZE */}
          {expanded && (
            <div style={{ display: "flex", gap: 2, marginRight: 2 }}>
              {(["S", "M", "L", "XL"] as ChatNodeSize[]).map((s) => (
                <button
                  key={s}
                  onClick={(e) => { e.stopPropagation(); changeSize(s); }}
                  title={SIZE_PRESETS[s].label}
                  style={{
                    width: 18, height: 20, borderRadius: 4,
                    background: size === s ? `${scopeMeta.color}25` : "rgba(255,255,255,0.04)",
                    border: `0.5px solid ${size === s ? scopeMeta.color + "60" : "rgba(255,255,255,0.07)"}`,
                    color: size === s ? scopeMeta.color : "#7A8870",
                    fontSize: 8, fontWeight: 600,
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          {/* Botão Settings */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); }}
            title="Configurações"
            style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)", color: "#7A8870", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Layers size={10} />
          </button>
          {/* Botão "..." — menu */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowMenu((v) => !v); }}
            title="Mais ações"
            style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)", color: "#7A8870", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <MoreHorizontal size={10} />
          </button>
          {/* Botão Expand */}
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            title={expanded ? "Minimizar" : "Expandir"}
            style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)", color: "#7A8870", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>

          {/* Menu dropdown */}
          {showMenu && (
            <div
              ref={menuRef}
              style={{
                position: "absolute",
                top: 26, right: 0,
                background: "#12160F",
                border: `0.5px solid ${scopeMeta.color}40`,
                borderRadius: 8,
                padding: 4,
                minWidth: 180,
                zIndex: 100,
                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              }}
            >
              <MenuItem
                icon={<Copy size={11} />}
                label="Copiar conversa completa"
                onClick={copyAllConversation}
                disabled={messages.length === 0}
                color={scopeMeta.color}
              />
              <MenuItem
                icon={<Download size={11} />}
                label="Baixar como .md"
                onClick={downloadConversation}
                disabled={messages.length === 0}
                color={scopeMeta.color}
              />
              <MenuItem
                icon={<RotateCcw size={11} />}
                label="Recarregar contexto"
                onClick={() => { contextRef.current = ""; setShowMenu(false); toast({ title: "Contexto será recarregado na próxima mensagem" }); }}
                color={scopeMeta.color}
              />
              <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "3px 0" }} />
              <MenuItem
                icon={<Trash2 size={11} />}
                label="Limpar todas as mensagens"
                onClick={clearHistory}
                disabled={messages.length === 0}
                color="#EF4444"
              />
            </div>
          )}
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && expanded && (
        <div style={{ padding: "10px 12px", borderBottom: `0.5px solid rgba(255,255,255,0.05)`, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 9, color: "#7A8870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Função</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {(Object.keys(FN_META) as ChatNodeFunction[]).map((f) => (
              <button
                key={f}
                onClick={(e) => { e.stopPropagation(); setFn(f); persist({ fn: f }); }}
                style={{
                  padding: "4px 8px", borderRadius: 5, fontSize: 10,
                  background: fn === f ? `${scopeMeta.color}20` : "rgba(255,255,255,0.03)",
                  border: `0.5px solid ${fn === f ? scopeMeta.color + "40" : "rgba(255,255,255,0.07)"}`,
                  color: fn === f ? scopeMeta.color : "#9DA593",
                  cursor: "pointer",
                }}
              >
                {FN_META[f].icon} {FN_META[f].label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "#7A8870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Escopo</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(Object.keys(SCOPE_META) as ChatNodeScope[]).map((s) => (
              <button
                key={s}
                onClick={(e) => { e.stopPropagation(); setScope(s); persist({ scope: s }); contextRef.current = ""; }}
                style={{
                  padding: "4px 8px", borderRadius: 5, fontSize: 10,
                  background: scope === s ? `${SCOPE_META[s].color}20` : "rgba(255,255,255,0.03)",
                  border: `0.5px solid ${scope === s ? SCOPE_META[s].color + "40" : "rgba(255,255,255,0.07)"}`,
                  color: scope === s ? SCOPE_META[s].color : "#9DA593",
                  cursor: "pointer",
                }}
              >
                {SCOPE_META[s].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      {expanded && (
        <>
          {/* Messages */}
          <div style={{
            padding: "12px 12px 4px",
            height: currentPreset.messagesHeight,
            overflowY: "auto",
            background: "rgba(0,0,0,0.15)",
            transition: "height 0.25s",
          }}
            className="nodrag nowheel"
          >
            {messages.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8, color: "#5D6A56" }}>
                <Brain size={28} style={{ opacity: 0.3 }} />
                <div style={{ fontSize: 10, textAlign: "center", maxWidth: 220, lineHeight: 1.5 }}>
                  {fnMeta.hint}
                  <br/><br/>
                  Conecte este chat a outros nodes para dar contexto.
                </div>
              </div>
            ) : (
              messages.map(renderMessage)
            )}
            {processing && (
              <div style={{ display: "flex", gap: 6, alignItems: "center", color: scopeMeta.color, fontSize: 10, padding: "4px 0" }}>
                <Loader2 size={11} className="animate-spin" />
                Pensando...
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div style={{
            padding: "8px 12px 12px", borderTop: `0.5px solid rgba(255,255,255,0.05)`,
            display: "flex", gap: 6, alignItems: "flex-end",
            borderBottomLeftRadius: 14, borderBottomRightRadius: 14,
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              placeholder="Pergunte algo..."
              className="nodrag nowheel"
              style={{
                flex: 1, minHeight: 32,
                background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "6px 8px",
                color: "#D8E0D0", fontSize: 11,
                resize: "none", outline: "none",
                fontFamily: "inherit",
                maxHeight: 80, overflowY: "auto",
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); send(); }}
              disabled={!input.trim() || processing}
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: input.trim() && !processing ? scopeMeta.color : "rgba(255,255,255,0.04)",
                border: `0.5px solid ${input.trim() && !processing ? scopeMeta.color : "rgba(255,255,255,0.07)"}`,
                color: input.trim() && !processing ? "#0E1009" : "#5D6A56",
                cursor: input.trim() && !processing ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {processing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick, disabled, color }: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 8,
        width: "100%", padding: "6px 8px", borderRadius: 5,
        background: "transparent", border: "none",
        color: disabled ? "#5D6A56" : color,
        fontSize: 10.5, textAlign: "left",
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.1s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = `${color}10`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {icon} {label}
    </button>
  );
}

export default memo(ChatNodeComp);
