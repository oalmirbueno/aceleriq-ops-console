/**
 * BriefingNodeDrawer
 *
 * Drawer especializado para nodes do tipo "briefing" — combina o drawer
 * genérico (SpecializedNodeDrawer + blueprint BRIEFING) com o
 * BriefingConsolidatedView injetado como extraSlot.
 *
 * Razão: briefing é o único node onde o "documento consolidado por IA"
 * é mais importante que as seções estruturadas — então mostramos os 2.
 */
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import BriefingConsolidatedView from "./BriefingConsolidatedView";
import { getNodeBlueprint } from "./nodeBlueprints";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import type { QuickActionId } from "./nodeBlueprints";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName: string;
  onDelete?: (id: string) => Promise<void> | void;
  onGenerateTasks?: () => void;
}

export default function BriefingNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete, onGenerateTasks,
}: Props) {
  const blueprint = getNodeBlueprint("briefing");
  if (!blueprint) return null;

  const handlers: Partial<Record<QuickActionId, () => void>> = {};
  if (onGenerateTasks) handlers.generate_tasks = onGenerateTasks;
  // export_pdf é tratado dentro do BriefingConsolidatedView (menu de download)
  // approve será implementado quando tivermos o status "selado"

  return (
    <SpecializedNodeDrawer
      node={node}
      open={open}
      onOpenChange={onOpenChange}
      workspaceId={workspaceId}
      clientId={clientId}
      blueprintOverride={blueprint}
      quickActionHandlers={handlers}
      onDelete={onDelete}
      extraSlot={
        <BriefingConsolidatedView
          workspaceId={workspaceId}
          clientId={clientId}
          clientName={clientName}
          compact
        />
      }
    />
  );
}
