/**
 * CaseGeneratorDialog — gera draft de case automaticamente ao apertar 1 botão.
 *
 * Fluxo:
 *   1. Abre dialog → busca todos os sinais (before/after, nodes done, briefing)
 *   2. Gera draft estruturado (100% template, sem IA)
 *   3. Mostra preview editável
 *   4. Usuário pode:
 *      - Salvar como case_record (aparece na aba Case)
 *      - Exportar markdown pra pastar em Word/blog
 *      - Ambos
 */
import { useState, useEffect, useCallback } from "react";
import {
  Sparkles, FileText, Download, Save, Loader2, Copy, Eye, Edit,
  TrendingUp, Package, Calendar,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import {
  gatherCaseSignals, buildCaseDraft, saveCaseDraft, exportCaseDraftMarkdown,
  type CaseDraft,
} from "@/lib/caseGenerator";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName: string;
  onSaved?: () => void;
}

export default function CaseGeneratorDialog({ open, onOpenChange, workspaceId, clientId, clientName, onSaved }: Props) {
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<CaseDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const regenerate = useCallback(async () => {
    setLoading(true);
    const signals = await gatherCaseSignals(workspaceId, clientId);
    setDraft(buildCaseDraft(signals));
    setLoading(false);
  }, [workspaceId, clientId]);

  useEffect(() => {
    if (open) regenerate();
    else { setDraft(null); }
  }, [open, regenerate]);

  const updateField = <K extends keyof CaseDraft>(field: K, value: CaseDraft[K]) => {
    if (!draft) return;
    setDraft({ ...draft, [field]: value });
  };

  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    const { id, error } = await saveCaseDraft(workspaceId, clientId, draft);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error, variant: "destructive" });
      return;
    }
    toast({ title: "Case salvo", description: `Draft "${draft.title}" criado e disponível na aba Case.` });
    onSaved?.();
    onOpenChange(false);
  };

  const handleExport = () => {
    if (!draft) return;
    exportCaseDraftMarkdown(draft, clientName);
    toast({ title: "Case exportado", description: "Arquivo .md baixado." });
  };

  const handleCopyClipboard = () => {
    if (!draft) return;
    navigator.clipboard.writeText(draft.narrative);
    toast({ title: "Case copiado", description: "Markdown no clipboard." });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-full max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            Case Generator — {clientName}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Draft gerado automaticamente a partir das métricas before/after, entregáveis concluídos e contexto do cliente.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Agregando sinais do workspace...
          </div>
        ) : !draft ? (
          <div className="flex-1 flex items-center justify-center py-16 text-sm text-muted-foreground">
            Nada para gerar ainda.
          </div>
        ) : (
          <>
            {/* Metadata strip */}
            <div className="px-5 py-3 border-b border-border/40 flex items-center gap-3 flex-wrap bg-secondary/20">
              <Badge variant="outline" className="text-[10px] gap-1">
                <TrendingUp className="h-2.5 w-2.5" />
                {draft.metadata.metrics_analyzed} métricas
              </Badge>
              <Badge variant="outline" className="text-[10px] gap-1">
                <Package className="h-2.5 w-2.5" />
                {draft.metadata.nodes_delivered} entregas
              </Badge>
              {draft.metadata.days_in_journey > 0 && (
                <Badge variant="outline" className="text-[10px] gap-1">
                  <Calendar className="h-2.5 w-2.5" />
                  {draft.metadata.days_in_journey} dias de jornada
                </Badge>
              )}
              <div className="ml-auto">
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5" onClick={regenerate}>
                  <Sparkles className="h-3 w-3" /> Regenerar
                </Button>
              </div>
            </div>

            {/* Preview/Edit tabs */}
            <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
              <div className="px-5 pt-3 border-b border-border/40">
                <TabsList className="h-8">
                  <TabsTrigger value="preview" className="text-xs gap-1.5">
                    <Eye className="h-3 w-3" /> Preview
                  </TabsTrigger>
                  <TabsTrigger value="edit" className="text-xs gap-1.5">
                    <Edit className="h-3 w-3" /> Editar campos
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="preview" className="flex-1 min-h-0 m-0 overflow-y-auto overscroll-contain">
                <div className="px-5 py-4 prose prose-sm prose-invert max-w-none">
                  <div className="rounded-xl border border-border bg-card/40 p-5 text-sm whitespace-pre-wrap leading-relaxed">
                    {draft.narrative}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="edit" className="flex-1 min-h-0 m-0 overflow-y-auto overscroll-contain">
                <div className="px-5 py-4 space-y-3">
                  <Field label="Título" value={draft.title} onChange={(v) => updateField("title", v)} />
                  <Field label="Resumo (1-2 frases)" value={draft.summary} onChange={(v) => updateField("summary", v)} multiline rows={2} />
                  <Field label="Contexto antes (problem)" value={draft.problem} onChange={(v) => updateField("problem", v)} multiline rows={4} />
                  <Field label="Diagnóstico e estratégia" value={draft.diagnosis} onChange={(v) => updateField("diagnosis", v)} multiline rows={4} />
                  <Field label="Solução construída" value={draft.solution} onChange={(v) => updateField("solution", v)} multiline rows={4} />
                  <Field label="Lista de entregáveis" value={draft.deliverables} onChange={(v) => updateField("deliverables", v)} multiline rows={5} />
                  <Field label="Transformação mensurada" value={draft.transformation} onChange={(v) => updateField("transformation", v)} multiline rows={5} />
                  <Field label="Resultados principais" value={draft.results} onChange={(v) => updateField("results", v)} multiline rows={4} />
                </div>
              </TabsContent>
            </Tabs>

            {/* Footer actions */}
            <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
              <Button onClick={handleCopyClipboard} size="sm" variant="ghost" className="h-8 text-xs gap-1.5">
                <Copy className="h-3 w-3" /> Copiar markdown
              </Button>
              <Button onClick={handleExport} size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Download className="h-3 w-3" /> Baixar .md
              </Button>
              <div className="flex-1" />
              <Button onClick={() => onOpenChange(false)} variant="ghost" size="sm" className="h-8 text-xs">
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs gap-1.5">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Salvar na aba Case
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Helper ──

function Field({ label, value, onChange, multiline, rows }: {
  label: string; value: string; onChange: (v: string) => void;
  multiline?: boolean; rows?: number;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      {multiline ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows ?? 3}
          className="text-sm resize-none font-mono leading-relaxed" />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
      )}
    </div>
  );
}
