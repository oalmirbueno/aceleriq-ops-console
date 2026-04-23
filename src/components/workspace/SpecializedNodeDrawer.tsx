/**
 * SpecializedNodeDrawer
 *
 * Drawer especializado base: usa o blueprint do tipo de node para renderizar
 * checklist do método + sections com auto-preenchimento + ações rápidas.
 *
 * É o "miolo" reutilizado pelos 4 drawers de entrada (Briefing, Diagnóstico,
 * Objetivo, Documento) e plugado no router pelo ProjectNodeDrawer.
 *
 * Cada tipo pode ter um wrapper específico que adiciona seções customizadas
 * extras (ex: BriefingNodeDrawer mostra também o BriefingConsolidatedView).
 */
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KeyRound, Save, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useNodePrefill } from "@/hooks/useNodePrefill";
import { getNodeBlueprint, type NodeBlueprint, type QuickActionId } from "./nodeBlueprints";
import { getProjectTypeMeta, getStageMeta, resolveProjectNodeKind, type ProjectNodeKind } from "./canvasProjectTypes";
import NodeMethodChecklist from "./drawerPrimitives/NodeMethodChecklist";
import NodeSection from "./drawerPrimitives/NodeSection";
import NodeQuickActions from "./drawerPrimitives/NodeQuickActions";
import NodePrefillStatus from "./drawerPrimitives/NodePrefillStatus";
import AccessVaultDrawer from "./AccessVaultDrawer";
import CanvasNodeOperationalFields from "./CanvasNodeOperationalFields";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import type { PrefillFieldValue } from "./nodePrefillTypes";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  /** Nome do cliente — usado no header do AccessVaultDrawer quando aberto por cima. */
  clientName?: string;
  /** Override do blueprint (caso o caller queira forçar um específico, ex: kickoff vs reuniao) */
  blueprintOverride?: NodeBlueprint;
  /** Map de handlers para as ações rápidas. Ações sem handler ficam desabilitadas. */
  quickActionHandlers?: Partial<Record<QuickActionId, () => void | Promise<void>>>;
  onDelete?: (id: string) => Promise<void> | void;
  /** Slot opcional pra seções extras específicas do tipo (ex: BriefingConsolidatedView) */
  extraSlot?: React.ReactNode;
  /**
   * Slot opcional renderizado LOGO ABAIXO de um field específico de qualquer section.
   * Usado por wrappers que querem decorar campos individuais (ex: IaAgentNodeDrawer
   * injeta histórico de versões abaixo do system_prompt).
   */
  renderFieldExtra?: (
    sectionId: string,
    fieldId: string,
    value: PrefillFieldValue | undefined,
  ) => React.ReactNode;
  /**
   * Override programático de updateField — wrappers podem interceptar pra
   * snapshotar prompt antes de aplicar mudanças. Recebe o updateField original
   * e devolve a versão decorada.
   */
  wrapUpdateField?: (
    original: (sectionId: string, fieldId: string, next: PrefillFieldValue) => void,
  ) => (sectionId: string, fieldId: string, next: PrefillFieldValue) => void;
  /** Callback chamado quando prefill carrega/atualiza — útil pra wrappers reagirem (ex: snapshot inicial). */
  onPrefillChanged?: (prefill: ReturnType<typeof useNodePrefill>["prefill"]) => void;
  availableNodes?: Array<CanvasNodeRecord & { parent_node_id?: string | null }>;
  onUpdated?: () => Promise<void> | void;
}

export default function SpecializedNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName,
  blueprintOverride, quickActionHandlers = {}, onDelete, extraSlot,
  renderFieldExtra, wrapUpdateField, onPrefillChanged, availableNodes = [], onUpdated,
}: Props) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState(node.title);
  const [renameBusy, setRenameBusy] = useState(false);
  const kind = resolveProjectNodeKind({
    nodeType: node.node_type,
    data: node.data,
  }) ?? "documento";
  const typeMeta = getProjectTypeMeta(kind);
  const stage = (node.data as Record<string, unknown> | null)?.stage as string | undefined;
  const stageMeta = stage ? getStageMeta(stage) : null;

  const blueprint = useMemo(
    () => blueprintOverride ?? getNodeBlueprint(kind, { title: node.title }),
    [kind, node.title, blueprintOverride],
  );

  const { prefill, status, error, generate, regenerate, updateField, updateMethod } = useNodePrefill({
    nodeId: node.id, workspaceId, clientId, blueprint, enabled: open,
  });

  useEffect(() => {
    setTitleDraft(node.title);
  }, [node.id, node.title]);

  // Notifica wrapper sobre mudanças de prefill (ex: snapshot inicial do IA)
  useEffect(() => { onPrefillChanged?.(prefill); }, [prefill, onPrefillChanged]);

  // Aplica o wrap do updateField se o caller forneceu (ex: snapshot pré-edição)
  const effectiveUpdateField = useMemo(
    () => (wrapUpdateField ? wrapUpdateField(updateField) : updateField),
    [updateField, wrapUpdateField],
  );

  // Wires regenerate handler if blueprint expects it
  const handlers: typeof quickActionHandlers = {
    ...quickActionHandlers,
    regenerate_prefill: () => regenerate(),
  };

  if (!blueprint) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="p-6 max-w-md">
          <DialogTitle className="sr-only">Sem blueprint</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Sem blueprint para este tipo. Use o drawer genérico.
          </p>
        </DialogContent>
      </Dialog>
    );
  }

  const Icon = typeMeta?.icon;
  const methodState = prefill?.method_state ?? {};
  const isGenerating = status === "generating" || status === "loading";

  const handleRenameSave = async () => {
    const nextTitle = titleDraft.trim();
    if (!nextTitle || nextTitle === node.title) return;
    setRenameBusy(true);
    const { error } = await supabase
      .from("canvas_nodes")
      .update({ title: nextTitle, updated_at: new Date().toISOString() })
      .eq("id", node.id);
    setRenameBusy(false);

    if (error) {
      toast({ title: "Erro ao renomear node", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Node renomeado" });
    await onUpdated?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border border-white/10 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden sm:rounded-2xl"
        style={{
          background: "rgba(9,17,10,0.92)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)",
        }}
      >
        <DialogTitle className="sr-only">{node.title}</DialogTitle>
        {/* ─── Header (pr-12 to leave room for built-in X) ─── */}
        <div className="px-5 pt-5 pb-3 border-b border-white/8 space-y-3 pr-12">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              {Icon && (
                <div className={`h-10 w-10 rounded-lg border-2 ${typeMeta?.color} ${typeMeta?.bg} flex items-center justify-center shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-semibold truncate">{node.title}</h2>
                  {stageMeta && (
                    <Badge variant="outline" className={`text-[9px] ${stageMeta.badge}`}>
                      {stageMeta.letter} · {stageMeta.short}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[9px]">
                    {typeMeta?.label ?? kind}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  {blueprint.purpose}
                </p>
                <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Nome do node</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Input
                      value={titleDraft}
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleRenameSave();
                        }
                      }}
                      placeholder="Renomear node"
                      className="h-8 text-sm"
                    />
                    <Button size="sm" variant="secondary" className="h-8 gap-1.5" onClick={() => void handleRenameSave()} disabled={renameBusy || titleDraft.trim() === node.title || !titleDraft.trim()}>
                      <Save className="h-3.5 w-3.5" />
                      {renameBusy ? "Salvando" : "Salvar"}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => setVaultOpen(true)}
                title="Consultar credenciais do cliente sem sair do node"
              >
                <KeyRound className="h-3 w-3" />
                Acessos
              </Button>
              {onDelete && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                  onClick={() => { onDelete(node.id); onOpenChange(false); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>

          <NodeQuickActions actions={blueprint.quickActions} handlers={handlers} disabled={isGenerating} />
        </div>

        {/* ─── Body ─── */}
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-5 py-4 space-y-4">
            <NodePrefillStatus
              status={status === "ready" ? "ready" : status === "generating" || status === "loading" ? "generating" : status === "error" ? "error" : "empty"}
              prefill={prefill}
              errorMessage={error ?? undefined}
              onGenerate={() => generate(false)}
              onRegenerate={() => regenerate()}
            />

            <NodeMethodChecklist
              items={blueprint.methodChecklist}
              state={methodState}
              onToggle={updateMethod}
              disabled={isGenerating}
            />

            <Separator />
            <CanvasNodeOperationalFields
              node={node}
              workspaceId={workspaceId}
              clientId={clientId}
              availableNodes={availableNodes}
              onUpdated={onUpdated}
            />

            {extraSlot && (
              <>
                <Separator />
                {extraSlot}
                <Separator />
              </>
            )}

            <div className="space-y-3">
              {blueprint.sections.map((section) => (
                <NodeSection
                  key={section.id}
                  section={section}
                  content={prefill?.sections[section.id]}
                  onFieldChange={(fieldId, next) => effectiveUpdateField(section.id, fieldId, next)}
                  disabled={isGenerating}
                  workspaceId={workspaceId}
                  nodeId={node.id}
                  renderFieldExtra={renderFieldExtra}
                />
              ))}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>

      {/* ─── AccessVaultDrawer empilhado por cima — consulta de credenciais sem sair do node ─── */}
      <AccessVaultDrawer
        node={node}
        open={vaultOpen}
        onOpenChange={setVaultOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName ?? "Cliente"}
      />
    </Dialog>
  );
}
