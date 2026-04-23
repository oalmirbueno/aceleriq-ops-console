/**
 * FunnelEditorDrawer
 *
 * Drawer especializado pro node tipo "funil":
 *  - Cria/carrega o client_funnels vinculado ao node (1:1)
 *  - Lista funnel_steps em pipeline vertical reordenável
 *  - Cada step → FunnelStepCard expansível (config, métricas, checklist, vínculo)
 *  - Steps de lógica podem ramificar via funnel_branches
 *  - Header com nome, objetivo, tipo, conversão total calculada
 *
 * Persistência: client_funnels + funnel_steps + funnel_branches.
 * Vínculo com canvas: linked_node_id em cada step aponta pra outro node do workspace.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Workflow, Plus, Loader2, X, Trash2, ArrowDown, TrendingUp, Target,
  Sparkles, ListTodo,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  FUNNEL_BLOCKS, blocksByFamily, getFamilyMeta, getFunnelBlock,
  calculateFunnelConversion, computeFunnelKpis, FUNNEL_TEMPLATES,
  type FunnelBlockKind, type FunnelTemplate,
} from "./funnelBlocks";
import FunnelStepCard, {
  type FunnelStepRow, type FunnelBranchRow, type LinkableNodeOption,
} from "./FunnelStepCard";
import FunnelConeView from "./FunnelConeView";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface FunnelRow {
  id: string;
  workspace_id: string;
  client_id: string;
  node_id: string | null;
  name: string;
  goal: string | null;
  funnel_type: string | null;
  metrics: Record<string, unknown>;
  notes: string | null;
}

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName: string;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function FunnelEditorDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [funnel, setFunnel] = useState<FunnelRow | null>(null);
  const [steps, setSteps] = useState<FunnelStepRow[]>([]);
  const [branches, setBranches] = useState<FunnelBranchRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkableNodes, setLinkableNodes] = useState<LinkableNodeOption[]>([]);

  // ─── Load / bootstrap funnel ────────────────────────────────────────
  const loadFunnel = useCallback(async () => {
    setLoading(true);
    // 1. Tenta achar funil já vinculado ao node
    const { data: existing, error: fErr } = await supabase
      .from("client_funnels" as never)
      .select("*")
      .eq("node_id", node.id)
      .maybeSingle();
    if (fErr) {
      console.error("loadFunnel error:", fErr);
      toast({ title: "Falha ao carregar funil", description: fErr.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    let row = existing as FunnelRow | null;
    // 2. Se não existe, cria um novo vinculado ao node
    if (!row) {
      const { data: created, error: cErr } = await supabase
        .from("client_funnels" as never)
        .insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_id: node.id,
          name: node.title || "Funil sem nome",
        })
        .select("*")
        .maybeSingle();
      if (cErr) {
        toast({ title: "Falha ao criar funil", description: cErr.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      row = created as FunnelRow;
    }
    setFunnel(row);

    // 3. Carrega steps + branches
    const [stepsRes, branchesRes, nodesRes] = await Promise.all([
      supabase.from("funnel_steps" as never).select("*").eq("funnel_id", row.id).order("position", { ascending: true, nullsFirst: false }),
      supabase.from("funnel_branches" as never).select("*").eq("funnel_id", row.id),
      supabase.from("canvas_nodes").select("id,title,node_type").eq("workspace_id", workspaceId).neq("id", node.id),
    ]);
    setSteps((stepsRes.data ?? []) as FunnelStepRow[]);
    setBranches((branchesRes.data ?? []) as FunnelBranchRow[]);
    setLinkableNodes((nodesRes.data ?? []) as LinkableNodeOption[]);
    setLoading(false);
  }, [node.id, node.title, workspaceId, clientId]);

  useEffect(() => { if (open) loadFunnel(); }, [open, loadFunnel]);

  // ─── Funnel metadata patch ──────────────────────────────────────────
  const patchFunnel = async (patch: Partial<FunnelRow>) => {
    if (!funnel) return;
    setFunnel({ ...funnel, ...patch });
    const { error } = await supabase
      .from("client_funnels" as never)
      .update(patch)
      .eq("id", funnel.id);
    if (error) toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
  };

  // ─── Steps CRUD ─────────────────────────────────────────────────────
  const addStep = async (kind: FunnelBlockKind) => {
    if (!funnel) return;
    const meta = getFunnelBlock(kind);
    const nextPos = (steps[steps.length - 1]?.position ?? -1) + 1;
    const checklistTemplate = meta.checklistTemplate.map((t) => ({
      id: crypto.randomUUID(), text: t, done: false,
    }));
    const { data, error } = await supabase
      .from("funnel_steps" as never)
      .insert({
        funnel_id: funnel.id,
        workspace_id: workspaceId,
        position: nextPos,
        block_kind: kind,
        title: meta.label,
        checklist: checklistTemplate,
      })
      .select("*")
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Falha ao adicionar bloco", description: error?.message, variant: "destructive" });
      return;
    }
    setSteps((prev) => [...prev, data as FunnelStepRow]);
    setExpandedId((data as FunnelStepRow).id);
  };

  const patchStep = async (id: string, patch: Partial<FunnelStepRow>) => {
    setSteps((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
    const { error } = await supabase.from("funnel_steps" as never).update(patch).eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
  };

  const deleteStep = async (id: string) => {
    if (!confirm("Remover esta etapa do funil?")) return;
    setSteps((prev) => prev.filter((s) => s.id !== id));
    setBranches((prev) => prev.filter((b) => b.from_step_id !== id && b.to_step_id !== id));
    const { error } = await supabase.from("funnel_steps" as never).delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
  };

  const moveStep = async (id: string, dir: "up" | "down") => {
    const idx = steps.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= steps.length) return;
    const next = [...steps];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    // reassign positions
    const reordered = next.map((s, i) => ({ ...s, position: i }));
    setSteps(reordered);
    // persist both
    await Promise.all([
      supabase.from("funnel_steps" as never).update({ position: reordered[idx].position }).eq("id", reordered[idx].id),
      supabase.from("funnel_steps" as never).update({ position: reordered[swap].position }).eq("id", reordered[swap].id),
    ]);
  };

  const changeStepKind = async (id: string, kind: FunnelBlockKind) => {
    await patchStep(id, { block_kind: kind, config: {}, metrics: {} });
  };

  // ─── Aplicar template (cria múltiplos steps de uma vez) ─────────────
  const applyTemplate = async (template: FunnelTemplate) => {
    if (!funnel) return;
    const startPos = (steps[steps.length - 1]?.position ?? -1) + 1;
    const rows = template.steps.map((t, i) => {
      const meta = getFunnelBlock(t.kind);
      return {
        funnel_id: funnel.id,
        workspace_id: workspaceId,
        position: startPos + i,
        block_kind: t.kind,
        title: t.title,
        description: t.description ?? null,
        conversion_rate: t.conversion_rate ?? null,
        config: t.config ?? {},
        checklist: meta.checklistTemplate.map((text) => ({
          id: crypto.randomUUID(), text, done: false,
        })),
      };
    });
    const { data, error } = await supabase
      .from("funnel_steps" as never)
      .insert(rows)
      .select("*");
    if (error) {
      toast({ title: "Falha ao aplicar template", description: error.message, variant: "destructive" });
      return;
    }
    setSteps((prev) => [...prev, ...((data ?? []) as FunnelStepRow[])]);
    toast({ title: `Template "${template.name}" aplicado`, description: `${rows.length} etapas adicionadas` });
  };

  // ─── Branches CRUD ──────────────────────────────────────────────────
  const addBranch = async (fromStepId: string, toStepId: string, condition: FunnelBranchRow["condition"]) => {
    if (!funnel) return;
    // upsert por (from_step_id, condition) — unique constraint
    const existing = branches.find((b) => b.from_step_id === fromStepId && b.condition === condition);
    if (existing) {
      await supabase.from("funnel_branches" as never).update({ to_step_id: toStepId }).eq("id", existing.id);
      setBranches((prev) => prev.map((b) => b.id === existing.id ? { ...b, to_step_id: toStepId } : b));
      return;
    }
    const { data, error } = await supabase
      .from("funnel_branches" as never)
      .insert({ funnel_id: funnel.id, from_step_id: fromStepId, to_step_id: toStepId, condition })
      .select("*")
      .maybeSingle();
    if (error || !data) {
      toast({ title: "Falha ao criar ramificação", description: error?.message, variant: "destructive" });
      return;
    }
    setBranches((prev) => [...prev, data as FunnelBranchRow]);
  };

  const removeBranch = async (id: string) => {
    setBranches((prev) => prev.filter((b) => b.id !== id));
    await supabase.from("funnel_branches" as never).delete().eq("id", id);
  };

  // ─── Computed: total conversion ─────────────────────────────────────
  const totalConv = useMemo(() => calculateFunnelConversion(steps), [steps]);
  const kpis = useMemo(() => computeFunnelKpis(steps), [steps]);

  // Itens de checklist pendentes em todos os steps
  const pendingChecklist = useMemo(() => {
    const out: Array<{ stepId: string; stepTitle: string; blockKind: string; itemId: string; text: string }> = [];
    for (const s of steps) {
      const list = Array.isArray(s.checklist) ? s.checklist : [];
      for (const item of list) {
        if (!item?.done && item?.text?.trim()) {
          out.push({
            stepId: s.id,
            stepTitle: s.title || getFunnelBlock(s.block_kind as FunnelBlockKind).label,
            blockKind: s.block_kind,
            itemId: item.id,
            text: item.text.trim(),
          });
        }
      }
    }
    return out;
  }, [steps]);

  const [generatingTasks, setGeneratingTasks] = useState(false);

  const generateTasksFromChecklists = useCallback(async () => {
    if (!funnel || pendingChecklist.length === 0) return;
    setGeneratingTasks(true);
    try {
      // Dedupe: evita recriar tasks já geradas pra mesmo (funnel_id, step_id, checklist_item_id)
      const { data: existing } = await supabase
        .from("tasks")
        .select("metadata")
        .eq("workspace_id", workspaceId)
        .eq("client_id", clientId)
        .eq("source_type", "funnel_checklist");
      const existingKeys = new Set<string>(
        (existing ?? [])
          .map((r: { metadata: unknown }) => {
            const m = (r.metadata ?? {}) as Record<string, unknown>;
            return m.funnel_id && m.step_id && m.checklist_item_id
              ? `${m.funnel_id}|${m.step_id}|${m.checklist_item_id}`
              : null;
          })
          .filter((v): v is string => !!v),
      );

      const fresh = pendingChecklist.filter(
        (it) => !existingKeys.has(`${funnel.id}|${it.stepId}|${it.itemId}`),
      );
      if (fresh.length === 0) {
        toast({
          title: "Nada novo pra gerar",
          description: "Todos os itens pendentes já viraram tasks anteriormente.",
        });
        return;
      }

      const rows = fresh.map((it) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        title: it.text,
        description: `Etapa "${it.stepTitle}" do funil "${funnel.name}".`,
        status: "todo",
        priority: "medium",
        stage: "producao",
        due_date: null,
        assignee_id: null,
        source_type: "funnel_checklist",
        source_id: funnel.id,
        metadata: {
          generation_mode: "from_funnel_checklist",
          funnel_id: funnel.id,
          step_id: it.stepId,
          step_title: it.stepTitle,
          block_kind: it.blockKind,
          checklist_item_id: it.itemId,
        },
      }));

      const { error } = await supabase.from("tasks").insert(rows);
      if (error) {
        toast({ title: "Erro ao gerar tasks", description: error.message, variant: "destructive" });
        return;
      }

      // Timeline event
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "task_created",
        title: `${fresh.length} task${fresh.length > 1 ? "s" : ""} gerada${fresh.length > 1 ? "s" : ""} do funil`,
        description: `Funil "${funnel.name}" — itens de checklist convertidos em tasks.`,
        happened_at: new Date().toISOString(),
      });

      toast({
        title: `${fresh.length} task${fresh.length > 1 ? "s criadas" : " criada"}`,
        description: "Disponíveis na aba Tasks do workspace.",
      });
    } finally {
      setGeneratingTasks(false);
    }
  }, [funnel, pendingChecklist, workspaceId, clientId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border border-white/10 max-w-4xl w-full max-h-[88vh] flex flex-col overflow-hidden sm:rounded-2xl"
        style={{
          background: "rgba(9,17,10,0.92)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)",
        }}
      >
        <DialogTitle className="sr-only">{funnel?.name ?? node.title}</DialogTitle>
        {/* ─── Header (pr-12 to leave room for built-in X) ─── */}
        <div className="px-5 pt-5 pb-3 border-b border-white/8 space-y-3 pr-12">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="h-10 w-10 rounded-lg border-2 border-border bg-muted/10 flex items-center justify-center shrink-0">
                <Workflow className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold truncate">{funnel?.name ?? node.title}</h2>
                  <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                    L · Planejamento
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Editor visual do funil de <span className="text-foreground/80">{clientName}</span>.
                  Arraste etapas, vincule a assets e mapeie conversões.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px] border-border text-muted-foreground hover:bg-muted/10 disabled:opacity-50"
                onClick={generateTasksFromChecklists}
                disabled={generatingTasks || pendingChecklist.length === 0}
                title={
                  pendingChecklist.length === 0
                    ? "Nenhum item de checklist pendente"
                    : `Gerar ${pendingChecklist.length} task${pendingChecklist.length > 1 ? "s" : ""}`
                }
              >
                {generatingTasks ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ListTodo className="h-3 w-3" />
                )}
                Gerar tarefas
                {pendingChecklist.length > 0 && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px] border-border text-muted-foreground">
                    {pendingChecklist.length}
                  </Badge>
                )}
              </Button>
              {onDelete && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                  onClick={() => { onDelete(node.id); onOpenChange(false); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* Funnel metadata bar */}
          {funnel && (
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-0.5">
                <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Nome</Label>
                <Input
                  value={funnel.name}
                  onChange={(e) => setFunnel({ ...funnel, name: e.target.value })}
                  onBlur={() => patchFunnel({ name: funnel.name })}
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[9px] uppercase tracking-wide text-muted-foreground">Tipo</Label>
                <Input
                  value={funnel.funnel_type ?? ""}
                  onChange={(e) => setFunnel({ ...funnel, funnel_type: e.target.value })}
                  onBlur={() => patchFunnel({ funnel_type: funnel.funnel_type })}
                  placeholder="lead-magnet, lançamento..."
                  className="h-7 text-xs"
                />
              </div>
              <div className="space-y-0.5">
                <Label className="text-[9px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                  <Target className="h-2.5 w-2.5" /> Objetivo
                </Label>
                <Input
                  value={funnel.goal ?? ""}
                  onChange={(e) => setFunnel({ ...funnel, goal: e.target.value })}
                  onBlur={() => patchFunnel({ goal: funnel.goal })}
                  placeholder="Ex: 100 leads/mês"
                  className="h-7 text-xs"
                />
              </div>
            </div>
          )}

          {/* KPIs */}
          <div className="flex items-center gap-2 text-[10px]">
            <Badge variant="outline" className="border-border text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-2.5 w-2.5" />
              Conv. total: {totalConv != null ? `${(totalConv * 100).toFixed(2)}%` : "—"}
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">
              {steps.length} etapa{steps.length !== 1 ? "s" : ""}
            </Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">
              {branches.length} ramificaç{branches.length !== 1 ? "ões" : "ão"}
            </Badge>
          </div>

          {/* KPIs agregados (receita / spend / CAC / ROI) */}
          {(kpis.revenue != null || kpis.spend != null || kpis.cac != null || kpis.roi != null) && (
            <div className="flex items-center gap-2 text-[10px] flex-wrap pt-1 border-t border-border">
              {kpis.revenue != null && (
                <Badge variant="outline" className="border-primary/30 text-primary tabular-nums">
                  Receita: R$ {kpis.revenue.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                </Badge>
              )}
              {kpis.spend != null && (
                <Badge variant="outline" className="border-border text-muted-foreground tabular-nums">
                  Spend: R$ {kpis.spend.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                </Badge>
              )}
              {kpis.cac != null && (
                <Badge variant="outline" className="border-border text-muted-foreground tabular-nums">
                  CAC: R$ {kpis.cac.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                </Badge>
              )}
              {kpis.roi != null && (
                <Badge variant="outline" className={cn(
                  "tabular-nums",
                  kpis.roi >= 0 ? "border-primary/30 text-primary" : "border-destructive/30 text-destructive",
                )}>
                  ROI: {(kpis.roi * 100).toFixed(0)}%
                </Badge>
              )}
              {kpis.ticketAvg != null && (
                <Badge variant="outline" className="border-border text-muted-foreground tabular-nums">
                  Ticket médio: R$ {kpis.ticketAvg.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* ─── Pipeline ─── */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : steps.length === 0 ? (
              <EmptyPipeline onAdd={addStep} onApplyTemplate={applyTemplate} />
            ) : (
              <>
                {/* Visão clássica em cone — proporcional ao volume */}
                <FunnelConeView
                  steps={steps}
                  highlightId={expandedId}
                  onPickStep={(id) => setExpandedId((cur) => (cur === id ? null : id))}
                />
                {steps.map((step, i) => (
                  <div key={step.id}>
                    <FunnelStepCard
                      step={step}
                      branches={branches}
                      allSteps={steps}
                      expanded={expandedId === step.id}
                      isFirst={i === 0}
                      isLast={i === steps.length - 1}
                      linkableNodes={linkableNodes}
                      clientId={clientId}
                      onToggleExpand={() => setExpandedId((cur) => cur === step.id ? null : step.id)}
                      onPatch={(patch) => patchStep(step.id, patch)}
                      onDelete={() => deleteStep(step.id)}
                      onMove={(dir) => moveStep(step.id, dir)}
                      onChangeKind={(k) => changeStepKind(step.id, k)}
                      onAddBranch={(toId, cond) => addBranch(step.id, toId, cond)}
                      onRemoveBranch={removeBranch}
                    />
                    {i < steps.length - 1 && (
                      <div className="flex justify-center py-1">
                        <ArrowDown className="h-3.5 w-3.5 text-muted-foreground/50" />
                      </div>
                    )}
                  </div>
                ))}

                {/* Add bottom */}
                <div className="pt-3">
                  <AddBlockPopover onPick={addStep} />
                </div>
              </>
            )}
          </div>

          {funnel && (
            <div className="px-5 pb-5">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Notas do funil</Label>
              <Textarea
                value={funnel.notes ?? ""}
                onChange={(e) => setFunnel({ ...funnel, notes: e.target.value })}
                onBlur={() => patchFunnel({ notes: funnel.notes })}
                placeholder="Hipóteses, aprendizados, próximos testes..."
                rows={3}
                className="text-xs resize-y mt-1"
              />
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────
function EmptyPipeline({
  onAdd, onApplyTemplate,
}: {
  onAdd: (k: FunnelBlockKind) => void;
  onApplyTemplate: (t: FunnelTemplate) => void;
}) {
  return (
    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center space-y-4">
      <Sparkles className="h-8 w-8 mx-auto text-muted-foreground" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Funil vazio</p>
        <p className="text-xs text-muted-foreground">Comece a partir de um template pronto ou adicione blocos manualmente.</p>
      </div>

      {/* Templates prontos */}
      <div className="space-y-2 text-left max-w-md mx-auto">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground text-center">
          Templates prontos
        </p>
        <div className="grid gap-1.5">
          {FUNNEL_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => onApplyTemplate(t)}
              className="rounded-md border border-border bg-card/40 px-3 py-2 text-left hover:border-primary/40 hover:bg-primary/5 transition-colors group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium group-hover:text-primary transition-colors">{t.name}</span>
                <Badge variant="outline" className="text-[9px] border-border text-muted-foreground shrink-0">
                  {t.steps.length} etapas
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{t.description}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 max-w-md mx-auto">
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">ou comece do zero</span>
        <div className="flex-1 h-px bg-border" />
      </div>

      <div className="flex flex-wrap justify-center gap-1.5">
        {(["traffic_ad","page_landing","comm_email_sequence","page_checkout"] as FunnelBlockKind[]).map((k) => {
          const m = getFunnelBlock(k);
          const I = m.icon;
          return (
            <Button key={k} size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => onAdd(k)}>
              <I className={cn("h-3 w-3", m.color)} /> {m.shortLabel}
            </Button>
          );
        })}
        <AddBlockPopover onPick={onAdd} compact />
      </div>
    </div>
  );
}

// ─── Add block popover ────────────────────────────────────────────────────
function AddBlockPopover({ onPick, compact }: { onPick: (k: FunnelBlockKind) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
            <Plus className="h-3 w-3" /> Outros
          </Button>
        ) : (
          <Button variant="outline" className="w-full h-9 border-dashed gap-2">
            <Plus className="h-3.5 w-3.5" /> Adicionar bloco ao funil
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="center">
        <ScrollArea className="max-h-96">
          <div className="p-2 space-y-3">
            {blocksByFamily().map(({ family, blocks }) => {
              const f = getFamilyMeta(family);
              return (
                <div key={family} className="space-y-1">
                  <p className={cn("text-[10px] font-semibold uppercase tracking-wide px-1", f.color)}>
                    {f.label}
                  </p>
                  <div className="grid grid-cols-2 gap-1">
                    {blocks.map((b) => {
                      const I = b.icon;
                      return (
                        <button
                          key={b.kind}
                          onClick={() => { onPick(b.kind); setOpen(false); }}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] hover:bg-accent transition",
                            b.border, b.bg,
                          )}
                        >
                          <I className={cn("h-3.5 w-3.5 shrink-0", b.color)} />
                          <span className="truncate">{b.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
