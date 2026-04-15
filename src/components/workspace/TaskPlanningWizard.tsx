import { useState, useEffect, useCallback } from "react";
import { ClipboardList, ChevronRight, ChevronLeft, X, Loader2, AlertCircle, Check, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getContextLabel } from "./contextTypes";
import { getPriorityLabel, getPriorityColor, getStageLabel } from "./taskConstants";
import {
  type PlanningContext,
  type GapAnswers,
  type AceleraStageKey,
  type PlannedTaskSuggestion,
  type SynthesisBlock,
  GAP_QUESTIONS,
  DEFAULT_GAPS,
  ACELERA_STAGES,
  buildSynthesis,
  generatePlannedTasks,
  resolveSourceForPlanning,
} from "./taskPlanningEngine";

/* ─── Types ─── */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  onGenerated: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const STEP_LABELS: Record<Step, string> = {
  1: "Contextos",
  2: "Síntese",
  3: "Lacunas",
  4: "A.C.E.L.E.R.A",
  5: "Preview",
  6: "Confirmar",
};

/* ─── Component ─── */

export default function TaskPlanningWizard({ open, onOpenChange, workspaceId, clientId, onGenerated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Step 1
  const [contexts, setContexts] = useState<PlanningContext[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Step 2
  const [synthesis, setSynthesis] = useState<SynthesisBlock[]>([]);
  const [synthesisNotes, setSynthesisNotes] = useState("");

  // Step 3
  const [gaps, setGaps] = useState<GapAnswers>({ ...DEFAULT_GAPS });

  // Step 4
  const [aceleraStage, setAceleraStage] = useState<AceleraStageKey>("A");

  // Step 5/6
  const [suggestions, setSuggestions] = useState<PlannedTaskSuggestion[]>([]);

  /* ─── Fetch contexts ─── */
  const fetchContexts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("context_entries")
      .select("id, context_type, title, content, is_key_decision, happened_at, tags")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar contextos", description: error.message, variant: "destructive" });
    }
    // Filter out briefings with pending_review status
    const allContexts = (data as PlanningContext[]) ?? [];
    const filtered = allContexts.filter((c: any) => {
      if (c.context_type === "briefing" && c.metadata) {
        const reviewStatus = c.metadata.import_review_status as string | undefined;
        if (reviewStatus === "pending_review") return false;
      }
      return true;
    });
    setContexts(filtered);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      fetchContexts();
      setStep(1);
      setSelectedIds(new Set());
      setSynthesis([]);
      setSynthesisNotes("");
      setGaps({ ...DEFAULT_GAPS });
      setAceleraStage("A");
      setSuggestions([]);
    }
  }, [open, fetchContexts]);

  /* ─── Selection ─── */
  const selectedContexts = contexts.filter((c) => selectedIds.has(c.id));

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  /* ─── Navigation ─── */
  const canAdvance = (): boolean => {
    if (step === 1) return selectedIds.size > 0;
    if (step === 5) return suggestions.length > 0;
    return true;
  };

  const advance = () => {
    if (step === 1) {
      setSynthesis(buildSynthesis(selectedContexts));
    }
    if (step === 4) {
      const result = generatePlannedTasks(selectedContexts, gaps, aceleraStage);
      setSuggestions(result);
    }
    if (step < 6) setStep((step + 1) as Step);
  };

  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  /* ─── Remove suggestion ─── */
  const removeSuggestion = (index: number) => {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  };

  /* ─── Save ─── */
  const handleSave = async () => {
    if (suggestions.length === 0) return;
    setSaving(true);

    try {
      const { sourceId, relatedIds } = resolveSourceForPlanning(selectedContexts);

      const rows = suggestions.map((s) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        title: s.title,
        description: s.description,
        status: "todo",
        priority: s.priority,
        stage: s.stage || null,
        due_date: null,
        assignee_id: null,
        source_type: "context",
        source_id: sourceId,
        metadata: {
          generation_mode: "task_planning_wizard",
          related_context_ids: relatedIds,
          selected_acelera_stage: aceleraStage,
          gap_answers: gaps,
          synthesis_snapshot: synthesisNotes || synthesis.map((b) => `${b.label}: ${b.items.join("; ")}`).join(" | "),
          rule_keys: s.ruleKeys,
          generated_from: s.generatedFrom,
        },
      }));

      const { error } = await supabase.from("tasks").insert(rows);
      if (error) {
        toast({ title: "Erro ao salvar tasks", description: error.message, variant: "destructive" });
        throw error;
      }

      const timelineRows = suggestions.map((s) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "task_created",
        title: "Task gerada pelo plano operacional",
        description: `"${s.title}"`,
        happened_at: new Date().toISOString(),
      }));
      await supabase.from("timeline_events").insert(timelineRows);

      toast({ title: `${suggestions.length} task(s) criada(s) pelo plano operacional` });
      onGenerated();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Render ─── */
  const progressPct = (step / 6) * 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Plano Operacional — {STEP_LABELS[step]}
          </DialogTitle>
          <div className="pt-2">
            <Progress value={progressPct} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              {([1,2,3,4,5,6] as Step[]).map((s) => (
                <span key={s} className={s === step ? "text-primary font-medium" : ""}>{s}. {STEP_LABELS[s]}</span>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 min-h-0">
          {/* Step 1: Select contexts */}
          {step === 1 && (
            <div className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : contexts.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <AlertCircle className="h-6 w-6 mb-2" />
                  <p className="text-sm">Nenhum contexto neste workspace.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">Selecione os contextos que compõem o cenário deste cliente.</p>
                  <div className="space-y-1.5">
                    {contexts.map((ctx) => (
                      <Card
                        key={ctx.id}
                        className={`cursor-pointer transition-colors ${selectedIds.has(ctx.id) ? "border-primary/50 bg-primary/5" : "hover:border-border/80"}`}
                        onClick={() => toggleId(ctx.id)}
                      >
                        <CardContent className="p-3 flex items-start gap-3">
                          <Checkbox checked={selectedIds.has(ctx.id)} onCheckedChange={() => toggleId(ctx.id)} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="outline" className="text-[10px]">{getContextLabel(ctx.context_type)}</Badge>
                              <span className="text-sm font-medium truncate">{ctx.title}</span>
                              {ctx.is_key_decision && <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Decisão-chave</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{ctx.content}</p>
                            {ctx.happened_at && <span className="text-[10px] text-muted-foreground">{new Date(ctx.happened_at).toLocaleDateString("pt-BR")}</span>}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Synthesis */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Síntese do que sabemos sobre a empresa com base nos {selectedContexts.length} contexto(s) selecionados.</p>
              {synthesis.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum bloco de síntese gerado.</p>
              ) : (
                <div className="space-y-3">
                  {synthesis.map((block, i) => (
                    <div key={i}>
                      <h4 className="text-xs font-semibold text-foreground mb-1">{block.label}</h4>
                      <ul className="space-y-0.5">
                        {block.items.map((item, j) => (
                          <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                            <span className="text-primary mt-0.5">•</span>
                            <span className="line-clamp-2">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <Label className="text-xs text-muted-foreground">Observações adicionais (opcional)</Label>
                <Textarea
                  value={synthesisNotes}
                  onChange={(e) => setSynthesisNotes(e.target.value)}
                  placeholder="Adicione notas ou contexto extra que não está nos registros..."
                  className="mt-1 text-xs min-h-[60px]"
                />
              </div>
            </div>
          )}

          {/* Step 3: Gap analysis */}
          {step === 3 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Checagem rápida de lacunas e prioridades para orientar o plano.</p>
              <div className="space-y-2.5">
                {GAP_QUESTIONS.map((q) => (
                  <div key={q.key} className="flex items-center gap-3">
                    <Checkbox
                      id={`gap-${q.key}`}
                      checked={gaps[q.key]}
                      onCheckedChange={(v) => setGaps((prev) => ({ ...prev, [q.key]: !!v }))}
                    />
                    <label htmlFor={`gap-${q.key}`} className="text-sm cursor-pointer">{q.label}</label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: ACELERA stage */}
          {step === 4 && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">Em qual etapa principal do método A.C.E.L.E.R.A o cliente se encontra?</p>
              <RadioGroup value={aceleraStage} onValueChange={(v) => setAceleraStage(v as AceleraStageKey)}>
                <div className="space-y-2">
                  {ACELERA_STAGES.map((s) => (
                    <div key={s.key} className="flex items-center gap-3">
                      <RadioGroupItem value={s.key} id={`acelera-${s.key}`} />
                      <Label htmlFor={`acelera-${s.key}`} className="text-sm cursor-pointer font-medium">{s.label}</Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>
          )}

          {/* Step 5: Preview */}
          {step === 5 && (
            <div className="space-y-3">
              {suggestions.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <AlertCircle className="h-6 w-6 mb-2" />
                  <p className="text-sm">Nenhuma sugestão gerada para a combinação selecionada.</p>
                  <p className="text-xs mt-1">Tente selecionar mais contextos ou marcar lacunas.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">{suggestions.length} task(s) sugeridas. Remova as que não deseja.</p>
                  <div className="space-y-1.5">
                    {suggestions.map((s, i) => (
                      <Card key={i} className="relative">
                        <CardContent className="p-3 pr-10 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{s.title}</span>
                            <span className={`text-[10px] ${getPriorityColor(s.priority)}`}>{getPriorityLabel(s.priority)}</span>
                            {s.stage && <Badge variant="outline" className="text-[10px]">{getStageLabel(s.stage)}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>Regra: {s.ruleKeys.join(", ")}</span>
                            <span>· Origem: {s.generatedFrom}</span>
                          </div>
                        </CardContent>
                        <button
                          onClick={() => removeSuggestion(i)}
                          className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Card>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 6: Confirm */}
          {step === 6 && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-base font-semibold">Confirmar criação</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Serão criadas <strong className="text-foreground">{suggestions.length} task(s)</strong> com status <strong className="text-foreground">To Do</strong>, vinculadas a este workspace.
                </p>
                <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
                  <p>Etapa A.C.E.L.E.R.A: <strong className="text-foreground">{ACELERA_STAGES.find((s) => s.key === aceleraStage)?.label}</strong></p>
                  <p>Contextos utilizados: <strong className="text-foreground">{selectedContexts.length}</strong></p>
                  <p>Lacunas marcadas: <strong className="text-foreground">{Object.values(gaps).filter(Boolean).length}</strong></p>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border/50">
          {step > 1 && (
            <Button variant="outline" onClick={goBack} disabled={saving}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          {step === 1 && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          )}
          <div className="flex-1" />
          {step < 6 && (
            <Button onClick={advance} disabled={!canAdvance()}>
              Avançar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 6 && (
            <Button onClick={handleSave} disabled={saving || suggestions.length === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : <><Sparkles className="h-4 w-4 mr-1" /> Criar {suggestions.length} task(s)</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
