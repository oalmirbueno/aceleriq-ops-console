import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { ArrowRight, Building2, Check, ChevronLeft, ChevronRight, Clock, Download, Loader2, Send, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/toaster";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/logo-aceleriq.png";
import { ENTERPRISE_BLOCKS, ENTERPRISE_DOC_SIGNALS, ENTERPRISE_SIGNAL_TO_DOSSIER, ENTERPRISE_TASK_SIGNALS } from "@/components/workspace/enterpriseStructuringBlocks";
import { clearBriefingProgress, decodeBriefingToken, loadBriefingProgress, saveBriefingProgress } from "@/lib/briefingToken";

interface FlatQuestion {
  blockKey: string;
  blockLabel: string;
  blockIndex: number;
  question: string;
  answerKey: string;
}

function buildFlatQuestions(): FlatQuestion[] {
  return ENTERPRISE_BLOCKS.flatMap((block, blockIndex) =>
    block.questions.map((question, questionIndex) => ({
      blockKey: block.key,
      blockLabel: block.label,
      blockIndex,
      question,
      answerKey: `${block.key}__${questionIndex}`,
    }))
  );
}

const FLAT_QUESTIONS = buildFlatQuestions();
const TOTAL_QUESTIONS = FLAT_QUESTIONS.length;
type Step = "welcome" | "fill" | "review" | "submitted";

export default function ClientBriefingPage() {
  const { token } = useParams<{ token: string }>();
  const decoded = useMemo(() => (token ? decodeBriefingToken(token) : null), [token]);
  const [clientName, setClientName] = useState("Cliente");
  const [currentQ, setCurrentQ] = useState(0);
  const [step, setStep] = useState<Step>("welcome");
  const [saving, setSaving] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(() => Object.fromEntries(FLAT_QUESTIONS.map((q) => [q.answerKey, ""])));
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token || !decoded) {
      setInvalid(true);
      return;
    }

    const saved = loadBriefingProgress(token);
    if (saved) {
      setAnswers((prev) => ({ ...prev, ...saved }));
      if (Object.values(saved).some((value) => value.trim().length > 0)) {
        setStep("fill");
      }
    }

    supabase
      .from("clients")
      .select("name")
      .eq("id", decoded.clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setClientName(data.name);
      });
  }, [decoded, token]);

  const debouncedSave = useCallback((nextAnswers: Record<string, string>) => {
    if (!token) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => saveBriefingProgress(token, nextAnswers), 350);
  }, [token]);

  const updateAnswer = (key: string, value: string) => {
    const nextAnswers = { ...answers, [key]: value };
    setAnswers(nextAnswers);
    debouncedSave(nextAnswers);
  };

  const answeredCount = FLAT_QUESTIONS.filter((q) => answers[q.answerKey]?.trim().length > 5).length;
  const currentQuestion = FLAT_QUESTIONS[currentQ];
  const currentAnswer = currentQuestion ? answers[currentQuestion.answerKey] ?? "" : "";
  const isNewBlock = currentQ === 0 || FLAT_QUESTIONS[currentQ - 1]?.blockKey !== currentQuestion?.blockKey;
  const progressPct = step === "welcome" ? 0 : step === "review" || step === "submitted" ? 100 : ((currentQ + 1) / TOTAL_QUESTIONS) * 100;

  const buildDocument = () => ENTERPRISE_BLOCKS.map((block) => {
    const blockAnswers = block.questions.map((question, questionIndex) => {
      const key = `${block.key}__${questionIndex}`;
      const answer = answers[key]?.trim();
      return answer ? `**${question}**\n${answer}` : `**${question}**\n_(não respondido)_`;
    });
    return `## ${block.label}\n\n${blockAnswers.join("\n\n")}`;
  }).join("\n\n---\n\n");

  const buildSignals = () => {
    const structured_signals: Record<string, { summary: string; dossier_block: string }> = {};
    for (const block of ENTERPRISE_BLOCKS) {
      const blockText = block.questions
        .map((_, questionIndex) => answers[`${block.key}__${questionIndex}`]?.trim() || "")
        .filter(Boolean)
        .join(" | ");

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
      dossier_signals: [...new Set(signalKeys.map((key) => ENTERPRISE_SIGNAL_TO_DOSSIER[key]))],
      task_signals: signalKeys.filter((key) => ENTERPRISE_TASK_SIGNALS.includes(key)),
      documentation_signals: signalKeys.filter((key) => ENTERPRISE_DOC_SIGNALS.includes(key)),
    };
  };

  const handleDownloadPDF = async () => {
    const content = buildDocument();
    let logoBase64 = "";
    try {
      const response = await fetch(logoUrl);
      const blob = await response.blob();
      logoBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch {
      // ignore
    }

    const popup = window.open("", "_blank");
    if (!popup) return;

    const date = new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
    popup.document.write(`<!DOCTYPE html><html><head><title>Briefing de Estruturação Empresarial</title><style>
      @page { margin: 30mm 20mm; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; padding: 0; max-width: 700px; margin: 0 auto; color: #1a1a1a; font-size: 13px; line-height: 1.7; }
      .header { display:flex; align-items:center; justify-content:space-between; border-bottom:2px solid #1a1a1a; padding-bottom:16px; margin-bottom:32px; }
      .header img { height: 34px; }
      .header-text { text-align:right; }
      .header-text h1 { font-size:18px; margin:0; }
      .header-text p { margin:4px 0 0; font-size:11px; color:#666; }
      .section-title { font-size:14px; font-weight:600; margin:32px 0 12px; padding-bottom:6px; border-bottom:1px solid #e5e7eb; text-transform:uppercase; letter-spacing:.5px; }
      .question { font-weight:600; color:#222; margin:16px 0 4px; font-size:12px; }
      .answer { margin:0 0 12px; color:#444; white-space:pre-wrap; }
      .empty { color:#999; font-style:italic; }
      .divider { border:none; border-top:1px solid #eee; margin:24px 0; }
      .footer { margin-top:40px; padding-top:16px; border-top:1px solid #e5e7eb; font-size:10px; color:#888; text-align:center; }
    </style></head><body>
      <div class="header">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Aceleriq" />` : "<div></div>"}
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
        .replace(/\n/g, '<br>')}
      <div class="footer">Documento confidencial &middot; ${answeredCount} de ${TOTAL_QUESTIONS} perguntas respondidas &middot; ${date}</div>
    </body></html>`);
    popup.document.close();
    window.setTimeout(() => popup.print(), 250);
  };

  const handleSubmit = async () => {
    if (!decoded || !token) return;
    setSaving(true);
    try {
      const content = buildDocument();
      const signals = buildSignals();
      const metadata: Record<string, unknown> = {
        briefing_kind: "enterprise_structuring",
        import_source: "client_form",
        parser_mode: "local_rules",
        import_review_status: "pending_review",
        source_token: token,
        submitted_by_client: true,
        submitted_at: new Date().toISOString(),
        answers_count: answeredCount,
        total_questions: TOTAL_QUESTIONS,
        ...signals,
      };

      const { error } = await supabase.from("context_entries").insert({
        workspace_id: decoded.workspaceId,
        client_id: decoded.clientId,
        context_type: "briefing",
        title: "Briefing de Estruturação Empresarial",
        content,
        source_label: "Preenchido via link do cliente",
        is_key_decision: false,
        tags: ["briefing", "enterprise_structuring", "client_submitted"],
        metadata,
      });

      if (error) {
        toast({ title: "Erro ao enviar", description: error.message, variant: "destructive" });
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

      clearBriefingProgress(token);
      setStep("submitted");
      toast({ title: "Briefing enviado com sucesso" });
    } catch {
      toast({ title: "Erro inesperado", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (invalid || !decoded) {
    return <div className="min-h-screen bg-background flex items-center justify-center p-6"><Toaster /><Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-3"><Building2 className="h-8 w-8 text-muted-foreground mx-auto" /><h1 className="text-lg font-semibold text-foreground">Link inválido</h1><p className="text-sm text-muted-foreground">Este link do briefing é inválido ou expirou.</p></CardContent></Card></div>;
  }

  if (step === "submitted") {
    return <div className="min-h-screen bg-background flex items-center justify-center p-6"><Toaster /><Card className="max-w-md w-full"><CardContent className="p-8 text-center space-y-4"><div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto"><Check className="h-6 w-6 text-primary" /></div><h1 className="text-lg font-semibold text-foreground">Briefing enviado</h1><p className="text-sm text-muted-foreground">Obrigado. Suas respostas já foram recebidas pela equipe.</p><Button variant="outline" onClick={handleDownloadPDF}><Download className="h-4 w-4 mr-1" /> Baixar PDF</Button></CardContent></Card></div>;
  }

  if (step === "welcome") {
    return <div className="min-h-screen bg-background flex items-center justify-center p-6"><Toaster /><div className="max-w-lg w-full space-y-6"><div className="text-center space-y-3"><div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"><Building2 className="h-7 w-7 text-primary" /></div><h1 className="text-xl font-semibold text-foreground">Briefing de Estruturação Empresarial</h1><p className="text-sm text-muted-foreground">{clientName}</p></div><Card><CardContent className="p-6 space-y-4"><p className="text-sm text-foreground leading-relaxed">Este briefing nos ajuda a entender a operação real da sua empresa para montar um plano mais preciso, sem perder contexto importante.</p><div className="space-y-3"><div className="flex items-start gap-3"><Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-sm font-medium text-foreground">Tempo estimado: 20–35 minutos</p><p className="text-xs text-muted-foreground">{TOTAL_QUESTIONS} perguntas organizadas por tema.</p></div></div><div className="flex items-start gap-3"><Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-sm font-medium text-foreground">Progresso salvo automaticamente</p><p className="text-xs text-muted-foreground">Se você sair e voltar depois, não perde nada.</p></div></div><div className="flex items-start gap-3"><Check className="h-4 w-4 text-primary mt-0.5 shrink-0" /><div><p className="text-sm font-medium text-foreground">Responda com o máximo de clareza</p><p className="text-xs text-muted-foreground">Quanto mais contexto, melhor o diagnóstico.</p></div></div></div></CardContent></Card><Button className="w-full" size="lg" onClick={() => setStep("fill")}>Começar <ArrowRight className="h-4 w-4 ml-2" /></Button></div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster />
      <div className="border-b border-border/50 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Pergunta {currentQ + 1} de {TOTAL_QUESTIONS}</span>
            <Badge variant="outline" className="text-[10px]">{answeredCount} respondidas</Badge>
          </div>
          <Progress value={progressPct} className="h-1" />
        </div>
      </div>
      <div className="max-w-xl mx-auto px-4 py-8">
        {step === "fill" && currentQuestion && (
          <div className="space-y-5">
            {isNewBlock ? (
              <div className="flex items-center gap-2"><div className="h-1.5 w-1.5 rounded-full bg-primary" /><span className="text-xs font-medium text-primary uppercase tracking-wider">{currentQuestion.blockLabel}</span></div>
            ) : (
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">{currentQuestion.blockLabel}</p>
            )}
            <h2 className="text-base font-medium text-foreground leading-snug">{currentQuestion.question}</h2>
            <Textarea value={currentAnswer} onChange={(e) => updateAnswer(currentQuestion.answerKey, e.target.value)} placeholder="Digite sua resposta aqui..." className="min-h-[140px] text-sm resize-none" autoFocus />
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => currentQ > 0 && setCurrentQ((value) => value - 1)} disabled={currentQ === 0}><ChevronLeft className="h-4 w-4 mr-1" /> Anterior</Button>
              <div className="flex items-center gap-2">
                {!currentAnswer.trim() && <Button variant="ghost" size="sm" onClick={() => currentQ < TOTAL_QUESTIONS - 1 ? setCurrentQ((value) => value + 1) : setStep("review")}>Pular</Button>}
                <Button onClick={() => currentQ < TOTAL_QUESTIONS - 1 ? setCurrentQ((value) => value + 1) : setStep("review")}>{currentQ < TOTAL_QUESTIONS - 1 ? <>Próxima <ChevronRight className="h-4 w-4 ml-1" /></> : "Revisar respostas"}</Button>
              </div>
            </div>
          </div>
        )}
        {step === "review" && (
          <div className="space-y-4">
            <div><h3 className="text-base font-semibold text-foreground">Revisão final</h3><p className="text-xs text-muted-foreground mt-1">Revise as respostas antes de enviar.</p></div>
            {ENTERPRISE_BLOCKS.map((block, blockIndex) => {
              const blockQuestions = FLAT_QUESTIONS.filter((q) => q.blockIndex === blockIndex);
              const blockAnswered = blockQuestions.filter((q) => answers[q.answerKey]?.trim().length > 5).length;
              return <div key={block.key} className="space-y-1.5"><div className="flex items-center justify-between"><span className="text-xs font-medium text-foreground">{block.label}</span><span className="text-[10px] text-muted-foreground">{blockAnswered}/{blockQuestions.length}</span></div>{blockQuestions.map((q) => { const index = FLAT_QUESTIONS.indexOf(q); const answer = answers[q.answerKey]?.trim() || ""; const filled = answer.length > 5; return <Card key={q.answerKey} className={`cursor-pointer transition-colors ${filled ? "border-primary/20 hover:border-primary/40" : "border-border/20 hover:border-border/40"}`} onClick={() => { setCurrentQ(index); setStep("fill"); }}><CardContent className="p-3 flex items-start gap-2"><div className={`h-3.5 w-3.5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${filled ? "bg-primary/20" : "bg-muted"}`}>{filled && <Check className="h-2 w-2 text-primary" />}</div><div className="flex-1 min-w-0"><p className="text-xs text-foreground">{q.question}</p>{filled ? <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{answer}</p> : <p className="text-[11px] text-muted-foreground/40 mt-0.5">Não respondida</p>}</div></CardContent></Card>; })}</div>;
            })}
            <div className="border rounded-md p-3 bg-muted/20 text-xs text-muted-foreground">{answeredCount} de {TOTAL_QUESTIONS} perguntas respondidas</div>
            <div className="flex items-center justify-between gap-2"><div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => setStep("fill")}><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</Button><Button variant="outline" size="sm" onClick={handleDownloadPDF}><Download className="h-4 w-4 mr-1" /> PDF</Button></div><Button onClick={handleSubmit} disabled={saving || answeredCount < 5}>{saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Enviando...</> : <><Send className="h-4 w-4 mr-1" /> Enviar briefing</>}</Button></div>
          </div>
        )}
      </div>
    </div>
  );
}
