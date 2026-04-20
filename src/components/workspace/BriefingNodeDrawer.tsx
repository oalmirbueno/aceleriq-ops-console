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
import { useNodeQuickActions } from "@/hooks/useNodeQuickActions";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName: string;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function BriefingNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete,
}: Props) {
  const blueprint = getNodeBlueprint("briefing");
  const { handlers, dialogs } = useNodeQuickActions({
    node, open, workspaceId, clientId, clientName,
  });

  if (!blueprint) return null;

  return (
    <>
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
      {dialogs}
    </>
  );
}
