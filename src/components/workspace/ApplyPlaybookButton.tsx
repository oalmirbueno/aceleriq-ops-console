/**
 * ApplyPlaybookButton — botão que abre dialog com TODOS os playbooks disponíveis.
 *
 * Agora é um SELETOR, não mais aplica direto. Usuário:
 *  1. Clica em "Aplicar Playbook"
 *  2. Dialog abre com lista de playbooks (por tipo + por plano)
 *  3. Playbook sugerido (baseado no tipo do cliente) aparece destacado
 *  4. Usuário escolhe qual aplicar
 *  5. Preview + confirmação + aplicação
 */
import { useState, useMemo } from "react";
import {
  Sparkles, Loader2, Rocket, AlertCircle, CheckCircle2, X, ChevronRight,
  Globe, Workflow, Bot, Megaphone, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getPlaybookForPlan, playbookPos, type Playbook, PLAYBOOKS } from "./canvasPlaybooks";
import { calculateLayout, LAYOUT_CONFIG } from "@/lib/canvasAutoLayout";
import { TYPE_PLAYBOOKS, getPlaybookForType } from "./typePlaybooks";
import { getPlanConfig, type PlanKey } from "@/lib/planConfig";
import { getProjectTypeMeta, type ProjectType } from "@/lib/projectTypes";
import { projectKindToDbNodeType } from "./canvasProjectTypes";
import { cn } from "@/lib/utils";

const TYPE_ICONS = { Globe, Workflow, Bot, Megaphone };

interface PlaybookOption {
  key: string;
  source: "type" | "plan";
  name: string;
  description: string;
  nodeCount: number;
  edgeCount: number;
  playbook: Omit<Playbook, "planKey"> | Playbook;
  color?: string;
  icon?: string;
  suggested?: boolean;
}

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  planName: string | null;
  projectType?: string | null;
  parentNodeId: string | null;
  currentNodeCount?: number;
  onApplied?: () => Promise<void> | void;
  variant?: "button" | "toolbar";
}

export default function ApplyPlaybookButton({
  workspaceId, clientId, clientName, planName, projectType, parentNodeId,
  currentNodeCount = 0, onApplied,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Build playbook options list
  const options = useMemo<PlaybookOption[]>(() => {
    const list: PlaybookOption[] = [];

    // Playbooks por plano (AI-First tracks)
    const PLAN_META: Record<string, { label: string; color: string }> = {
      starter: { label: "Fundação", color: "#00FF88" },
      growth: { label: "Aceleração", color: "#60A5FA" },
      enterprise: { label: "Escala IA-First", color: "#FBBF24" },
    };
    (["starter", "growth", "enterprise"] as const).forEach((planKey) => {
      const pb = PLAYBOOKS[planKey];
      if (!pb) return;
      list.push({
        key: `plan:${planKey}`,
        source: "plan",
        name: `${pb.name} (AI-First)`,
        description: pb.description,
        nodeCount: pb.nodes.length,
        edgeCount: pb.edges.length,
        playbook: pb,
        color: PLAN_META[planKey].color,
        icon: "Sparkles",
        suggested: !projectType || projectType === "ai_first" ? (planName === planKey) : false,
      });
    });

    // Playbooks por tipo (one-shots + marketing)
    const TYPE_META_MAP: Record<string, { color: string; icon: string }> = {
      one_shot_site: { color: "#60A5FA", icon: "Globe" },
      one_shot_automation: { color: "#FB923C", icon: "Workflow" },
      one_shot_agent: { color: "#06B6D4", icon: "Bot" },
      marketing_service: { color: "#F472B6", icon: "Megaphone" },
    };
    Object.entries(TYPE_PLAYBOOKS).forEach(([type, pb]) => {
      if (!pb) return;
      const meta = TYPE_META_MAP[type];
      list.push({
        key: `type:${type}`,
        source: "type",
        name: pb.name,
        description: pb.description,
        nodeCount: pb.nodes.length,
        edgeCount: pb.edges.length,
        playbook: pb,
        color: meta?.color,
        icon: meta?.icon,
        suggested: projectType === type,
      });
    });

    return list;
  }, [projectType, planName]);

  const selected = options.find((o) => o.key === selectedKey);
  const suggested = options.find((o) => o.suggested);

  const openDialog = () => {
    setOpen(true);
    setSelectedKey(suggested?.key ?? null);
  };

  const handleApply = async () => {
    if (!selected || !parentNodeId) {
      toast({ title: "Selecione um playbook", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      const pb = selected.playbook;

      // Valida que parentNodeId existe na DB antes de inserir os filhos.
      // Evita FK violation no parent_node_id quando o id local está stale.
      const { data: parentExists } = await supabase
        .from("canvas_nodes")
        .select("id")
        .eq("id", parentNodeId)
        .maybeSingle();
      if (!parentExists) {
        toast({
          title: "Pasta do cliente inválida",
          description: "Recarregue a página e tente de novo.",
          variant: "destructive",
        });
        return;
      }

      // ═══ AUTO-LAYOUT inteligente ═══
      // Calcula posições usando algoritmo barycenter que minimiza cruzamentos
      const layoutInput = pb.nodes.map((n) => ({
        ref: n.ref,
        stage: n.stage,
        kind: n.kind,
      }));
      const layoutEdges = pb.edges.map((e) => ({ fromRef: e.fromRef, toRef: e.toRef }));
      const positions = calculateLayout(
        layoutInput,
        layoutEdges,
        LAYOUT_CONFIG.ORIGIN_X,
        LAYOUT_CONFIG.ORIGIN_Y,
      );

      const nodesToInsert = pb.nodes.map((n) => {
        // Usa posição calculada pelo auto-layout (fallback para playbookPos se não encontrar)
        const pos = positions[n.ref] ?? playbookPos(n.col, n.row);
        return {
          workspace_id: workspaceId,
          client_id: clientId,
          parent_node_id: parentNodeId,
          node_type: projectKindToDbNodeType(n.kind),
          title: n.title,
          description: n.description,
          status: "draft",
          pos_x: pos.pos_x,
          pos_y: pos.pos_y,
          data: { kind: n.kind, ...(n.data ?? {}) },
        };
      });

      const { data: created, error: nErr } = await supabase
        .from("canvas_nodes")
        .insert(nodesToInsert)
        .select();
      if (nErr) throw new Error(nErr.message);

      const refToId = new Map<string, string>();
      (created as Array<{ id: string }> | null)?.forEach((row, i) => {
        refToId.set(pb.nodes[i].ref, row.id);
      });

      const edgesToInsert = pb.edges.map((e) => {
        const src = refToId.get(e.fromRef);
        const tgt = refToId.get(e.toRef);
        if (!src || !tgt) return null;
        return {
          workspace_id: workspaceId,
          source_node_id: src,
          target_node_id: tgt,
          edge_type: "ops",
          label: e.label,
        };
      }).filter(Boolean);

      if (edgesToInsert.length > 0) {
        await supabase.from("canvas_edges").insert(edgesToInsert);
      }

      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "playbook_applied",
        title: `Playbook "${pb.name}" aplicado`,
        description: `${pb.nodes.length} nodes + ${pb.edges.length} conexões para ${clientName}.`,
        happened_at: new Date().toISOString(),
      });

      // ═══ Prefill automático em background ═══
      // Para cada node criado, dispara prefill-node em fire-and-forget pra que a IA
      // preencha descrição/campos com o contexto real do cliente.
      const insertedNodes = (created as Array<{ id: string; title: string | null; description: string | null; data: any }> | null) ?? [];
      const skipKinds = new Set(["client", "chat_node", "ai_orb"]);
      let prefillCount = 0;
      insertedNodes.forEach((node) => {
        const kind = (node.data as Record<string, any> | null)?.kind as string | undefined;
        if (!kind || skipKinds.has(kind)) return;
        prefillCount++;
        supabase.functions
          .invoke("prefill-node", {
            body: {
              workspaceId,
              clientId,
              nodeId: node.id,
              nodeKind: kind,
              kind,
              currentTitle: node.title,
            },
          })
          .then(({ data }) => {
            const fields = (data as any)?.fields;
            if (!fields) return;
            const currentData = (node.data as Record<string, any> | null) ?? {};
            void supabase
              .from("canvas_nodes")
              .update({
                description: fields.description ?? node.description,
                data: {
                  ...currentData,
                  ...fields,
                  prefilled: true,
                  prefilled_at: new Date().toISOString(),
                },
              })
              .eq("id", node.id);
          })
          .catch(() => { /* silencioso — prefill é best-effort */ });
      });

      toast({
        title: "Playbook aplicado ✓",
        description: prefillCount > 0
          ? `${pb.nodes.length} nodes · ${pb.edges.length} conexões. IA preenchendo ${prefillCount} nodes em background…`
          : `${pb.nodes.length} nodes · ${pb.edges.length} conexões criados`,
      });
      setOpen(false);
      await onApplied?.();
    } catch (err) {
      toast({
        title: "Erro ao aplicar playbook",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      <Button
        onClick={openDialog}
        disabled={!parentNodeId}
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5"
        title="Escolher e aplicar playbook no canvas"
      >
        <Rocket className="h-3.5 w-3.5" />
        Playbook
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl w-full max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
                <Rocket className="h-4 w-4 text-primary" />
              </div>
              Escolher Playbook para {clientName}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione o fluxo de canvas mais adequado para este projeto. Cada playbook cria nodes pré-organizados por etapa ACELERA.
            </DialogDescription>
          </DialogHeader>

          {/* Warning se canvas tem nodes */}
          {currentNodeCount > 0 && (
            <div className="px-5 py-2 border-b border-amber-400/30 bg-amber-400/5">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-amber-400">{currentNodeCount} nodes</span> já existem. Playbook ADICIONA (não remove os existentes).
                </p>
              </div>
            </div>
          )}

          {/* Lista de playbooks */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
            <div className="space-y-2">
              {options.map((opt) => {
                const isSelected = opt.key === selectedKey;
                const Icon = opt.icon ? (TYPE_ICONS[opt.icon as keyof typeof TYPE_ICONS] ?? Sparkles) : Sparkles;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setSelectedKey(opt.key)}
                    className={cn(
                      "w-full text-left rounded-xl border-2 p-4 transition-all flex items-start gap-3",
                      isSelected
                        ? "bg-opacity-10"
                        : "border-border hover:border-primary/30 hover:bg-secondary/30"
                    )}
                    style={isSelected ? {
                      borderColor: opt.color ?? "#00FF88",
                      background: `${opt.color ?? "#00FF88"}10`,
                    } : undefined}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-lg shrink-0"
                      style={{
                        background: `${opt.color ?? "#00FF88"}15`,
                        border: `1px solid ${opt.color ?? "#00FF88"}40`,
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color: opt.color ?? "#00FF88" }} />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="text-sm font-semibold" style={{ color: isSelected ? opt.color : undefined }}>
                          {opt.name}
                        </p>
                        {opt.suggested && (
                          <Badge
                            className="text-[9px] px-1.5 py-0 h-4 border"
                            style={{
                              background: `${opt.color ?? "#00FF88"}20`,
                              color: opt.color ?? "#00FF88",
                              borderColor: `${opt.color ?? "#00FF88"}40`,
                            }}
                          >
                            ✓ sugerido pelo tipo
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                          {opt.nodeCount} nodes
                        </Badge>
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">
                          {opt.edgeCount} conexões
                        </Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {opt.description}
                      </p>
                    </div>

                    <ChevronRight className={cn("h-4 w-4 shrink-0 mt-1 transition-all",
                      isSelected ? "opacity-100" : "opacity-30")}
                      style={isSelected ? { color: opt.color } : undefined}
                    />
                  </button>
                );
              })}
            </div>

            {options.length === 0 && (
              <div className="text-center py-10">
                <Package className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Nenhum playbook disponível.</p>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 shrink-0">
            <p className="text-[11px] text-muted-foreground">
              {selected
                ? `Aplicará "${selected.name}" com ${selected.nodeCount} nodes`
                : "Selecione um playbook acima"}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)} variant="ghost" size="sm" className="h-8 text-xs">
                Cancelar
              </Button>
              <Button
                onClick={handleApply}
                disabled={!selected || applying || !parentNodeId}
                size="sm"
                className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground"
              >
                {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                Aplicar playbook
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
