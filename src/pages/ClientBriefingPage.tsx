import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Building2, Check, ChevronLeft, ChevronRight, Loader2, Download, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { ENTERPRISE_BLOCKS, ENTERPRISE_SIGNAL_TO_DOSSIER, ENTERPRISE_TASK_SIGNALS, ENTERPRISE_DOC_SIGNALS } from "@/components/workspace/enterpriseStructuringBlocks";
import { decodeBriefingToken, saveBriefingProgress, loadBriefingProgress, clearBriefingProgress } from "@/lib/briefingToken";
import { supabase } from "@/integrations/supabase/client";

type Step = "fill" | "review" | "submitted";

export default function ClientBriefingPage() {
  const { token } = useParams<{ token: string }>();
  const [decoded, setDecoded] = useState<{ workspaceId: string; clientId: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [currentBlock, setCurrentBlock] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(ENTERPRISE_BLOCKS.map((b) => [b.key, ""]))
  );
  const [step, setStep] = useState<Step>("fill");
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const totalBlocks = ENTERPRISE_BLOCKS.length;
  const filledCount = ENTERPRISE_BLOCKS.filter((b) => answers[b.key].trim().length > 10).length;
  const block = ENTERPRISE_BLOCKS[currentBlock];
  const progressPct = step === "review" ? 100 : step === "submitted" ? 100 : ((currentBlock + 1) / totalBlocks) * 90;

  // Decode token & load saved progress
  useEffect(() => {
    if (!token) { setInvalid(true); return; }
    const payload = decodeBriefingToken(token);
    if (!payload) { setInvalid(true); return; }
    setDecoded(payload);

    // Load saved progress
    const saved = loadBriefingProgress(token);
    if (saved) {
      setAnswers((prev) => ({ ...prev, ...saved }));
    }

    // Fetch client name
    supabase
      .from("clients")
      .select("name")
      .eq("id", payload.clientId)
      .single()
      .then(({ data }) => {
        if (data) setClientName(data.name);
      });
  }, [token]);

  // Auto-save to localStorage with debounce
  const debouncedSave = useCallback((newAnswers: Record<string, string>) => {
    if (!token) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveBriefingProgress(token, newAnswers);
    }, 500);
  }, [token]);

  const updateAnswer = (key: string, value: string) => {
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);
    debouncedSave(newAnswers);
  };

  const handleNext = () => {
    if (currentBlock < totalBlocks - 1) setCurrentBlock(currentBlock + 1);
    else setStep("review");
  };

  const handlePrev = () => {
    if (step === "review") { setStep("fill"); setCurrentBlock(totalBlocks - 1); return; }
    if (currentBlock > 0) setCurrentBlock(currentBlock - 1);
  };

  const goToBlock = (idx: number) => { setStep("fill"); setCurrentBlock(idx); };

  const buildDocument = () => {
    return ENTERPRISE_BLOCKS.map((b) => {
      const answer = answers[b.key].trim();
      return `## ${b.label}\n\n${answer || "(não preenchido)"}`;
    }).join("\n\n---\n\n");
  };

  const buildSignals = () => {
    const structured_signals: Record<string, { summary: string; dossier_block: string }> = {};
    for (const b of ENTERPRISE_BLOCKS) {
      const answer = answers[b.key].trim();
      if (answer.length > 10) {
        structured_signals[b.signalKey] = {
          summary: answer.slice(0, 500),
          dossier_block: ENTERPRISE_SIGNAL_TO_DOSSIER[b.signalKey],
        };
      }
    }
    const signalKeys = Object.keys(structured_signals);
    return {
      structured_signals,
      dossier_signals: [...new Set(signalKeys.map((k) => ENTERPRISE_SIGNAL_TO_DOSSIER[k]))],
      task_signals: signalKeys.filter((k) => ENTERPRISE_TASK_SIGNALS.includes(k)),
      documentation_signals: signalKeys.filter((k) => ENTERPRISE_DOC_SIGNALS.includes(k)),
    };
  };

  const handleSubmit = async () => {
    if (!decoded || filledCount < 3) return;
    setSaving(true);

    try {
      const content = buildDocument();
      const signalsData = buildSignals();

      const metadata: Record<string, unknown> = {
        briefing_kind: "enterprise_structuring",
        import_source: "client_form",
        parser_mode: "local_rules",
        import_review_status: "pending_review",
        submitted_by_client: true,
        submitted_at: new Date().toISOString(),
        ...signalsData,
      };

      const { error } = await supabase.from("context_entries").insert({
        workspace_id: decoded.workspaceId,
        client_id: decoded.clientId,
        context_type: "briefing",
        title: "Briefing de Estruturação Empresarial (preenchido pelo cliente)",
        content,
        source_label: "Formulário externo (link)",
        is_key_decision: false,
        tags: ["briefing", "enterprise_structuring", "client_submitted"],
        metadata,
      });

      if (error) {
        toast({ title: "Erro ao enviar", description: "Tente novamente em alguns instantes.", variant: "destructive" });
        setSaving(false);
        return;
      }

      // Timeline event
      await supabase.from("timeline_events").insert({
        workspace_id: decoded.workspaceId,
        client_id: decoded.clientId,
        event_type: "context_added",
        title: "📋 Cliente preencheu Briefing de Estruturação",
        description: `${filledCount} de ${totalBlocks} blocos preenchidos · Enviado via link externo · Pendente de revisão`,
        happened_at: new Date().toISOString(),
      });

      // Clear localStorage
      if (token) clearBriefingProgress(token);
      setStep("submitted");
      toast({ title: "Briefing enviado com sucesso!" });
    } catch {
      toast({ title: "Erro inesperado", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = () => {
    const content = buildDocument();
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Briefing de Estruturação Empresarial</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; color: #1a1a1a; }
          h1 { font-size: 22px; border-bottom: 2px solid #22c55e; padding-bottom: 12px; margin-bottom: 24px; }
          h2 { font-size: 16px; color: #16a34a; margin-top: 28px; margin-bottom: 8px; }
          p { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
          hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
          .meta { font-size: 11px; color: #888; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <h1>🏢 Briefing de Estruturação Empresarial</h1>
        <p class="meta">${clientName ? `Cliente: ${clientName} · ` : ""}Gerado em ${new Date().toLocaleDateString("pt-BR")} · ${filledCount}/${totalBlocks} blocos</p>
        ${content.replace(/## (.+)/g, "<h2>$1</h2>").replace(/---/g, "<hr>").replace(/\n\n/g, "</p><p>").replace(/^(?!<)/, "<p>") + "</p>"}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  if (invalid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster />
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
            <h1 className="text-lg font-semibold text-foreground">Link inválido</h1>
            <p className="text-sm text-muted-foreground">
              Este link de briefing é inválido ou expirou. Solicite um novo link ao seu consultor.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === "submitted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster />
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto">
              <Check className="h-7 w-7 text-emerald-400" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Briefing enviado!</h1>
            <p className="text-sm text-muted-foreground">
              Obrigado por preencher o briefing. Sua equipe será notificada e entrará em contato em breve.
            </p>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-1" /> Baixar PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h1 className="text-base font-semibold text-foreground">Briefing de Estruturação Empresarial</h1>
          </div>
          {clientName && (
            <p className="text-xs text-muted-foreground mb-2">{clientName}</p>
          )}
          <Progress value={progressPct} className="h-1.5" />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>{step === "review" ? "Revisão final" : `Bloco ${currentBlock + 1} de ${totalBlocks}`}</span>
            <span>{filledCount}/{totalBlocks} preenchidos</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {step === "fill" && block && (
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{block.label}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{block.description}</p>
            </div>

            <div className="rounded-md border p-3 bg-muted/20 space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Perguntas-guia</p>
              {block.questions.map((q, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary/50 mt-0.5 shrink-0">{i + 1}.</span>
                  {q}
                </p>
              ))}
            </div>

            <Textarea
              value={answers[block.key]}
              onChange={(e) => updateAnswer(block.key, e.target.value)}
              placeholder="Descreva o cenário real da empresa neste bloco..."
              className="min-h-[150px] text-sm"
            />

            <div className="flex justify-between gap-2 pt-2">
              <Button variant="outline" onClick={handlePrev} disabled={currentBlock === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button onClick={handleNext}>
                {currentBlock < totalBlocks - 1 ? (
                  <>Próximo <ChevronRight className="h-4 w-4 ml-1" /></>
                ) : "Revisar"}
              </Button>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Revise suas respostas antes de enviar. Clique em qualquer bloco para editar.
            </p>
            <div className="space-y-1.5">
              {ENTERPRISE_BLOCKS.map((b, idx) => {
                const answer = answers[b.key].trim();
                const filled = answer.length > 10;
                return (
                  <Card
                    key={b.key}
                    className={`cursor-pointer transition-colors ${filled ? "border-emerald-500/20 hover:border-emerald-500/40" : "border-border/30 hover:border-border/60"}`}
                    onClick={() => goToBlock(idx)}
                  >
                    <CardContent className="p-3 flex items-start gap-2">
                      <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${filled ? "bg-emerald-500/20" : "bg-muted"}`}>
                        {filled ? <Check className="h-2.5 w-2.5 text-emerald-400" /> : <span className="text-[9px] text-muted-foreground">{idx + 1}</span>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium text-foreground">{b.label}</span>
                        {filled ? (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{answer}</p>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/50 mt-0.5">Não preenchido</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex items-center gap-3 text-xs text-muted-foreground border rounded-md p-3 bg-muted/20">
              <span>{filledCount} de {totalBlocks} blocos preenchidos</span>
              {filledCount < 3 && (
                <Badge variant="outline" className="text-[9px] bg-destructive/10 text-destructive border-destructive/20">
                  Mínimo 3 blocos
                </Badge>
              )}
            </div>

            <div className="flex justify-between gap-2 pt-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handlePrev}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button variant="outline" onClick={handleDownloadPDF}>
                  <Download className="h-4 w-4 mr-1" /> PDF
                </Button>
              </div>
              <Button onClick={handleSubmit} disabled={saving || filledCount < 3}>
                {saving ? (
                  <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Enviando...</>
                ) : (
                  <><Send className="h-4 w-4 mr-1" /> Enviar Briefing</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
