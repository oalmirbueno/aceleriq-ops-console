/**
 * FunnelStepCard — card de uma etapa do funil dentro do FunnelEditorDrawer.
 *
 * Render compacto + drawer inline expansível pra editar:
 *  - título / descrição
 *  - config fields específicos do kind
 *  - métricas (conversão + volume + métricas-chave do kind)
 *  - checklist de produção
 *  - vínculo com node existente do canvas
 *  - ramificações (apenas pra logic_decision / logic_split_test)
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ChevronDown, ChevronUp, GripVertical, Trash2, Link2, Plus, X,
  ArrowDown, GitBranch, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getFunnelBlock, type FunnelBlockKind, FUNNEL_BLOCKS,
} from "./funnelBlocks";

export interface FunnelStepRow {
  id: string;
  funnel_id: string;
  workspace_id: string;
  position: number | null;
  block_kind: FunnelBlockKind;
  title: string;
  description: string | null;
  linked_node_id: string | null;
  conversion_rate: number | null;
  expected_volume: number | null;
  actual_volume: number | null;
  checklist: Array<{ id: string; text: string; done: boolean }>;
  metrics: Record<string, number | string | null>;
  config: Record<string, string | number | null>;
}

export interface FunnelBranchRow {
  id: string;
  funnel_id: string;
  from_step_id: string;
  to_step_id: string;
  condition: "yes" | "no" | "variant_a" | "variant_b" | "default";
  label: string | null;
}

export interface LinkableNodeOption {
  id: string;
  title: string;
  node_type: string;
}

interface Props {
  step: FunnelStepRow;
  branches: FunnelBranchRow[];
  allSteps: FunnelStepRow[];
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  linkableNodes: LinkableNodeOption[];
  onToggleExpand: () => void;
  onPatch: (patch: Partial<FunnelStepRow>) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  onChangeKind: (kind: FunnelBlockKind) => void;
  onAddBranch: (toStepId: string, condition: FunnelBranchRow["condition"]) => void;
  onRemoveBranch: (branchId: string) => void;
}

export default function FunnelStepCard({
  step, branches, allSteps, expanded, isFirst, isLast, linkableNodes,
  onToggleExpand, onPatch, onDelete, onMove, onChangeKind,
  onAddBranch, onRemoveBranch,
}: Props) {
  const meta = getFunnelBlock(step.block_kind);
  const Icon = meta.icon;
  const linkedNode = linkableNodes.find((n) => n.id === step.linked_node_id);

  const stepBranches = branches.filter((b) => b.from_step_id === step.id);
  const checklistDone = step.checklist.filter((c) => c.done).length;

  return (
    <div className={cn("rounded-lg border-2 bg-card/40 transition-all", meta.border, expanded && "shadow-lg")}>
      {/* ─── Header (sempre visível) ─── */}
      <div className="flex items-center gap-2 p-3">
        <button
          className="text-muted-foreground/50 hover:text-foreground cursor-grab"
          title="Arraste para reordenar (em breve)"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className={cn("h-9 w-9 rounded-md border flex items-center justify-center shrink-0", meta.border, meta.bg)}>
          <Icon className={cn("h-4 w-4", meta.color)} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{step.title || meta.label}</span>
            <Badge variant="outline" className={cn("text-[9px]", meta.border, meta.color)}>
              {meta.shortLabel}
            </Badge>
            {step.conversion_rate != null && (
              <Badge variant="outline" className="text-[9px] border-emerald-500/40 text-emerald-400">
                {(step.conversion_rate * 100).toFixed(1)}% conv.
              </Badge>
            )}
            {linkedNode && (
              <Badge variant="outline" className="text-[9px] border-primary/40 text-primary flex items-center gap-1">
                <Link2 className="h-2.5 w-2.5" /> {linkedNode.title.slice(0, 18)}
              </Badge>
            )}
            {step.checklist.length > 0 && (
              <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                {checklistDone}/{step.checklist.length} ✓
              </Badge>
            )}
          </div>
          {step.description && !expanded && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{step.description}</p>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={isFirst} onClick={() => onMove("up")}>
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" disabled={isLast} onClick={() => onMove("down")}>
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={onToggleExpand}>
            {expanded ? "Recolher" : "Editar"}
          </Button>
        </div>
      </div>

      {/* ─── Corpo expandido ─── */}
      {expanded && (
        <div className="border-t border-border px-3 py-3 space-y-3 bg-muted/10">
          {/* Trocar tipo de bloco */}
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">Tipo de bloco</Label>
            <Select value={step.block_kind} onValueChange={(v) => onChangeKind(v as FunnelBlockKind)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                {FUNNEL_BLOCKS.map((b) => (
                  <SelectItem key={b.kind} value={b.kind} className="text-xs">
                    <span className="flex items-center gap-2">
                      <b.icon className={cn("h-3 w-3", b.color)} /> {b.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1 col-span-2">
              <Label className="text-[10px] text-muted-foreground">Título</Label>
              <Input value={step.title} onChange={(e) => onPatch({ title: e.target.value })}
                className="h-8 text-xs" placeholder={meta.label} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-[10px] text-muted-foreground">Descrição</Label>
              <Textarea value={step.description ?? ""} onChange={(e) => onPatch({ description: e.target.value })}
                rows={2} className="text-xs resize-y" placeholder="O que acontece nessa etapa?" />
            </div>
          </div>

          {/* Config específico do kind */}
          {meta.configFields.length > 0 && (
            <div className="space-y-2 rounded-md border border-border/60 bg-background/40 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Config · {meta.shortLabel}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {meta.configFields.map((f) => {
                  const value = (step.config?.[f.id] ?? "") as string | number;
                  if (f.type === "textarea") {
                    return (
                      <div key={f.id} className="space-y-1 col-span-2">
                        <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                        <Textarea value={String(value)} onChange={(e) => onPatch({ config: { ...step.config, [f.id]: e.target.value } })}
                          rows={2} className="text-xs resize-y" placeholder={f.placeholder} />
                      </div>
                    );
                  }
                  return (
                    <div key={f.id} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{f.label}</Label>
                      <Input
                        type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
                        value={String(value)}
                        onChange={(e) => {
                          const v = f.type === "number" ? (e.target.value ? Number(e.target.value) : null) : e.target.value;
                          onPatch({ config: { ...step.config, [f.id]: v } });
                        }}
                        className="h-7 text-xs"
                        placeholder={f.placeholder}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Conversão + volume */}
          {!step.block_kind.startsWith("logic_") && (
            <div className="space-y-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400">Conversão & Volume</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Taxa conv. (%)</Label>
                  <Input
                    type="number" step="0.1" min="0" max="100"
                    value={step.conversion_rate != null ? (step.conversion_rate * 100).toFixed(2) : ""}
                    onChange={(e) => {
                      const v = e.target.value ? Number(e.target.value) / 100 : null;
                      onPatch({ conversion_rate: v });
                    }}
                    className="h-7 text-xs" placeholder="0–100"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Vol. esperado</Label>
                  <Input
                    type="number" min="0"
                    value={step.expected_volume ?? ""}
                    onChange={(e) => onPatch({ expected_volume: e.target.value ? Number(e.target.value) : null })}
                    className="h-7 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Vol. real</Label>
                  <Input
                    type="number" min="0"
                    value={step.actual_volume ?? ""}
                    onChange={(e) => onPatch({ actual_volume: e.target.value ? Number(e.target.value) : null })}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              {meta.metricKeys.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {meta.metricKeys.map((mk) => (
                    <div key={mk} className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground">{mk}</Label>
                      <Input
                        value={String(step.metrics?.[mk] ?? "")}
                        onChange={(e) => onPatch({ metrics: { ...step.metrics, [mk]: e.target.value } })}
                        className="h-7 text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Checklist de produção */}
          <div className="space-y-1.5 rounded-md border border-border/60 bg-background/40 p-2.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Checklist de produção</p>
              <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                onClick={() => {
                  const next = [...step.checklist, { id: crypto.randomUUID(), text: "Novo item", done: false }];
                  onPatch({ checklist: next });
                }}>
                <Plus className="h-3 w-3 mr-1" /> Item
              </Button>
            </div>
            {step.checklist.length === 0 ? (
              <p className="text-[10px] text-muted-foreground italic">Nenhum item — adicione tarefas de produção.</p>
            ) : (
              <ul className="space-y-1">
                {step.checklist.map((item, i) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <Checkbox checked={item.done} onCheckedChange={(c) => {
                      const next = [...step.checklist];
                      next[i] = { ...item, done: !!c };
                      onPatch({ checklist: next });
                    }} />
                    <Input
                      value={item.text}
                      onChange={(e) => {
                        const next = [...step.checklist];
                        next[i] = { ...item, text: e.target.value };
                        onPatch({ checklist: next });
                      }}
                      className={cn("h-7 text-xs flex-1", item.done && "line-through text-muted-foreground")}
                    />
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400"
                      onClick={() => onPatch({ checklist: step.checklist.filter((_, idx) => idx !== i) })}>
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Vínculo com node existente */}
          <div className="space-y-1 rounded-md border border-primary/20 bg-primary/5 p-2.5">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-primary flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Vinculado a node do canvas
            </Label>
            <Select
              value={step.linked_node_id ?? "__none"}
              onValueChange={(v) => onPatch({ linked_node_id: v === "__none" ? null : v })}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Selecionar node..." /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="__none" className="text-xs italic text-muted-foreground">— sem vínculo —</SelectItem>
                {linkableNodes.map((n) => (
                  <SelectItem key={n.id} value={n.id} className="text-xs">
                    {n.title} <span className="text-muted-foreground ml-1">· {n.node_type}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {linkedNode && (
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <ExternalLink className="h-2.5 w-2.5" /> {linkedNode.title}
              </p>
            )}
          </div>

          {/* Ramificações (só pra blocos de lógica) */}
          {meta.canBranch && (
            <BranchEditor
              step={step}
              branches={stepBranches}
              allSteps={allSteps.filter((s) => s.id !== step.id)}
              onAddBranch={onAddBranch}
              onRemoveBranch={onRemoveBranch}
            />
          )}
        </div>
      )}

      {/* ─── Conector de ramificação visível (resumo) ─── */}
      {!expanded && stepBranches.length > 0 && (
        <div className="border-t border-border px-3 py-2 bg-amber-500/5">
          <div className="flex items-center gap-2 text-[10px] text-amber-400">
            <GitBranch className="h-3 w-3" />
            <span>{stepBranches.length} ramificação{stepBranches.length > 1 ? "ões" : ""}:</span>
            {stepBranches.map((b) => {
              const target = allSteps.find((s) => s.id === b.to_step_id);
              return (
                <Badge key={b.id} variant="outline" className="text-[9px] border-amber-500/40">
                  {b.condition} → {target?.title ?? "?"}
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Branch editor ────────────────────────────────────────────────────────
function BranchEditor({
  step, branches, allSteps, onAddBranch, onRemoveBranch,
}: {
  step: FunnelStepRow;
  branches: FunnelBranchRow[];
  allSteps: FunnelStepRow[];
  onAddBranch: (toStepId: string, condition: FunnelBranchRow["condition"]) => void;
  onRemoveBranch: (branchId: string) => void;
}) {
  const [newTarget, setNewTarget] = useState<string>("");
  const [newCondition, setNewCondition] = useState<FunnelBranchRow["condition"]>(
    step.block_kind === "logic_split_test" ? "variant_a" : "yes",
  );

  const conditionOptions: FunnelBranchRow["condition"][] = step.block_kind === "logic_split_test"
    ? ["variant_a","variant_b","default"]
    : ["yes","no","default"];

  return (
    <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-400 flex items-center gap-1">
        <GitBranch className="h-3 w-3" /> Ramificações
      </p>

      {branches.length === 0 ? (
        <p className="text-[10px] text-muted-foreground italic">Nenhuma rota definida ainda.</p>
      ) : (
        <ul className="space-y-1">
          {branches.map((b) => {
            const target = allSteps.find((s) => s.id === b.to_step_id);
            return (
              <li key={b.id} className="flex items-center gap-1.5 text-[11px]">
                <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-400">{b.condition}</Badge>
                <ArrowDown className="h-3 w-3 text-muted-foreground rotate-[-90deg]" />
                <span className="flex-1 truncate">{target?.title ?? "(etapa removida)"}</span>
                <Button size="icon" variant="ghost" className="h-5 w-5 text-rose-400" onClick={() => onRemoveBranch(b.id)}>
                  <X className="h-3 w-3" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-1.5 pt-1 border-t border-amber-500/20">
        <Select value={newCondition} onValueChange={(v) => setNewCondition(v as FunnelBranchRow["condition"])}>
          <SelectTrigger className="h-7 text-[10px] w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {conditionOptions.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={newTarget} onValueChange={setNewTarget}>
          <SelectTrigger className="h-7 text-[10px] flex-1"><SelectValue placeholder="Etapa destino..." /></SelectTrigger>
          <SelectContent>
            {allSteps.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.title || "(sem título)"}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" className="h-7 text-[10px]" disabled={!newTarget}
          onClick={() => { onAddBranch(newTarget, newCondition); setNewTarget(""); }}>
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
