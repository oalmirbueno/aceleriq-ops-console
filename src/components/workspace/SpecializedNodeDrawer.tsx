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
import { useMemo, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KeyRound, Trash2, X } from "lucide-react";
import { useNodePrefill } from "@/hooks/useNodePrefill";
import { getNodeBlueprint, type NodeBlueprint, type QuickActionId } from "./nodeBlueprints";
import { getProjectTypeMeta, getStageMeta, type ProjectNodeKind } from "./canvasProjectTypes";
import NodeMethodChecklist from "./drawerPrimitives/NodeMethodChecklist";
import NodeSection from "./drawerPrimitives/NodeSection";
import NodeQuickActions from "./drawerPrimitives/NodeQuickActions";
import NodePrefillStatus from "./drawerPrimitives/NodePrefillStatus";
import AccessVaultDrawer from "./AccessVaultDrawer";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

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
}

export default function SpecializedNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName,
  blueprintOverride, quickActionHandlers = {}, onDelete, extraSlot,
}: Props) {
  const [vaultOpen, setVaultOpen] = useState(false);
  const kind = (node.node_type as ProjectNodeKind) ?? "documento";
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

  // Wires regenerate handler if blueprint expects it
  const handlers: typeof quickActionHandlers = {
    ...quickActionHandlers,
    regenerate_prefill: () => regenerate(),
  };

  if (!blueprint) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-2xl p-6">
          <p className="text-sm text-muted-foreground">
            Sem blueprint para este tipo. Use o drawer genérico.
          </p>
        </SheetContent>
      </Sheet>
    );
  }

  const Icon = typeMeta?.icon;
  const methodState = prefill?.method_state ?? {};
  const isGenerating = status === "generating" || status === "loading";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl p-0 flex flex-col">
        {/* ─── Header ─── */}
        <div className="px-5 pt-5 pb-3 border-b border-border space-y-3">
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
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {onDelete && (
                <Button size="icon" variant="ghost" className="h-7 w-7 text-rose-400"
                  onClick={() => { onDelete(node.id); onOpenChange(false); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onOpenChange(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <NodeQuickActions actions={blueprint.quickActions} handlers={handlers} disabled={isGenerating} />
        </div>

        {/* ─── Body ─── */}
        <ScrollArea className="flex-1">
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
                  onFieldChange={(fieldId, next) => updateField(section.id, fieldId, next)}
                  disabled={isGenerating}
                />
              ))}
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
