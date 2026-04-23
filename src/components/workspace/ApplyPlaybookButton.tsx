/**
 * ApplyPlaybookButton — botão que aplica a esteira automática baseada no plano do cliente.
 *
 * Ao clicar:
 *  1. Busca o playbook correspondente ao plano do cliente
 *  2. Cria todos os nodes + edges automaticamente
 *  3. Registra evento na timeline
 *  4. Opcionalmente sincroniza com o portal (passo futuro)
 */
import { useState, useMemo } from "react";
import { Sparkles, Loader2, Rocket, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getPlaybookForPlan, playbookPos, type Playbook } from "./canvasPlaybooks";
import { getPlanConfig } from "@/lib/planConfig";
import { projectKindToDbNodeType } from "./canvasProjectTypes";

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  planName: string | null;
  /** Parent node id (cliente folder no canvas) */
  parentNodeId: string | null;
  /** Usuário confirma antes de aplicar? default true */
  confirm?: boolean;
  /** Current nodes count — usado para avisar se canvas não está vazio */
  currentNodeCount?: number;
  onApplied?: () => Promise<void> | void;
  variant?: "button" | "toolbar";
}

export default function ApplyPlaybookButton({
  workspaceId, clientId, clientName, planName, parentNodeId,
  currentNodeCount = 0, onApplied, variant = "toolbar",
}: Props) {
  const [open, setOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const playbook = useMemo(() => getPlaybookForPlan(planName), [planName]);
  const planLabel = planName ? getPlanConfig()[planName as keyof ReturnType<typeof getPlanConfig>]?.label ?? planName : null;

  const handleApply = async () => {
    if (!playbook || !parentNodeId) {
      toast({ title: "Não foi possível aplicar", description: "Plano não reconhecido ou pasta do cliente não encontrada.", variant: "destructive" });
      return;
    }
    setApplying(true);
    try {
      // Posições relativas → absolutas + node_type
      const nodesToInsert = playbook.nodes.map((n) => {
        const pos = playbookPos(n.col, n.row);
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

      // Mapear ref → id de DB
      const refToId = new Map<string, string>();
      (created as Array<{ id: string }> | null)?.forEach((row, i) => {
        refToId.set(playbook.nodes[i].ref, row.id);
      });

      // Criar edges
      const edgesToInsert = playbook.edges.map((e) => {
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

      // Timeline event
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "playbook_applied",
        title: `Playbook "${playbook.name}" aplicado`,
        description: `Esteira automática do plano ${planLabel}: ${playbook.nodes.length} nodes + ${playbook.edges.length} conexões.`,
        happened_at: new Date().toISOString(),
      });

      toast({
        title: "Playbook aplicado ✓",
        description: `${playbook.nodes.length} nodes · ${playbook.edges.length} conexões criados para ${clientName}`,
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

  // Se não tem plano, não mostra
  if (!planName || !playbook) {
    return (
      <Button
        size="sm" variant="outline" className="h-8 text-xs gap-1.5 opacity-50 cursor-not-allowed"
        disabled
        title="Selecione um plano para o cliente primeiro"
      >
        <Rocket className="h-3.5 w-3.5" />
        Aplicar playbook
      </Button>
    );
  }

  // Contagem de nodes por etapa para preview
  const nodesByStage = playbook.nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.stage] = (acc[n.stage] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        disabled={!parentNodeId}
        size="sm"
        variant="outline"
        className="h-8 text-xs gap-1.5"
        title={`Aplicar esteira automática do plano ${planLabel}`}
      >
        <Rocket className="h-3.5 w-3.5" />
        Playbook {planLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle className="flex items-center gap-2 text-base">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
                <Rocket className="h-4 w-4 text-primary" />
              </div>
              Aplicar playbook {playbook.name}
            </DialogTitle>
            <DialogDescription className="text-xs pt-1">
              {playbook.description}
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-4 space-y-4">
            {/* Resumo */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{playbook.nodes.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Nodes</p>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{playbook.edges.length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Conexões</p>
              </div>
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-center">
                <p className="text-2xl font-bold text-primary tabular-nums">{Object.keys(nodesByStage).length}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Etapas</p>
              </div>
            </div>

            {/* Breakdown por etapa */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                Nodes por etapa ACELERA
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(nodesByStage).map(([stage, count]) => (
                  <Badge key={stage} variant="outline" className="text-[10px]">
                    {stage.replace(/_/g, " ")} · {count}
                  </Badge>
                ))}
              </div>
            </div>

            {/* Warning se canvas não está vazio */}
            {currentNodeCount > 0 && (
              <div className="rounded-lg border border-amber-400/30 bg-amber-400/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-amber-400">
                      Canvas não está vazio
                    </p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                      {currentNodeCount} nodes já existem para este cliente. Os nodes do playbook serão adicionados SEM remover os atuais.
                      Se quiser esteira limpa, apague os nodes existentes antes.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2">
            <Button onClick={() => setOpen(false)} variant="outline" size="sm" className="h-8 text-xs">
              Cancelar
            </Button>
            <Button onClick={handleApply} disabled={applying || !parentNodeId} size="sm"
              className="h-8 text-xs gap-1.5 bg-primary text-primary-foreground">
              {applying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Aplicar esteira
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
