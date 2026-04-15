import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  SIGNAL_BLOCK_KEYS,
  SIGNAL_LABELS,
  SIGNAL_TO_DOSSIER,
  type SignalBlockKey,
} from "./briefingSignals";
import {
  ENTERPRISE_SIGNAL_LABELS,
  ENTERPRISE_SIGNAL_TO_DOSSIER,
  ENTERPRISE_SIGNAL_KEYS,
  ENTERPRISE_TASK_SIGNALS,
  ENTERPRISE_DOC_SIGNALS,
} from "./enterpriseStructuringBlocks";
import {
  AUTOMATION_SIGNAL_LABELS,
  AUTOMATION_SIGNAL_TO_DOSSIER,
  AUTOMATION_SIGNAL_KEYS,
  AUTOMATION_TASK_SIGNALS,
  AUTOMATION_DOC_SIGNALS,
} from "./automationBlocks";

const DOSSIER_BLOCK_OPTIONS = [
  { value: "identity", label: "Identidade" },
  { value: "offer", label: "Oferta/ICP" },
  { value: "commercial", label: "Comercial" },
  { value: "operational", label: "Operacional" },
  { value: "digital", label: "Digital" },
  { value: "access", label: "Acessos" },
  { value: "diagnostic", label: "Diagnóstico" },
  { value: "decisions", label: "Decisões" },
];

interface Props {
  entryId: string;
  metadata: Record<string, unknown>;
  onUpdated: () => void;
}

function getReviewConfig(briefingKind?: string) {
  if (briefingKind === "enterprise_structuring") {
    return {
      keys: ENTERPRISE_SIGNAL_KEYS,
      labels: ENTERPRISE_SIGNAL_LABELS,
      dossier: ENTERPRISE_SIGNAL_TO_DOSSIER,
      taskSignals: ENTERPRISE_TASK_SIGNALS,
      docSignals: ENTERPRISE_DOC_SIGNALS,
    };
  }

  if (briefingKind === "ai_automation") {
    return {
      keys: AUTOMATION_SIGNAL_KEYS,
      labels: AUTOMATION_SIGNAL_LABELS,
      dossier: AUTOMATION_SIGNAL_TO_DOSSIER,
      taskSignals: AUTOMATION_TASK_SIGNALS,
      docSignals: AUTOMATION_DOC_SIGNALS,
    };
  }

  return {
    keys: SIGNAL_BLOCK_KEYS as readonly string[],
    labels: SIGNAL_LABELS as Record<string, string>,
    dossier: SIGNAL_TO_DOSSIER as Record<string, string>,
    taskSignals: ["pain_points", "goals", "accesses", "diagnosis", "decisions", "gaps", "priorities"],
    docSignals: ["identity", "offer", "icp_persona", "goals", "accesses"],
  };
}

export default function BriefingSignalReview({ entryId, metadata, onUpdated }: Props) {
  const signals = (metadata.structured_signals ?? {}) as Record<string, { summary: string; dossier_block: string }>;
  const reviewStatus = metadata.import_review_status as string;
  const briefingKind = metadata.briefing_kind as string | undefined;
  const config = getReviewConfig(briefingKind);

  const [editing, setEditing] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editDossierBlock, setEditDossierBlock] = useState("");
  const [saving, setSaving] = useState(false);

  const signalKeys = config.keys.filter((key) => signals[key]);
  const emptyKeys = config.keys.filter((key) => !signals[key]);

  const getLabel = (key: string) => config.labels[key] ?? key;
  const getDossier = (key: string) => config.dossier[key] ?? "identity";

  const buildUpdatedMeta = (updatedSignals: Record<string, { summary: string; dossier_block: string }>) => ({
    ...metadata,
    structured_signals: updatedSignals,
    dossier_signals: [...new Set(Object.values(updatedSignals).map((value) => value.dossier_block))],
    task_signals: Object.keys(updatedSignals).filter((key) => config.taskSignals.includes(key)),
    documentation_signals: Object.keys(updatedSignals).filter((key) => config.docSignals.includes(key)),
  });

  const startEdit = (key: string) => {
    const entry = signals[key];
    setEditing(key);
    setEditSummary(entry?.summary ?? "");
    setEditDossierBlock(entry?.dossier_block ?? getDossier(key));
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);

    const updatedSignals = {
      ...signals,
      [editing]: {
        summary: editSummary.trim(),
        dossier_block: editDossierBlock,
      },
    };

    const { error } = await supabase
      .from("context_entries")
      .update({ metadata: buildUpdatedMeta(updatedSignals) })
      .eq("id", entryId);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Sinal atualizado" });
      onUpdated();
    }

    setEditing(null);
    setSaving(false);
  };

  const removeSignal = async (key: string) => {
    const updatedSignals = { ...signals };
    delete updatedSignals[key];

    const { error } = await supabase
      .from("context_entries")
      .update({ metadata: buildUpdatedMeta(updatedSignals) })
      .eq("id", entryId);

    if (!error) {
      toast({ title: "Sinal removido" });
      onUpdated();
    }
  };

  const markReviewed = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("context_entries")
      .update({ metadata: { ...buildUpdatedMeta(signals), import_review_status: "reviewed" } })
      .eq("id", entryId);

    if (!error) {
      toast({ title: "Briefing marcado como revisado", description: "Sinais agora alimentam Dossiê, Wizard e Tasks." });

      const { data: entry } = await supabase
        .from("context_entries")
        .select("workspace_id, client_id")
        .eq("id", entryId)
        .single();

      if (entry) {
        await supabase.from("timeline_events").insert({
          workspace_id: entry.workspace_id,
          client_id: entry.client_id,
          event_type: "briefing_reviewed",
          title: "Briefing revisado e aprovado",
          description: "Sinais estruturados revisados — briefing liberado para uso em Dossiê, Wizard e Tasks.",
          happened_at: new Date().toISOString(),
        });
      }

      onUpdated();
    }

    setSaving(false);
  };

  if (signalKeys.length === 0) {
    return <div className="text-xs text-muted-foreground py-2">Nenhum sinal estruturado detectado neste briefing.</div>;
  }

  return (
    <div className="space-y-3 mt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-foreground">Sinais Estruturados</h4>
        {reviewStatus === "pending_review" && (
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={markReviewed} disabled={saving || editing !== null}>
            <Check className="h-3 w-3 mr-1" /> Marcar revisado
          </Button>
        )}
        {reviewStatus === "reviewed" && (
          <Badge variant="secondary" className="text-[9px]">
            Revisado — alimenta Dossiê e Tasks
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {signalKeys.map((key) => {
          const entry = signals[key];
          const isEditing = editing === key;

          if (!entry) return null;

          if (isEditing) {
            return (
              <Card key={key} className="border-border">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{getLabel(key)}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-6 px-1.5" onClick={() => setEditing(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                      <Button size="sm" className="h-6 px-2 text-[10px]" onClick={saveEdit} disabled={saving}>
                        Salvar
                      </Button>
                    </div>
                  </div>
                  <Textarea value={editSummary} onChange={(e) => setEditSummary(e.target.value)} className="text-xs min-h-[60px]" />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Bloco Dossiê:</span>
                    <Select value={editDossierBlock} onValueChange={setEditDossierBlock}>
                      <SelectTrigger className="h-6 text-[10px] w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOSSIER_BLOCK_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value} className="text-xs">
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            );
          }

          return (
            <div key={key} className="flex items-start gap-2 text-xs border rounded-md p-2 bg-muted/10">
              <span className="text-primary/40 mt-0.5 shrink-0">•</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-foreground">{getLabel(key)}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0">{entry.dossier_block}</Badge>
                </div>
                <p className="text-muted-foreground line-clamp-2 mt-0.5">{entry.summary}</p>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <button onClick={() => startEdit(key)} className="p-1 rounded hover:bg-muted">
                  <Pencil className="h-3 w-3 text-muted-foreground" />
                </button>
                <button onClick={() => removeSignal(key)} className="p-1 rounded hover:bg-destructive/10">
                  <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {emptyKeys.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {emptyKeys.length} sinal(is) não detectado(s): {emptyKeys.map((key) => getLabel(key)).join(", ")}
        </p>
      )}
    </div>
  );
}
