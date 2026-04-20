/**
 * DiagnosticoNodeDrawer
 *
 * Wrapper especializado para nodes de "Diagnóstico" (kind documento + título contém "diagn").
 * Combina:
 *  - SpecializedNodeDrawer com blueprint DIAGNOSTICO (sections estruturais completas)
 *  - extraSlot com DiagnosticoDocumentsPanel (docs do Contexto auto-puxados)
 *
 * O autopreencher já lê os docs via novo source `diagnostico_docs` no edge fn,
 * mas o painel garante visibilidade humana + download + checklist de revisão.
 */
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import DiagnosticoDocumentsPanel from "./DiagnosticoDocumentsPanel";
import { getNodeBlueprint } from "./nodeBlueprints";
import { useNodeQuickActions } from "@/hooks/useNodeQuickActions";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
}

export default function DiagnosticoNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete, onUpdated,
}: Props) {
  const blueprint = getNodeBlueprint("documento", { title: node.title });
  const { handlers, dialogs } = useNodeQuickActions({
    node, open, workspaceId, clientId, clientName, onChanged: onUpdated,
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
        clientName={clientName}
        blueprintOverride={blueprint}
        quickActionHandlers={handlers}
        onDelete={onDelete}
        extraSlot={<DiagnosticoDocumentsPanel nodeId={node.id} clientId={clientId} />}
      />
      {dialogs}
    </>
  );
}