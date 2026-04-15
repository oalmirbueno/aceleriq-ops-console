import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Building2, Check, ChevronLeft, ChevronRight, Loader2, Download, Send, Clock, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import logoUrl from "@/assets/logo-aceleriq.png";
import { ENTERPRISE_BLOCKS, ENTERPRISE_SIGNAL_TO_DOSSIER, ENTERPRISE_TASK_SIGNALS, ENTERPRISE_DOC_SIGNALS } from "@/components/workspace/enterpriseStructuringBlocks";
import { decodeBriefingToken, saveBriefingProgress, loadBriefingProgress, clearBriefingProgress } from "@/lib/briefingToken";
import { supabase } from "@/integrations/supabase/client";

/** Flatten all blocks into individual questions */
interface FlatQuestion {
  blockKey: string;
  blockLabel: string;
  blockIndex: number;
  questionIndex: number;
  question: string;
  /** Unique key for answer storage */
  answerKey: string;
}

function buildFlatQuestions(): FlatQuestion[] {
  const flat: FlatQuestion[] = [];
  ENTERPRISE_BLOCKS.forEach((block, bIdx) => {
    block.questions.forEach((q, qIdx) => {
      flat.push({
        blockKey: block.key,
        blockLabel: block.label,
        blockIndex: bIdx,
        questionIndex: qIdx,
        question: q,
        answerKey: `${block.key}__${qIdx}`,
      });
    });
  });
  return flat;
}

const FLAT_QUESTIONS = buildFlatQuestions();
const TOTAL_QUESTIONS = FLAT_QUESTIONS.length;

type Step = "welcome" | "fill" | "review" | "submitted";

export default function ClientBriefingPage() {
  const { token } = useParams<{ token: string }>();
  const [decoded, setDecoded] = useState<{ workspaceId: string; clientId: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(FLAT_QUESTIONS.map((q) => [q.answerKey, ""]))
  );
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);
  const [clientName, setClientName] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answeredCount = FLAT_QUESTIONS.filter((q) => answers[q.answerKey]?.trim().length > 5).length;
  const progressPct = step === "welcome" ? 0 : step === "review" || step === "submitted" ? 100 : ((currentQ + 1) / TOTAL_QUESTIONS) * 100;
  const currentQuestion = FLAT_QUESTIONS[currentQ];

  // Decode token & load saved progress
  useEffect(() => {
    if (!token) { setInvalid(true); return; }
    const payload = decodeBriefingToken(token);
    if (!payload) { setInvalid(true); return; }
    setDecoded(payload);

    const saved = loadBriefingProgress(token);
    if (saved) {
      setAnswers((prev) => ({ ...prev, ...saved }));
      // If there's saved progress, skip welcome
      const hasSavedAnswers = Object.values(saved).some((v) => v.trim().length > 0);
      if (hasSavedAnswers) setStep("fill");
    }

    supabase
      .from("clients")
      .select("name")
      .eq("id", payload.clientId)
      .single()
      .then(({ data }) => {
        if (data) setClientName(data.name);
      });
  }, [token]);

  // Auto-save with debounce
  const debouncedSave = useCallback((newAnswers: Record<string, string>) => {
    if (!token) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveBriefingProgress(token, newAnswers);
    }, 400);
  }, [token]);

  const updateAnswer = (key: string, value: string) => {
    const newAnswers = { ...answers, [key]: value };
    setAnswers(newAnswers);
    debouncedSave(newAnswers);
  };

  const handleNext = () => {
    if (currentQ < TOTAL_QUESTIONS - 1) setCurrentQ(currentQ + 1);
    else setStep("review");
  };

  const handlePrev = () => {
    if (step === "review") { setStep("fill"); setCurrentQ(TOTAL_QUESTIONS - 1); return; }
    if (currentQ > 0) setCurrentQ(currentQ - 1);
  };

  const handleSkip = () => {
    if (currentQ < TOTAL_QUESTIONS - 1) setCurrentQ(currentQ + 1);
    else setStep("review");
  };

  const goToQuestion = (idx: number) => { setStep("fill"); setCurrentQ(idx); };

  /** Consolidate flat answers back into block-level content */
  const buildDocument = () => {
    return ENTERPRISE_BLOCKS.map((block) => {
      const blockAnswers = block.questions.map((q, qIdx) => {
        const key = `${block.key}__${qIdx}`;
        const answer = answers[key]?.trim();
        return answer ? `**${q}**\n${answer}` : `**${q}**\n_(não respondido)_`;
      });
      return `## ${block.label}\n\n${blockAnswers.join("\n\n")}`;
    }).join("\n\n---\n\n");
  };

  const buildSignals = () => {
    const structured_signals: Record<string, { summary: string; dossier_block: string }> = {};
    for (const block of ENTERPRISE_BLOCKS) {
      const blockText = block.questions.map((_, qIdx) => {
        const key = `${block.key}__${qIdx}`;
        return answers[key]?.trim() || "";
      }).filter(Boolean).join(" | ");

      if (blockText.length > 10) {
        structured_signals[block.signalKey] = {
          summary: blockText.slice(0, 500),
          dossier_block: ENTERPRISE_SIGNAL_TO_DOSSIER[block.signalKey],
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
    if (!decoded) return;
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
        answers_count: answeredCount,
        total_questions: TOTAL_QUESTIONS,
        ...signalsData,
      };

      const { error } = await supabase.from("context_entries").insert({
        workspace_id: decoded.workspaceId,
        client_id: decoded.clientId,
        context_type: "briefing",
        title: "Briefing de Estruturação Empresarial",
        content,
        source_label: "Preenchido pelo cliente",
        is_key_decision: false,
        tags: ["briefing", "enterprise_structuring", "client_submitted"],
        metadata,
      });

      if (error) {
        toast({ title: "Erro ao enviar", description: "Tente novamente.", variant: "destructive" });
        setSaving(false);
        return;
      }

      await supabase.from("timeline_events").insert({
        workspace_id: decoded.workspaceId,
        client_id: decoded.clientId,
        event_type: "context_added",
        title: "Cliente preencheu o Briefing de Estruturação",
        description: `${answeredCount} de ${TOTAL_QUESTIONS} perguntas respondidas. Pendente de revisão.`,
        happened_at: new Date().toISOString(),
      });

      if (token) clearBriefingProgress(token);
      setStep("submitted");
      toast({ title: "Briefing enviado com sucesso!" });
    } catch {
      toast({ title: "Erro inesperado", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    const content = buildDocument();
    // Convert logo to base64 for embedding
    let logoBase64 = "";
    try {
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* silent */ }

    const w = window.open("", "_blank");
    if (!w) return;

    const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });

    w.document.write(`<!DOCTYPE html><html><head><title>Briefing de Estruturação Empresarial</title>
      <style>
        @page { margin: 30mm 20mm; }
        body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; padding: 0; max-width: 700px; margin: 0 auto; color: #1a1a1a; font-size: 13px; line-height: 1.7; }
        .header { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 32px; }
        .header img { height: 36px; }
        .header-text { text-align: right; }
        .header-text h1 { font-size: 18px; font-weight: 600; margin: 0; letter-spacing: -0.3px; }
        .header-text p { font-size: 11px; color: #666; margin: 4px 0 0; }
        .section-title { font-size: 14px; font-weight: 600; color: #1a1a1a; margin: 32px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb; text-transform: uppercase; letter-spacing: 0.5px; }
        .question { font-weight: 600; color: #333; margin: 16px 0 4px; font-size: 12px; }
        .answer { margin: 0 0 12px; color: #444; white-space: pre-wrap; }
        .empty { color: #bbb; font-style: italic; }
        .divider { border: none; border-top: 1px solid #eee; margin: 24px 0; }
        .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 10px; color: #999; text-align: center; }
      </style></head><body>
      <div class="header">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" />` : "<div></div>"}
        <div class="header-text">
          <h1>Briefing de Estruturação Empresarial</h1>
          <p>${clientName ? `${clientName} &middot; ` : ""}${date}</p>
        </div>
      </div>
      ${content
        .replace(/## (.+)/g, '<p class="section-title">$1</p>')
        .replace(/\*\*(.+?)\*\*/g, '<p class="question">$1</p>')
        .replace(/_\(não respondido\)_/g, '<p class="answer empty">Não respondida</p>')
        .replace(/---/g, '<hr class="divider">')
        .replace(/(?<=>)\n([^<])/g, '<p class="answer">$1')
        .replace(/\n/g, "<br>")}
      <div class="footer">
        Documento gerado automaticamente &middot; ${answeredCount} de ${TOTAL_QUESTIONS} perguntas respondidas &middot; ${date}
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  // ── Invalid token ──
  if (invalid) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster />
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-3">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
            <h1 className="text-lg font-semibold text-foreground">Link inválido</h1>
            <p className="text-sm text-muted-foreground">
              Este link é inválido ou expirou. Solicite um novo link ao seu consultor.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Submitted ──
  if (step === "submitted") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster />
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Briefing enviado!</h1>
            <p className="text-sm text-muted-foreground">
              Obrigado por dedicar seu tempo. Suas respostas já foram recebidas e sua equipe será notificada.
            </p>
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-1" /> Baixar cópia em PDF
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Welcome screen ──
  if (step === "welcome") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster />
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center space-y-3">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              Briefing de Estruturação Empresarial
            </h1>
            {clientName && (
              <p className="text-sm text-muted-foreground">{clientName}</p>
            )}
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                Este questionário nos ajuda a entender profundamente como sua empresa funciona hoje — 
                sua operação, processos, ferramentas, equipe e objetivos. Com essas informações, 
                conseguimos criar um plano de ação preciso e personalizado.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Tempo estimado: 20–35 minutos</p>
                    <p className="text-xs text-muted-foreground">São {TOTAL_QUESTIONS} perguntas organizadas em {ENTERPRISE_BLOCKS.length} temas.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Seu progresso é salvo automaticamente</p>
                    <p className="text-xs text-muted-foreground">Se precisar sair, pode voltar a qualquer momento e continuar de onde parou.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Responda com honestidade</p>
                    <p className="text-xs text-muted-foreground">Não existe resposta errada. Quanto mais detalhes, melhor o resultado do trabalho.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg" onClick={() => setStep("fill")}>
            Começar <ArrowRight className="h-4 w-4 ml-2" />
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            Você pode pular perguntas que não se aplicam ao seu negócio.
          </p>
        </div>
      </div>
    );
  }

  // ── Current block label (for section header) ──
  const currentBlockLabel = currentQuestion?.blockLabel;
  const isNewBlock = currentQ === 0 || FLAT_QUESTIONS[currentQ - 1]?.blockKey !== currentQuestion?.blockKey;
  const currentAnswer = answers[currentQuestion?.answerKey] ?? "";
  const hasAnswer = currentAnswer.trim().length > 5;

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Sticky header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Pergunta {currentQ + 1} de {TOTAL_QUESTIONS}
            </span>
            <Badge variant="outline" className="text-[10px]">
              {answeredCount} respondidas
            </Badge>
          </div>
          <Progress value={progressPct} className="h-1" />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-xl mx-auto px-4 py-8">
        {step === "fill" && currentQuestion && (
          <div className="space-y-6">
            {/* Block section indicator */}
            {isNewBlock && (
              <div className="flex items-center gap-2 pb-2">
                <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                <span className="text-xs font-medium text-primary uppercase tracking-wider">
                  {currentBlockLabel}
                </span>
              </div>
            )}
            {!isNewBlock && (
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                {currentBlockLabel}
              </p>
            )}

            {/* Question */}
            <h2 className="text-base font-medium text-foreground leading-snug">
              {currentQuestion.question}
            </h2>

            {/* Answer */}
            <Textarea
              value={currentAnswer}
              onChange={(e) => updateAnswer(currentQuestion.answerKey, e.target.value)}
              placeholder="Digite sua resposta aqui..."
              className="min-h-[140px] text-sm resize-none"
              autoFocus
            />

            {/* Navigation */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                disabled={currentQ === 0}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>

              <div className="flex items-center gap-2">
                {!hasAnswer && (
                  <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
                    Pular
                  </Button>
                )}
                <Button onClick={handleNext}>
                  {currentQ < TOTAL_QUESTIONS - 1 ? (
                    <>Próxima <ChevronRight className="h-4 w-4 ml-1" /></>
                  ) : (
                    "Revisar respostas"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-foreground">Revisão final</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Revise suas respostas antes de enviar. Clique em qualquer pergunta para editar.
              </p>
            </div>

            {ENTERPRISE_BLOCKS.map((block, bIdx) => {
              const blockQuestions = FLAT_QUESTIONS.filter((q) => q.blockIndex === bIdx);
              const blockAnswered = blockQuestions.filter((q) => answers[q.answerKey]?.trim().length > 5).length;

              return (
                <div key={block.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{block.label}</span>
                    <span className="text-[10px] text-muted-foreground">{blockAnswered}/{blockQuestions.length}</span>
                  </div>
                  {blockQuestions.map((q) => {
                    const answer = answers[q.answerKey]?.trim();
                    const filled = answer.length > 5;
                    const globalIdx = FLAT_QUESTIONS.indexOf(q);

                    return (
                      <Card
                        key={q.answerKey}
                        className={`cursor-pointer transition-colors ${filled ? "border-primary/20 hover:border-primary/40" : "border-border/20 hover:border-border/40"}`}
                        onClick={() => goToQuestion(globalIdx)}
                      >
                        <CardContent className="p-3 flex items-start gap-2">
                          <div className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${filled ? "bg-primary/20" : "bg-muted"}`}>
                            {filled && <Check className="h-2 w-2 text-primary" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground">{q.question}</p>
                            {filled ? (
                              <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{answer}</p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground/40 mt-0.5">Não respondida</p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              );
            })}

            <div className="border rounded-md p-3 bg-muted/20 text-xs text-muted-foreground">
              {answeredCount} de {TOTAL_QUESTIONS} perguntas respondidas
            </div>

            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrev}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
                  <Download className="h-4 w-4 mr-1" /> PDF
                </Button>
              </div>
              <Button onClick={handleSubmit} disabled={saving || answeredCount < 5}>
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
