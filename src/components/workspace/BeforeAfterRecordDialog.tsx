import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, ExternalLink, LineChart, PackageCheck, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  BEFORE_AFTER_STATUS_OPTIONS,
  BEFORE_AFTER_TIMELINE_EVENT_TYPE,
  buildBeforeAfterEventDescription,
  buildBeforeAfterEventTitle,
  getBeforeAfterStatusColor,
  getBeforeAfterStatusLabel,
  type AssetSnapshotEntry,
  type BeforeAfterStatus,
  type MetricSnapshotEntry,
} from "./beforeAfterConstants";
import { getAssetTypeColor, getAssetTypeLabel, getValidationLabel } from "./assetConstants";
import { formatMetricValue, getMetricKeyLabel } from "./metricsConstants";

export interface BeforeAfterRecord {
  id: string;
  workspace_id: string;
  client_id: string;
  title: string;
  status: string;
  before_summary: string | null;
  problem_summary: string | null;
  solution_summary: string | null;
  after_summary: string | null;
  evidence_notes: string | null;
  main_metric_summary: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string | null;
}

interface AssetOption {
  id: string;
  title: string;
  asset_type: string;
  validation_status: string;
  external_url: string | null;
}

interface SnapshotOption {
  id: string;
  metric_key: string;
  metric_label: string | null;
  metric_value: number | null;
  metric_unit: string | null;
  period_label: string | null;
  captured_at: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  record: BeforeAfterRecord | null;
  onSaved: () => void;
  onTimelineRefresh?: () => Promise<void> | void;
}

const initialForm = {
  title: "",
  status: "draft" as BeforeAfterStatus,
  before_summary: "",
  problem_summary: "",
  solution_summary: "",
  after_summary: "",
  evidence_notes: "",
  main_metric_summary: "",
};

export default function BeforeAfterRecordDialog({
  open, onOpenChange, workspaceId, clientId, record, onSaved, onTimelineRefresh,
}: Props) {
  const [form, setForm] = useState(initialForm);
  const [assetIds, setAssetIds] = useState<string[]>([]);
  const [metricIds, setMetricIds] = useState<string[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [snapshots, setSnapshots] = useState<SnapshotOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  const isEditing = !!record;

  useEffect(() => {
    if (!open) return;
    setLoading(true);

    if (record) {
      setForm({
        title: record.title ?? "",
        status: (record.status as BeforeAfterStatus) ?? "draft",
        before_summary: record.before_summary ?? "",
        problem_summary: record.problem_summary ?? "",
        solution_summary: record.solution_summary ?? "",
        after_summary: record.after_summary ?? "",
        evidence_notes: record.evidence_notes ?? "",
        main_metric_summary: record.main_metric_summary ?? "",
      });
      const md = (record.metadata ?? {}) as Record<string, unknown>;
      setAssetIds(Array.isArray(md.asset_ids) ? (md.asset_ids as string[]) : []);
      setMetricIds(Array.isArray(md.metric_snapshot_ids) ? (md.metric_snapshot_ids as string[]) : []);
    } else {
      setForm(initialForm);
      setAssetIds([]);
      setMetricIds([]);
    }

    Promise.all([
      supabase
        .from("assets")
        .select("id, title, asset_type, validation_status, external_url")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("metric_snapshots")
        .select("id, metric_key, metric_label, metric_value, metric_unit, period_label, captured_at")
        .eq("workspace_id", workspaceId)
        .order("captured_at", { ascending: false })
        .limit(200),
    ]).then(([{ data: a }, { data: s }]) => {
      setAssets((a ?? []) as AssetOption[]);
      setSnapshots((s ?? []) as SnapshotOption[]);
      setLoading(false);
    });
  }, [open, record, workspaceId]);

  const linkedAssets = useMemo(
    () => assets.filter((a) => assetIds.includes(a.id)),
    [assets, assetIds],
  );
  const linkedSnapshots = useMemo(
    () => snapshots.filter((s) => metricIds.includes(s.id)),
    [snapshots, metricIds],
  );

  const toggleAsset = (id: string) => {
    setAssetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleMetric = (id: string) => {
    setMetricIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);

    const assetSnapshot: AssetSnapshotEntry[] = linkedAssets.map((a) => ({
      id: a.id,
      title: a.title,
      asset_type: a.asset_type,
      validation_status: a.validation_status,
    }));
    const metricSnapshot: MetricSnapshotEntry[] = linkedSnapshots.map((s) => ({
      id: s.id,
      label: s.metric_label || getMetricKeyLabel(s.metric_key),
      value: s.metric_value,
      unit: s.metric_unit,
      period: s.period_label,
    }));

    const previousMetadata = (record?.metadata ?? {}) as Record<string, unknown>;
    const metadata = {
      ...previousMetadata,
      asset_ids: assetIds,
      asset_titles_snapshot: assetSnapshot,
      metric_snapshot_ids: metricIds,
      metric_snapshot_summary: metricSnapshot,
    };

    const payload = {
      workspace_id: workspaceId,
      client_id: clientId,
      title: form.title.trim(),
      status: form.status,
      before_summary: form.before_summary.trim() || null,
      problem_summary: form.problem_summary.trim() || null,
      solution_summary: form.solution_summary.trim() || null,
      after_summary: form.after_summary.trim() || null,
      evidence_notes: form.evidence_notes.trim() || null,
      main_metric_summary: form.main_metric_summary.trim() || null,
      metadata,
    };

    const previousStatus = record?.status ?? null;

    if (isEditing && record) {
      const { error } = await supabase
        .from("before_after_records")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", record.id);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      const statusChanged = previousStatus !== form.status;
      if (statusChanged) {
        const action = form.status === "completed" ? "completed" : "status_changed";
        const { error: tlError } = await supabase.from("timeline_events").insert({
          workspace_id: workspaceId,
          client_id: clientId,
          event_type: BEFORE_AFTER_TIMELINE_EVENT_TYPE,
          title: buildBeforeAfterEventTitle({ action, recordTitle: form.title.trim(), newStatus: form.status }),
          description: buildBeforeAfterEventDescription({ action, recordTitle: form.title.trim(), newStatus: form.status }),
          happened_at: new Date().toISOString(),
        });
        if (tlError) console.error("Timeline insert error:", tlError);
      }
    } else {
      const { error } = await supabase.from("before_after_records").insert(payload);
      if (error) {
        toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      const { error: tlError } = await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: BEFORE_AFTER_TIMELINE_EVENT_TYPE,
        title: buildBeforeAfterEventTitle({ action: "created", recordTitle: form.title.trim(), newStatus: form.status }),
        description: buildBeforeAfterEventDescription({ action: "created", recordTitle: form.title.trim(), newStatus: form.status }),
        happened_at: new Date().toISOString(),
      });
      if (tlError) console.error("Timeline insert error:", tlError);
    }

    toast({ title: isEditing ? "Registro atualizado" : "Registro criado" });
    onSaved();
    await onTimelineRefresh?.();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 sm:rounded-xl overflow-hidden border-border bg-card">
        <DialogHeader className="border-b border-border bg-background/80 px-6 py-4 text-left space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border text-[10px]">
              Before/After
            </Badge>
            <Badge variant="outline" className={`text-[10px] ${getBeforeAfterStatusColor(form.status)}`}>
              {getBeforeAfterStatusLabel(form.status)}
            </Badge>
          </div>
          <DialogTitle className="text-xl text-foreground leading-tight">
            {isEditing ? "Editar prova de transformação" : "Nova prova de transformação"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground max-w-2xl">
            Estruture antes, problema, solução e depois. Sustente com Assets e Métricas já existentes no workspace.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(92vh-140px)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
            {/* ─── Coluna principal: blocos do formulário ─── */}
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Título *</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    placeholder="Ex: Reestruturação do funil de captação"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as BeforeAfterStatus })}
                  >
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BEFORE_AFTER_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          <div className="flex flex-col">
                            <span>{o.label}</span>
                            <span className="text-[10px] text-muted-foreground">{o.hint}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-4">
                  <FormBlock
                    label="1. Antes"
                    hint="Como era o cenário antes da intervenção?"
                    value={form.before_summary}
                    onChange={(v) => setForm({ ...form, before_summary: v })}
                    placeholder="Estado original — números, percepção, gargalo de origem..."
                  />
                  <Separator />
                  <FormBlock
                    label="2. Problema"
                    hint="Qual era o problema operacional central?"
                    value={form.problem_summary}
                    onChange={(v) => setForm({ ...form, problem_summary: v })}
                    placeholder="Diagnóstico — o que travava o resultado..."
                  />
                  <Separator />
                  <FormBlock
                    label="3. Solução"
                    hint="O que foi aplicado para resolver?"
                    value={form.solution_summary}
                    onChange={(v) => setForm({ ...form, solution_summary: v })}
                    placeholder="Solução operacional — frente, processo, sistema, time..."
                  />
                  <Separator />
                  <FormBlock
                    label="4. Depois"
                    hint="Qual o novo cenário pós-intervenção?"
                    value={form.after_summary}
                    onChange={(v) => setForm({ ...form, after_summary: v })}
                    placeholder="Estado atual — números, percepção, novo padrão..."
                  />
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-4">
                  <FormBlock
                    label="5. Evidências"
                    hint="Notas que sustentam a leitura. Os assets vinculados ao lado complementam essa base."
                    value={form.evidence_notes}
                    onChange={(v) => setForm({ ...form, evidence_notes: v })}
                    placeholder="Notas de evidência — prints, validações, depoimentos..."
                  />
                  <Separator />
                  <FormBlock
                    label="6. Métrica principal"
                    hint="Resumo factual da principal métrica que sustenta a transformação."
                    value={form.main_metric_summary}
                    onChange={(v) => setForm({ ...form, main_metric_summary: v })}
                    placeholder="Ex: Leads/mês passaram de 120 para 480 em 90 dias"
                  />
                </CardContent>
              </Card>
            </div>

            {/* ─── Coluna lateral: vínculos leves ─── */}
            <div className="space-y-5">
              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">Assets vinculados</p>
                    <Badge variant="outline" className="ml-auto text-[10px]">{assetIds.length}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Selecione provas operacionais já registradas no workspace.
                  </p>
                  {loading ? (
                    <p className="text-xs text-muted-foreground">Carregando...</p>
                  ) : assets.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum asset disponível neste workspace.</p>
                  ) : (
                    <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
                      {assets.map((a) => {
                        const checked = assetIds.includes(a.id);
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => toggleAsset(a.id)}
                            className={`w-full flex items-start gap-2 p-2 rounded-md border text-left transition-colors ${
                              checked ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                            }`}
                          >
                            <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                              checked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                            }`}>
                              {checked && <Check className="h-3 w-3" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{a.title}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <Badge variant="outline" className={`text-[9px] px-1 py-0 ${getAssetTypeColor(a.asset_type)}`}>
                                  {getAssetTypeLabel(a.asset_type)}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  {getValidationLabel(a.validation_status)}
                                </span>
                                {a.external_url && <ExternalLink className="h-2.5 w-2.5 text-muted-foreground" />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <LineChart className="h-4 w-4 text-primary" />
                    <p className="text-sm font-medium">Snapshots de métrica</p>
                    <Badge variant="outline" className="ml-auto text-[10px]">{metricIds.length}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Vincule snapshots já capturados como base factual.
                  </p>
                  {loading ? (
                    <p className="text-xs text-muted-foreground">Carregando...</p>
                  ) : snapshots.length === 0 ? (
                    <p className="text-xs text-muted-foreground italic">Nenhum snapshot disponível neste workspace.</p>
                  ) : (
                    <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
                      {snapshots.map((s) => {
                        const checked = metricIds.includes(s.id);
                        const label = s.metric_label || getMetricKeyLabel(s.metric_key);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => toggleMetric(s.id)}
                            className={`w-full flex items-start gap-2 p-2 rounded-md border text-left transition-colors ${
                              checked ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/30"
                            }`}
                          >
                            <div className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                              checked ? "bg-primary border-primary text-primary-foreground" : "border-border"
                            }`}>
                              {checked && <Check className="h-3 w-3" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium text-foreground truncate">{label}</p>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-[11px] font-semibold text-foreground">
                                  {formatMetricValue(s.metric_value, s.metric_unit)}
                                </span>
                                {s.period_label && (
                                  <span className="text-[10px] text-muted-foreground">· {s.period_label}</span>
                                )}
                                <span className="text-[10px] text-muted-foreground">
                                  · {new Date(s.captured_at).toLocaleDateString("pt-BR")}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {(linkedAssets.length > 0 || linkedSnapshots.length > 0) && (
                <Card className="border-border bg-secondary/30">
                  <CardContent className="p-4 space-y-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Selecionado</p>
                    {linkedAssets.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {linkedAssets.map((a) => (
                          <Badge key={a.id} variant="outline" className="text-[10px] inline-flex items-center gap-1">
                            <PackageCheck className="h-2.5 w-2.5" />
                            <span className="max-w-[140px] truncate">{a.title}</span>
                            <button
                              type="button"
                              onClick={() => toggleAsset(a.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    {linkedSnapshots.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {linkedSnapshots.map((s) => (
                          <Badge key={s.id} variant="outline" className="text-[10px] inline-flex items-center gap-1">
                            <LineChart className="h-2.5 w-2.5" />
                            <span className="max-w-[140px] truncate">
                              {(s.metric_label || getMetricKeyLabel(s.metric_key))}: {formatMetricValue(s.metric_value, s.metric_unit)}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleMetric(s.id)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="border-t border-border px-6 py-3 flex items-center justify-end gap-2 bg-background/80">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!form.title.trim() || saving}>
            {saving ? "Salvando..." : isEditing ? "Salvar alterações" : (
              <><Plus className="h-4 w-4 mr-1" /> Criar registro</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FormBlock({
  label, hint, value, onChange, placeholder,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-xs font-medium">{label}</Label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="resize-none text-sm"
      />
    </div>
  );
}
