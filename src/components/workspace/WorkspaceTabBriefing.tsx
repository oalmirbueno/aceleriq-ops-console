import { useState, useEffect, useCallback, useRef } from "react";
import { Building2, Check, ChevronLeft, ChevronRight, Loader2, Download, Send, Clock, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ENTERPRISE_BLOCKS, ENTERPRISE_SIGNAL_TO_DOSSIER, ENTERPRISE_TASK_SIGNALS, ENTERPRISE_DOC_SIGNALS } from "./enterpriseStructuringBlocks";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo-aceleriq.png";

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
}

/** Flatten blocks into individual questions */
interface FlatQuestion {
  blockKey: string;
  blockLabel: string;
  blockIndex: number;
  questionIndex: number;
  question: string;
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
const STORAGE_PREFIX = "aceleriq_briefing_";

type Step = "welcome" | "fill" | "review" | "submitted";

export default function WorkspaceTabBriefing({ workspaceId, clientId, clientName }: Props) {
  const storageKey = `${STORAGE_PREFIX}${workspaceId}`;
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(FLAT_QUESTIONS.map((q) => [q.answerKey, ""]))
  );
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);
  const [existingBriefing, setExistingBriefing] = useState<boolean | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const answeredCount = FLAT_QUESTIONS.filter((q) => answers[q.answerKey]?.trim().length > 5).length;
  const progressPct = step === "welcome" ? 0 : step === "review" || step === "submitted" ? 100 : ((currentQ + 1) / TOTAL_QUESTIONS) * 100;
  const currentQuestion = FLAT_QUESTIONS[currentQ];

  // Check for existing briefing + load saved progress
  useEffect(() => {
    // Check if there's already a submitted enterprise briefing
    supabase
      .from("context_entries")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("context_type", "briefing")
      .filter("metadata->>briefing_kind", "eq", "enterprise_structuring")
      .limit(1)
      .then(({ data }) => {
        setExistingBriefing(!!data && data.length > 0);
      });

    // Load saved progress from localStorage
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.answers) {
          setAnswers((prev) => ({ ...prev, ...parsed.answers }));
          const hasSaved = Object.values(parsed.answers as Record<string, string>).some((v) => v.trim().length > 0);
          if (hasSaved) setStep("fill");
        }
      }
    } catch { /* silent */ }
  }, [workspaceId, storageKey]);

  // Auto-save with debounce
  const debouncedSave = useCallback((newAnswers: Record<string, string>) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ answers: newAnswers, updatedAt: Date.now() }));
      } catch { /* silent */ }
    }, 400);
  }, [storageKey]);

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
    setSaving(true);
    try {
      const content = buildDocument();
      const signalsData = buildSignals();

      const metadata: Record<string, unknown> = {
        briefing_kind: "enterprise_structuring",
        import_source: "native_form",
        parser_mode: "local_rules",
        import_review_status: "pending_review",
        submitted_at: new Date().toISOString(),
        answers_count: answeredCount,
        total_questions: TOTAL_QUESTIONS,
        ...signalsData,
      };

      const { error } = await supabase.from("context_entries").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        context_type: "briefing",
        title: "Briefing de Estruturação Empresarial",
        content,
        source_label: "Formulário nativo",
        is_key_decision: false,
        tags: ["briefing", "enterprise_structuring"],
        metadata,
      });

      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "context_added",
        title: "Briefing de Estruturação Empresarial criado",
        description: `${answeredCount} de ${TOTAL_QUESTIONS} perguntas respondidas. Pendente de revisão.`,
        happened_at: new Date().toISOString(),
      });

      try { localStorage.removeItem(storageKey); } catch { /* silent */ }
      setStep("submitted");
      setExistingBriefing(true);
      toast({ title: "Briefing salvo com sucesso", description: "Revise os sinais na aba Contexto." });
    } catch {
      toast({ title: "Erro inesperado", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadPDF = async () => {
    const content = buildDocument();
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
          <p>${clientName} &middot; ${date}</p>
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
        Documento confidencial &middot; ${answeredCount} de ${TOTAL_QUESTIONS} perguntas respondidas &middot; ${date}
      </div>
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  };

  const handleReset = () => {
    setAnswers(Object.fromEntries(FLAT_QUESTIONS.map((q) => [q.answerKey, ""])));
    setCurrentQ(0);
    setStep("welcome");
    try { localStorage.removeItem(storageKey); } catch { /* silent */ }
  };

  // ── Already submitted ──
  if (step === "submitted" || (existingBriefing && step === "welcome")) {
    return (
      <div className="flex items-center justify-center py-16 animate-fade-in">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto">
            <Check className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-base font-semibold text-foreground">Briefing já foi preenchido</h2>
          <p className="text-sm text-muted-foreground">
            O Briefing de Estruturação Empresarial deste workspace já foi enviado. 
            Revise os sinais na aba <strong>Contexto</strong> e marque como revisado para liberar o uso automático.
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
              <Download className="h-4 w-4 mr-1" /> Baixar PDF
            </Button>
            <Button variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground">
              Preencher novamente
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Welcome ──
  if (step === "welcome") {
    return (
      <div className="flex items-center justify-center py-12 animate-fade-in">
        <div className="max-w-lg w-full space-y-6">
          <div className="text-center space-y-2">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              Briefing de Estruturação Empresarial
            </h2>
            <p className="text-xs text-muted-foreground">{clientName}</p>
          </div>

          <Card>
            <CardContent className="p-5 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                Este questionário mapeia a estrutura real da empresa — operação, processos, ferramentas, 
                equipe e objetivos. As respostas alimentam o Dossiê, plano operacional e geração de tarefas.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Tempo estimado: 20–35 minutos</p>
                    <p className="text-xs text-muted-foreground">{TOTAL_QUESTIONS} perguntas em {ENTERPRISE_BLOCKS.length} temas.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Progresso salvo automaticamente</p>
                    <p className="text-xs text-muted-foreground">Pode sair e voltar a qualquer momento sem perder nada.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Quanto mais detalhes, melhor</p>
                    <p className="text-xs text-muted-foreground">Não existe resposta errada. Pule o que não se aplica.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg" onClick={() => setStep("fill")}>
            Começar <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </div>
    );
  }

  // ── Current question context ──
  const isNewBlock = currentQ === 0 || FLAT_QUESTIONS[currentQ - 1]?.blockKey !== currentQuestion?.blockKey;
  const currentAnswer = answers[currentQuestion?.answerKey] ?? "";
  const hasAnswer = currentAnswer.trim().length > 5;

  return (
    <div className="animate-fade-in">
      {/* Progress bar */}
      <div className="mb-6">
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

      {step === "fill" && currentQuestion && (
        <div className="max-w-xl mx-auto space-y-5">
          {/* Block indicator */}
          {isNewBlock ? (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-xs font-medium text-primary uppercase tracking-wider">
                {currentQuestion.blockLabel}
              </span>
            </div>
          ) : (
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
              {currentQuestion.blockLabel}
            </p>
          )}

          {/* Question */}
          <h3 className="text-base font-medium text-foreground leading-snug">
            {currentQuestion.question}
          </h3>

          {/* Answer */}
          <Textarea
            value={currentAnswer}
            onChange={(e) => updateAnswer(currentQuestion.answerKey, e.target.value)}
            placeholder="Digite sua resposta aqui..."
            className="min-h-[140px] text-sm resize-none"
            autoFocus
          />

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={handlePrev} disabled={currentQ === 0}>
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
                ) : "Revisar respostas"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {step === "review" && (
        <div className="max-w-xl mx-auto space-y-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">Revisão final</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Revise as respostas antes de salvar. Clique em qualquer pergunta para editar.
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

          <div className="flex items-center justify-between gap-2">
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
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</>
              ) : (
                <><Send className="h-4 w-4 mr-1" /> Salvar Briefing</>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
