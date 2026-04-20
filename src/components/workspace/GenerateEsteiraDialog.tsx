import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, Check, Brain, RefreshCw, AlertTriangle } from "lucide-react";
import { ESTEIRA_TEMPLATES, type EsteiraTemplate, getEsteiraTemplateForPlan } from "./esteiraTemplates";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import EsteiraTemplatePreview from "./EsteiraTemplatePreview";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Cliente (real) cujo plan_name será usado como sugestão default */
  clientId: string;
  /** Workspace — necessário pra IA pegar o contexto certo */
  workspaceId?: string;
  /** Confirma a geração com o template escolhido (pode ser ad-hoc da IA) */
  onConfirm: (template: EsteiraTemplate) => Promise<void> | void;
  generating?: boolean;
}

interface AiResult {
  template: EsteiraTemplate;
  rationale: string;
  sources: {
    hasBriefing: boolean;
    contextEntries: number;
    metricSnapshots: number;
    fronts: number;
    assets: number;
  };
}

const SMART_KEY = "ai_smart";

export default function GenerateEsteiraDialog({
  open, onOpenChange, clientId, workspaceId, onConfirm, generating = false,
}: Props) {
  const [planName, setPlanName] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string>("growth");

  // ─── Modo Inteligente (IA) ──────────────────────────────────────────
  const [aiResult, setAiResult] = useState<AiResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiHint, setAiHint] = useState("");

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("plan_name")
        .eq("id", clientId)
        .maybeSingle();
      if (!alive) return;
      const plan = (data?.plan_name as string | null) ?? null;
      setPlanName(plan);
      const recommended = getEsteiraTemplateForPlan(plan);
      setSelectedKey(recommended.key);
    })();
    return () => { alive = false; };
  }, [open, clientId]);

  // Reset state ao fechar
  useEffect(() => {
    if (!open) {
      setAiResult(null);
      setAiError(null);
      setAiHint("");
    }
  }, [open]);

  const generateAi = async () => {
    if (!workspaceId) {
      toast({ title: "Workspace ausente", description: "Recarregue a página.", variant: "destructive" });
      return;
    }
    setAiLoading(true);
    setAiError(null);
    try {
      const { data, error } = await supabase.functions.invoke("generate-esteira-ai", {
        body: { clientId, workspaceId, hint: aiHint.trim() || undefined },
      });
      if (error || data?.error) {
        const msg = (data?.error ?? error?.message) as string | undefined;
        setAiError(msg ?? "Falha ao gerar esteira inteligente.");
        toast({ title: "Falha na IA", description: msg, variant: "destructive" });
        return;
      }
      setAiResult(data as AiResult);
      setSelectedKey(SMART_KEY);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro inesperado";
      setAiError(msg);
      toast({ title: "Erro", description: msg, variant: "destructive" });
    } finally {
      setAiLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (selectedKey === SMART_KEY) {
      if (!aiResult) {
        toast({ title: "Gere a esteira inteligente primeiro", variant: "destructive" });
        return;
      }
      await onConfirm(aiResult.template);
      return;
    }
    const tpl = ESTEIRA_TEMPLATES.find((t) => t.key === selectedKey);
    if (!tpl) return;
    await onConfirm(tpl);
  };

  const recommended = getEsteiraTemplateForPlan(planName).key;
  const aiSelected = selectedKey === SMART_KEY;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Gerar esteira de produção
          </DialogTitle>
          <DialogDescription className="text-xs">
            Escolha um template fixo ou gere uma esteira sob medida com IA, usando briefing + contexto + métricas + assets do cliente.
            {planName && (
              <span className="ml-1">
                Plano detectado: <strong className="text-foreground capitalize">{planName}</strong>.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[65vh]">
          <div className="p-4 space-y-4">
            {/* ─── Modo Inteligente (IA) — destaque ─── */}
            <button
              type="button"
              onClick={() => setSelectedKey(SMART_KEY)}
              disabled={generating}
              className={cn(
                "w-full text-left rounded-lg border-2 p-4 transition-all relative overflow-hidden",
                aiSelected
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                  : "border-primary/30 bg-primary/5 hover:border-primary/60",
                generating && "opacity-60 cursor-not-allowed",
              )}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center shrink-0">
                    <Brain className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">Inteligente — Sob medida</p>
                      <Badge variant="outline" className="text-[9px] border-primary/40 text-primary bg-primary/5">
                        IA · usa todo o contexto do cliente
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Esteira ad-hoc gerada pela IA com base no briefing consolidado, contexto recente, métricas, fronts e assets deste cliente.
                    </p>
                  </div>
                </div>
                {aiSelected && aiResult && (
                  <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
              </div>

              {/* Hint do usuário */}
              <div className="space-y-1.5 mb-3" onClick={(e) => e.stopPropagation()}>
                <Textarea
                  value={aiHint}
                  onChange={(e) => setAiHint(e.target.value)}
                  placeholder="Opcional: dê uma pista pra IA. Ex: 'foco em lançamento de infoproduto', 'priorizar B2B enterprise', 'cliente quer reativar base inativa'..."
                  rows={2}
                  className="text-xs resize-none"
                  disabled={aiLoading || generating}
                />
              </div>

              {/* CTA gerar / regerar */}
              <div className="flex items-center justify-between gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                <Button
                  type="button"
                  size="sm"
                  variant={aiResult ? "outline" : "default"}
                  onClick={generateAi}
                  disabled={aiLoading || generating}
                  className="h-8 text-xs gap-1.5"
                >
                  {aiLoading ? (
                    <><Loader2 className="h-3 w-3 animate-spin" /> Analisando contexto…</>
                  ) : aiResult ? (
                    <><RefreshCw className="h-3 w-3" /> Regerar esteira</>
                  ) : (
                    <><Sparkles className="h-3 w-3" /> Gerar com IA</>
                  )}
                </Button>

                {aiResult && (
                  <div className="flex items-center gap-1 flex-wrap text-[10px]">
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                      {aiResult.template.nodes.length} nodes
                    </Badge>
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                      {aiResult.template.edges.length} conexões
                    </Badge>
                    {aiResult.sources.hasBriefing && (
                      <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">briefing ✓</Badge>
                    )}
                    {aiResult.sources.contextEntries > 0 && (
                      <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                        {aiResult.sources.contextEntries} contextos
                      </Badge>
                    )}
                    {aiResult.sources.metricSnapshots > 0 && (
                      <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                        {aiResult.sources.metricSnapshots} métricas
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Erro */}
              {aiError && (
                <div className="mt-3 flex items-start gap-2 text-[11px] text-destructive bg-destructive/10 border border-destructive/30 rounded-md px-2.5 py-1.5">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  <span>{aiError}</span>
                </div>
              )}

              {/* Rationale + preview */}
              {aiResult && (
                <div className="mt-3 pt-3 border-t border-primary/20 space-y-2">
                  <p className="text-[11px] text-foreground/80 italic leading-snug">
                    <span className="text-primary font-medium not-italic">Lógica:</span> {aiResult.rationale}
                  </p>
                  <EsteiraTemplatePreview template={aiResult.template} active={aiSelected} />
                </div>
              )}
            </button>

            {/* Separador */}
            <div className="flex items-center gap-3 px-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">ou use um template fixo</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            {/* ─── Templates fixos ─── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {ESTEIRA_TEMPLATES.map((tpl) => {
                const active = tpl.key === selectedKey;
                const isRecommended = tpl.key === recommended;
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => setSelectedKey(tpl.key)}
                    disabled={generating}
                    className={cn(
                      "text-left rounded-lg border-2 p-3 transition-all",
                      active
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border bg-card/40 hover:border-primary/40 hover:bg-muted/30",
                      generating && "opacity-60 cursor-not-allowed",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{tpl.label}</p>
                          {isRecommended && (
                            <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                              Recomendado
                            </Badge>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{tpl.tagline}</p>
                      </div>
                      {active && (
                        <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <Check className="h-3 w-3 text-primary-foreground" />
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 mb-2">
                      <Badge variant="outline" className="text-[9px]">
                        {tpl.nodes.length} node{tpl.nodes.length === 1 ? "" : "s"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">
                        {tpl.edges.length} conexõe{tpl.edges.length === 1 ? "" : "s"}
                      </Badge>
                    </div>

                    <EsteiraTemplatePreview template={tpl} active={active} />
                  </button>
                );
              })}
            </div>
          </div>
        </ScrollArea>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-muted/20">
          <p className="text-[11px] text-muted-foreground">
            {aiSelected
              ? aiResult
                ? "Esteira inteligente pronta — clique em 'Gerar esteira' pra criar os nodes."
                : "Clique em 'Gerar com IA' acima pra montar a esteira sob medida."
              : "O briefing vira o ponto de entrada da esteira."}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={generating}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
              disabled={generating || (aiSelected && !aiResult)}
            >
              {generating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1" />
              )}
              Gerar esteira
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
