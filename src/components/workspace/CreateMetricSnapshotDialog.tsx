import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  METRIC_KEY_OPTIONS,
  METRIC_SOURCE_OPTIONS,
  getDefaultUnitFor,
  getMetricKeyLabel,
  formatMetricValue,
} from "./metricsConstants";

interface Front { id: string; name: string }

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  onCreated: () => void;
}

const NONE = "__none__";

function todayISO(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function CreateMetricSnapshotDialog({ open, onOpenChange, workspaceId, clientId, onCreated }: Props) {
  const [fronts, setFronts] = useState<Front[]>([]);
  const [saving, setSaving] = useState(false);

  const [metricKey, setMetricKey] = useState<string>("leads");
  const [metricLabel, setMetricLabel] = useState<string>("");
  const [metricValue, setMetricValue] = useState<string>("");
  const [metricUnit, setMetricUnit] = useState<string>(getDefaultUnitFor("leads"));
  const [periodLabel, setPeriodLabel] = useState<string>("");
  const [capturedAt, setCapturedAt] = useState<string>(todayISO());
  const [sourceType, setSourceType] = useState<string>("manual");
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [frontId, setFrontId] = useState<string>(NONE);

  useEffect(() => {
    if (!open) return;
    setMetricKey("leads");
    setMetricLabel("");
    setMetricValue("");
    setMetricUnit(getDefaultUnitFor("leads"));
    setPeriodLabel("");
    setCapturedAt(todayISO());
    setSourceType("manual");
    setSourceLabel("");
    setNotes("");
    setFrontId(NONE);
    supabase
      .from("operational_fronts")
      .select("id, name")
      .eq("workspace_id", workspaceId)
      .order("name")
      .then(({ data }) => setFronts((data ?? []) as Front[]));
  }, [open, workspaceId]);

  // When metric_key changes, suggest default unit
  useEffect(() => {
    setMetricUnit(getDefaultUnitFor(metricKey));
  }, [metricKey]);

  const numericValue = metricValue.trim() === "" ? NaN : Number(metricValue.replace(",", "."));
  const valid = metricKey && !Number.isNaN(numericValue);

  const handleSave = async () => {
    if (!valid) return;
    setSaving(true);

    const front = frontId !== NONE ? fronts.find(f => f.id === frontId) ?? null : null;
    const metadata: Record<string, unknown> = {};
    if (front) {
      metadata.operational_front_id = front.id;
      metadata.operational_front_name_snapshot = front.name;
    }

    const finalLabel = metricLabel.trim() || getMetricKeyLabel(metricKey);

    const { error } = await supabase.from("metric_snapshots").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      metric_key: metricKey,
      metric_label: finalLabel,
      metric_value: numericValue,
      metric_unit: metricUnit.trim() || null,
      period_label: periodLabel.trim() || null,
      captured_at: new Date(capturedAt + "T12:00:00").toISOString(),
      source_type: sourceType || null,
      source_label: sourceLabel.trim() || null,
      notes: notes.trim() || null,
      metadata,
    });

    if (error) {
      toast({ title: "Erro ao salvar métrica", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Timeline event — uses 'metric_added' (event_type column is free text in this project)
    const tlDescParts: string[] = [
      `${finalLabel}: ${formatMetricValue(numericValue, metricUnit || null)}`,
    ];
    if (periodLabel.trim()) tlDescParts.push(`Período: ${periodLabel.trim()}`);
    if (front) tlDescParts.push(`Frente: ${front.name}`);
    if (sourceLabel.trim()) tlDescParts.push(`Fonte: ${sourceLabel.trim()}`);

    const { error: tlError } = await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: "metric_added",
      title: `Métrica registrada: ${finalLabel}`,
      description: tlDescParts.join(" · "),
      happened_at: new Date().toISOString(),
    });
    if (tlError) {
      console.error("Timeline insert error:", tlError);
      toast({
        title: "Métrica salva, mas timeline falhou",
        description: tlError.message,
        variant: "destructive",
      });
    }

    toast({ title: "Snapshot registrado" });
    onCreated();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo snapshot de métrica</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Métrica *</Label>
              <Select value={metricKey} onValueChange={setMetricKey}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRIC_KEY_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                      <span>{o.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{o.hint}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome legível (opcional)</Label>
              <Input
                value={metricLabel}
                onChange={(e) => setMetricLabel(e.target.value)}
                placeholder={getMetricKeyLabel(metricKey)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Valor *</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={metricValue}
                onChange={(e) => setMetricValue(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unidade</Label>
              <Input
                value={metricUnit}
                onChange={(e) => setMetricUnit(e.target.value)}
                placeholder="leads, %, BRL..."
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Período</Label>
              <Input
                value={periodLabel}
                onChange={(e) => setPeriodLabel(e.target.value)}
                placeholder="Ex: Out/2025, Sem 42, Q4..."
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Data de captura *</Label>
              <Input
                type="date"
                value={capturedAt}
                onChange={(e) => setCapturedAt(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Origem</Label>
              <Select value={sourceType} onValueChange={setSourceType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METRIC_SOURCE_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Referência da origem</Label>
              <Input
                value={sourceLabel}
                onChange={(e) => setSourceLabel(e.target.value)}
                placeholder="Ex: Print Meta Ads, planilha cliente..."
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Frente operacional (opcional)</Label>
            <Select value={frontId} onValueChange={setFrontId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhuma</SelectItem>
                {fronts.map(f => (
                  <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              Vínculo leve via metadata. Não obriga frente para criar a métrica.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observação</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Contexto adicional (opcional)"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!valid || saving}>
              {saving ? "Salvando..." : "Registrar snapshot"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
