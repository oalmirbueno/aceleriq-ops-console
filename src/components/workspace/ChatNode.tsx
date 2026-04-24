import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  MessageCircle, Send, Sparkles, ChevronDown, ChevronUp,
  Brain, Layers, FileText, X, Loader2, RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ─── Types ──────────────────────────────────────────────────

export type ChatNodeScope = "node" | "flow" | "workspace";
export type ChatNodeFunction =
  | "planning"    // planejamento estratégico
  | "briefing"    // conduzir briefing com perguntas
  | "production"  // organizar e produzir entregáveis
  | "analysis"    // analisar contexto e dar diagnóstico
  | "free";       // conversa livre

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
}

// ─── Scope / Function meta ───────────────────────────────────

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

// ─── System prompts por função ───────────────────────────────

function buildSystemPrompt(fn: ChatNodeFunction, scope: ChatNodeScope, context: string): string {
  const scopeDesc = scope === "node" ? "neste node específico" : scope === "flow" ? "neste fluxo de nodes conectados" : "em todo o workspace do cliente";

  const base = `Você é o assistente operacional interno da Aceleriq — especialista em estruturação empresarial, marketing digital e implantação de sistemas.
Você está trabalhando ${scopeDesc}.
Você TEM ACESSO ao contexto real do cliente abaixo. Use-o para PERSONALIZAR cada resposta.
Nunca invente dados — se não souber algo, pergunte.
Responda sempre em português. Seja direto, prático e orientado a resultado.

CONTEXTO DO CLIENTE:
${context || "(sem contexto carregado — peça ao usuário para conectar nodes de contexto)"}`;

  const fnPrompts: Record<ChatNodeFunction, string> = {
    planning: `${base}

SUA FUNÇÃO: Conduzir o planejamento estratégico operacional.
- Faça perguntas para entender objetivos, restrições e prioridades
- Use framework OKR: Objetivo + Resultados-Chave mensuráveis
- Priorize por impacto × esforço (ICE score)
- Ao final de cada resposta, sugira a próxima ação concreta
- Quando tiver dados suficientes, ofereça gerar o plano operacional em nodes`,

    briefing: `${base}

SUA FUNÇÃO: Conduzir o briefing do cliente com perguntas estruturadas.
- Faça UMA pergunta por vez — não sobrecarregue
- Perguntas em ordem lógica: empresa → mercado → objetivos → público → restrições
- Ao receber respostas, confirme e aprofunde
- Quando um campo está claro o suficiente, diga "✓ [campo] registrado"
- Ao final, ofereça preencher automaticamente os campos do node conectado`,

    production: `${base}

SUA FUNÇÃO: Organizar e produzir entregáveis operacionais.
- Analise o que está conectado e identifique o próximo entregável prioritário
- Para cada entregável, liste: o que fazer, como fazer, critério de aceite
- Sugira dividir em tasks quando necessário
- Quando tiver contexto suficiente, ofereça gerar o conteúdo diretamente`,

    analysis: `${base}

SUA FUNÇÃO: Analisar o contexto e gerar diagnóstico operacional.
- Identifique gaps, riscos e oportunidades com base no contexto
- Use estrutura: Situação atual → Problema central → Causa raiz → Impacto → Recomendação
- Priorize o que tem maior alavancagem com menor esforço
- Cite evidências do contexto quando disponível`,

    free: `${base}

SUA FUNÇÃO: Assistir livremente no que for necessário.
- Responda perguntas sobre o cliente, projeto ou operação
- Ajude a redigir, revisar, planejar ou decidir
- Quando pertinente, sugira conectar mais nodes para enriquecer o contexto`,
  };

  return fnPrompts[fn];
}

// ─── Fetch context from connected nodes ─────────────────────

async function fetchConnectedContext(
  connectedNodeIds: string[],
  workspaceId: string,
  clientId: string,
): Promise<string> {
  const parts: string[] = [];

  // Client + workspace base
  const [clientRes, briefingsRes, contextRes] = await Promise.all([
    supabase.from("clients").select("name,company_name,segment,plan_name,notes").eq("id", clientId).maybeSingle(),
    supabase.from("context_entries").select("context_type,title,content,tags").eq("client_id", clientId)
      .in("context_type", ["briefing"]).order("created_at", { ascending: false }).limit(3),
    supabase.from("context_entries").select("context_type,title,content").eq("workspace_id", workspaceId)
      .not("context_type", "eq", "briefing").order("created_at", { ascending: false }).limit(8),
  ]);

  if (clientRes.data) {
    const c = clientRes.data;
    parts.push(`CLIENTE: ${c.name} | Empresa: ${c.company_name ?? "—"} | Segmento: ${c.segment ?? "—"} | Plano: ${c.plan_name ?? "—"}`);
    if (c.notes) parts.push(`Notas: ${c.notes}`);
  }

  if (briefingsRes.data?.length) {
    parts.push("\nBRIEFINGS:");
    briefingsRes.data.forEach((b) => {
      if (b.content) parts.push(`• ${b.title ?? b.context_type}: ${String(b.content).slice(0, 400)}`);
    });
  }

  if (contextRes.data?.length) {
    parts.push("\nCONTEXTO RECENTE:");
    contextRes.data.forEach((c) => {
      if (c.content) parts.push(`• [${c.context_type}] ${c.title ?? ""}: ${String(c.content).slice(0, 300)}`);
    });
  }

  // Connected nodes
  if (connectedNodeIds.length > 0) {
    const { data: nodes } = await supabase
      .from("canvas_nodes")
      .select("title,description,node_type,data,status")
      .in("id", connectedNodeIds)
      .limit(10);
    if (nodes?.length) {
      parts.push("\nNODES CONECTADOS:");
      nodes.forEach((n) => {
        parts.push(`• [${n.node_type}] ${n.title}: ${n.description ?? ""}`);
        const d = n.data as Record<string, unknown> | null;
        if (d?.content) parts.push(`  Conteúdo: ${String(d.content).slice(0, 200)}`);
      });
    }
  }

  return parts.join("\n");
}

// ─── Call AI ────────────────────────────────────────────────

async function callAI(
  messages: Array<{ role: string; content: string }>,
  systemPrompt: string,
  workspaceId: string,
  clientId: string,
  fn?: string,
  model?: string,
): Promise<{ reply: string; modelUsed?: string }> {
  const { data, error } = await supabase.functions.invoke("chat-node-gemini", {
    body: { messages, systemPrompt, workspaceId, clientId, fn, model },
  });
  if (error) throw new Error(error.message ?? "Erro na edge function chat-node-gemini");
  if (data?.error) throw new Error(data.error);
  return { reply: data?.reply ?? "Sem resposta.", modelUsed: data?.model_used };
}

// ─── ChatNode Component ──────────────────────────────────────

function ChatNodeComp({ data, selected }: NodeProps) {
  const d = data as ChatNodeData;
  const scopeMeta = SCOPE_META[d.scope ?? "node"];
  const fnMeta = FN_META[d.fn ?? "free"];
  const [expanded, setExpanded] = useState(d.isExpanded ?? true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(d.messages ?? []);
  const [processing, setProcessing] = useState(false);
  const [scope, setScope] = useState<ChatNodeScope>(d.scope ?? "node");
  const [fn, setFn] = useState<ChatNodeFunction>(d.fn ?? "free");
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    // Herda modelo preferido do chat global, ou usa auto-pick
    return localStorage.getItem("aceleriq_preferred_model") ?? "";
  });
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<string>("");

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-load context on mount
  useEffect(() => {
    if (!d.workspaceId || !d.clientId) return;
    fetchConnectedContext(d.connectedNodeIds ?? [], d.workspaceId, d.clientId)
      .then((ctx) => { contextRef.current = ctx; })
      .catch(() => {});
  }, [d.workspaceId, d.clientId, d.connectedNodeIds]);

  // Initial greeting based on function
  useEffect(() => {
    if (messages.length > 0) return;
    const greetings: Record<ChatNodeFunction, string> = {
      briefing:   `Olá! Vou conduzir o briefing com você. Vamos começar: **qual é o principal objetivo do cliente com este projeto?**`,
      planning:   `Pronto para planejar. Já carreguei o contexto disponível. **Qual é o horizonte de planejamento que você quer trabalhar agora? (30, 60 ou 90 dias?)**`,
      production: `Vamos produzir. Analisando os nodes conectados... **Qual entregável você quer atacar primeiro?**`,
      analysis:   `Carregando contexto para análise... **Quer que eu comece com o diagnóstico geral ou há um problema específico que você quer entender?**`,
      free:       `Olá! Estou conectado ao contexto do workspace. **O que você precisa agora?**`,
    };
    const greeting: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: greetings[fn],
      timestamp: new Date().toISOString(),
    };
    setMessages([greeting]);
  }, [fn]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || processing) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setProcessing(true);

    try {
      // Refresh context if needed
      if (!contextRef.current && d.workspaceId && d.clientId) {
        contextRef.current = await fetchConnectedContext(d.connectedNodeIds ?? [], d.workspaceId, d.clientId);
      }

      const systemPrompt = buildSystemPrompt(fn, scope, contextRef.current);
      const history = newMessages.slice(-12).map((m) => ({ role: m.role, content: m.content }));
      const { reply } = await callAI(history, systemPrompt, d.workspaceId, d.clientId, fn, selectedModel);

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
      };

      const finalMessages = [...newMessages, assistantMsg];
      setMessages(finalMessages);

      // Persist messages to node data
      if (d.workspaceId) {
        const nodeId = (data as Record<string, unknown>).nodeId as string | undefined;
        if (nodeId) {
          await supabase.from("canvas_nodes").update({
            data: { ...d, messages: finalMessages, isExpanded: true },
            updated_at: new Date().toISOString(),
          }).eq("id", nodeId);
        }
      }
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Erro ao processar. Tente novamente.",
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [input, messages, processing, fn, scope, d]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearHistory = () => setMessages([]);

  const renderMessage = (msg: ChatMessage) => {
    const isUser = msg.role === "user";
    // Simple markdown: **bold**, bullet points
    const formatted = msg.content
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/^• /gm, "• ")
      .split("\n").map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          <span dangerouslySetInnerHTML={{ __html: line }} />
        </span>
      ));

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
        <div style={{
          maxWidth: "82%",
          background: isUser ? "rgba(255,255,255,0.06)" : `${scopeMeta.color}08`,
          border: `0.5px solid ${isUser ? "rgba(255,255,255,0.08)" : `${scopeMeta.color}20`}`,
          borderRadius: isUser ? "12px 3px 12px 12px" : "3px 12px 12px 12px",
          padding: "8px 11px",
          fontSize: 11.5,
          color: "#D8E0D0",
          lineHeight: 1.6,
        }}>
          {formatted}
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        width: expanded ? 320 : 200,
        background: "#0E1009",
        border: selected ? `1.5px solid ${scopeMeta.color}` : `0.5px solid ${scopeMeta.color}30`,
        borderRadius: 14,
        boxShadow: selected
          ? `0 0 0 1px ${scopeMeta.color}20, 0 8px 32px rgba(0,0,0,0.5)`
          : "0 2px 12px rgba(0,0,0,0.3)",
        fontFamily: "'Outfit', sans-serif",
        transition: "width 0.25s ease, border-color 0.2s",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="target" position={Position.Top} style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Bottom} style={{ background: scopeMeta.color, border: "2px solid #0E1009", width: 10, height: 10 }} />

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 12px", borderBottom: `0.5px solid ${scopeMeta.color}15`,
        background: `linear-gradient(135deg, ${scopeMeta.color}06, transparent)`,
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
              {scopeMeta.label}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 3 }}>
          <button
            onClick={(e) => { e.stopPropagation(); setShowSettings((v) => !v); }}
            style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)", color: "#7A8870", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <Layers size={10} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            style={{ width: 20, height: 20, borderRadius: 5, background: "rgba(255,255,255,0.04)", border: "0.5px solid rgba(255,255,255,0.07)", color: "#7A8870", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && expanded && (
        <div style={{ padding: "10px 12px", borderBottom: `0.5px solid rgba(255,255,255,0.05)`, background: "rgba(255,255,255,0.02)" }}>
          <div style={{ fontSize: 9, color: "#7A8870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Função</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
            {(Object.keys(FN_META) as ChatNodeFunction[]).map((f) => (
              <button key={f} onClick={(e) => { e.stopPropagation(); setFn(f); setMessages([]); setShowSettings(false); }} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                background: fn === f ? `${scopeMeta.color}15` : "rgba(255,255,255,0.03)",
                border: `0.5px solid ${fn === f ? scopeMeta.color + "50" : "rgba(255,255,255,0.07)"}`,
                color: fn === f ? scopeMeta.color : "#7A8870",
              }}>
                {FN_META[f].icon} {FN_META[f].label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 9, color: "#7A8870", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Escopo</div>
          <div style={{ display: "flex", gap: 4 }}>
            {(Object.keys(SCOPE_META) as ChatNodeScope[]).map((s) => (
              <button key={s} onClick={(e) => { e.stopPropagation(); setScope(s); }} style={{
                fontSize: 10, padding: "3px 8px", borderRadius: 5, cursor: "pointer",
                background: scope === s ? `${SCOPE_META[s].color}15` : "rgba(255,255,255,0.03)",
                border: `0.5px solid ${scope === s ? SCOPE_META[s].color + "50" : "rgba(255,255,255,0.07)"}`,
                color: scope === s ? SCOPE_META[s].color : "#7A8870",
              }}>
                {SCOPE_META[s].label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      {expanded && (
        <div style={{ height: 220, overflowY: "auto", padding: "10px 12px", scrollbarWidth: "thin" }}>
          {messages.length === 0 && (
            <div style={{ textAlign: "center", color: "#4A5240", fontSize: 11, marginTop: 60 }}>
              <Brain size={20} style={{ margin: "0 auto 8px", opacity: 0.3 }} />
              Conecte nodes de contexto e comece a conversar
            </div>
          )}
          {messages.map(renderMessage)}
          {processing && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7A8870", fontSize: 11 }}>
              <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} />
              processando...
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      {/* Input */}
      {expanded && (
        <div style={{ padding: "8px 10px", borderTop: `0.5px solid rgba(255,255,255,0.05)` }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Mensagem... (Enter para enviar)"
              rows={1}
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: "0.5px solid rgba(255,255,255,0.08)",
                borderRadius: 8, padding: "7px 10px",
                fontSize: 11.5, color: "#D8E0D0",
                resize: "none", outline: "none",
                fontFamily: "inherit", lineHeight: 1.4,
                maxHeight: 80, overflowY: "auto",
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); send(); }}
              disabled={!input.trim() || processing}
              style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: input.trim() && !processing ? `${scopeMeta.color}15` : "rgba(255,255,255,0.03)",
                border: `0.5px solid ${input.trim() && !processing ? scopeMeta.color + "50" : "rgba(255,255,255,0.07)"}`,
                color: input.trim() && !processing ? scopeMeta.color : "#4A5240",
                cursor: input.trim() && !processing ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}
            >
              {processing ? <Loader2 size={12} /> : <Send size={12} />}
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5, padding: "0 2px" }}>
            <span style={{ fontSize: 9, color: "#3A4230" }}>
              {(d.connectedNodeIds ?? []).length} nodes conectados · {scope}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); clearHistory(); }}
              style={{ fontSize: 9, color: "#4A5240", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 3 }}
            >
              <RotateCcw size={8} /> limpar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(ChatNodeComp);
