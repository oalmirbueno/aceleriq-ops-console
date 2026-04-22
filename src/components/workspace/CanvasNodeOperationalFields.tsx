import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BarChart3, Link2, ListPlus, Loader2, Save, Sparkles, Trophy, Wand2, X, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import {
  getChecklistTemplate,
  getProjectTypeMeta,
  projectKindToDbNodeType,
  type ProjectNodeKind,
} from "./canvasProjectTypes";
import { readCanvasOperationalMeta, type ApprovalStatus, type CanvasOperationalMeta } from "./canvasOperationalMeta";

interface RelatedTask {
  id: string;
  title: string;
  status: string;
  priority: string | null;
  metadata: Record<string, unknown> | null;
}

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  workspaceId: string;
  clientId?: string | null;
  availableNodes?: Array<CanvasNodeRecord & { parent_node_id?: string | null }>;
  onUpdated?: () => Promise<void> | void;
}

const approvalOptions: Array<{ value: ApprovalStatus; label: string }> = [
  { value: "not_required", label: "Não exige" },
  { value: "pending", label: "Pendente" },
  { value: "approved", label: "Aprovada" },
  { value: "rejected", label: "Reprovada" },
];

type ProofNodeKind = "metrica" | "before_after" | "case";

const proofButtons: Array<{ kind: ProofNodeKind; label: string; icon: LucideIcon }> = [
  { kind: "metrica", label: "Criar KPI", icon: BarChart3 },
  { kind: "before_after", label: "Criar before/after", icon: Sparkles },
  { kind: "case", label: "Criar case", icon: Trophy },
];

function taskLinkedToNode(task: RelatedTask, nodeId: string) {
  return task.metadata?.canvas_node_id === nodeId || task.metadata?.source_node_id === nodeId;
}

function sourceKindOf(node: CanvasNodeRecord) {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return (data.kind as string | undefined) ?? node.node_type;
}

export default function CanvasNodeOperationalFields({ node, workspaceId, clientId, availableNodes = [], onUpdated }: Props) {
  const currentData = (node.data ?? {}) as Record<string, unknown>;
  const [meta, setMeta] = useState<CanvasOperationalMeta>(() => readCanvasOperationalMeta(currentData));
  const [handoff, setHandoff] = useState(String(currentData.operational_handoff ?? ""));
  const [evidenceDraft, setEvidenceDraft] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [tasks, setTasks] = useState<RelatedTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [saving, setSaving] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [proofBusy, setProofBusy] = useState<"metrica" | "before_after" | "case" | "all" | null>(null);

  useEffect(() => {
    const data = (node.data ?? {}) as Record<string, unknown>;
    setMeta(readCanvasOperationalMeta(data));
    setHandoff(String(data.operational_handoff ?? ""));
    setEvidenceDraft("");
    setTaskTitle("");
    setSelectedTaskId("");
  }, [node]);

  const relatedTasks = useMemo(() => tasks.filter((task) => taskLinkedToNode(task, node.id)), [tasks, node.id]);
  const unlinkedTasks = useMemo(() => tasks.filter((task) => !taskLinkedToNode(task, node.id)), [tasks, node.id]);
  const currentStage = ((node.data as Record<string, unknown> | null)?.stage as string | undefined) ?? null;
  const currentKind = sourceKindOf(node);
  const canGenerateProof = !["metrica", "before_after", "case"].includes(currentKind);

  const fetchTasks = useCallback(async () => {
    const { data } = await supabase
      .from("tasks")
      .select("id, title, status, priority, metadata")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(80);
    setTasks((data ?? []) as RelatedTask[]);
  }, [workspaceId]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks, node.id]);

  const updateMeta = (patch: Partial<CanvasOperationalMeta>) => setMeta((prev) => ({ ...prev, ...patch }));

  const addEvidence = () => {
    const url = evidenceDraft.trim();
    if (!url) return;
    updateMeta({ evidenceLinks: [...(meta.evidenceLinks ?? []), url] });
    setEvidenceDraft("");
  };

  const removeEvidence = (url: string) => {
    updateMeta({ evidenceLinks: (meta.evidenceLinks ?? []).filter((item) => item !== url) });
  };

  const toggleDependency = (id: string) => {
    const current = meta.dependencyNodeIds ?? [];
    updateMeta({ dependencyNodeIds: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] });
  };

  const saveOperational = async () => {
    setSaving(true);
    const nextData = { ...currentData, operationalMeta: meta, operational_handoff: handoff.trim() || null };
    const { error } = await supabase
      .from("canvas_nodes")
      .update({ data: nextData, updated_at: new Date().toISOString() })
      .eq("id", node.id);
    setSaving(false);
    if (error) {
      return toast({ title: "Erro ao salvar operação", description: error.message, variant: "destructive" });
    }
    toast({ title: "Operação do node salva" });
    await onUpdated?.();
  };

  const createTaskFromNode = async () => {
    if (!clientId) {
      return toast({ title: "Cliente não vinculado", description: "Associe o node a uma pasta de cliente para criar task." });
    }

    const title = taskTitle.trim() || node.title;
    setTaskBusy(true);
    const { error } = await supabase.from("tasks").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      title,
      description: node.description ?? (handoff || null),
      status: "todo",
      priority: "medium",
      stage: currentStage,
      due_date: meta.dueDate ?? null,
      source_type: "canvas",
      source_id: node.id,
      metadata: {
        canvas_node_id: node.id,
        canvas_node_title: node.title,
        source_node_kind: currentKind,
        origin: "canvas_node_drawer",
      },
    });
    setTaskBusy(false);

    if (error) {
      return toast({ title: "Erro ao criar task", description: error.message, variant: "destructive" });
    }

    toast({ title: "Task criada a partir do node" });
    setTaskTitle("");
    await fetchTasks();
  };

  const linkExistingTask = async () => {
    if (!selectedTaskId) return;

    setTaskBusy(true);
    const task = tasks.find((item) => item.id === selectedTaskId);
    const { error } = await supabase
      .from("tasks")
      .update({
        metadata: {
          ...(task?.metadata ?? {}),
          canvas_node_id: node.id,
          canvas_node_title: node.title,
          source_node_kind: currentKind,
        },
        source_type: task?.metadata?.source_type ? undefined : "canvas",
        source_id: node.id,
      })
      .eq("id", selectedTaskId);
    setTaskBusy(false);

    if (error) {
      return toast({ title: "Erro ao vincular task", description: error.message, variant: "destructive" });
    }

    toast({ title: "Task vinculada ao node" });
    setSelectedTaskId("");
    await fetchTasks();
  };

  const createProofNode = useCallback(async (kind: "metrica" | "before_after" | "case") => {
    if (!clientId) {
      return toast({
        title: "Cliente não vinculado",
        description: "Associe o node a uma pasta de cliente para criar provas e cases da entrega.",
        variant: "destructive",
      });
    }

    if (!canGenerateProof) {
      return toast({
        title: "Esse node já é uma prova",
        description: "Use a trilha de prova a partir do node de entrega original para evitar loops visuais no canvas.",
      });
    }

    const metaCfg = getProjectTypeMeta(kind);
    if (!metaCfg) return;

    setProofBusy(kind);

    const positionOffset = kind === "metrica" ? 280 : kind === "before_after" ? 560 : 840;
    const descriptionMap: Record<typeof kind, string> = {
      metrica: `KPI e evidência quantitativa gerados a partir de ${node.title}.`,
      before_after: `Comparativo antes/depois derivado da entrega ${node.title}.`,
      case: `Case operacional construído com base na entrega ${node.title} e seus KPIs.`,
    };

    const insertPayload = {
      workspace_id: workspaceId,
      client_id: clientId,
      node_type: projectKindToDbNodeType(kind),
      title: `${metaCfg.titleTemplate}: ${node.title}`,
      status: "draft",
      description: descriptionMap[kind],
      pos_x: Number(node.pos_x ?? 0) + positionOffset,
      pos_y: Number(node.pos_y ?? 0),
      parent_node_id: node.parent_node_id ?? null,
      data: {
        kind,
        stage: metaCfg.defaultStage,
        checklist: getChecklistTemplate(kind),
        proofSource: {
          source_node_id: node.id,
          source_node_title: node.title,
          source_node_kind: currentKind,
        },
      } as Record<string, unknown>,
    };

    const { data: createdNode, error } = await supabase
      .from("canvas_nodes")
      .insert(insertPayload)
      .select()
      .single();

    if (error || !createdNode) {
      setProofBusy(null);
      return toast({ title: `Erro ao criar ${metaCfg.shortLabel.toLowerCase()}`, description: error?.message, variant: "destructive" });
    }

    const { error: edgeError } = await supabase.from("canvas_edges").insert({
      workspace_id: workspaceId,
      source_node_id: node.id,
      target_node_id: (createdNode as CanvasNodeRecord).id,
      edge_type: "proof",
      label: kind === "metrica" ? "mede" : kind === "before_after" ? "compara" : "prova",
    });

    setProofBusy(null);

    if (edgeError) {
      return toast({
        title: `${metaCfg.shortLabel} criado com ressalva`,
        description: `O node foi criado, mas a conexão visual falhou: ${edgeError.message}`,
        variant: "destructive",
      });
    }

    toast({
      title: `${metaCfg.shortLabel} criado`,
      description: `Node conectado a ${node.title} para consolidar KPI, prova e narrativa da entrega.`,
    });
    await onUpdated?.();
  }, [canGenerateProof, clientId, currentKind, node.id, node.parent_node_id, node.pos_x, node.pos_y, node.title, onUpdated, workspaceId]);

  const createProofTrail = useCallback(async () => {
    if (!clientId) {
      return toast({
        title: "Cliente não vinculado",
        description: "Associe o node a uma pasta de cliente para gerar trilha de prova.",
        variant: "destructive",
      });
    }

    if (!canGenerateProof) {
      return toast({
        title: "Esse node já é uma prova",
        description: "Gere KPI, before/after e case a partir do node de entrega original.",
      });
    }

    setProofBusy("all");

    const trailKinds: Array<"metrica" | "before_after" | "case"> = ["metrica", "before_after", "case"];
    let previousId = node.id;

    for (const [index, kind] of trailKinds.entries()) {
      const metaCfg = getProjectTypeMeta(kind);
      if (!metaCfg) continue;

      const { data: createdNode, error } = await supabase
        .from("canvas_nodes")
        .insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_type: projectKindToDbNodeType(kind),
          title: `${metaCfg.titleTemplate}: ${node.title}`,
          status: "draft",
          description: kind === "metrica"
            ? `KPIs da entrega ${node.title}.`
            : kind === "before_after"
              ? `Comparativo antes/depois da entrega ${node.title}.`
              : `Case visual e comercial da entrega ${node.title}.`,
          pos_x: Number(node.pos_x ?? 0) + 280 * (index + 1),
          pos_y: Number(node.pos_y ?? 0) + (index === 2 ? 110 : 0),
          parent_node_id: node.parent_node_id ?? null,
          data: {
            kind,
            stage: metaCfg.defaultStage,
            checklist: getChecklistTemplate(kind),
            proofSource: {
              source_node_id: node.id,
              source_node_title: node.title,
              source_node_kind: currentKind,
            },
          } as Record<string, unknown>,
        })
        .select()
        .single();

      if (error || !createdNode) {
        setProofBusy(null);
        return toast({ title: "Erro ao gerar trilha de prova", description: error?.message, variant: "destructive" });
      }

      await supabase.from("canvas_edges").insert({
        workspace_id: workspaceId,
        source_node_id: previousId,
        target_node_id: (createdNode as CanvasNodeRecord).id,
        edge_type: "proof",
        label: kind === "metrica" ? "mede" : kind === "before_after" ? "compara" : "prova",
      });

      previousId = (createdNode as CanvasNodeRecord).id;
    }

    setProofBusy(null);
    toast({
      title: "Trilha de prova criada",
      description: "KPIs, before/after e case foram adicionados ao fluxo para provar a entrega visualmente.",
    });
    await onUpdated?.();
  }, [canGenerateProof, clientId, currentKind, node.id, node.parent_node_id, node.pos_x, node.pos_y, node.title, onUpdated, workspaceId]);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Owner</Label>
          <Input value={meta.ownerName ?? ""} onChange={(e) => updateMeta({ ownerName: e.target.value })} placeholder="Responsável" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Prazo</Label>
          <Input type="date" value={meta.dueDate ?? ""} onChange={(e) => updateMeta({ dueDate: e.target.value || null })} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Aprovação</Label>
          <Select value={meta.approvalStatus ?? "not_required"} onValueChange={(v) => updateMeta({ approvalStatus: v as ApprovalStatus })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {approvalOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Motivo de bloqueio</Label>
          <Input value={meta.blockedReason ?? ""} onChange={(e) => updateMeta({ blockedReason: e.target.value || null })} placeholder="Se estiver bloqueado" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Handoff / observação operacional</Label>
        <Textarea value={handoff} onChange={(e) => setHandoff(e.target.value)} rows={4} placeholder="O que a próxima pessoa precisa saber para continuar sem ruído..." />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Evidências</Label>
        <div className="flex gap-2">
          <Input value={evidenceDraft} onChange={(e) => setEvidenceDraft(e.target.value)} placeholder="https://..." />
          <Button type="button" variant="outline" onClick={addEvidence}>Adicionar</Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {(meta.evidenceLinks ?? []).map((url) => (
            <Badge key={url} variant="outline" className="gap-1 text-[10px]">
              <Link2 className="h-2.5 w-2.5" />
              {url.slice(0, 32)}
              <button type="button" onClick={() => removeEvidence(url)}>
                <X className="h-2.5 w-2.5" />
              </button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Dependências</Label>
        <div className="flex flex-wrap gap-1">
          {availableNodes.filter((item) => item.id !== node.id).map((item) => {
            const active = (meta.dependencyNodeIds ?? []).includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleDependency(item.id)}
                className={`rounded-md border px-2 py-1 text-[10px] transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/60"}`}
              >
                {item.title}
              </button>
            );
          })}
        </div>
      </div>

      <Button size="sm" onClick={saveOperational} disabled={saving}>
        {saving ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1 h-3.5 w-3.5" />}
        Salvar operação
      </Button>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label className="text-sm font-medium">Prova da entrega</Label>
            <p className="text-xs text-muted-foreground">
              Transforme entregas em KPI, before/after e case diretamente no fluxo do canvas.
            </p>
          </div>
          <Badge variant="outline" className="text-[9px]">{currentKind}</Badge>
        </div>

        <div className="flex flex-wrap gap-2">
          {proofButtons.map((item) => {
            const Icon = item.icon;
            const busy = proofBusy === item.kind;
            return (
              <Button key={item.kind} type="button" variant="outline" size="sm" onClick={() => createProofNode(item.kind)} disabled={!!proofBusy || !canGenerateProof}>
                {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Icon className="mr-1 h-3.5 w-3.5" />}
                {item.label}
              </Button>
            );
          })}
          <Button type="button" size="sm" onClick={createProofTrail} disabled={!!proofBusy || !canGenerateProof}>
            {proofBusy === "all" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1 h-3.5 w-3.5" />}
            Gerar trilha de prova
          </Button>
        </div>
        {!canGenerateProof && (
          <p className="text-[11px] text-muted-foreground">
            Este node já pertence à camada de prova. Continue a narrativa a partir da entrega original.
          </p>
        )}
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ListPlus className="h-4 w-4 text-primary" />
          <Label className="text-sm font-medium">Tasks relacionadas</Label>
        </div>

        <div className="space-y-1">
          {relatedTasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma task vinculada.</p>
          ) : (
            relatedTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between rounded-md border border-border px-2 py-1.5 text-xs">
                <span className="truncate">{task.title}</span>
                <Badge variant="outline" className="text-[9px]">{task.status}</Badge>
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2">
          <Input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} placeholder={`Task: ${node.title}`} />
          <Button onClick={createTaskFromNode} disabled={taskBusy}>{taskBusy ? "..." : "Criar"}</Button>
        </div>

        <div className="flex gap-2">
          <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
            <SelectTrigger>
              <SelectValue placeholder="Vincular task existente" />
            </SelectTrigger>
            <SelectContent>
              {unlinkedTasks.map((task) => (
                <SelectItem key={task.id} value={task.id}>{task.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={linkExistingTask} disabled={!selectedTaskId || taskBusy}>Vincular</Button>
        </div>
      </div>
    </div>
  );
}
