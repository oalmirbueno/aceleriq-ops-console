import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle, CheckCircle2, Pause, Play, RotateCcw, Lock, Unlock,
  Plus, Link2, ExternalLink, FileText, Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  EXECUTION_STATUS_OPTIONS, getBucketLabel, getExecutionLabel,
  getExecutionColor, getBucketColor, type ExecutionStatus,
} from "./frontConstants";
import { getScopeLabel, getScopeColor, type ScopeClassification } from "./aceleraConstants";
import { getStatusLabel, getStatusColor } from "./taskConstants";

interface OperationalFront {
  id: string;
  workspace_id: string;
  client_id: string;
  front_key: string | null;
  name: string;
  objective: string | null;
  expected_outcome: string | null;
  scope_classification: string | null;
  priority: string;
  bucket_status: string;
  execution_status: string;
  owner_id: string | null;
  blocked_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface LinkedTask {
  id: string;
  title: string;
  status: string;
  priority: string;
}

interface EvidenceItem {
  type: string;
  label: string;
  url?: string;
  text?: string;
  note?: string;
  created_at: string;
}

interface Props {
  front: OperationalFront | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onUpdated: () => void;
  workspaceId: string;
  clientId: string;
}

export default function FrontDetailDialog({ front, open, onOpenChange, onUpdated, workspaceId, clientId }: Props) {
  const [linkedTasks, setLinkedTasks] = useState<LinkedTask[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [blockReason, setBlockReason] = useState("");
  const [showBlockInput, setShowBlockInput] = useState(false);

  // Evidence state
  const [evidenceLabel, setEvidenceLabel] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [showEvidenceForm, setShowEvidenceForm] = useState(false);

  const frontId = front?.id;

  const fetchLinkedTasks = useCallback(async () => {
    if (!frontId) return;
    setLoadingTasks(true);
    // Tasks linked via metadata.operational_front_id
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status, priority")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    // Filter client-side for metadata match
    if (data) {
      // We need to fetch full metadata to check link — use a broader query
      const { data: fullTasks } = await supabase
        .from("tasks")
        .select("id, title, status, priority, metadata")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });

      const linked = (fullTasks ?? []).filter((t: Record<string, unknown>) => {
        const meta = t.metadata as Record<string, unknown> | null;
        return meta?.operational_front_id === frontId;
      });
      setLinkedTasks(linked as LinkedTask[]);
    }
    setLoadingTasks(false);
  }, [frontId, workspaceId]);

  useEffect(() => {
    if (open && frontId) fetchLinkedTasks();
  }, [open, frontId, fetchLinkedTasks]);

  if (!front) return null;

  const evidenceItems: EvidenceItem[] = (front.metadata?.evidence_items as EvidenceItem[]) ?? [];
  const totalLinked = linkedTasks.length;
  const doneLinked = linkedTasks.filter((t) => t.status === "done").length;
  const progressPct = totalLinked > 0 ? Math.round((doneLinked / totalLinked) * 100) : 0;

  const updateFront = async (updates: Record<string, unknown>, timelineTitle?: string, timelineDesc?: string) => {
    const { error } = await supabase
      .from("operational_fronts")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", front.id);

    if (error) {
      toast({ title: "Erro ao atualizar frente", description: error.message, variant: "destructive" });
      return;
    }

    if (timelineTitle) {
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "front_updated",
        title: timelineTitle,
        description: timelineDesc ?? null,
        happened_at: new Date().toISOString(),
      });
    }

    toast({ title: "Frente atualizada" });
    onUpdated();
  };

  const handleStatusChange = async (newStatus: ExecutionStatus) => {
    if (newStatus === "blocked") {
      setShowBlockInput(true);
      return;
    }
    setShowBlockInput(false);
    const oldLabel = getExecutionLabel(front.execution_status);
    const newLabel = getExecutionLabel(newStatus);
    await updateFront(
      { execution_status: newStatus, blocked_reason: null },
      `Frente "${front.name}" — status alterado`,
      `De "${oldLabel}" para "${newLabel}"`
    );
  };

  const handleBlock = async () => {
    if (!blockReason.trim()) return;
    await updateFront(
      { execution_status: "blocked", blocked_reason: blockReason.trim() },
      `Frente "${front.name}" — bloqueada`,
      blockReason.trim()
    );
    setBlockReason("");
    setShowBlockInput(false);
  };

  const handleUnblock = async () => {
    await updateFront(
      { execution_status: "in_progress", blocked_reason: null },
      `Frente "${front.name}" — desbloqueada`
    );
  };

  const handleAddEvidence = async () => {
    if (!evidenceLabel.trim()) return;
    const newItem: EvidenceItem = {
      type: evidenceUrl ? "link" : "note",
      label: evidenceLabel.trim(),
      url: evidenceUrl.trim() || undefined,
      note: evidenceNote.trim() || undefined,
      created_at: new Date().toISOString(),
    };
    const updated = [...evidenceItems, newItem];
    await updateFront(
      { metadata: { ...(front.metadata ?? {}), evidence_items: updated } },
      `Evidência adicionada em "${front.name}"`,
      evidenceLabel.trim()
    );
    setEvidenceLabel("");
    setEvidenceUrl("");
    setEvidenceNote("");
    setShowEvidenceForm(false);
  };

  const handleRemoveEvidence = async (idx: number) => {
    const updated = evidenceItems.filter((_, i) => i !== idx);
    await updateFront(
      { metadata: { ...(front.metadata ?? {}), evidence_items: updated } }
    );
  };

  const handleLinkTask = async (taskId: string) => {
    // Update task metadata to link it
    const { data: task } = await supabase.from("tasks").select("metadata").eq("id", taskId).single();
    const existingMeta = (task?.metadata as Record<string, unknown>) ?? {};
    await supabase.from("tasks").update({
      metadata: { ...existingMeta, operational_front_id: front.id },
    }).eq("id", taskId);
    toast({ title: "Task vinculada à frente" });
    fetchLinkedTasks();
  };

  const scopeClass = (front.scope_classification ?? "in_plan") as ScopeClassification;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {front.name}
            <Badge variant="outline" className={`text-[10px] ${getBucketColor(front.bucket_status)}`}>
              {getBucketLabel(front.bucket_status)}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Status & Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground text-xs">Status de Execução</span>
              <div className="flex items-center gap-2 mt-1">
                <Select value={front.execution_status} onValueChange={(v) => handleStatusChange(v as ExecutionStatus)}>
                  <SelectTrigger className="h-8 w-[180px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXECUTION_STATUS_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground text-xs">Escopo</span>
              <div className="mt-1">
                <Badge variant="outline" className={`text-[10px] ${getScopeColor(scopeClass)}`}>
                  {getScopeLabel(scopeClass)}
                </Badge>
              </div>
            </div>
          </div>

          {/* Block input */}
          {showBlockInput && (
            <div className="space-y-2 p-3 border rounded-md border-red-500/30 bg-red-500/5">
              <Label className="text-xs text-red-400">Motivo do bloqueio</Label>
              <Input value={blockReason} onChange={(e) => setBlockReason(e.target.value)} placeholder="Descreva o impedimento..." />
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={handleBlock} disabled={!blockReason.trim()}>
                  <Lock className="h-3.5 w-3.5 mr-1" /> Bloquear
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowBlockInput(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {/* Blocked banner */}
          {front.execution_status === "blocked" && front.blocked_reason && (
            <div className="flex items-start gap-2 p-3 rounded-md border border-red-500/30 bg-red-500/5">
              <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-red-400 font-medium">Bloqueada</p>
                <p className="text-xs text-red-300">{front.blocked_reason}</p>
              </div>
              <Button size="sm" variant="outline" className="shrink-0" onClick={handleUnblock}>
                <Unlock className="h-3.5 w-3.5 mr-1" /> Desbloquear
              </Button>
            </div>
          )}

          {/* Objective & outcome */}
          {front.objective && (
            <div>
              <span className="text-xs text-muted-foreground">Objetivo</span>
              <p className="text-sm mt-0.5">{front.objective}</p>
            </div>
          )}
          {front.expected_outcome && (
            <div>
              <span className="text-xs text-muted-foreground">Resultado Esperado</span>
              <p className="text-sm mt-0.5">{front.expected_outcome}</p>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-2">
            {front.execution_status !== "in_progress" && front.execution_status !== "blocked" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("in_progress")}>
                <Play className="h-3.5 w-3.5 mr-1" /> Iniciar
              </Button>
            )}
            {front.execution_status === "in_progress" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("paused")}>
                <Pause className="h-3.5 w-3.5 mr-1" /> Pausar
              </Button>
            )}
            {front.execution_status !== "done" && front.execution_status !== "blocked" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("in_validation")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Validar
              </Button>
            )}
            {front.execution_status === "in_validation" && (
              <Button size="sm" onClick={() => handleStatusChange("done")}>
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Concluir
              </Button>
            )}
            {front.execution_status === "done" && (
              <Button size="sm" variant="outline" onClick={() => handleStatusChange("reopened")}>
                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reabrir
              </Button>
            )}
          </div>

          <Separator />

          {/* Progress */}
          <div>
            <span className="text-xs text-muted-foreground">Progresso</span>
            {totalLinked > 0 ? (
              <div className="mt-1 space-y-1">
                <Progress value={progressPct} className="h-2" />
                <p className="text-[10px] text-muted-foreground">{doneLinked}/{totalLinked} tasks concluídas ({progressPct}%)</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {front.execution_status === "not_started" ? "Não iniciada" :
                 front.execution_status === "done" ? "Concluída" :
                 getExecutionLabel(front.execution_status)}
                {" — sem tasks vinculadas para cálculo de progresso"}
              </p>
            )}
          </div>

          <Separator />

          {/* Linked tasks */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Tasks Vinculadas</span>
              <LinkTaskButton workspaceId={workspaceId} frontId={front.id} onLink={handleLinkTask} />
            </div>
            {loadingTasks ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : linkedTasks.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma task vinculada ainda.</p>
            ) : (
              <div className="space-y-1">
                {linkedTasks.map((t) => (
                  <div key={t.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/30">
                    <Badge variant="outline" className={`text-[10px] px-1 py-0 ${getStatusColor(t.status)}`}>
                      {getStatusLabel(t.status)}
                    </Badge>
                    <span className="truncate flex-1">{t.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          {/* Evidence */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground font-medium">Evidências</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowEvidenceForm(!showEvidenceForm)}>
                <Plus className="h-3 w-3 mr-1" /> Adicionar
              </Button>
            </div>

            {showEvidenceForm && (
              <div className="space-y-2 p-3 border rounded-md mb-3">
                <Input value={evidenceLabel} onChange={(e) => setEvidenceLabel(e.target.value)} placeholder="Título da evidência" />
                <Input value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} placeholder="URL (opcional)" />
                <Textarea value={evidenceNote} onChange={(e) => setEvidenceNote(e.target.value)} placeholder="Nota (opcional)" rows={2} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleAddEvidence} disabled={!evidenceLabel.trim()}>Salvar</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowEvidenceForm(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {evidenceItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma evidência registrada.</p>
            ) : (
              <div className="space-y-1.5">
                {evidenceItems.map((ev, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/30 text-xs group">
                    {ev.url ? <ExternalLink className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" /> : <FileText className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />}
                    <div className="flex-1 min-w-0">
                      {ev.url ? (
                        <a href={ev.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{ev.label}</a>
                      ) : (
                        <span>{ev.label}</span>
                      )}
                      {ev.note && <p className="text-muted-foreground mt-0.5">{ev.note}</p>}
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {new Date(ev.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveEvidence(i)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Origin metadata */}
          {front.metadata && (front.metadata as Record<string, unknown>).plan_name && (
            <>
              <Separator />
              <div>
                <span className="text-xs text-muted-foreground font-medium">Origem Estratégica</span>
                <div className="mt-1 space-y-0.5 text-[10px] text-muted-foreground">
                  {(front.metadata as Record<string, unknown>).plan_name && (
                    <p>Plano: {String((front.metadata as Record<string, unknown>).plan_name)}</p>
                  )}
                  {(front.metadata as Record<string, unknown>).dossier_blocks && (
                    <p>Dossiê: {((front.metadata as Record<string, unknown>).dossier_blocks as string[])?.join(", ")}</p>
                  )}
                  {(front.metadata as Record<string, unknown>).generation_mode && (
                    <p>Gerada por: {String((front.metadata as Record<string, unknown>).generation_mode)}</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── Inline Link Task Mini-Component ─── */

function LinkTaskButton({ workspaceId, frontId, onLink }: { workspaceId: string; frontId: string; onLink: (taskId: string) => void }) {
  const [showPicker, setShowPicker] = useState(false);
  const [availableTasks, setAvailableTasks] = useState<Array<{ id: string; title: string; metadata: Record<string, unknown> | null }>>([]);

  const loadTasks = async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, metadata")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    // Filter out already linked
    const unlinked = (data ?? []).filter((t) => {
      const meta = t.metadata as Record<string, unknown> | null;
      return !meta?.operational_front_id || meta.operational_front_id !== frontId;
    });
    setAvailableTasks(unlinked);
    setShowPicker(true);
  };

  if (showPicker) {
    return (
      <div className="space-y-1">
        <div className="max-h-32 overflow-y-auto border rounded p-1 space-y-0.5">
          {availableTasks.length === 0 ? (
            <p className="text-[10px] text-muted-foreground p-1">Nenhuma task disponível</p>
          ) : (
            availableTasks.map((t) => (
              <button
                key={t.id}
                onClick={() => { onLink(t.id); setShowPicker(false); }}
                className="w-full text-left text-[11px] p-1 rounded hover:bg-muted/50 truncate"
              >
                {t.title}
              </button>
            ))
          )}
        </div>
        <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => setShowPicker(false)}>Fechar</Button>
      </div>
    );
  }

  return (
    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={loadTasks}>
      <Link2 className="h-3 w-3 mr-1" /> Vincular Task
    </Button>
  );
}
