import { useState, useEffect, useCallback } from "react";
import {
  ClipboardList, ChevronRight, ChevronLeft, X, Loader2, AlertCircle,
  Check, Sparkles, Layers, Target, Eye, Search,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getPriorityLabel, getPriorityColor, getStageLabel } from "./taskConstants";
import ScopeBadge from "./ScopeBadge";
import { getScopeLabel, type ScopeClassification } from "./aceleraConstants";
import {
  buildOperationalPlan,
  type OperationalPlan,
  type DiagnosticAxis,
  type OperationalFront,
  type DerivedTask,
  type SignalSource,
} from "./operationalPlanEngine";

/* ─── Types ─── */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  planName?: string | null;
  onGenerated: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

const STEP_LABELS: Record<Step, string> = {
  1: "Leitura Base",
  2: "Diagnóstico",
  3: "Frentes Operacionais",
  4: "Plano e Tasks",
  5: "Confirmar",
};

/* ─── Component ─── */

export default function TaskPlanningWizard({ open, onOpenChange, workspaceId, clientId, planName, onGenerated }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<OperationalPlan | null>(null);
  const [tasks, setTasks] = useState<DerivedTask[]>([]);

  /* ─── Load Dossiê base ─── */
  const loadDossierBase = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("context_entries")
        .select("id, context_type, title, content, is_key_decision, metadata, tags")
        .eq("workspace_id", workspaceId)
        .eq("context_type", "briefing")
        .order("created_at", { ascending: false });

      if (error) {
        toast({ title: "Erro ao carregar base", description: error.message, variant: "destructive" });
        return;
      }

      const briefings = (data ?? []) as Array<{
        id: string;
        metadata: Record<string, unknown> | null;
      }>;

      const result = buildOperationalPlan(briefings, planName ?? null);
      setPlan(result);
      setTasks(result.tasks);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, planName]);

  useEffect(() => {
    if (open) {
      loadDossierBase();
      setStep(1);
      setPlan(null);
      setTasks([]);
    }
  }, [open, loadDossierBase]);

  /* ─── Navigation ─── */
  const canAdvance = (): boolean => {
    if (step === 1) return !!plan && (plan.diagnostic.some((a) => a.items.length > 0));
    if (step === 4) return tasks.length > 0;
    return true;
  };

  const advance = () => {
    if (step < 5) setStep((step + 1) as Step);
  };

  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step);
  };

  const removeTask = (index: number) => {
    setTasks((prev) => prev.filter((_, i) => i !== index));
  };

  /* ─── Save ─── */
  const handleSave = async () => {
    if (tasks.length === 0) return;
    setSaving(true);

    try {
      const rows = tasks.map((t) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        title: t.title,
        description: t.description,
        status: "todo",
        priority: t.priority,
        stage: t.stage || null,
        due_date: null,
        assignee_id: null,
        source_type: "context",
        source_id: null,
        metadata: {
          generation_mode: "operational_wizard",
          plan_name: planName ?? null,
          front_key: t.frontKey,
          front_name: t.frontName,
          dossier_block: t.dossierBlock,
          signal_keys: t.signalKeys,
          signal_sources: t.signalSources,
          scope_classification: t.scopeClassification,
          operational_reason: t.operationalReason,
        },
      }));

      const { error } = await supabase.from("tasks").insert(rows);
      if (error) {
        toast({ title: "Erro ao salvar tasks", description: error.message, variant: "destructive" });
        throw error;
      }

      const timelineRows = tasks.map((t) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "task_created",
        title: "Task gerada pelo plano operacional",
        description: `"${t.title}" — Frente: ${t.frontName}`,
        happened_at: new Date().toISOString(),
      }));
      await supabase.from("timeline_events").insert(timelineRows);

      toast({ title: `${tasks.length} task(s) criada(s) pelo plano operacional` });
      onGenerated();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  /* ─── Render helpers ─── */
  const progressPct = (step / 5) * 100;
  const hasDiagnosticContent = plan?.diagnostic.some((a) => a.items.length > 0) ?? false;

  const priorityIcon = (p: string) => {
    switch (p) {
      case "high": return "🔴";
      case "medium": return "🟡";
      case "low": return "🟢";
      default: return "⚪";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Plano Operacional — {STEP_LABELS[step]}
          </DialogTitle>
          <div className="pt-2">
            <Progress value={progressPct} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              {([1, 2, 3, 4, 5] as Step[]).map((s) => (
                <span key={s} className={s === step ? "text-primary font-medium" : ""}>{s}. {STEP_LABELS[s]}</span>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 min-h-0">
          {/* Step 1: Loading / base reading */}
          {step === 1 && (
            <div className="space-y-4">
              {loading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Lendo Dossiê e sinais revisados…</p>
                </div>
              ) : !hasDiagnosticContent ? (
                <div className="flex flex-col items-center py-12 text-muted-foreground">
                  <AlertCircle className="h-6 w-6 mb-2" />
                  <p className="text-sm">Nenhum sinal revisado encontrado.</p>
                  <p className="text-xs mt-1">Importe e revise briefings antes de gerar o plano operacional.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    O plano operacional foi construído a partir do Dossiê consolidado e dos sinais revisados dos briefings.
                    {planName && <> Plano contratado: <strong className="text-foreground">{planName}</strong>.</>}
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <Card>
                      <CardContent className="p-3 text-center">
                        <div className="text-lg font-bold text-primary">{plan?.fronts.length ?? 0}</div>
                        <p className="text-[10px] text-muted-foreground">Frentes ativas</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <div className="text-lg font-bold text-foreground">{plan?.tasks.length ?? 0}</div>
                        <p className="text-[10px] text-muted-foreground">Tasks derivadas</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 text-center">
                        <div className="text-lg font-bold text-muted-foreground">{plan?.retained.length ?? 0}</div>
                        <p className="text-[10px] text-muted-foreground">Oportunidades retidas</p>
                      </CardContent>
                    </Card>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 2: Diagnostic */}
          {step === 2 && plan && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Leitura diagnóstica estruturada em 5 eixos com base nos sinais revisados.
              </p>
              {plan.diagnostic.map((axis) => (
                <div key={axis.key}>
                  <h4 className="text-xs font-semibold text-foreground mb-1.5 flex items-center gap-1.5">
                    <Search className="h-3 w-3 text-primary" />
                    {axis.label}
                  </h4>
                  {axis.items.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground ml-4">Sem dados suficientes neste eixo.</p>
                  ) : (
                    <ul className="space-y-1 ml-4">
                      {axis.items.map((item, j) => (
                        <li key={j} className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <span className="text-primary mt-0.5 shrink-0">•</span>
                          <span className="line-clamp-2">{item}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Step 3: Operational Fronts */}
          {step === 3 && plan && (
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Frentes operacionais derivadas do Dossiê, organizadas por prioridade e aderência ao plano.
              </p>

              {plan.fronts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Target className="h-3 w-3 text-primary" />
                    Execução Recomendada ({plan.fronts.length})
                  </h4>
                  {plan.fronts.map((front) => (
                    <FrontCard key={front.key} front={front} />
                  ))}
                </div>
              )}

              {plan.retained.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-border/30">
                  <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Eye className="h-3 w-3" />
                    Oportunidades Futuras / Fora do Plano ({plan.retained.length})
                  </h4>
                  {plan.retained.map((front) => (
                    <FrontCard key={front.key} front={front} muted />
                  ))}
                </div>
              )}

              {plan.fronts.length === 0 && plan.retained.length === 0 && (
                <div className="flex flex-col items-center py-8 text-muted-foreground">
                  <AlertCircle className="h-6 w-6 mb-2" />
                  <p className="text-sm">Nenhuma frente operacional identificada.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Plan + Tasks preview */}
          {step === 4 && plan && (
            <div className="space-y-4">
              {/* Operational plan summary */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Layers className="h-3 w-3 text-primary" />
                  Plano Operacional
                </h4>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {plan.fronts.map((f) => (
                    <Badge key={f.key} variant="outline" className="text-[10px]">
                      {f.name}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Derived tasks */}
              <div>
                <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-primary" />
                  Tasks Derivadas ({tasks.length})
                </h4>
                {tasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Nenhuma task para criar.</p>
                ) : (
                  <div className="space-y-1.5">
                    {tasks.map((t, i) => (
                      <Card key={i} className="relative">
                        <CardContent className="p-3 pr-10 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium">{t.title}</span>
                            <span className={`text-[10px] ${getPriorityColor(t.priority)}`}>
                              {getPriorityLabel(t.priority)}
                            </span>
                            {t.stage && (
                              <Badge variant="outline" className="text-[10px]">
                                {getStageLabel(t.stage)}
                              </Badge>
                            )}
                            <ScopeBadge scope={t.scopeClassification} className="text-[9px] px-1 py-0" />
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                            <span>Frente: {t.frontName}</span>
                            <span>· {t.operationalReason.slice(0, 80)}</span>
                          </div>
                        </CardContent>
                        <button
                          onClick={() => removeTask(i)}
                          className="absolute top-2 right-2 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </Card>
                    ))}
                  </div>
                )}
              </div>

              {/* Retained items */}
              {plan.retained.length > 0 && (
                <div className="pt-2 border-t border-border/30">
                  <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1.5">
                    <Eye className="h-3 w-3" />
                    Itens retidos (não serão criados como task)
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {plan.retained.map((r) => (
                      <Badge key={r.key} variant="outline" className="text-[10px] text-muted-foreground">
                        {r.name} — {getScopeLabel(r.scopeClassification)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 5: Confirm */}
          {step === 5 && (
            <div className="space-y-4 py-4">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-base font-semibold">Confirmar criação</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Serão criadas <strong className="text-foreground">{tasks.length} task(s)</strong> com
                  status <strong className="text-foreground">To Do</strong>, vinculadas a este workspace.
                </p>
                <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
                  <p>Frentes operacionais: <strong className="text-foreground">{plan?.fronts.length ?? 0}</strong></p>
                  <p>Oportunidades retidas: <strong className="text-foreground">{plan?.retained.length ?? 0}</strong></p>
                  {planName && <p>Plano: <strong className="text-foreground">{planName}</strong></p>}
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
          {step < 5 && (
            <Button onClick={advance} disabled={!canAdvance()}>
              Avançar <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
          {step === 5 && (
            <Button onClick={handleSave} disabled={saving || tasks.length === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : <><Sparkles className="h-4 w-4 mr-1" /> Criar {tasks.length} task(s)</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─── FrontCard subcomponent ─── */

function FrontCard({ front, muted = false }: { front: OperationalFront; muted?: boolean }) {
  return (
    <Card className={muted ? "opacity-60" : ""}>
      <CardContent className="p-3 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${muted ? "text-muted-foreground" : "text-foreground"}`}>
            {front.name}
          </span>
          <ScopeBadge scope={front.scopeClassification} className="text-[9px] px-1 py-0" />
          {front.stage && (
            <Badge variant="outline" className="text-[10px]">
              {getStageLabel(front.stage)}
            </Badge>
          )}
          <Badge variant="outline" className={`text-[9px] ${
            front.priority === "high" ? "text-red-400 border-red-500/30" :
            front.priority === "medium" ? "text-amber-400 border-amber-500/30" :
            "text-muted-foreground"
          }`}>
            {front.priority === "high" ? "Alta" : front.priority === "medium" ? "Média" : "Baixa"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{front.objective}</p>
        {front.signals.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {front.signals.slice(0, 4).map((s) => (
              <Badge key={s} variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                {s}
              </Badge>
            ))}
            {front.signals.length > 4 && (
              <span className="text-[9px] text-muted-foreground">+{front.signals.length - 4}</span>
            )}
          </div>
        )}
        {front.retainedReason && (
          <p className="text-[10px] text-amber-400 mt-1">{front.retainedReason}</p>
        )}
      </CardContent>
    </Card>
  );
}
