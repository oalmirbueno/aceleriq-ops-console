import { useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  SIGNAL_BLOCK_KEYS,
  SIGNAL_LABELS,
  SIGNAL_TO_DOSSIER,
  type SignalBlockKey,
  type StructuredSignals,
  type BriefingSignalsMetadata,
} from "./briefingSignals";
import { ENTERPRISE_SIGNAL_LABELS, ENTERPRISE_SIGNAL_TO_DOSSIER, ENTERPRISE_SIGNAL_KEYS } from "./enterpriseStructuringBlocks";

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

export default function BriefingSignalReview({ entryId, metadata, onUpdated }: Props) {
  const signals = (metadata.structured_signals ?? {}) as Record<string, { summary: string; dossier_block: string }>;
  const reviewStatus = metadata.import_review_status as string;
  const briefingKind = metadata.briefing_kind as string | undefined;
  const isEnterprise = briefingKind === "enterprise_structuring";

  const [editing, setEditing] = useState<string | null>(null);
  const [editSummary, setEditSummary] = useState("");
  const [editDossierBlock, setEditDossierBlock] = useState("");
  const [saving, setSaving] = useState(false);

  // Resolve keys based on briefing kind
  const allKnownKeys = isEnterprise ? ENTERPRISE_SIGNAL_KEYS : (SIGNAL_BLOCK_KEYS as readonly string[]);
  const getLabel = (key: string) => (isEnterprise ? ENTERPRISE_SIGNAL_LABELS[key] : SIGNAL_LABELS[key as SignalBlockKey]) ?? key;
  const getDossier = (key: string) => (isEnterprise ? ENTERPRISE_SIGNAL_TO_DOSSIER[key] : SIGNAL_TO_DOSSIER[key as SignalBlockKey]) ?? "identity";

  const signalKeys = allKnownKeys.filter((k) => signals[k]);
  const emptyKeys = allKnownKeys.filter((k) => !signals[k]);

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
      [editing]: { summary: editSummary.trim(), dossier_block: editDossierBlock },
    };

    const allTaskKeys = ["pain_points", "goals", "accesses", "diagnosis", "decisions", "gaps", "priorities",
      "process_gaps", "commercial_structure", "operational_structure", "tools_stack", "access_dependencies",
      "structuring_opportunities", "priority_constraints", "growth_readiness"];
    const allDocKeys = ["identity", "offer", "icp_persona", "goals", "accesses",
      "company_moment", "revenue_model", "commercial_structure", "team_roles", "tools_stack", "digital_operation"];

    const taskSignals = Object.keys(updatedSignals).filter((k) => allTaskKeys.includes(k));
    const docSignals = Object.keys(updatedSignals).filter((k) => allDocKeys.includes(k));
    const dossierSignals = [...new Set(Object.values(updatedSignals).map((v) => v!.dossier_block))];

    const updatedMeta = {
      ...metadata,
      structured_signals: updatedSignals,
      dossier_signals: dossierSignals,
      task_signals: taskSignals,
      documentation_signals: docSignals,
    };

    const { error } = await supabase.from("context_entries").update({ metadata: updatedMeta }).eq("id", entryId);
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

    const allTaskKeys = ["pain_points", "goals", "accesses", "diagnosis", "decisions", "gaps", "priorities",
      "process_gaps", "commercial_structure", "operational_structure", "tools_stack", "access_dependencies",
      "structuring_opportunities", "priority_constraints", "growth_readiness"];
    const allDocKeys = ["identity", "offer", "icp_persona", "goals", "accesses",
      "company_moment", "revenue_model", "commercial_structure", "team_roles", "tools_stack", "digital_operation"];

    const updatedMeta = {
      ...metadata,
      structured_signals: updatedSignals,
      dossier_signals: [...new Set(Object.values(updatedSignals).map((v) => v!.dossier_block))],
      task_signals: Object.keys(updatedSignals).filter((k) => allTaskKeys.includes(k)),
      documentation_signals: Object.keys(updatedSignals).filter((k) => allDocKeys.includes(k)),
    };

    const { error } = await supabase.from("context_entries").update({ metadata: updatedMeta }).eq("id", entryId);
    if (!error) {
      toast({ title: "Sinal removido" });
      onUpdated();
    }
  };

  const markReviewed = async () => {
    setSaving(true);
    const updatedMeta = { ...metadata, import_review_status: "reviewed" };
    const { error } = await supabase.from("context_entries").update({ metadata: updatedMeta }).eq("id", entryId);
    if (!error) {
      toast({ title: "Briefing marcado como revisado", description: "Sinais agora alimentam Dossiê, Wizard e Tasks." });

      // Register timeline event for review completion
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
    return (
      <div className="text-xs text-muted-foreground py-2">
        Nenhum sinal estruturado detectado neste briefing.
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-3" onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold text-foreground">Sinais Estruturados</h4>
        {reviewStatus === "pending_review" && (
          <Button size="sm" className="h-6 text-[10px] px-2" onClick={markReviewed} disabled={saving}>
            <Check className="h-3 w-3 mr-1" /> Marcar revisado
          </Button>
        )}
        {reviewStatus === "reviewed" && (
          <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
            Revisado — alimenta Dossiê e Tasks
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {signalKeys.map((key) => {
          const entry = signals[key]!;
          const isEditing = editing === key;

          if (isEditing) {
            return (
              <Card key={key} className="border-primary/30">
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
                  <Textarea
                    value={editSummary}
                    onChange={(e) => setEditSummary(e.target.value)}
                    className="text-xs min-h-[60px]"
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Bloco Dossiê:</span>
                    <Select value={editDossierBlock} onValueChange={setEditDossierBlock}>
                      <SelectTrigger className="h-6 text-[10px] w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOSSIER_BLOCK_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
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
          {emptyKeys.length} sinal(is) não detectado(s): {emptyKeys.map((k) => getLabel(k)).join(", ")}
        </p>
      )}
    </div>
  );
}
