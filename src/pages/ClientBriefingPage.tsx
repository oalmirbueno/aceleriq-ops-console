import { useState, useEffect, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { Building2, Bot, Check, ChevronLeft, ChevronRight, Loader2, Download, Send, Clock, Shield, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { ENTERPRISE_BLOCKS, ENTERPRISE_SIGNAL_TO_DOSSIER, ENTERPRISE_TASK_SIGNALS, ENTERPRISE_DOC_SIGNALS } from "@/components/workspace/enterpriseStructuringBlocks";
import { AUTOMATION_BLOCKS, AUTOMATION_SIGNAL_TO_DOSSIER, AUTOMATION_TASK_SIGNALS, AUTOMATION_DOC_SIGNALS } from "@/components/workspace/automationBlocks";
import { decodeBriefingToken, saveBriefingProgress, loadBriefingProgress, clearBriefingProgress, type BriefingKind, BRIEFING_KIND_LABELS } from "@/lib/briefingToken";
import { loadRemoteDraft, saveRemoteDraft, submitRemoteBriefing } from "@/lib/briefingPersistence";
import { supabase } from "@/integrations/supabase/client";

/** Get block definitions based on briefing type */
function getBlocksForType(briefingType: BriefingKind) {
  if (briefingType === "ai_automation") {
    return {
      blocks: AUTOMATION_BLOCKS,
      signalToDossier: AUTOMATION_SIGNAL_TO_DOSSIER,
      taskSignals: AUTOMATION_TASK_SIGNALS,
      docSignals: AUTOMATION_DOC_SIGNALS,
    };
  }
  return {
    blocks: ENTERPRISE_BLOCKS,
    signalToDossier: ENTERPRISE_SIGNAL_TO_DOSSIER,
    taskSignals: ENTERPRISE_TASK_SIGNALS,
    docSignals: ENTERPRISE_DOC_SIGNALS,
  };
}

/** Flatten all blocks into individual questions */
interface FlatQuestion {
  blockKey: string;
  blockLabel: string;
  blockIndex: number;
  questionIndex: number;
  question: string;
  answerKey: string;
}

function buildFlatQuestions(blocks: typeof ENTERPRISE_BLOCKS): FlatQuestion[] {
  const flat: FlatQuestion[] = [];
  blocks.forEach((block, bIdx) => {
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

function isAnsweredValue(value?: string | null) {
  return (value?.trim().length ?? 0) > 0;
}

function countAnsweredQuestions(answerMap: Record<string, string>, flatQuestions: FlatQuestion[]) {
  return flatQuestions.filter((q) => isAnsweredValue(answerMap[q.answerKey])).length;
}

type Step = "welcome" | "fill" | "review" | "submitted";

/** Briefing type metadata for display */
const BRIEFING_META: Record<BriefingKind, { icon: typeof Building2; title: string; description: string }> = {
  enterprise_structuring: {
    icon: Building2,
    title: "Briefing de Estruturação Empresarial",
    description: "Este questionário nos ajuda a entender profundamente como sua empresa funciona hoje — sua operação, processos, ferramentas, equipe e objetivos. Com essas informações, conseguimos criar um plano de ação preciso e personalizado.",
  },
  ai_automation: {
    icon: Bot,
    title: "Briefing de Automação e IA",
    description: "Este questionário nos ajuda a mapear sua operação atual, identificar oportunidades de automação e entender como inteligência artificial pode acelerar seus resultados. Com essas respostas, criamos um plano de automação personalizado.",
  },
};

export default function ClientBriefingPage() {
  const { token } = useParams<{ token: string }>();
  const [decoded, setDecoded] = useState<{ workspaceId: string; clientId: string; briefingType: BriefingKind } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState<string | null>(null);
  const [remoteId, setRemoteId] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const posTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceTokenRef = useRef<string>("");
  const answersRef = useRef<Record<string, string>>({});

  // Derived from decoded briefing type
  const briefingType = decoded?.briefingType ?? "enterprise_structuring";
  const { blocks, signalToDossier, taskSignals, docSignals } = getBlocksForType(briefingType);
  const flatQuestions = buildFlatQuestions(blocks);
  const totalQuestions = flatQuestions.length;

  const answeredCount = countAnsweredQuestions(answers, flatQuestions);
  const progressPct = step === "welcome" ? 0 : step === "review" || step === "submitted" ? 100 : ((currentQ + 1) / totalQuestions) * 100;
  const currentQuestion = flatQuestions[currentQ];
  const meta = BRIEFING_META[briefingType];
  const BriefingIcon = meta.icon;

  // Keep answersRef in sync so async callbacks always read the latest
  useEffect(() => { answersRef.current = answers; }, [answers]);

  // Decode token & load saved progress (Supabase first, localStorage fallback)
  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return; }
    const payload = decodeBriefingToken(token);
    if (!payload) { setInvalid(true); setLoading(false); return; }
    setDecoded(payload);
    sourceTokenRef.current = token;

    // Build empty answers for the correct briefing type
    const typeBlocks = getBlocksForType(payload.briefingType);
    const typeFlat = buildFlatQuestions(typeBlocks.blocks);
    const emptyAnswers = Object.fromEntries(typeFlat.map((q) => [q.answerKey, ""]));

    const init = async () => {
      let nextAnswers = { ...emptyAnswers };
      let nextCurrentQ = 0;
      let nextStep: Step = "welcome";
      let nextRemoteId: string | null = null;
      let nextSubmitted = false;

      // 1. Try Supabase first
      const remote = await loadRemoteDraft(token);

      if (remote) {
        if (remote.status === "submitted") {
          nextSubmitted = true;
          nextStep = "submitted";
          nextRemoteId = remote.id;
        } else {
          nextAnswers = { ...emptyAnswers, ...remote.answers };
          nextRemoteId = remote.id;

          const hasSavedAnswers = Object.values(remote.answers).some((value) => isAnsweredValue(value));
          if (hasSavedAnswers) {
            const savedIdx = remote.currentQuestion;
            nextCurrentQ = (typeof savedIdx === "number" && savedIdx >= 0 && savedIdx < typeFlat.length)
              ? savedIdx : 0;
            nextStep = "fill";
          }
        }
      } else {
        const local = loadBriefingProgress(token);
        if (local) {
          nextAnswers = { ...emptyAnswers, ...local };
          const hasSavedAnswers = Object.values(local).some((value) => isAnsweredValue(value));
          if (hasSavedAnswers) {
            nextStep = "fill";
          }
        }
      }

      setAnswers(nextAnswers);
      answersRef.current = nextAnswers;
      setCurrentQ(nextCurrentQ);
      setStep(nextStep);
      setRemoteId(nextRemoteId);
      setIsSubmitted(nextSubmitted);
      setLoading(false);
    };

    init();

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
  const debouncedSave = useCallback((questionIndex: number) => {
    if (!token || !decoded || isSubmitted) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const latestAnswers = answersRef.current;
      saveBriefingProgress(token, latestAnswers);

      const meaningful = countAnsweredQuestions(latestAnswers, flatQuestions);
      if (meaningful < 1) return;

      const id = await saveRemoteDraft(
        token,
        decoded.workspaceId,
        decoded.clientId,
        {
          answers: latestAnswers,
          currentQuestion: questionIndex,
          answeredCount: meaningful,
          totalQuestions,
        },
        remoteId ?? undefined,
      );
      if (id && !remoteId) setRemoteId(id);
    }, 1500);
  }, [token, decoded, remoteId, isSubmitted, flatQuestions, totalQuestions]);

  const flushPosition = useCallback((questionIndex: number) => {
    if (!token || !decoded || isSubmitted) return;
    if (saveTimerRef.current) { clearTimeout(saveTimerRef.current); saveTimerRef.current = null; }
    if (posTimerRef.current) clearTimeout(posTimerRef.current);
    posTimerRef.current = setTimeout(async () => {
      const latestAnswers = answersRef.current;
      const meaningful = countAnsweredQuestions(latestAnswers, flatQuestions);
      if (meaningful < 1) return;
      saveBriefingProgress(token, latestAnswers);
      const id = await saveRemoteDraft(
        token,
        decoded.workspaceId,
        decoded.clientId,
        {
          answers: latestAnswers,
          currentQuestion: questionIndex,
          answeredCount: meaningful,
          totalQuestions,
        },
        remoteId ?? undefined,
      );
      if (id && !remoteId) setRemoteId(id);
    }, 300);
  }, [token, decoded, remoteId, isSubmitted, flatQuestions, totalQuestions]);

  const updateAnswer = (key: string, value: string) => {
    setAnswers(prev => {
      const next = { ...prev, [key]: value };
      answersRef.current = next;
      return next;
    });
    debouncedSave(currentQ);
  };

  const handleNext = () => {
    if (currentQ < totalQuestions - 1) {
      const next = currentQ + 1;
      setCurrentQ(next);
      flushPosition(next);
    } else {
      setStep("review");
      flushPosition(currentQ);
    }
  };

  const handlePrev = () => {
    if (step === "review") {
      const last = totalQuestions - 1;
      setStep("fill");
      setCurrentQ(last);
      flushPosition(last);
      return;
    }
    if (currentQ > 0) {
      const prev = currentQ - 1;
      setCurrentQ(prev);
      flushPosition(prev);
    }
  };

  const handleSkip = () => {
    if (currentQ < totalQuestions - 1) {
      const next = currentQ + 1;
      setCurrentQ(next);
      flushPosition(next);
    } else {
      setStep("review");
      flushPosition(currentQ);
    }
  };

  const goToQuestion = (idx: number) => {
    setStep("fill");
    setCurrentQ(idx);
    flushPosition(idx);
  };

  /** Consolidate flat answers back into block-level content */
  const buildDocument = () => {
    return blocks.map((block) => {
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
    for (const block of blocks) {
      const blockText = block.questions.map((_, qIdx) => {
        const key = `${block.key}__${qIdx}`;
        return answers[key]?.trim() || "";
      }).filter(Boolean).join(" | ");

      if (blockText.length > 10) {
        structured_signals[block.signalKey] = {
          summary: blockText.slice(0, 500),
          dossier_block: signalToDossier[block.signalKey],
        };
      }
    }
    const signalKeys = Object.keys(structured_signals);
    return {
      structured_signals,
      dossier_signals: [...new Set(signalKeys.map((k) => signalToDossier[k]))],
      task_signals: signalKeys.filter((k) => taskSignals.includes(k)),
      documentation_signals: signalKeys.filter((k) => docSignals.includes(k)),
    };
  };

  const handleSubmit = async () => {
    if (!decoded || !token) return;
    setSaving(true);
    try {
      const content = buildDocument();
      const signalsData = buildSignals();

      const success = await submitRemoteBriefing(
        remoteId ?? "",
        token,
        content,
        signalsData,
        answeredCount,
        totalQuestions,
      );

      if (!success) {
        toast({ title: "Erro ao enviar", description: "Tente novamente.", variant: "destructive" });
        setSaving(false);
        return;
      }

      if (token) clearBriefingProgress(token);
      setIsSubmitted(true);
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
    const w = window.open("", "_blank");
    if (!w) return;
    const primaryColor = briefingType === "ai_automation" ? "#8b5cf6" : "#22c55e";
    w.document.write(`<!DOCTYPE html><html><head><title>${meta.title}</title>
      <style>
        body{font-family:'Segoe UI',system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#1a1a1a}
        h1{font-size:22px;border-bottom:2px solid ${primaryColor};padding-bottom:12px;margin-bottom:24px}
        h2{font-size:16px;color:${primaryColor};margin-top:28px;margin-bottom:8px}
        p,strong{font-size:13px;line-height:1.6}
        strong{display:block;margin-top:12px;color:#333}
        hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
        .meta{font-size:11px;color:#888;margin-bottom:20px}
        em{color:#999}
      </style></head><body>
      <h1>${meta.title}</h1>
      <p class="meta">${clientName ? `${clientName} · ` : ""}${new Date().toLocaleDateString("pt-BR")} · ${answeredCount}/${totalQuestions} perguntas</p>
      ${content
        .replace(/## (.+)/g, "<h2>$1</h2>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/_\((.+?)\)_/g, "<em>($1)</em>")
        .replace(/---/g, "<hr>")
        .replace(/\n/g, "<br>")}
    </body></html>`);
    w.document.close();
    w.print();
  };

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Toaster />
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Carregando briefing...</span>
        </div>
      </div>
    );
  }

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
              <BriefingIcon className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground">
              {meta.title}
            </h1>
            {clientName && (
              <p className="text-sm text-muted-foreground">{clientName}</p>
            )}
          </div>

          <Card>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-foreground leading-relaxed">
                {meta.description}
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Tempo estimado: 20–35 minutos</p>
                    <p className="text-xs text-muted-foreground">São {totalQuestions} perguntas organizadas em {blocks.length} temas.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-foreground">Seu progresso é salvo automaticamente</p>
                    <p className="text-xs text-muted-foreground">Se precisar sair, pode voltar a qualquer momento — mesmo de outro dispositivo.</p>
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
  const isNewBlock = currentQ === 0 || flatQuestions[currentQ - 1]?.blockKey !== currentQuestion?.blockKey;
  const currentAnswer = answers[currentQuestion?.answerKey] ?? "";
  const hasAnswer = isAnsweredValue(currentAnswer);

  return (
    <div className="min-h-screen bg-background">
      <Toaster />

      {/* Sticky header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">
              Pergunta {currentQ + 1} de {totalQuestions}
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
              key={currentQuestion.answerKey}
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
                  {currentQ < totalQuestions - 1 ? (
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

            {blocks.map((block, bIdx) => {
              const blockQuestions = flatQuestions.filter((q) => q.blockIndex === bIdx);
              const blockAnswered = blockQuestions.filter((q) => isAnsweredValue(answers[q.answerKey])).length;

              return (
                <div key={block.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">{block.label}</span>
                    <span className="text-[10px] text-muted-foreground">{blockAnswered}/{blockQuestions.length}</span>
                  </div>
                  {blockQuestions.map((q) => {
                    const answer = answers[q.answerKey]?.trim() ?? "";
                    const filled = isAnsweredValue(answer);
                    const globalIdx = flatQuestions.indexOf(q);

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
              {answeredCount} de {totalQuestions} perguntas respondidas
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
