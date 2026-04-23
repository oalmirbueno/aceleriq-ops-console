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
import SiteNodeDrawer from "./SiteNodeDrawer";
import LancamentoNodeDrawer from "./LancamentoNodeDrawer";
import MetricaNodeDrawer from "./MetricaNodeDrawer";
import KickoffNodeDrawer from "./KickoffNodeDrawer";
import DiagnosticoNodeDrawer from "./DiagnosticoNodeDrawer";
import IaAgentNodeDrawer from "./IaAgentNodeDrawer";
import OperationalNodeDrawer from "./OperationalNodeDrawer";
import { useNodeQuickActions } from "@/hooks/useNodeQuickActions";
import { hasBlueprint } from "./nodeBlueprints";
import { resolveProjectNodeKind, type ProjectNodeKind } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

export type { ClientFolderOption };

/** Wrapper genérico: SpecializedNodeDrawer + handlers padrão (tasks/pdf/snapshot) */
function SpecializedGenericDrawer(args: {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
  availableNodes?: Array<CanvasNodeRecord & { parent_node_id?: string | null }>;
}) {
  const { handlers, dialogs } = useNodeQuickActions({
    node: args.node, open: args.open,
    workspaceId: args.workspaceId, clientId: args.clientId,
    clientName: args.clientName, onChanged: args.onUpdated,
  });
  return (
    <>
      <SpecializedNodeDrawer
        node={args.node}
        open={args.open}
        onOpenChange={args.onOpenChange}
        workspaceId={args.workspaceId}
        clientId={args.clientId}
        clientName={args.clientName}
        quickActionHandlers={handlers}
        onDelete={args.onDelete}
        availableNodes={args.availableNodes}
        onUpdated={args.onUpdated}
      />
      {dialogs}
    </>
  );
}

interface Props {
  node: (CanvasNodeRecord & { parent_node_id?: string | null }) | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  onUpdated: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  clientFolders?: ClientFolderOption[];
  onMoveToFolder?: (nodeId: string, targetFolderId: string | null) => Promise<void> | void;
  availableNodes?: Array<CanvasNodeRecord & { parent_node_id?: string | null }>;
  onOpenChat?: (nodeId: string) => void;
}

export default function ProjectNodeDrawer(props: Props) {
  const { node } = props;
  if (!node) return null;

  const kind = resolveProjectNodeKind({
    nodeType: node.node_type,
    data: node.data,
  }) as ProjectNodeKind | null;

  // Resolve clientId from the parent client folder, if available
  const parentFolder = props.clientFolders?.find((c) => c.id === node.parent_node_id);
  const clientId = parentFolder?.linkedClientId ?? null;
  const clientName = parentFolder?.name ?? "Cliente";

  if (!kind) {
    return <LegacyProjectNodeDrawer {...props} />;
  }

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

  // Diagnóstico (documento cujo título contém "diagn"):
  // sections estruturais + painel de docs do Contexto auto-puxados
  if (kind === "documento" && clientId && node.title?.toLowerCase().includes("diagn")) {
    return (
      <DiagnosticoNodeDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        clientName={clientName}
        onDelete={props.onDelete}
        onUpdated={props.onUpdated}
      />
    );
  }

  // Site: preview hero + meta + botão SiteBolt
  if (kind === "site" && clientId) {
    return (
      <SiteNodeDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        onDelete={props.onDelete}
      />
    );
  }

  // Lançamento: timeline pré-launch (T-7 → T+1)
  if (kind === "lancamento" && clientId) {
    return (
      <LancamentoNodeDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        onDelete={props.onDelete}
      />
    );
  }

  // Métrica: gráfico de snapshots históricos
  if (kind === "metrica" && clientId) {
    return (
      <MetricaNodeDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        onDelete={props.onDelete}
      />
    );
  }

  // Kickoff / reunião: card resumo + export .ics local
  if (kind === "reuniao" && clientId) {
    return (
      <KickoffNodeDrawer
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

  // Tipos operacionais: usam o drawer enxuto OperationalNodeDrawer
  // (landing_page, case, ia, agente, automacao, crm, site, metrica, conteudo, briefing, etc)
  const OPERATIONAL_KINDS: ProjectNodeKind[] = [
    "landing_page", "case", "ia", "agente", "automacao", "crm",
    "site", "metrica", "conteudo", "briefing", "contexto_ops",
    "documento", "objetivo", "trafego", "email_mkt", "social",
    "video", "imagem", "asset", "before_after", "instrucao",
    "engine", "resultado", "decisao", "funil", "integracao",
    "ideia", "contato", "reuniao", "checklist",
  ];
  if (clientId && OPERATIONAL_KINDS.includes(kind)) {
    return (
      <OperationalNodeDrawer
        node={node}
        open={props.open}
        onOpenChange={props.onOpenChange}
        workspaceId={props.workspaceId}
        clientId={clientId}
        clientName={clientName}
        onDelete={props.onDelete}
        onUpdated={props.onUpdated}
        onOpenChat={props.onOpenChat}
      />
    );
  }

  // Fallback: drawer legado completo (campos, tabs, copy, links, anexos, mover de pasta)
  return <LegacyProjectNodeDrawer {...props} />;
}
