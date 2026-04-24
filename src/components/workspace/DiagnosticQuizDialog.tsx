/**
 * DiagnosticQuizDialog — quiz interativo de diagnóstico inicial.
 *
 * UX gamificada (Typeform-style):
 *  - 1 pergunta por vez, animações suaves
 *  - Progresso visual no topo
 *  - Navegação teclado + mouse
 *  - Ao final: resumo com ICP-fit + plano recomendado
 *  - Salva no essential_briefing do cliente (MESMO LUGAR que o formulário)
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Sparkles, ChevronRight, ChevronLeft, Check, X, Loader2,
  Wand2, Target, Trophy, Rocket, Brain,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DIAGNOSTIC_QUIZ, CATEGORY_META, answersToEssentialBriefing, briefingToAnswers,
  type QuizQuestion, type QuizAnswers,
} from "@/lib/diagnosticQuiz";
import { calculateICPFitScore, getICPLevelColor, getICPLevelLabel, getPlanDisplayName } from "@/lib/icpFitScore";
import { getPlanConfig, type PlanKey } from "@/lib/planConfig";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  /** Quando concluído com sucesso */
  onCompleted?: () => void;
}

type Phase = "welcome" | "question" | "result";

export default function DiagnosticQuizDialog({ open, onOpenChange, clientId, clientName, onCompleted }: Props) {
  const [phase, setPhase] = useState<Phase>("welcome");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswers>({});
  const [saving, setSaving] = useState(false);

  // Carregar briefing existente se houver
  useEffect(() => {
    if (!open) return;
    setPhase("welcome");
    setCurrentIdx(0);
    (async () => {
      const { data } = await supabase.from("clients").select("metadata").eq("id", clientId).maybeSingle();
      const eb = (data?.metadata as Record<string, unknown> | null)?.essential_briefing as Record<string, string> | undefined;
      if (eb) setAnswers(briefingToAnswers(eb));
      else setAnswers({});
    })();
  }, [open, clientId]);

  const currentQuestion: QuizQuestion | undefined = DIAGNOSTIC_QUIZ[currentIdx];
  const progress = ((currentIdx + 1) / DIAGNOSTIC_QUIZ.length) * 100;

  const answeredCount = Object.keys(answers).filter((k) => {
    const v = answers[k];
    return v && (Array.isArray(v) ? v.length > 0 : String(v).trim().length > 0);
  }).length;

  const canAdvance = useMemo(() => {
    if (!currentQuestion) return false;
    const ans = answers[currentQuestion.id];
    if (!ans) return !currentQuestion.required;
    const asString = Array.isArray(ans) ? ans.join("") : String(ans);
    if (currentQuestion.required && !asString.trim()) return false;
    if (currentQuestion.minLength && asString.trim().length < currentQuestion.minLength) return false;
    return true;
  }, [answers, currentQuestion]);

  const setAnswer = (id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const handleNext = useCallback(() => {
    if (currentIdx < DIAGNOSTIC_QUIZ.length - 1) {
      setCurrentIdx((i) => i + 1);
    } else {
      setPhase("result");
    }
  }, [currentIdx]);

  const handleBack = useCallback(() => {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
    else setPhase("welcome");
  }, [currentIdx]);

  // Keyboard: Enter = next, Shift+Tab-like = back via keyboard
  useEffect(() => {
    if (phase !== "question") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey && canAdvance && (currentQuestion?.type !== "open_text")) {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [phase, canAdvance, handleNext, currentQuestion]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const briefing = answersToEssentialBriefing(answers);
      // Merge com metadata existente
      const { data: currentClient } = await supabase.from("clients").select("metadata").eq("id", clientId).maybeSingle();
      const currentMeta = (currentClient?.metadata as Record<string, unknown> | null) ?? {};
      const nextMeta = { ...currentMeta, essential_briefing: briefing };
      const { error } = await supabase
        .from("clients")
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error) throw error;
      toast({ title: "Diagnóstico salvo", description: `${answeredCount} respostas salvas no briefing essencial` });
      onCompleted?.();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Result phase calculations
  const resultSummary = useMemo(() => {
    if (phase !== "result") return null;
    const briefing = answersToEssentialBriefing(answers);
    const score = calculateICPFitScore({
      revenue_range: briefing.revenue_range,
      team_size: briefing.team_size,
      maturity_digital: briefing.maturity_digital,
      ai_readiness: briefing.ai_readiness,
      positioning: briefing.positioning,
      differential: briefing.differential,
      icp: briefing.icp,
      main_pains: briefing.main_pains,
      goals_12m: briefing.goals_12m,
      success_metric: briefing.success_metric,
    });
    return { briefing, score };
  }, [phase, answers]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogTitle className="sr-only">Diagnóstico Inicial</DialogTitle>

        {/* Progress bar */}
        {phase === "question" && (
          <div className="px-5 pt-4 pb-2 border-b border-border shrink-0">
            <div className="flex items-center justify-between mb-2 gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
                  style={{ background: `${CATEGORY_META[currentQuestion!.category].color}15`, border: `1px solid ${CATEGORY_META[currentQuestion!.category].color}30` }}>
                  <Wand2 className="h-3.5 w-3.5" style={{ color: CATEGORY_META[currentQuestion!.category].color }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: CATEGORY_META[currentQuestion!.category].color }}>
                    {CATEGORY_META[currentQuestion!.category].label}
                  </p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    Pergunta {currentIdx + 1} de {DIAGNOSTIC_QUIZ.length}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => onOpenChange(false)}
                className="h-7 w-7 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <Progress value={progress} className="h-1" />
          </div>
        )}

        {/* Welcome */}
        {phase === "welcome" && (
          <div className="flex-1 flex flex-col justify-center items-center text-center p-8 space-y-5">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 border border-primary/30">
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Diagnóstico Inicial</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                {answeredCount > 0
                  ? `Você já tem ${answeredCount} respostas salvas. Continue de onde parou ou revise para refinar.`
                  : "10 perguntas para entendermos profundamente o negócio de " + clientName + ". Leva em média 8 minutos."}
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2 pt-2">
              {Object.entries(CATEGORY_META).sort((a, b) => a[1].order - b[1].order).map(([key, meta]) => (
                <div key={key} className="flex flex-col items-center gap-1">
                  <div className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground text-center">{meta.label.split(" ")[0]}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={() => setPhase("question")} className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                {answeredCount > 0 ? "Continuar diagnóstico" : "Começar diagnóstico"}
              </Button>
            </div>
          </div>
        )}

        {/* Question */}
        {phase === "question" && currentQuestion && (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6 flex flex-col justify-center">
              <div className="max-w-xl mx-auto w-full space-y-4">
                {/* Pergunta */}
                <h3 className="text-xl font-bold text-foreground leading-tight">
                  {currentQuestion.question}
                </h3>
                {currentQuestion.helperText && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentQuestion.helperText}
                  </p>
                )}

                {/* Input */}
                <div className="pt-2">
                  {currentQuestion.type === "open_text" && (
                    <Textarea
                      value={(answers[currentQuestion.id] as string) ?? ""}
                      onChange={(e) => setAnswer(currentQuestion.id, e.target.value)}
                      placeholder={currentQuestion.placeholder}
                      rows={5}
                      className="text-sm leading-relaxed resize-y"
                      autoFocus
                    />
                  )}

                  {currentQuestion.type === "single_select" && currentQuestion.options && (
                    <div className="space-y-2">
                      {currentQuestion.options.map((opt) => {
                        const selected = answers[currentQuestion.id] === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setAnswer(currentQuestion.id, opt.value)}
                            className={cn(
                              "w-full text-left rounded-xl border-2 px-4 py-3 transition-all flex items-center gap-3",
                              selected
                                ? "border-primary bg-primary/8"
                                : "border-border hover:border-primary/30 hover:bg-secondary/40"
                            )}
                          >
                            <div className={cn(
                              "h-5 w-5 rounded-full border-2 shrink-0 flex items-center justify-center",
                              selected ? "border-primary bg-primary" : "border-border"
                            )}>
                              {selected && <Check className="h-3 w-3 text-[#09110A]" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground">{opt.label}</p>
                              {opt.description && (
                                <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Min length warning */}
                {currentQuestion.type === "open_text" && currentQuestion.minLength && (
                  <p className="text-[11px] text-muted-foreground/60">
                    {((answers[currentQuestion.id] as string) ?? "").length} / {currentQuestion.minLength} caracteres mínimos
                  </p>
                )}
              </div>
            </div>

            {/* Navegação */}
            <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
              <Button variant="ghost" size="sm" onClick={handleBack} className="h-8 text-xs gap-1.5">
                <ChevronLeft className="h-3 w-3" />
                {currentIdx === 0 ? "Voltar" : "Anterior"}
              </Button>
              <div className="flex-1 text-center">
                <p className="text-[10px] text-muted-foreground">
                  {currentQuestion.type !== "open_text" && "Pressione Enter para avançar · "}
                  {currentIdx + 1} / {DIAGNOSTIC_QUIZ.length}
                </p>
              </div>
              <Button onClick={handleNext} disabled={!canAdvance} size="sm" className="h-8 text-xs gap-1.5">
                {currentIdx === DIAGNOSTIC_QUIZ.length - 1 ? "Ver resultado" : "Próxima"}
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}

        {/* Result */}
        {phase === "result" && resultSummary && (
          <ResultView
            clientName={clientName}
            score={resultSummary.score}
            answeredCount={answeredCount}
            totalCount={DIAGNOSTIC_QUIZ.length}
            saving={saving}
            onSave={handleSave}
            onBack={() => { setPhase("question"); setCurrentIdx(DIAGNOSTIC_QUIZ.length - 1); }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Result view ──

function ResultView({ clientName, score, answeredCount, totalCount, saving, onSave, onBack, onCancel }: {
  clientName: string;
  score: ReturnType<typeof calculateICPFitScore>;
  answeredCount: number;
  totalCount: number;
  saving: boolean;
  onSave: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const color = getICPLevelColor(score.level);
  const label = getICPLevelLabel(score.level);

  // Ring
  const size = 110, stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(score.score, 100) / 100) * c;

  const planCfg = score.recommendedPlan ? getPlanConfig()[score.recommendedPlan as PlanKey] : null;

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-6">
        <div className="max-w-lg mx-auto space-y-5">
          {/* Header */}
          <div className="text-center">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl mb-3"
              style={{ background: `${color}15`, border: `1px solid ${color}40` }}>
              <Trophy className="h-7 w-7" style={{ color }} />
            </div>
            <h2 className="text-xl font-bold text-foreground mb-1">Diagnóstico completo</h2>
            <p className="text-sm text-muted-foreground">
              {answeredCount}/{totalCount} respostas · {clientName}
            </p>
          </div>

          {/* Ring score */}
          <div className="flex items-center justify-center gap-6 rounded-2xl border bg-card p-5"
            style={{ borderColor: `${color}30` }}>
            <div className="relative shrink-0" style={{ width: size, height: size }}>
              <svg width={size} height={size} className="-rotate-90">
                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth={stroke} />
                <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
                  style={{ transition: "stroke-dasharray 1s ease" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <Target className="h-4 w-4 mb-1" style={{ color }} />
                <span className="text-2xl font-bold tabular-nums" style={{ color }}>{score.score}</span>
                <span className="text-[9px] text-muted-foreground uppercase tracking-wider">ICP-Fit</span>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Resultado</p>
              <p className="text-xl font-bold leading-tight" style={{ color }}>{label}</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                {score.level === "ideal" && "Cliente alinhado com a proposta Aceleriq. Priorizar e conduzir ao sucesso."}
                {score.level === "good" && "Bom fit. Cliente tem o perfil para a jornada, com alguns pontos a trabalhar."}
                {score.level === "moderate" && "Perfil moderado. Qualificar bem antes de aceitar."}
                {score.level === "red_flag" && "Red flag — perfil abaixo do ideal. Considere se vale a pena aceitar."}
              </p>
            </div>
          </div>

          {/* Plano recomendado */}
          {planCfg && (
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">Plano recomendado</p>
              <div className="flex items-start gap-3">
                <Brain className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold text-foreground">{planCfg.label}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">{planCfg.tagline}</p>
                  <p className="text-sm font-semibold text-primary mt-1 tabular-nums">
                    R$ {planCfg.monthly.toLocaleString("pt-BR")}/mês
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Insights */}
          {score.insights.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                Pontos fortes
              </p>
              {score.insights.map((ins, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                  <Check className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                  {ins}
                </p>
              ))}
            </div>
          )}

          {/* Red flags — mostrados no Ops mas nunca ao cliente final */}
          {score.redFlags.length > 0 && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-3 space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-amber-400">
                ⚠ Atenção (uso interno)
              </p>
              {score.redFlags.map((f, i) => (
                <p key={i} className="text-xs text-muted-foreground leading-snug">→ {f}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={onBack} className="h-8 text-xs gap-1.5">
          <ChevronLeft className="h-3 w-3" /> Revisar respostas
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onCancel} className="h-8 text-xs">
          Fechar sem salvar
        </Button>
        <Button onClick={onSave} disabled={saving} size="sm" className="h-8 text-xs gap-1.5">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          Salvar no briefing
        </Button>
      </div>
    </>
  );
}
