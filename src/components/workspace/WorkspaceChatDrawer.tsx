/**
 * WorkspaceChatDrawer v3 — chat com 10 agentes especializados,
 * motor de contexto unificado e ações por mensagem.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  MessageSquare, Send, Loader2, Copy, RefreshCw,
  Sparkles, User, Bot, Trash2, Download, FileText,
  Brain, ChevronDown, Check, Eye, EyeOff,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import MarkdownMessage from "./MarkdownMessage";
import { AGENTS, AGENT_LIST, getAgent, type AgentId } from "@/lib/aiAgents";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  workspaceName: string;
  clientId: string;
  clientName: string;
}

export default function WorkspaceChatDrawer({
  open, onOpenChange, workspaceId, workspaceName, clientId, clientName,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentId>(() => {
    return (localStorage.getItem("aceleriq_preferred_agent") as AgentId) ?? "general";
  });
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    return localStorage.getItem("aceleriq_preferred_model") ?? "";
  });
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);
  const [lastContextStats, setLastContextStats] = useState<Record<string, number> | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const agent = useMemo(() => getAgent(selectedAgent), [selectedAgent]);
  const effectiveModel = selectedModel || agent.suggestedModel;

  // Carrega histórico SOMENTE quando abre
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingHistory(true);
    (async () => {
      const { data } = await supabase
        .from("workspace_chat_messages")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(50);
      if (!cancelled) {
        setMessages((data ?? []) as ChatMessage[]);
        setLoadingHistory(false);
        setTimeout(() => {
          scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
        }, 50);
      }
    })();
    return () => { cancelled = true; };
  }, [open, workspaceId]);

  // Auto-focus input ao abrir
  useEffect(() => {
    if (open && !loadingHistory) {
      const t = setTimeout(() => inputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [open, loadingHistory]);

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Salva preferência
  useEffect(() => {
    localStorage.setItem("aceleriq_preferred_agent", selectedAgent);
  }, [selectedAgent]);

  useEffect(() => {
    if (selectedModel) localStorage.setItem("aceleriq_preferred_model", selectedModel);
  }, [selectedModel]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMessage: ChatMessage = { role: "user", content: msg };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      const historyToSend = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("ai-context-engine", {
        body: {
          scope: "workspace",
          clientId,
          workspaceId,
          message: msg,
          history: historyToSend,
          agentSystemPrompt: agent.systemPrompt,
          agentId: agent.id,
          model: effectiveModel,
          feature: "chat_workspace",
          temperature: 0.7,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error + (data.detail ? ` — ${data.detail}` : ""));

      const answer: string = data?.answer ?? "Sem resposta.";
      const contextStats = data?.context_stats ?? null;
      setLastContextStats(contextStats);

      const assistantMessage: ChatMessage = {
        role: "assistant",
        content: answer,
        metadata: {
          agent_id: agent.id,
          model: data?.model_used,
          tokens: data?.tokens,
          cost_usd: data?.cost_usd,
          context_stats: contextStats,
        },
      };

      setMessages(prev => [...prev, assistantMessage]);

      // Salva no banco (best effort)
      try {
        await supabase.from("workspace_chat_messages").insert([
          { workspace_id: workspaceId, role: "user", content: msg },
          { workspace_id: workspaceId, role: "assistant", content: answer, metadata: assistantMessage.metadata },
        ]);
      } catch { /* não bloqueia */ }
    } catch (err) {
      toast({
        title: "Erro ao chamar IA",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
      setMessages(prev => prev.slice(0, -1)); // remove a user message
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, workspaceId, clientId, agent, effectiveModel]);

  const clearHistory = useCallback(async () => {
    if (!confirm("Limpar todo o histórico de chat deste workspace?")) return;
    await supabase.from("workspace_chat_messages").delete().eq("workspace_id", workspaceId);
    setMessages([]);
    toast({ title: "Histórico limpo" });
  }, [workspaceId]);

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: "Copiado" });
  };

  const downloadMessage = (content: string, agentName: string, format: "md" | "html") => {
    const filename = `aceleriq-${agentName.toLowerCase().replace(/\s/g, "-")}-${Date.now()}.${format}`;
    let blob: Blob;
    if (format === "md") {
      blob = new Blob([content], { type: "text/markdown" });
    } else {
      const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><title>${agentName} — Aceleriq AI</title>
<style>
body { font-family: -apple-system, sans-serif; max-width: 780px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
h1,h2,h3 { margin-top: 1.8em; margin-bottom: 0.6em; }
ul,ol { padding-left: 1.4em; }
code { background: #f4f4f5; padding: 2px 6px; border-radius: 4px; font-family: Menlo, monospace; font-size: 0.9em; }
pre { background: #f4f4f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
.header { background: #00FF88; color: #09110A; padding: 20px 24px; border-radius: 12px; margin-bottom: 24px; }
.header h1 { margin: 0; font-size: 1.3em; }
.footer { color: #888; font-size: 0.85em; margin-top: 40px; border-top: 1px solid #eee; padding-top: 16px; }
</style></head>
<body>
<div class="header"><h1>Aceleriq AI — ${agentName}</h1></div>
<div>${content.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</div>
<div class="footer">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
</body></html>`;
      blob = new Blob([html], { type: "text/html" });
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: `Baixado como ${format.toUpperCase()}` });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* ═══ HEADER ═══ */}
        <div className="px-5 py-3 border-b border-border shrink-0 flex items-center gap-3 pr-12">
          {/* Agent selector */}
          <button
            type="button"
            onClick={() => setAgentPickerOpen(v => !v)}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors group"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0 text-lg"
              style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}40` }}>
              {agent.emoji}
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold" style={{ color: agent.color }}>{agent.name}</p>
              <p className="text-[10px] text-muted-foreground">{agent.title}</p>
            </div>
            <ChevronDown className={cn("h-3 w-3 text-muted-foreground transition-transform",
              agentPickerOpen && "rotate-180")} />
          </button>

          <div className="flex-1 min-w-0">
            <DialogTitle className="sr-only">Chat IA · {clientName}</DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground truncate">
              {clientName} · {workspaceName}
            </DialogDescription>
          </div>

          {/* Model selector */}
          <select
            value={effectiveModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="h-8 text-[11px] rounded-md border border-border bg-background px-2 max-w-[160px]"
            title="Modelo Gemini"
          >
            <optgroup label="⭐ Recomendado pelo agente">
              <option value={agent.suggestedModel}>{agent.suggestedModel}</option>
            </optgroup>
            <optgroup label="Flash (grátis)">
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash-Lite</option>
            </optgroup>
            <optgroup label="Pro (grátis limitado)">
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
            </optgroup>
            <optgroup label="Preview (requer billing)">
              <option value="gemini-3-flash-preview">Gemini 3 Flash Preview</option>
              <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro Preview</option>
            </optgroup>
          </select>

          {messages.length > 0 && (
            <Button onClick={clearHistory} variant="ghost" size="icon" className="h-8 w-8" title="Limpar histórico">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* Agent picker dropdown */}
        {agentPickerOpen && (
          <div className="border-b border-border bg-secondary/20 p-3 max-h-64 overflow-y-auto">
            <div className="grid grid-cols-2 gap-1.5">
              {AGENT_LIST.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setSelectedAgent(a.id); setSelectedModel(""); setAgentPickerOpen(false); }}
                  className={cn(
                    "flex items-start gap-2 p-2 rounded-lg text-left transition-all",
                    selectedAgent === a.id
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-secondary/50 border border-transparent"
                  )}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-md shrink-0 text-base mt-0.5"
                    style={{ background: `${a.color}15`, border: `1px solid ${a.color}30` }}>
                    {a.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold" style={{ color: a.color }}>
                      {a.name}
                      {selectedAgent === a.id && <Check className="h-3 w-3 inline ml-1" />}
                    </p>
                    <p className="text-[10px] text-muted-foreground line-clamp-1">{a.title}</p>
                    <p className="text-[9px] text-muted-foreground/70 line-clamp-1 mt-0.5">{a.shortDesc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Context badge */}
        {lastContextStats && !loading && (
          <div className="px-5 py-1.5 border-b border-border/40 bg-secondary/10">
            <div className="flex items-center gap-2 flex-wrap">
              <Eye className="h-3 w-3 text-primary/60" />
              <span className="text-[10px] text-muted-foreground">Contexto carregado:</span>
              {lastContextStats.nodes > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">{lastContextStats.nodes} nodes</Badge>}
              {lastContextStats.context_entries > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">{lastContextStats.context_entries} dossiê</Badge>}
              {lastContextStats.timeline_events > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">{lastContextStats.timeline_events} eventos</Badge>}
              {lastContextStats.metric_snapshots > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">{lastContextStats.metric_snapshots} métricas</Badge>}
              {lastContextStats.briefings > 0 && <Badge variant="outline" className="text-[9px] h-4 px-1">{lastContextStats.briefings} briefings</Badge>}
            </div>
          </div>
        )}

        {/* ═══ MESSAGES ═══ */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl"
                style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}30` }}>
                {agent.emoji}
              </div>
              <div className="text-center max-w-md">
                <p className="text-sm font-semibold text-foreground">
                  Falar com o {agent.name}
                </p>
                <p className="text-xs text-muted-foreground mt-1">{agent.shortDesc}</p>
              </div>
              <div className="w-full max-w-lg space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Sugestões do {agent.name}
                </p>
                {agent.quickPrompts.map((q, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => sendMessage(q)}
                    className="w-full text-left text-xs px-3 py-2 rounded-lg border border-border hover:bg-secondary/50 hover:border-primary/30 transition-all text-muted-foreground hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageBubble
                key={m.id ?? i}
                message={m}
                agent={m.role === "assistant" ? getAgent((m.metadata as any)?.agent_id ?? selectedAgent) : null}
                onCopy={() => copyMessage(m.content)}
                onDownload={(fmt) => downloadMessage(m.content, m.role === "assistant" && (m.metadata as any)?.agent_id ? getAgent((m.metadata as any).agent_id).name : agent.name, fmt)}
              />
            ))
          )}
          {loading && <LoadingBubble agent={agent} />}
        </div>

        {/* ═══ INPUT ═══ */}
        <div className="px-5 py-3 border-t border-border shrink-0 bg-card/50">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={`Perguntar ao ${agent.name}... (Enter envia, Shift+Enter nova linha)`}
              rows={2}
              className="text-sm resize-none min-h-[52px] max-h-[140px]"
              disabled={loading}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              size="icon"
              className="h-10 w-10 shrink-0"
              style={{ background: agent.color }}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            {agent.emoji} {agent.name} · Modelo: {effectiveModel} · Contexto completo carregado automaticamente
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════════════════════════
// SUBCOMPONENTS
// ═══════════════════════════════════════════════════════════════

function MessageBubble({ message, agent, onCopy, onDownload }: {
  message: ChatMessage;
  agent: ReturnType<typeof getAgent> | null;
  onCopy: () => void;
  onDownload: (format: "md" | "html") => void;
}) {
  const [downloadOpen, setDownloadOpen] = useState(false);

  if (message.role === "user") {
    return (
      <div className="flex gap-3 justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary shrink-0">
          <User className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </div>
    );
  }

  const color = agent?.color ?? "#00FF88";

  return (
    <div className="flex gap-3 justify-start group">
      <div className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 text-base"
        style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
        {agent?.emoji ?? "🤖"}
      </div>
      <div className="max-w-[85%] flex-1">
        <div className="rounded-2xl rounded-tl-sm bg-secondary/70 text-foreground px-4 py-2.5 text-sm leading-relaxed">
          <MarkdownMessage content={message.content} />
        </div>
        {/* Meta + actions */}
        <div className="flex items-center gap-1.5 mt-1.5 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={onCopy}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="h-2.5 w-2.5" />
            Copiar
          </button>
          <span className="text-[10px] text-muted-foreground/40">·</span>
          <button
            type="button"
            onClick={() => onDownload("md")}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <FileText className="h-2.5 w-2.5" />
            .md
          </button>
          <button
            type="button"
            onClick={() => onDownload("html")}
            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Download className="h-2.5 w-2.5" />
            .html
          </button>
          {message.metadata && (
            <>
              <span className="text-[10px] text-muted-foreground/40 ml-auto">·</span>
              <span className="text-[9px] text-muted-foreground/60">
                {(message.metadata as any).model ?? "—"}
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingBubble({ agent }: { agent: ReturnType<typeof getAgent> }) {
  return (
    <div className="flex gap-3 justify-start">
      <div className="flex h-8 w-8 items-center justify-center rounded-full shrink-0 text-base"
        style={{ background: `${agent.color}15`, border: `1px solid ${agent.color}30` }}>
        {agent.emoji}
      </div>
      <div className="bg-secondary/70 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.2s" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.4s" }} />
          <span className="text-[10px] text-muted-foreground ml-2">{agent.name} pensando...</span>
        </div>
      </div>
    </div>
  );
}
