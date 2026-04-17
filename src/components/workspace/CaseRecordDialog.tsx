import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { FileText, FolderKanban, BarChart3, PackageCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  CASE_STATUS_OPTIONS,
  CASE_TIMELINE_EVENT_TYPE,
  buildCaseEventDescription,
  buildCaseEventTitle,
  getCaseStatusColor,
  getCaseStatusLabel,
  type AssetSnapshotEntry,
  type CaseStatus,
  type MetricSnapshotEntry,
} from "./caseConstants";

export interface CaseRecord {
  id: string;
  workspace_id: string;
  client_id: string;
  title: string;
  status: string;
  summary: string | null;
  problem: string | null;
  diagnosis: string | null;
  solution: string | null;
  deliverables: string | null;
  transformation: string | null;
  results: string | null;
  narrative: string | null;
  based_on_before_after_id: string | null;
  metadata: Record<string, unknown> | null;
  version: number | null;
  created_at: string;
  updated_at: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  record: CaseRecord | null;
  /** Used when creating a new case pre-seeded from a Before/After. */
  seed?: Partial<CaseRecord> | null;
  onSaved: () => void;
  onTimelineRefresh?: () => Promise<void> | void;
}

const initialForm = {
  title: "",
  status: "draft" as CaseStatus,
  summary: "",
  problem: "",
  diagnosis: "",
  solution: "",
  deliverables: "",
  transformation: "",
  results: "",
  narrative: "",
  based_on_before_after_id: "" as string,
};

export default function CaseRecordDialog({
  open, onOpenChange, workspaceId, clientId, record, seed, onSaved, onTimelineRefresh,
}: Props) {
  const isEditing = !!record;
  const [form, setForm] = useState(initialForm);
  const [metadata, setMetadata] = useState<Record<string, unknown>>({});
  const [originalStatus, setOriginalStatus] = useState<CaseStatus>("draft");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (record) {
      setForm({
        title: record.title ?? "",
        status: (record.status as CaseStatus) ?? "draft",
        summary: record.summary ?? "",
        problem: record.problem ?? "",
        diagnosis: record.diagnosis ?? "",
        solution: record.solution ?? "",
        deliverables: record.deliverables ?? "",
        transformation: record.transformation ?? "",
        results: record.results ?? "",
        narrative: record.narrative ?? "",
        based_on_before_after_id: record.based_on_before_after_id ?? "",
      });
      setMetadata((record.metadata ?? {}) as Record<string, unknown>);
      setOriginalStatus((record.status as CaseStatus) ?? "draft");
    } else if (seed) {
      setForm({
        title: seed.title ?? "",
        status: (seed.status as CaseStatus) ?? "draft",
        summary: seed.summary ?? "",
        problem: seed.problem ?? "",
        diagnosis: seed.diagnosis ?? "",
        solution: seed.solution ?? "",
        deliverables: seed.deliverables ?? "",
        transformation: seed.transformation ?? "",
        results: seed.results ?? "",
        narrative: seed.narrative ?? "",
        based_on_before_after_id: seed.based_on_before_after_id ?? "",
      });
      setMetadata((seed.metadata ?? {}) as Record<string, unknown>);
      setOriginalStatus("draft");
    } else {
      setForm(initialForm);
      setMetadata({});
      setOriginalStatus("draft");
    }
  }, [open, record, seed]);

  const baTitle = (metadata.before_after_title_snapshot as string | undefined) ?? null;
  const assetSnap = (metadata.asset_titles_snapshot as AssetSnapshotEntry[] | undefined) ?? [];
  const metricSnap = (metadata.metric_snapshot_summary as MetricSnapshotEntry[] | undefined) ?? [];

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Título obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);

    const payload = {
      workspace_id: workspaceId,
      client_id: clientId,
      title: form.title.trim(),
      status: form.status,
      summary: form.summary.trim() || null,
      problem: form.problem.trim() || null,
      diagnosis: form.diagnosis.trim() || null,
      solution: form.solution.trim() || null,
      deliverables: form.deliverables.trim() || null,
      transformation: form.transformation.trim() || null,
      results: form.results.trim() || null,
      narrative: form.narrative.trim() || null,
      based_on_before_after_id: form.based_on_before_after_id || null,
      metadata,
    };

    let savedId: string | null = null;
    let action: "created" | "generated" | "in_review" | "approved" | "status_changed" | null = null;

    if (isEditing && record) {
      const { error } = await supabase
        .from("case_records")
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq("id", record.id);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedId = record.id;
      if (form.status !== originalStatus) {
        if (form.status === "in_review") action = "in_review";
        else if (form.status === "approved") action = "approved";
        else action = "status_changed";
      }
    } else {
      const { data, error } = await supabase
        .from("case_records")
        .insert(payload)
        .select("id")
        .single();
      if (error) {
        toast({ title: "Erro ao criar case", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedId = data?.id ?? null;
      action = form.based_on_before_after_id ? "generated" : "created";
    }

    if (action && savedId) {
      const { error: tlError } = await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: CASE_TIMELINE_EVENT_TYPE,
        title: buildCaseEventTitle({ action, caseTitle: form.title.trim(), newStatus: form.status, basedOnTitle: baTitle }),
        description: buildCaseEventDescription({ action, caseTitle: form.title.trim(), newStatus: form.status, basedOnTitle: baTitle }),
        happened_at: new Date().toISOString(),
      });
      if (tlError) {
        toast({ title: "Salvo, mas timeline falhou", description: tlError.message, variant: "destructive" });
      }
    }

    toast({ title: isEditing ? "Case atualizado" : "Case criado" });
    onSaved();
    await onTimelineRefresh?.();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl p-0 sm:rounded-xl overflow-hidden border-border bg-card">
        <div className="border-b border-border bg-background/80 px-6 py-5">
          <DialogHeader className="space-y-3 text-left">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={getCaseStatusColor(form.status)}>
                {getCaseStatusLabel(form.status)}
              </Badge>
              {baTitle && (
                <Badge variant="outline" className="bg-secondary text-secondary-foreground border-border">
                  Base: {baTitle}
                </Badge>
              )}
            </div>
            <DialogTitle className="text-xl text-foreground">
              {isEditing ? "Editar case" : "Novo case"}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Camada legível e editável da prova consolidada. Reaproveita Before/After, Assets e Métricas.
            </DialogDescription>
          </DialogHeader>
        </div>

        <ScrollArea className="max-h-[calc(92vh-180px)]">
          <div className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
            {/* Editor */}
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                <div className="space-y-1.5">
                  <Label className="text-xs">Título *</Label>
                  <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Case — Recuperação de pipeline B2B" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CaseStatus })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CASE_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <BlockField label="Resumo" hint="Visão curta do case" value={form.summary} onChange={(v) => setForm({ ...form, summary: v })} rows={2} />
              <BlockField label="Problema" hint="Problema principal enfrentado" value={form.problem} onChange={(v) => setForm({ ...form, problem: v })} />
              <BlockField label="Diagnóstico" hint="Leitura do cenário e causas" value={form.diagnosis} onChange={(v) => setForm({ ...form, diagnosis: v })} />
              <BlockField label="Solução" hint="Abordagem aplicada" value={form.solution} onChange={(v) => setForm({ ...form, solution: v })} />
              <BlockField label="Entregáveis" hint="Entregas e ativos principais" value={form.deliverables} onChange={(v) => setForm({ ...form, deliverables: v })} />
              <BlockField label="Transformação" hint="Mudança operacional percebida" value={form.transformation} onChange={(v) => setForm({ ...form, transformation: v })} />
              <BlockField label="Resultados" hint="Resultado factual consolidado" value={form.results} onChange={(v) => setForm({ ...form, results: v })} />
              <BlockField label="Narrativa final" hint="Versão editável final em texto corrido" value={form.narrative} onChange={(v) => setForm({ ...form, narrative: v })} rows={6} />
            </div>

            {/* Sustentação factual */}
            <div className="space-y-4">
              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Base factual</span>
                  </div>
                  <Separator />
                  <div className="space-y-1">
                    <p className="label-sm">Before/After de origem</p>
                    <p className="text-sm text-foreground">{baTitle ?? "Sem base vinculada"}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Assets herdados</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">{assetSnap.length}</Badge>
                  </div>
                  {assetSnap.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum asset herdado do Before/After base.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {assetSnap.map((a) => (
                        <li key={a.id} className="text-xs text-foreground flex items-center gap-2">
                          <FolderKanban className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{a.title}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border bg-card">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Métricas herdadas</span>
                    <Badge variant="outline" className="text-[10px] ml-auto">{metricSnap.length}</Badge>
                  </div>
                  {metricSnap.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhuma métrica herdada do Before/After base.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {metricSnap.map((m) => (
                        <li key={m.id} className="text-xs text-foreground">
                          <span className="font-medium">{m.label}:</span>{" "}
                          {m.value ?? "-"}{m.unit ? ` ${m.unit}` : ""}{m.period ? ` (${m.period})` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 border-t border-border bg-background/60 px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving || !form.title.trim()}>
            {saving ? "Salvando..." : isEditing ? "Salvar alterações" : "Criar case"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BlockField({
  label, hint, value, onChange, rows = 3,
}: { label: string; hint: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <Label className="text-xs">{label}</Label>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </div>
      <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} />
    </div>
  );
}
