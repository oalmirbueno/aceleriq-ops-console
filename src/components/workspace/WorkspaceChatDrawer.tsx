/**
 * WorkspaceChatDrawer — chat IA contextual por workspace.
 *
 * Mostra conversa com histórico persistente, carrega contexto completo
 * do workspace ao perguntar, e permite copiar prompt para uso externo.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  MessageSquare, Send, Loader2, X, Copy, RefreshCw,
  Sparkles, User, Bot, Trash2,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  clientName: string;
}

const QUICK_PROMPTS = [
  "Resume o estado atual desse workspace em 3 frases",
  "Quais os 3 próximos passos prioritários?",
  "Analise o ICP e sugira pontos de atenção",
  "Escreva um email de atualização pro cliente",
  "O que falta pra concluir essa entrega?",
  "Identifique riscos e gargalos",
];

export default function WorkspaceChatDrawer({
  open, onOpenChange, workspaceId, workspaceName, clientName,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Carrega histórico ao abrir
  useEffect(() => {
    if (!open) return;
    setLoadingHistory(true);
    (async () => {
      const { data } = await supabase
        .from("workspace_chat_messages")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true })
        .limit(50);
      setMessages((data ?? []) as ChatMessage[]);
      setLoadingHistory(false);
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
      }, 100);
    })();
  }, [open, workspaceId]);

  // Auto-focus input ao abrir
  useEffect(() => {
    if (open && !loadingHistory) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open, loadingHistory]);

  // Auto-scroll ao adicionar mensagem
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    const userMessage: ChatMessage = { role: "user", content: msg };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Envia só as últimas 6 mensagens como história pra controlar tokens
      const historyToSend = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await supabase.functions.invoke("chat-workspace", {
        body: {
          workspace_id: workspaceId,
          message: msg,
          history: historyToSend,
        },
      });

      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error + (data.hint ? ` (${data.hint})` : ""));

      const answer: string = data?.answer ?? "Sem resposta.";
      const contextInfo = data?.context_summary;

      setMessages(prev => [...prev, {
        role: "assistant",
        content: answer,
        metadata: contextInfo,
      }]);
    } catch (err) {
      toast({
        title: "Erro ao chamar IA",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
      // Remove a mensagem do user já que não teve resposta
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, workspaceId]);

  const clearHistory = useCallback(async () => {
    if (!confirm("Limpar todo o histórico de chat deste workspace?")) return;
    await supabase
      .from("workspace_chat_messages")
      .delete()
      .eq("workspace_id", workspaceId);
    setMessages([]);
    toast({ title: "Histórico limpo" });
  }, [workspaceId]);

  const copyConversation = useCallback(() => {
    const text = messages.map(m =>
      `**${m.role === "user" ? "Você" : "Aceleriq AI"}:**\n${m.content}`
    ).join("\n\n---\n\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Conversa copiada" });
  }, [messages]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-border shrink-0 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle className="text-sm font-semibold leading-tight">
              Aceleriq AI · {clientName}
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              Contexto carregado automaticamente: briefing, canvas, timeline, métricas
            </DialogDescription>
          </div>
          {messages.length > 0 && (
            <>
              <Button onClick={copyConversation} variant="ghost" size="icon" className="h-8 w-8" title="Copiar conversa">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button onClick={clearHistory} variant="ghost" size="icon" className="h-8 w-8" title="Limpar histórico">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          <Button onClick={() => onOpenChange(false)} variant="ghost" size="icon" className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
          {loadingHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 border border-primary/25">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">Converse sobre {workspaceName}</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  O Aceleriq AI tem acesso ao contexto completo: briefing do cliente, nodes do canvas,
                  timeline e métricas. Faça perguntas estratégicas ou operacionais.
                </p>
              </div>
              <div className="w-full max-w-md space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Perguntas rápidas
                </p>
                {QUICK_PROMPTS.map((q, i) => (
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
              <div
                key={m.id ?? i}
                className={cn(
                  "flex gap-3",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                {m.role === "assistant" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 border border-primary/30 shrink-0">
                    <Bot className="h-3.5 w-3.5 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-secondary/70 text-foreground rounded-tl-sm"
                  )}
                >
                  {m.content}
                  {m.role === "assistant" && m.metadata && (
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-foreground/10 text-[10px] text-muted-foreground">
                      {(m.metadata as any).nodes !== undefined && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {(m.metadata as any).nodes} nodes
                        </Badge>
                      )}
                      {(m.metadata as any).timeline_events !== undefined && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1">
                          {(m.metadata as any).timeline_events} eventos
                        </Badge>
                      )}
                      {(m.metadata as any).has_briefing && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-emerald-400/30 text-emerald-400">
                          com briefing
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                {m.role === "user" && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary shrink-0">
                    <User className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))
          )}
          {loading && (
            <div className="flex gap-3 justify-start">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 border border-primary/30 shrink-0">
                <Bot className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="bg-secondary/70 rounded-2xl rounded-tl-sm px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.2s" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" style={{ animationDelay: "0.4s" }} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-5 py-3 border-t border-border shrink-0 bg-card/50">
          <div className="flex items-end gap-2">
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Pergunte algo sobre esse workspace... (Enter envia, Shift+Enter nova linha)"
              rows={2}
              className="text-sm resize-none min-h-[48px] max-h-[140px]"
              disabled={loading}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={loading || !input.trim()}
              size="icon"
              className="h-10 w-10 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Gemini 2.5 Flash · contexto completo carregado automaticamente
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
