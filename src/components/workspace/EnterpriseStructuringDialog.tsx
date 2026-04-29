import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronRight, ChevronLeft, Loader2, Building2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  ENTERPRISE_BLOCKS,
  ENTERPRISE_SIGNAL_TO_DOSSIER,
  ENTERPRISE_TASK_SIGNALS,
  ENTERPRISE_DOC_SIGNALS,
  type EnterpriseBlock,
} from "./enterpriseStructuringBlocks";
import { syncBriefingUpdatedForClient } from "./syncToPortalEvents";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  onCreated: () => void;
}

export default function EnterpriseStructuringDialog({ open, onOpenChange, workspaceId, clientId, onCreated }: Props) {
  const totalBlocks = ENTERPRISE_BLOCKS.length;
  const [currentBlock, setCurrentBlock] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(ENTERPRISE_BLOCKS.map((b) => [b.key, ""]))
  );
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"fill" | "review">("fill");

  const reset = () => {
    setCurrentBlock(0);
    setAnswers(Object.fromEntries(ENTERPRISE_BLOCKS.map((b) => [b.key, ""])));
    setSaving(false);
    setStep("fill");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const block = ENTERPRISE_BLOCKS[currentBlock];
  const progressPct = step === "review" ? 100 : ((currentBlock + 1) / totalBlocks) * 90;

  const filledCount = ENTERPRISE_BLOCKS.filter((b) => answers[b.key].trim().length > 10).length;

  const handleNext = () => {
    if (currentBlock < totalBlocks - 1) {
      setCurrentBlock(currentBlock + 1);
    } else {
      setStep("review");
    }
  };

  const handlePrev = () => {
    if (step === "review") {
      setStep("fill");
      setCurrentBlock(totalBlocks - 1);
      return;
    }
    if (currentBlock > 0) setCurrentBlock(currentBlock - 1);
  };

  const goToBlock = (idx: number) => {
    setStep("fill");
    setCurrentBlock(idx);
  };

  /* ─── Build content & signals ─── */
  const buildDocument = () => {
    const sections: string[] = [];
    for (const b of ENTERPRISE_BLOCKS) {
      const answer = answers[b.key].trim();
      sections.push(`## ${b.label}\n\n${answer || "(não preenchido)"}`);
    }
    return sections.join("\n\n---\n\n");
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

  /* ─── Save ─── */
  const handleSave = async () => {
    if (filledCount < 3) {
      toast({ title: "Preencha ao menos 3 blocos", description: "É necessário um mínimo de informação para gerar sinais úteis.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const content = buildDocument();
      const signalsData = buildSignals();

      const metadata: Record<string, unknown> = {
        briefing_kind: "enterprise_structuring",
        import_source: "native_form",
        parser_mode: "local_rules",
        import_review_status: "pending_review",
        ...signalsData,
      };

      const row = {
        workspace_id: workspaceId,
        client_id: clientId,
        context_type: "briefing",
        title: "Briefing de Estruturação Empresarial",
        content,
        source_label: "Formulário nativo",
        is_key_decision: false,
        tags: ["briefing", "enterprise_structuring"],
        metadata,
      };

      const { error } = await supabase.from("context_entries").insert(row);
      if (error) {
        toast({ title: "Erro ao salvar briefing", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      syncBriefingUpdatedForClient(clientId);

      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "context_added",
        title: "Briefing de Estruturação Empresarial criado",
        description: `${filledCount} de ${totalBlocks} blocos preenchidos · Status: pendente de revisão`,
        happened_at: new Date().toISOString(),
      });

      toast({ title: "Briefing salvo com sucesso", description: "Revise os sinais na aba Contexto para liberar uso automático." });
      onCreated();
      handleOpenChange(false);
    } catch {
      /* toasted */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Briefing de Estruturação Empresarial
          </DialogTitle>
          <DialogDescription>
            Mapeamento profundo da estrutura, processos e operação da empresa.
          </DialogDescription>
          <div className="pt-2">
            <Progress value={progressPct} className="h-1.5" />
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{step === "review" ? "Revisão final" : `Bloco ${currentBlock + 1} de ${totalBlocks}`}</span>
              <span>{filledCount}/{totalBlocks} preenchidos</span>
            </div>
          </div>
        </DialogHeader>

        {step === "fill" && block && (
          <div className="space-y-4 py-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground">{block.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{block.description}</p>
            </div>

            {/* Guiding questions */}
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
              onChange={(e) => setAnswers({ ...answers, [block.key]: e.target.value })}
              placeholder="Descreva o cenário real da empresa neste bloco..."
              className="min-h-[120px] text-sm"
            />
          </div>
        )}

        {step === "review" && (
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Revise os blocos preenchidos antes de salvar. Clique em qualquer bloco para editar.
            </p>
            <div className="space-y-1.5">
              {ENTERPRISE_BLOCKS.map((b, idx) => {
                const answer = answers[b.key].trim();
                const filled = answer.length > 10;
                return (
                  <Card
                    key={b.key}
                    className={`cursor-pointer transition-colors ${filled ? "border-border hover:border-border" : "border-border/30 hover:border-border/60"}`}
                    onClick={() => goToBlock(idx)}
                  >
                    <CardContent className="p-3 flex items-start gap-2">
                      <div className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${filled ? "bg-muted/10" : "bg-muted"}`}>
                        {filled ? <Check className="h-2.5 w-2.5 text-muted-foreground" /> : <span className="text-[9px] text-muted-foreground">{idx + 1}</span>}
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
              <Badge variant="outline" className="text-[9px] bg-muted/10 text-muted-foreground border-border">
                Pendente de revisão
              </Badge>
            </div>

            <p className="text-[11px] text-muted-foreground">
              O briefing será salvo como documento mestre único. Após salvar, revise os sinais na aba Contexto e marque como revisado para liberar o uso automático.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "fill" && (
            <>
              <Button variant="outline" onClick={handlePrev} disabled={currentBlock === 0}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <Button onClick={handleNext}>
                {currentBlock < totalBlocks - 1 ? (
                  <>Próximo <ChevronRight className="h-4 w-4 ml-1" /></>
                ) : (
                  "Revisar"
                )}
              </Button>
            </>
          )}
          {step === "review" && (
            <>
              <Button variant="outline" onClick={handlePrev}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
              <Button onClick={handleSave} disabled={saving || filledCount < 3}>
                {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Salvando...</> : "Salvar Briefing"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
