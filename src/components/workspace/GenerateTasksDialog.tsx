import { useState, useEffect, useCallback } from "react";
import { Sparkles, X, Loader2, AlertCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { generateTaskSuggestions, type GeneratedTaskSuggestion } from "./taskGenerationRules";
import { getPriorityLabel, getPriorityColor, getStageLabel } from "./taskConstants";
import { getContextLabel } from "./contextTypes";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  onGenerated: () => void;
}

interface ContextEntry {
  id: string;
  context_type: string;
  title: string;
  content: string;
  is_key_decision: boolean;
  metadata?: Record<string, unknown> | null;
}

export default function GenerateTasksDialog({ open, onOpenChange, workspaceId, clientId, onGenerated }: Props) {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeGeneric, setIncludeGeneric] = useState(false);
  const [suggestions, setSuggestions] = useState<GeneratedTaskSuggestion[]>([]);
  const [step, setStep] = useState<"select" | "preview">("select");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchContexts = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("context_entries")
      .select("id, context_type, title, content, is_key_decision, metadata")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar contextos", description: error.message, variant: "destructive" });
    }
    // Filter out briefings with pending_review status
    const allContexts = (data as ContextEntry[]) ?? [];
    const filtered = allContexts.filter((c) => {
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
      setStep("select");
      setSelectedIds(new Set());
      setSuggestions([]);
      setIncludeGeneric(false);
    }
  }, [open, fetchContexts]);

  const toggleContext = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = () => {
    const selected = contexts.filter((c) => selectedIds.has(c.id));
    if (selected.length === 0) return;
    const result = generateTaskSuggestions(selected, includeGeneric);
    setSuggestions(result);
    setStep("preview");
  };

  const removeSuggestion = (index: number) => {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (suggestions.length === 0) return;
    setSaving(true);

    try {
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
        source_id: s.sourceContextId,
        metadata: {
          generation_mode: "from_context",
          related_context_ids: s.relatedContextIds,
          rule_key: s.ruleKey,
          generated_from: s.generatedFrom,
        },
      }));

      const { error } = await supabase.from("tasks").insert(rows);
      if (error) {
        toast({ title: "Erro ao salvar tasks", description: error.message, variant: "destructive" });
        throw error;
      }

      // Register timeline events
      const timelineRows = suggestions.map((s) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "task_created",
        title: "Task gerada a partir de contexto",
        description: `"${s.title}"`,
        happened_at: new Date().toISOString(),
      }));

      await supabase.from("timeline_events").insert(timelineRows);

      toast({ title: `${suggestions.length} task(s) gerada(s)` });
      onGenerated();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {step === "select" ? "Gerar Tasks a partir de Contextos" : "Preview de Tasks"}
          </DialogTitle>
        </DialogHeader>

        {step === "select" && (
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : contexts.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <AlertCircle className="h-6 w-6 mb-2" />
                <p className="text-sm">Nenhum contexto encontrado neste workspace.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  Selecione os contextos para gerar sugestões de tasks. Tipos genéricos (anotação, reunião, transcrição) só geram tasks se a opção abaixo estiver marcada.
                </p>

                <div className="flex items-center gap-2 py-1">
                  <Checkbox
                    id="include-generic"
                    checked={includeGeneric}
                    onCheckedChange={(v) => setIncludeGeneric(!!v)}
                  />
                  <label htmlFor="include-generic" className="text-xs text-muted-foreground cursor-pointer">
                    Incluir tipos genéricos (anotação, reunião, transcrição)
                  </label>
                </div>

                <div className="space-y-1.5">
                  {contexts.map((ctx) => (
                    <Card
                      key={ctx.id}
                      className={`cursor-pointer transition-colors ${
                        selectedIds.has(ctx.id) ? "border-primary/50 bg-primary/5" : "hover:border-border/80"
                      }`}
                      onClick={() => toggleContext(ctx.id)}
                    >
                      <CardContent className="p-3 flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.has(ctx.id)}
                          onCheckedChange={() => toggleContext(ctx.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">
                              {getContextLabel(ctx.context_type)}
                            </Badge>
                            <span className="text-sm font-medium truncate">{ctx.title}</span>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{ctx.content}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {suggestions.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <AlertCircle className="h-6 w-6 mb-2" />
                <p className="text-sm">Nenhuma sugestão gerada para os contextos selecionados.</p>
                <p className="text-xs mt-1">Tipos genéricos só geram tasks se a opção estiver marcada.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-muted-foreground">
                  {suggestions.length} sugestão(ões). Remova as que não deseja antes de salvar.
                </p>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <Card key={i} className="relative">
                      <CardContent className="p-3 pr-10 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{s.title}</span>
                          <span className={`text-[10px] ${getPriorityColor(s.priority)}`}>
                            {getPriorityLabel(s.priority)}
                          </span>
                          {s.stage && (
                            <Badge variant="outline" className="text-[10px]">
                              {getStageLabel(s.stage)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{s.description}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>Regra: {s.ruleKey}</span>
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

        <DialogFooter className="gap-2">
          {step === "select" && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button onClick={handleGenerate} disabled={selectedIds.size === 0}>
                Gerar sugestões ({selectedIds.size})
              </Button>
            </>
          )}
          {step === "preview" && (
            <>
              <Button variant="outline" onClick={() => setStep("select")}>Voltar</Button>
              <Button onClick={handleSave} disabled={saving || suggestions.length === 0}>
                {saving ? "Salvando..." : `Criar ${suggestions.length} task(s)`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
