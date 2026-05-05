/**
 * ProjectNodeDrawer — router central.
 * Roteia para o drawer específico de cada tipo de node.
 * Cada tipo tem seu drawer com lógica, visual e ações únicas.
 */
import LegacyProjectNodeDrawer, { type ClientFolderOption } from "./LegacyProjectNodeDrawer";
import BriefingNodeDrawer from "./BriefingNodeDrawer";
import AccessVaultDrawer from "./AccessVaultDrawer";
import FunnelEditorDrawer from "./FunnelEditorDrawer";
import LancamentoNodeDrawer from "./LancamentoNodeDrawer";
import KickoffNodeDrawer from "./KickoffNodeDrawer";
import {
  LandingPageDrawer, CRMDrawer, AutomacaoDrawer, ConteudoDrawer,
  TrafegoPagoDrawer, IAAgentDrawer, MetricaDrawerV2, ObjetivoDrawer,
  CaseDrawer, DecisaoDrawer,
} from "./NodeDrawers";
import OperationalNodeDrawer from "./OperationalNodeDrawer";
import { resolveProjectNodeKind, type ProjectNodeKind } from "./canvasProjectTypes";
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
  availableNodes?: Array<CanvasNodeRecord & { parent_node_id?: string | null }>;
  onOpenChat?: (nodeId: string) => void;
}

export default function ProjectNodeDrawer(props: Props) {
  const { node } = props;
  if (!node) return null;

  const kind = resolveProjectNodeKind({ nodeType: node.node_type, data: node.data }) as ProjectNodeKind | null;
  const parentFolder = resolveClientFolder(node, props.clientFolders, props.availableNodes);
  const clientId = parentFolder?.linkedClientId ?? null;
  const clientName = parentFolder?.name ?? "Cliente";

  // ── Sem kind → Legacy fallback
  if (!kind) return <LegacyProjectNodeDrawer {...props} />;

  // Shared props passados a todos os drawers específicos
  const shared = {
    node,
    open: props.open,
    onOpenChange: props.onOpenChange,
    workspaceId: props.workspaceId,
    clientId: clientId ?? "",
    clientName,
    onDelete: props.onDelete,
    onUpdated: props.onUpdated,
    onOpenChat: props.onOpenChat,
  };

  // ── COFRE (acessos) — sem clientId ainda aceito via node
  if (kind === "acessos") {
    if (clientId) return <AccessVaultDrawer node={node} open={props.open} onOpenChange={props.onOpenChange} workspaceId={props.workspaceId} clientId={clientId} clientName={clientName} onDelete={props.onDelete} />;
    return <LegacyProjectNodeDrawer {...props} />;
  }

  // ── FUNIL — editor visual próprio
  if (kind === "funil" && clientId) {
    return <FunnelEditorDrawer node={node} open={props.open} onOpenChange={props.onOpenChange} workspaceId={props.workspaceId} clientId={clientId} clientName={clientName} onDelete={props.onDelete} />;
  }

  // ── BRIEFING — escolhe existente + consolida com IA
  if (kind === "briefing" && clientId) {
    return <BriefingNodeDrawer node={node} open={props.open} onOpenChange={props.onOpenChange} workspaceId={props.workspaceId} clientId={clientId} clientName={clientName} onDelete={props.onDelete} />;
  }

  // ── LANÇAMENTO — timeline T-7 → T+1
  if (kind === "lancamento" && clientId) {
    return <LancamentoNodeDrawer node={node} open={props.open} onOpenChange={props.onOpenChange} workspaceId={props.workspaceId} clientId={clientId} onDelete={props.onDelete} />;
  }

  // ── REUNIÃO / KICKOFF
  if (kind === "reuniao" && clientId) {
    return <KickoffNodeDrawer node={node} open={props.open} onOpenChange={props.onOpenChange} workspaceId={props.workspaceId} clientId={clientId} clientName={clientName} onDelete={props.onDelete} />;
  }

  // ── DRAWERS ESPECÍFICOS NOVOS ─────────────────────────────────
  if (!clientId) return <LegacyProjectNodeDrawer {...props} />;

  if (kind === "landing_page") return <LandingPageDrawer {...shared} />;
  if (kind === "crm")          return <CRMDrawer          {...shared} />;
  if (kind === "automacao")    return <AutomacaoDrawer    {...shared} />;
  if (kind === "conteudo" || kind === "video" || kind === "imagem") return <ConteudoDrawer {...shared} />;
  if (kind === "trafego" || kind === "email_mkt" || kind === "social") return <TrafegoPagoDrawer {...shared} />;
  if (kind === "ia" || kind === "agente")  return <IAAgentDrawer {...shared} />;
  if (kind === "metrica")      return <MetricaDrawerV2 {...shared} />;
  if (kind === "objetivo")     return <ObjetivoDrawer  {...shared} />;
  if (kind === "case")         return <CaseDrawer      {...shared} />;
  if (kind === "decisao")      return <DecisaoDrawer   {...shared} />;

  // ── OPERATIONAL para tipos que têm config mas sem drawer dedicado
  const OPERATIONAL_KINDS: ProjectNodeKind[] = [
    "site", "integracao", "asset", "before_after",
    "instrucao", "engine", "resultado", "ideia", "contato",
    "checklist", "contexto_ops", "documento",
  ];
  if (OPERATIONAL_KINDS.includes(kind)) {
    return <OperationalNodeDrawer node={node} open={props.open} onOpenChange={props.onOpenChange} workspaceId={props.workspaceId} clientId={clientId} clientName={clientName} onDelete={props.onDelete} onUpdated={props.onUpdated} onOpenChat={props.onOpenChat} />;
  }

  // ── Legacy fallback para tudo que não foi coberto
  return <LegacyProjectNodeDrawer {...props} />;
}

function resolveClientFolder(
  node: CanvasNodeRecord & { parent_node_id?: string | null },
  clientFolders: ClientFolderOption[] = [],
  availableNodes: Array<CanvasNodeRecord & { parent_node_id?: string | null }> = [],
) {
  const direct = clientFolders.find((c) => c.id === node.parent_node_id);
  if (direct) return direct;

  const byId = new Map(availableNodes.map((n) => [n.id, n] as const));
  let current: (CanvasNodeRecord & { parent_node_id?: string | null }) | undefined = node;
  const visited = new Set<string>();
  while (current?.parent_node_id && !visited.has(current.id)) {
    visited.add(current.id);
    const folder = clientFolders.find((c) => c.id === current?.parent_node_id);
    if (folder) return folder;
    current = byId.get(current.parent_node_id);
  }

  if (clientFolders.length === 1) return clientFolders[0];
  return null;
}
