/**
 * ProjectNodeDrawer (router)
 *
 * Despacha para o drawer especializado conforme `node.node_type`:
 *  - "briefing" → BriefingNodeDrawer (genérico + BriefingConsolidatedView)
 *  - kinds com blueprint → SpecializedNodeDrawer (objetivo, documento, site,
 *    landing_page, conteudo, asset, lancamento, trafego, metrica, reuniao)
 *  - resto → LegacyProjectNodeDrawer (rico, manual, com tabs/copy/links/anexos)
 *
 * Mantém a mesma assinatura de Props do drawer legado, então o CanvasStudio
 * não precisa mudar.
 */
import LegacyProjectNodeDrawer, { type ClientFolderOption } from "./LegacyProjectNodeDrawer";
import BriefingNodeDrawer from "./BriefingNodeDrawer";
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import AccessVaultDrawer from "./AccessVaultDrawer";
import FunnelEditorDrawer from "./FunnelEditorDrawer";
import { hasBlueprint } from "./nodeBlueprints";
import type { ProjectNodeKind } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

export type { ClientFolderOption };

interface Props {
  node: (CanvasNodeRecord & { parent_node_id?: string | null }) | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  onUpdated: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  clientFolders?: ClientFolderOption[];
  onMoveToFolder?: (nodeId: string, targetFolderId: string | null) => Promise<void> | void;
}

export default function ProjectNodeDrawer(props: Props) {
  const { node } = props;
  if (!node) return null;

  const kind = node.node_type as ProjectNodeKind;

  // Resolve clientId from the parent client folder, if available
  const parentFolder = props.clientFolders?.find((c) => c.id === node.parent_node_id);
  const clientId = parentFolder?.linkedClientId ?? null;
  const clientName = parentFolder?.name ?? "Cliente";

  // Acessos: drawer 100% custom (cofre criptografado)
  if (kind === "acessos" && clientId) {
    return (
      <AccessVaultDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        clientName={clientName}
        onDelete={props.onDelete}
      />
    );
  }

  // Funil: editor visual completo (pipeline + ramificações)
  if (kind === "funil" && clientId) {
    return (
      <FunnelEditorDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        clientName={clientName}
        onDelete={props.onDelete}
      />
    );
  }

  // Briefing tem extraSlot com BriefingConsolidatedView
  if (kind === "briefing" && clientId) {
    return (
      <BriefingNodeDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        clientName={clientName}
        onDelete={props.onDelete}
      />
    );
  }

  // Outros tipos com blueprint → drawer especializado
  if (clientId && hasBlueprint(kind)) {
    return (
      <SpecializedNodeDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        onDelete={props.onDelete}
      />
    );
  }

  // Fallback: drawer legado completo (campos, tabs, copy, links, anexos, mover de pasta)
  return <LegacyProjectNodeDrawer {...props} />;
}
