import { memo, useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from "react";
import {
  ReactFlow, ReactFlowProvider, Background,
  applyNodeChanges, applyEdgeChanges,
  ConnectionMode, ConnectionLineType,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
  type ReactFlowInstance, type Viewport, SelectionMode, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Sparkles, LayoutGrid, Maximize2, Minimize2, Loader2, Building2, Search, Workflow, MousePointer2, Hand, Lock, Grid3X3, Camera, Type, Image, FileStack, Bot, Megaphone, Trophy, MessageCircle, Focus, Eye, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ProjectNodeCard, { type ProjectNodeData } from "./ProjectNodeCard";
import CanvasGroupNode from "./CanvasGroupNode";
import AiOrbNode, { type AiOrbType } from "./AiOrbNode";
import AiOrbConfigPanel from "./AiOrbConfigPanel";
import ChatNode, { type ChatNodeData, type ChatNodeFunction, type ChatNodeScope } from "./ChatNode";
import ProjectNodeDrawer from "./ProjectNodeDrawer";
import CanvasInspector from "./CanvasInspector";
import CanvasClientPicker from "./CanvasClientPicker";
import CanvasClientTabs, { type CanvasClientTab } from "./CanvasClientTabs";
import GenerateEsteiraDialog from "./GenerateEsteiraDialog";
import CanvasTemplatesDialog, { type CanvasTemplate, type NodeSnapshot, type EdgeSnapshot } from "./CanvasTemplatesDialog";
import ApplyPlaybookButton from "./ApplyPlaybookButton";
import DeletableEdge from "./DeletableEdge";
import type { EsteiraTemplate } from "./esteiraTemplates";
import { readCanvasOperationalMeta, type ApprovalStatus, type CanvasOperationalMeta } from "./canvasOperationalMeta";
import {
  ACELERA_STAGES, PROJECT_TYPES, STAGE_COLUMN_WIDTH,
  getProjectTypeMeta, getStageMeta, stageColumnX, getChecklistTemplate,
  projectKindToDbNodeType, getNodeFlowRole, getNodeFamily, type ProjectNodeKind, type AceleraStageKey,
} from "./canvasProjectTypes";
import { mapLegacyStatus, premiumStatusToDb } from "./canvasEsteiraStatus";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import { AI_ORBS, createAiOrbData } from "./aiOrbConstants";
import { generatedNodePosition, validateOrbConnection } from "./aiOrbConnections";
import { invokeAiOrbGenerate, nextOrbDataAfterGeneration, readAiOrbData } from "./aiOrbEngine";

// CanvasStudio é uma camada visual operacional complementar: não substitui o briefing mestre,
// não cria nova lógica/tabela de sinais estruturados e não usa IA opaca como núcleo decisório.

interface CanvasEdgeRecord {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string | null;
  label: string | null;
}

type CanvasNodeRow = CanvasNodeRecord & { parent_node_id?: string | null };

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
  onTimelineRefresh?: () => Promise<void> | void;
  initialStatusFilter?: string | null;
}

const nodeTypes = {
  projectCard: ProjectNodeCard,
  canvasGroup: CanvasGroupNode,
  aiOrb: AiOrbNode,
  chatNode: ChatNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const CLIENT_BAR_Y = 0;
const CLIENT_BAR_HEIGHT = 52;
const CLIENT_BAR_GAP = 220;
const CONTENT_TOP = CLIENT_BAR_HEIGHT + 12;
const STAGE_BAND_HEIGHT = 2400; // long enough for many nodes
const NODE_VERTICAL = 130;
const NODE_X_OFFSET = 36; // x inside column
const TOTAL_STAGE_WIDTH = STAGE_COLUMN_WIDTH * ACELERA_STAGES.length;
const CANVAS_PADDING = 640;
const CANVAS_TRANSLATE_EXTENT: [[number, number], [number, number]] = [
  [-CANVAS_PADDING, -CANVAS_PADDING],
  [TOTAL_STAGE_WIDTH + CANVAS_PADDING, CONTENT_TOP + STAGE_BAND_HEIGHT + CANVAS_PADDING],
];
const FIT_VIEW_OPTIONS = { padding: 0.4 };
const DEFAULT_EDGE_OPTIONS = { type: "bezier", animated: true };
const PAN_ON_DRAG = [0, 1, 2];
const SELECTION_KEY_CODE = ["Shift"];
const MULTI_SELECTION_KEY_CODE = ["Meta", "Control"];
const CONNECTION_LINE_STYLE = { stroke: "hsl(var(--primary))", strokeWidth: 2.5, strokeDasharray: "8 4", opacity: 0.85 };
const PRO_OPTIONS = { hideAttribution: true };

export function getCanvasInteractionConfig(activeTool: "select" | "hand") {
  return {
    // Hand tool: qualquer botão arrasta/pan
    // Select tool: só botão do meio (1) e direito (2) fazem pan; esquerdo (0) cria caixa de seleção
    panOnDrag: activeTool === "hand" ? true : [1, 2],
    selectionOnDrag: activeTool === "select",
  };
}

export function resolveDockGroupClick(currentGroup: string | null, clickedGroup: string) {
  return currentGroup === clickedGroup ? null : clickedGroup;
}

function nodeStageOf(row: CanvasNodeRow): AceleraStageKey {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const stage = (data.stage ?? data.acelera_stage) as AceleraStageKey | undefined;
  return stage ?? "producao";
}

function nodeKindOf(row: CanvasNodeRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return (data.kind as string | undefined) ?? row.node_type;
}

const INPUT_KINDS = new Set(["contexto_ops", "briefing", "documento", "reuniao", "ideia", "objetivo", "acessos", "contato", "asset"]);
const INSTRUCTION_KINDS = new Set(["instrucao", "funil", "checklist"]);
const ENGINE_KINDS = new Set(["engine", "automacao", "ia", "integracao", "agente"]);
const RESULT_KINDS = new Set(["resultado", "landing_page", "site", "conteudo", "video", "imagem", "trafego", "email_mkt", "social", "crm", "lancamento", "metrica", "before_after", "case"]);
const DECISION_KINDS = new Set(["decisao"]);
const PROOF_KINDS = new Set(["metrica", "before_after", "case"]);
const FLOW_GRAMMAR = ["Contexto", "Instrução", "Engine", "Resultado", "Decisão", "Prova"];

export function buildAiOrbNodePayload({
  orbType, workspaceId, clientId, parentNodeId, x, y,
}: {
  orbType: AiOrbType;
  workspaceId: string;
  clientId: string;
  parentNodeId: string;
  x: number;
  y: number;
}) {
  const orb = AI_ORBS.find((item) => item.type === orbType) ?? AI_ORBS[0];
  return {
    workspace_id: workspaceId,
    client_id: clientId,
    node_type: "ai_orb",
    title: `AI Orb · ${orb.label}`,
    status: "active",
    description: orb.specialization,
    pos_x: x,
    pos_y: y,
    parent_node_id: parentNodeId,
    data: createAiOrbData(orbType),
  };
}
const DOCK_GROUPS = [
  { id: "text", label: "Texto", icon: Type, kinds: ["instrucao", "conteudo"] as ProjectNodeKind[] },
  { id: "media", label: "Mídia", icon: Image, kinds: ["imagem", "video"] as ProjectNodeKind[] },
  { id: "ref", label: "Ref.", icon: FileStack, kinds: ["contexto_ops", "documento", "briefing", "acessos"] as ProjectNodeKind[] },
  { id: "ai", label: "IA", icon: Bot, kinds: [] as ProjectNodeKind[] },
  { id: "chat", label: "Chat", icon: MessageCircle, kinds: [] as ProjectNodeKind[] },
  { id: "prod", label: "Prod.", icon: LayoutGrid, kinds: ["site", "landing_page", "automacao", "ia", "integracao", "funil"] as ProjectNodeKind[] },
  { id: "mkt", label: "Mkt", icon: Megaphone, kinds: ["trafego", "email_mkt", "social", "lancamento"] as ProjectNodeKind[] },
  { id: "proof", label: "Prova", icon: Trophy, kinds: ["metrica", "before_after", "case"] as ProjectNodeKind[] },
];
const OPS_FLOW_X: Record<string, number> = {
  context: 120,
  instruction: 120,
  engine: 620,
  result: 1080,
  decision: 1520,
  proof: 1080,
  narrative: 1960,
  execution: 1080,
  measurement: 1080,
};

type ConnectionValidation = { allowed: boolean; label: string | null; reason: string | null };
const allowConnection = (label: string | null): ConnectionValidation => ({ allowed: true, label, reason: null });
const blockConnection = (reason: string): ConnectionValidation => ({ allowed: false, label: null, reason });

function nodeLabel(row: CanvasNodeRow) {
  const kind = nodeKindOf(row);
  return getProjectTypeMeta(kind)?.shortLabel ?? row.title;
}

export function validateCanvasConnection(source: CanvasNodeRow, target: CanvasNodeRow) {
  const sourceKind = nodeKindOf(source);
  const targetKind = nodeKindOf(target);
  const orbValidation = validateOrbConnection(sourceKind, targetKind, (target.data as Record<string, unknown> | null)?.orbType as string | undefined);

  if (source.id === target.id) {
    return blockConnection("Um node não pode se conectar consigo mesmo.");
  }

  if (source.parent_node_id && target.parent_node_id && source.parent_node_id !== target.parent_node_id) {
    return blockConnection("Conecte nodes dentro da mesma pasta de cliente para manter rastreabilidade e evitar fluxo cruzado.");
  }

  if (PROOF_KINDS.has(sourceKind) && INPUT_KINDS.has(targetKind)) {
    return blockConnection("Provas não alimentam contexto diretamente.");
  }

  if (orbValidation) return orbValidation;

  if (INPUT_KINDS.has(sourceKind) && ENGINE_KINDS.has(targetKind)) return allowConnection("alimenta");
  if (INSTRUCTION_KINDS.has(sourceKind) && ENGINE_KINDS.has(targetKind)) return allowConnection("regra");
  if (ENGINE_KINDS.has(sourceKind) && RESULT_KINDS.has(targetKind)) return allowConnection("gera");
  if (RESULT_KINDS.has(sourceKind) && DECISION_KINDS.has(targetKind)) return allowConnection("aprovar");
  if ((RESULT_KINDS.has(sourceKind) || DECISION_KINDS.has(sourceKind)) && PROOF_KINDS.has(targetKind)) return allowConnection("prova");
  if (sourceKind === "metrica" && targetKind === "before_after") return allowConnection("compara");
  if (sourceKind === "before_after" && targetKind === "case") return allowConnection("caso");
  if (DECISION_KINDS.has(sourceKind) && (INSTRUCTION_KINDS.has(targetKind) || ENGINE_KINDS.has(targetKind) || RESULT_KINDS.has(targetKind))) return allowConnection("próxima");

  if (INPUT_KINDS.has(sourceKind) && INSTRUCTION_KINDS.has(targetKind)) return allowConnection("base");
  if (INSTRUCTION_KINDS.has(sourceKind) && RESULT_KINDS.has(targetKind)) return allowConnection("guia");
  if (INPUT_KINDS.has(sourceKind) && RESULT_KINDS.has(targetKind)) return allowConnection("referência");
  if (ENGINE_KINDS.has(sourceKind) && DECISION_KINDS.has(targetKind)) return allowConnection("decide");
  if (RESULT_KINDS.has(sourceKind) && INSTRUCTION_KINDS.has(targetKind)) return allowConnection("revisar");

  return allowConnection(null);
}

function edgeIntent(edge: CanvasEdgeRecord, nodesById: Map<string, CanvasNodeRow>) {
  const sourceKind = edge.source_node_id && nodesById.get(edge.source_node_id) ? nodeKindOf(nodesById.get(edge.source_node_id)!) : "";
  const targetKind = edge.target_node_id && nodesById.get(edge.target_node_id) ? nodeKindOf(nodesById.get(edge.target_node_id)!) : "";
  if (sourceKind === "ai_orb" || targetKind === "ai_orb") return { label: edge.label ?? "IA", stroke: "hsl(var(--node-tech))", animated: true, className: "edge-ai", strokeWidth: 2.4 };
  if (PROOF_KINDS.has(targetKind) || PROOF_KINDS.has(sourceKind)) return { label: edge.label ?? "prova", stroke: "hsl(var(--node-proof))", animated: false, className: "edge-proof", strokeWidth: 2.8 };
  if (targetKind === "engine") return { label: edge.label ?? "input", stroke: "hsl(var(--node-tech))", animated: true, className: "edge-input", strokeWidth: 2.6 };
  if (sourceKind === "engine") return { label: edge.label ?? "gera", stroke: "hsl(var(--node-build))", animated: true, className: "edge-engine", strokeWidth: 3 };
  if (targetKind === "decisao" || sourceKind === "decisao") return { label: edge.label ?? "aprova", stroke: "hsl(var(--node-growth))", animated: false, className: "edge-decision", strokeWidth: 2.5 };
  return { label: edge.label ?? undefined, stroke: "hsl(var(--primary))", animated: true, className: "edge-flow", strokeWidth: 2.3 };
}

function CanvasStudioInner({
  workspaceId, clientId, clientName,
  fullscreen, onToggleFullscreen, onTimelineRefresh, initialStatusFilter,
}: Props) {
  
  const [dbNodes, setDbNodes] = useState<CanvasNodeRow[]>([]);
  const [dbEdges, setDbEdges] = useState<CanvasEdgeRecord[]>([]);
  const [clientLogos, setClientLogos] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<CanvasNodeRow | null>(null);
  const [aiOrbConfigNode, setAiOrbConfigNode] = useState<CanvasNodeRow | null>(null);

  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(initialStatusFilter ?? null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalStatus | "all">("all");
  const [blockedFilter, setBlockedFilter] = useState<"all" | "blocked" | "clear">("all");
  const [ownerFilter, setOwnerFilter] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);
  const [activeTool, setActiveTool] = useState<"select" | "hand">("select");
  const [gridVisible, setGridVisible] = useState(true);
  const [lockedNodes, setLockedNodes] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [openDockGroup, setOpenDockGroup] = useState<string | null>(null);
  const dbNodesRef = useRef<CanvasNodeRow[]>([]);
  const dbEdgesRef = useRef<CanvasEdgeRecord[]>([]);

  // Active client folder (null = "Todos")
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  // Plan name of the currently displayed client (fetched from clients table)
  const [clientPlanName, setClientPlanName] = useState<string | null>(null);

  useEffect(() => { dbNodesRef.current = dbNodes; }, [dbNodes]);
  useEffect(() => { dbEdgesRef.current = dbEdges; }, [dbEdges]);

  // Load client plan_name for ApplyPlaybookButton
  useEffect(() => {
    if (!clientId) { setClientPlanName(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("plan_name")
        .eq("id", clientId)
        .maybeSingle();
      if (!cancelled) setClientPlanName((data?.plan_name as string | null) ?? null);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  useEffect(() => {
    setStatusFilter(initialStatusFilter ?? null);
  }, [initialStatusFilter]);

  // Quick add menu (advanced)
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Generate esteira (per-plan template) dialog
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: nodesData }, { data: edgesData }] = await Promise.all([
      // Only fields the card/drawer actually need — cuts ~40% of payload
      supabase.from("canvas_nodes")
        .select("id, node_type, title, description, status, pos_x, pos_y, data, parent_node_id, linked_entity_id, linked_entity_type, workspace_id, client_id, created_at, updated_at")
        .eq("workspace_id", workspaceId)
        .order("created_at"),
      supabase.from("canvas_edges")
        .select("id, source_node_id, target_node_id, source_handle, target_handle, edge_type, label, workspace_id")
        .eq("workspace_id", workspaceId),
    ]);
    setDbNodes((nodesData ?? []) as CanvasNodeRow[]);
    setDbEdges((edgesData ?? []) as CanvasEdgeRecord[]);

    // Fetch logos for all linked clients (tolerant if column doesn't exist)
    const linkedIds = Array.from(
      new Set(
        ((nodesData ?? []) as CanvasNodeRow[])
          .filter((n) => n.node_type === "client" && n.linked_entity_id)
          .map((n) => n.linked_entity_id as string),
      ),
    );
    if (linkedIds.length > 0) {
      const { data: logos, error: logoErr } = await supabase
        .from("clients")
        .select("id, logo_url")
        .in("id", linkedIds);
      if (!logoErr && logos) {
        const map: Record<string, string | null> = {};
        (logos as Array<{ id: string; logo_url: string | null }>).forEach((c) => {
          map[c.id] = c.logo_url ?? null;
        });
        setClientLogos(map);
      }
    } else {
      setClientLogos({});
    }

    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Derive groups (clients) and per-stage lanes */
  const clientGroups = useMemo(
    () => dbNodes
      .filter((n) => n.node_type === "client")
      .slice()
      .sort((a, b) => Number(a.pos_x ?? 0) - Number(b.pos_x ?? 0)),
    [dbNodes],
  );
  const projectNodes = useMemo(
    () => dbNodes.filter((n) => n.node_type !== "client"),
    [dbNodes],
  );

  /* Auto-select first client when data loads */
  useEffect(() => {
    if (loading) return;
    if (activeClientId === null && clientGroups.length > 0) {
      setActiveClientId(clientGroups[0].id);
    }
    // If active client was removed, fall back
    if (activeClientId && !clientGroups.find((c) => c.id === activeClientId)) {
      setActiveClientId(clientGroups[0]?.id ?? null);
    }
  }, [loading, clientGroups, activeClientId]);

  /* Tabs metadata */
  const clientTabs: CanvasClientTab[] = useMemo(
    () => clientGroups.map((c) => ({
      id: c.id,
      title: c.title,
      childCount: projectNodes.filter((n) => n.parent_node_id === c.id).length,
      linkedClientId: c.linked_entity_id,
      logoUrl: c.linked_entity_id ? clientLogos[c.linked_entity_id] ?? null : null,
    })),
    [clientGroups, projectNodes, clientLogos],
  );

  /* Quick lookup: parent group id → { name, logoUrl, seed } */
  const groupMeta = useMemo(() => {
    const map: Record<string, { name: string; logoUrl: string | null; seed: string }> = {};
    clientGroups.forEach((c) => {
      map[c.id] = {
        name: c.title,
        logoUrl: c.linked_entity_id ? clientLogos[c.linked_entity_id] ?? null : null,
        seed: c.linked_entity_id ?? c.id,
      };
    });
    return map;
  }, [clientGroups, clientLogos]);

  /* Project nodes visible based on active tab */
  const scopedProjectNodes = useMemo(() => {
    if (activeClientId === null) return projectNodes;
    return projectNodes.filter((n) => n.parent_node_id === activeClientId);
  }, [projectNodes, activeClientId]);

  type QuickAddState = { open: boolean; sourceId: string | null; dir: "right" | "bottom" | null };
  const [quickAddState, setQuickAddState] = useState<QuickAddState>({ open: false, sourceId: null, dir: null });

  const quickConnectFromNode = useCallback((sourceId: string, dir: "right" | "bottom") => {
    setQuickAddState({ open: true, sourceId, dir });
  }, []);

  const visibleCanvasNodes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    return scopedProjectNodes.filter((node) => {
      const meta = readCanvasOperationalMeta(node.data as Record<string, unknown> | null);
      if (typeFilter && nodeKindOf(node) !== typeFilter && node.node_type !== typeFilter) return false;
      if (statusFilter && mapLegacyStatus(node.status) !== statusFilter) return false;
      if (approvalFilter !== "all" && meta.approvalStatus !== approvalFilter) return false;
      if (blockedFilter === "blocked" && !meta.blockedReason && node.status !== "blocked" && node.status !== "bloqueado") return false;
      if (blockedFilter === "clear" && (meta.blockedReason || node.status === "blocked" || node.status === "bloqueado")) return false;
      if (ownerFilter && meta.ownerName !== ownerFilter) return false;
      if (q && !node.title.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [scopedProjectNodes, deferredSearch, typeFilter, statusFilter, approvalFilter, blockedFilter, ownerFilter]);

  const scopedProjectIds = useMemo(() => new Set(scopedProjectNodes.map((n) => n.id)), [scopedProjectNodes]);
  const scopedEdges = useMemo(
    () => dbEdges.filter((edge) => scopedProjectIds.has(edge.source_node_id) && scopedProjectIds.has(edge.target_node_id)),
    [dbEdges, scopedProjectIds],
  );

  /* ─── Persist viewport (zoom + pan) por escopo cliente/workspace ────
   * Cada combinação (workspace, clienteAtivo) tem seu próprio viewport
   * salvo em localStorage. Restaurado ao trocar aba; salvo ao mover/zoom.
   * Fallback: fitView quando não há viewport salvo (primeira visita).
   */
  const viewportScope = `canvas:viewport:${workspaceId}:${activeClientId ?? "all"}`;
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const expandEngineHubRef = useRef<((engineNodeId: string) => void | Promise<void>) | null>(null);
  const restoredScopesRef = useRef<Set<string>>(new Set());
  const draggingNodesRef = useRef<Set<string>>(new Set());
  const saveTimerRef = useRef<number | null>(null);

  const readSavedViewport = useCallback((scope: string): Viewport | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(scope);
      if (!raw) return null;
      const v = JSON.parse(raw) as Partial<Viewport>;
      if (typeof v.x === "number" && typeof v.y === "number" && typeof v.zoom === "number") {
        return { x: v.x, y: v.y, zoom: v.zoom };
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  const handleRfInit = useCallback((inst: ReactFlowInstance) => {
    rfInstanceRef.current = inst;
    const saved = readSavedViewport(viewportScope);
    if (saved) {
      inst.setViewport(saved, { duration: 0 });
      restoredScopesRef.current.add(viewportScope);
    } else {
      // primeira visita nesse escopo — deixa o fitView default agir
      inst.fitView({ padding: 0.4, duration: 0 });
      restoredScopesRef.current.add(viewportScope);
    }
  }, [viewportScope, readSavedViewport]);

  // Restaura quando muda de aba (cliente) sem desmontar o ReactFlow
  useEffect(() => {
    const inst = rfInstanceRef.current;
    if (!inst) return;
    if (restoredScopesRef.current.has(viewportScope)) return;
    const saved = readSavedViewport(viewportScope);
    if (saved) inst.setViewport(saved, { duration: 250 });
    else inst.fitView({ padding: 0.4, duration: 250 });
    restoredScopesRef.current.add(viewportScope);
  }, [viewportScope, readSavedViewport]);

  // Persiste com debounce no fim de cada pan/zoom
  const handleMoveEnd = useCallback((_e: unknown, vp: Viewport) => {
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(viewportScope, JSON.stringify({ x: vp.x, y: vp.y, zoom: vp.zoom }));
      } catch { /* quota — ignore */ }
    }, 250);
  }, [viewportScope]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = !!target && (
        target.tagName === "INPUT"
        || target.tagName === "TEXTAREA"
        || target.isContentEditable
      );
      if (isTyping) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setRfNodes((nodes) => nodes.map((node) => ({ ...node, selected: true })));
        setRfEdges((edges) => edges.map((edge) => ({ ...edge, selected: true })));
      }
      if (e.key.toLowerCase() === "v") setActiveTool("select");
      if (e.key.toLowerCase() === "h") setActiveTool("hand");
      if (e.key.toLowerCase() === "g") setGridVisible((v) => !v);
      if (e.key.toLowerCase() === "f") rfInstanceRef.current?.fitView({ padding: 0.32, duration: 280 });
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const reactFlowNodes = useMemo(() => {
    return visibleCanvasNodes.map((n): Node => {
      const owner = n.parent_node_id ? groupMeta[n.parent_node_id] : null;
      const dataObj = (n.data as Record<string, unknown> | null) ?? {};
      const operationalMeta = (dataObj.operationalMeta ?? dataObj.operational_meta ?? {}) as CanvasOperationalMeta;
      const attachmentList = (dataObj.attachments as Array<{ url?: string; type?: string; label?: string }> | undefined) ?? [];
      const isAiOrb = n.node_type === "ai_orb" || dataObj.kind === "ai_orb";
      const isChatNode = dataObj.kind === "chat_node";

      if (isChatNode) {
        // Collect connected node IDs from edges
        const connectedIds = dbEdges
          .filter((e) => e.source_node_id === n.id || e.target_node_id === n.id)
          .map((e) => e.source_node_id === n.id ? e.target_node_id : e.source_node_id)
          .filter((id) => id !== n.id);
        return {
          id: n.id,
          type: "chatNode",
          position: { x: Number(n.pos_x ?? 0), y: Number(n.pos_y ?? CONTENT_TOP) },
          draggable: !lockedNodes,
          data: {
            ...(dataObj as ChatNodeData),
            nodeId: n.id,
            workspaceId,
            clientId,
            connectedNodeIds: connectedIds,
          },
        };
      }

      return {
        id: n.id,
        type: isAiOrb ? "aiOrb" : "projectCard",
        position: { x: Number(n.pos_x ?? 0), y: Number(n.pos_y ?? CONTENT_TOP) },
        draggable: !lockedNodes,
        data: {
          title: n.title,
          kind: nodeKindOf(n),
          orbType: (dataObj.orbType ?? "planner") as AiOrbType,
          label: (dataObj.orbLabel ?? n.title) as string,
          specialization: (dataObj.specialization ?? n.description ?? "agente conectado") as string,
          isGenerating: !!dataObj.isGenerating,
          status: n.status,
          description: n.description,
          hasLinkedEntity: !!n.linked_entity_id,
          links: (dataObj.links as unknown[] | undefined)?.length ?? 0,
          attachments: attachmentList.length,
          checklistTotal: (dataObj.checklist as Array<{ done?: boolean }> | undefined)?.length ?? 0,
          checklistDone: (dataObj.checklist as Array<{ done?: boolean }> | undefined)?.filter((c) => c.done).length ?? 0,
          clientName: owner?.name ?? null,
          clientSeed: owner?.seed ?? null,
          clientLogoUrl: owner?.logoUrl ?? null,
          operationalMeta,
          nodeId: n.id,
          workspaceId,
          onPrefilled: fetchData,
          onQuickConnect: (dir: "right" | "bottom") => quickConnectFromNode(n.id, dir),
          onDelete: () => { void handleDeleteNode(n.id); },
          canExpandHub: nodeKindOf(n) === "engine",
          onExpandHub: () => expandEngineHubRef.current?.(n.id),
          typeData: dataObj,
        } satisfies ProjectNodeData,
      };
    });
  }, [visibleCanvasNodes, groupMeta, workspaceId, fetchData, quickConnectFromNode, lockedNodes]);

  const reactFlowEdges = useMemo(() => {
    const visibleIds = new Set(visibleCanvasNodes.map((n) => n.id));
    const visibleById = new Map(visibleCanvasNodes.map((n) => [n.id, n]));
    return dbEdges
      .filter((e) => visibleIds.has(e.source_node_id) && visibleIds.has(e.target_node_id))
      .map((e): Edge => {
        const intent = edgeIntent(e, visibleById);
        return {
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          sourceHandle: (e as CanvasEdgeRecord & { source_handle?: string | null }).source_handle ?? undefined,
          targetHandle: (e as CanvasEdgeRecord & { target_handle?: string | null }).target_handle ?? undefined,
          label: intent.label,
          animated: intent.animated,
          type: "deletable",
          className: intent.className,
          markerEnd: { type: MarkerType.ArrowClosed, color: intent.stroke, width: 18, height: 18 },
          style: { stroke: intent.stroke, strokeWidth: intent.strokeWidth },
        };
      });
  }, [dbEdges, visibleCanvasNodes]);

  /* DB → ReactFlow — preserva posição LOCAL quando o node já existe no canvas.
   * Motivo: sem isso, ao adicionar/editar qualquer node TODOS os outros voltam
   * para pos_x/pos_y do DB, desfazendo organização manual do usuário. */
  useEffect(() => {
    setRfNodes((currentRfNodes) => {
      const byId = new Map(currentRfNodes.map(n => [n.id, n]));
      return reactFlowNodes.map((newNode) => {
        const existing = byId.get(newNode.id);
        // Node novo → usa posição do DB
        if (!existing) return newNode;
        // Node sendo arrastado → mantém posição atual (já é a drag live)
        if (draggingNodesRef.current.has(newNode.id)) {
          return { ...newNode, position: existing.position };
        }
        // Node existente → atualiza DATA mas MANTÉM posição local
        // (a posição no DB só vale pra primeira renderização)
        return { ...newNode, position: existing.position };
      });
    });
  }, [reactFlowNodes]);

  useEffect(() => {
    setRfEdges(reactFlowEdges);
  }, [reactFlowEdges]);

  /* ReactFlow handlers */
  // Batch position updates — avoid hammering DB when moving many nodes
  const positionUpdateQueueRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const positionFlushTimerRef = useRef<number | null>(null);

  const flushPositionUpdates = useCallback(() => {
    const queue = positionUpdateQueueRef.current;
    if (queue.size === 0) return;
    const entries = Array.from(queue.entries());
    queue.clear();
    // Parallel updates — but only one per node, batched
    void Promise.all(
      entries.map(([id, pos]) =>
        supabase
          .from("canvas_nodes")
          .update({ pos_x: pos.x, pos_y: pos.y, updated_at: new Date().toISOString() })
          .eq("id", id)
      )
    );
  }, []);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
    for (const c of changes) {
      if (c.type === "position") {
        if (c.dragging === true) {
          draggingNodesRef.current.add(c.id);
        } else if (c.dragging === false && c.position) {
          draggingNodesRef.current.delete(c.id);
          // Enqueue instead of firing DB call immediately
          positionUpdateQueueRef.current.set(c.id, { x: c.position.x, y: c.position.y });
          if (positionFlushTimerRef.current) window.clearTimeout(positionFlushTimerRef.current);
          positionFlushTimerRef.current = window.setTimeout(flushPositionUpdates, 400);
        }
      }
    }
  }, [flushPositionUpdates]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
    for (const c of changes) {
      if (c.type === "remove") {
        supabase.from("canvas_edges").delete().eq("id", c.id).then(({ error }) => {
          if (error) toast({ title: "Erro ao remover conexão", description: error.message, variant: "destructive" });
          else fetchData();
        });
      }
    }
  }, [fetchData]);

  const onConnect = useCallback(async (conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return;
    const sourceNode = dbNodesRef.current.find((n) => n.id === conn.source);
    const targetNode = dbNodesRef.current.find((n) => n.id === conn.target);
    if (!sourceNode || !targetNode) return;
    const sourceKind = nodeKindOf(sourceNode);
    const targetKind = nodeKindOf(targetNode);

    const validation = validateCanvasConnection(sourceNode, targetNode);
    if (!validation.allowed) {
      const hardBlocked = validation.reason?.includes("si mesmo") || validation.reason?.includes("mesma pasta");
      toast({
        title: hardBlocked ? "Conexão bloqueada" : "Atenção",
        description: validation.reason ?? "Conexão fora do fluxo padrão.",
        variant: hardBlocked ? "destructive" : "default",
      });
      if (hardBlocked) return;
    }

    const alreadyExists = dbEdgesRef.current.some((edge) => edge.source_node_id === conn.source && edge.target_node_id === conn.target);
    if (alreadyExists) {
      toast({ title: "Conexão já existe", description: "Esses nodes já estão ligados no canvas." });
      return;
    }

    const { data, error } = await supabase
      .from("canvas_edges")
      .insert({
        workspace_id: workspaceId,
        source_node_id: conn.source,
        target_node_id: conn.target,
        source_handle: conn.sourceHandle ?? null,
        target_handle: conn.targetHandle ?? null,
        edge_type: "ops",
        label: validation.label,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
      return;
    }
    if (data) setDbEdges((prev) => [...prev, data as CanvasEdgeRecord]);

    if (INPUT_KINDS.has(sourceKind)) {
      const targetData = (targetNode.data as Record<string, unknown> | null) ?? {};
      const targetReferences = Array.isArray(targetData.references)
        ? targetData.references as Array<{ nodeId: string; kind: string; title: string; addedAt?: string }>
        : [];
      if (!targetReferences.some((ref) => ref.nodeId === sourceNode.id)) {
        const sourceTags = (sourceNode.data as Record<string, unknown> | null)?.tags;
        const currentTargetTags = Array.isArray(targetData.tags) ? targetData.tags as string[] : [];
        const mergedTags = Array.isArray(sourceTags)
          ? Array.from(new Set([...currentTargetTags, ...(sourceTags as string[])]))
          : currentTargetTags;
        const updatedData = {
          ...targetData,
          references: [...targetReferences, { nodeId: sourceNode.id, kind: sourceKind, title: sourceNode.title, addedAt: new Date().toISOString() }],
          tags: mergedTags,
          contextLastUpdatedAt: new Date().toISOString(),
        };
        await supabase.from("canvas_nodes").update({ data: updatedData, updated_at: new Date().toISOString() }).eq("id", targetNode.id);
        setDbNodes((prev) => prev.map((n) => (n.id === targetNode.id ? { ...n, data: updatedData } : n)));
        toast({ title: "Contexto propagado", description: `"${sourceNode.title}" agora alimenta "${targetNode.title}"` });
      }
    }

    if (targetNode.node_type === "ai_orb") {
      const orbData = readAiOrbData(targetNode.data as Record<string, unknown> | null);
      const updatedOrbData = {
        ...orbData,
        memory: [...(orbData.memory ?? []).slice(-11), {
          timestamp: new Date().toISOString(),
          action: "connected" as const,
          insight: `Recebeu input de "${sourceNode.title}" (${sourceKind})`,
          sourceNodeId: sourceNode.id,
        }],
      };
      await supabase.from("canvas_nodes").update({ data: updatedOrbData, updated_at: new Date().toISOString() }).eq("id", targetNode.id);
      setDbNodes((prev) => prev.map((n) => (n.id === targetNode.id ? { ...n, data: updatedOrbData } : n)));
    }

    const suggestion = (() => {
      if ((sourceKind === "briefing" || sourceKind === "contexto_ops") && ENGINE_KINDS.has(targetKind)) return { kind: "resultado", reason: "Engine costuma gerar um resultado." };
      if ((sourceKind === "briefing" || sourceKind === "contexto_ops") && INSTRUCTION_KINDS.has(targetKind)) return { kind: "engine", reason: "Instruções alimentam uma engine." };
      if (ENGINE_KINDS.has(sourceKind) && RESULT_KINDS.has(targetKind)) return { kind: "metrica", reason: "Meça o resultado com KPIs." };
      if (RESULT_KINDS.has(sourceKind) && PROOF_KINDS.has(targetKind)) return { kind: "case", reason: "Provas consolidam em case de sucesso." };
      return null;
    })();
    if (suggestion) {
      toast({ title: "Próximo passo sugerido", description: `${suggestion.reason} Criar um node "${suggestion.kind}"?` });
    }

    await onTimelineRefresh?.();
  }, [workspaceId, onTimelineRefresh]);

  const isValidConnection = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target || conn.source === conn.target) return false;
    const sourceNode = dbNodesRef.current.find((n) => n.id === conn.source);
    const targetNode = dbNodesRef.current.find((n) => n.id === conn.target);
    if (!sourceNode || !targetNode) return false;
    const validation = validateCanvasConnection(sourceNode, targetNode);
    if (validation.allowed) return true;
    return !(validation.reason?.includes("si mesmo") || validation.reason?.includes("mesma pasta"));
  }, []);

  /** Reconectar edge: quando usuário arrasta um endpoint de edge para outro node */
  const handleReconnectEdge = useCallback(async (oldEdge: Edge, newConn: Connection) => {
    if (!newConn.source || !newConn.target || newConn.source === newConn.target) return;
    const sourceNode = dbNodesRef.current.find((n) => n.id === newConn.source);
    const targetNode = dbNodesRef.current.find((n) => n.id === newConn.target);
    if (!sourceNode || !targetNode) return;

    // Validação básica
    const validation = validateCanvasConnection(sourceNode, targetNode);
    if (!validation.allowed) {
      const hardBlocked = validation.reason?.includes("si mesmo") || validation.reason?.includes("mesma pasta");
      if (hardBlocked) {
        toast({ title: "Reconexão bloqueada", description: validation.reason, variant: "destructive" });
        return;
      }
    }

    // Check duplicate
    const alreadyExists = dbEdgesRef.current.some(
      (e) => e.id !== oldEdge.id && e.source_node_id === newConn.source && e.target_node_id === newConn.target
    );
    if (alreadyExists) {
      toast({ title: "Conexão já existe", description: "Esses nodes já estão ligados." });
      return;
    }

    // Update edge in DB
    const { error } = await supabase
      .from("canvas_edges")
      .update({
        source_node_id: newConn.source,
        target_node_id: newConn.target,
        source_handle: newConn.sourceHandle ?? null,
        target_handle: newConn.targetHandle ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", oldEdge.id);

    if (error) {
      toast({ title: "Erro ao reconectar", description: error.message, variant: "destructive" });
      return;
    }

    // Local state update
    setDbEdges((prev) => prev.map((e) =>
      e.id === oldEdge.id
        ? { ...e, source_node_id: newConn.source!, target_node_id: newConn.target!, source_handle: newConn.sourceHandle ?? null, target_handle: newConn.targetHandle ?? null }
        : e
    ));
    toast({ title: "Conexão atualizada", description: `${sourceNode.title} → ${targetNode.title}` });
  }, []);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    const found = dbNodes.find((n) => n.id === node.id);
    if (!found) return;
    if (found.node_type === "client") return; // client groups don't open drawer
    if (nodeKindOf(found) === "ai_orb") {
      setAiOrbConfigNode(found);
      return;
    }
    setSelectedNode(found);
  }, [dbNodes]);

  /** ═══ CONNECTING STATE — ativa classe CSS .connecting durante drag de conexão.
   *   Isso faz todos os 12 handles de TODOS os nodes ficarem visíveis, ajudando
   *   o usuário a ver onde pode conectar. */
  const onConnectStart = useCallback(() => {
    document.querySelector(".canvas-flow")?.classList.add("connecting");
  }, []);
  const onConnectEnd = useCallback(() => {
    document.querySelector(".canvas-flow")?.classList.remove("connecting");
  }, []);

  /** ═══ EDGE CONTEXT MENU — right-click na edge abre opções. */
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);
  const onEdgeContextMenu = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
  }, []);

  /** ═══ EDGE DOUBLE CLICK — editar label inline. */
  const onEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.preventDefault();
    const newLabel = window.prompt("Rótulo da conexão (vazio para remover):", String(edge.label ?? ""));
    if (newLabel === null) return;
    const cleanLabel = newLabel.trim() || null;
    void supabase
      .from("canvas_edges")
      .update({ label: cleanLabel, updated_at: new Date().toISOString() })
      .eq("id", edge.id)
      .then(({ error }) => {
        if (error) { toast({ title: "Erro ao editar rótulo", description: error.message, variant: "destructive" }); return; }
        setDbEdges((prev) => prev.map((e) => e.id === edge.id ? { ...e, label: cleanLabel } : e));
        toast({ title: cleanLabel ? "Rótulo atualizado" : "Rótulo removido" });
      });
  }, []);

  /** ═══ INVERT EDGE DIRECTION — helper used by context menu. */
  const invertEdgeDirection = useCallback(async (edgeId: string) => {
    const edge = dbEdgesRef.current.find((e) => e.id === edgeId);
    if (!edge) return;
    const { error } = await supabase
      .from("canvas_edges")
      .update({
        source_node_id: edge.target_node_id,
        target_node_id: edge.source_node_id,
        source_handle: (edge as CanvasEdgeRecord & { target_handle?: string | null }).target_handle ?? null,
        target_handle: (edge as CanvasEdgeRecord & { source_handle?: string | null }).source_handle ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", edgeId);
    if (error) { toast({ title: "Erro ao inverter", description: error.message, variant: "destructive" }); return; }
    setDbEdges((prev) => prev.map((e) =>
      e.id === edgeId
        ? { ...e, source_node_id: edge.target_node_id, target_node_id: edge.source_node_id,
            source_handle: (e as any).target_handle ?? null,
            target_handle: (e as any).source_handle ?? null }
        : e
    ));
    toast({ title: "Direção invertida" });
  }, []);

  /** Delete edge used by context menu */
  const deleteEdgeById = useCallback(async (edgeId: string) => {
    const { error } = await supabase.from("canvas_edges").delete().eq("id", edgeId);
    if (error) { toast({ title: "Erro ao remover", description: error.message, variant: "destructive" }); return; }
    setDbEdges((prev) => prev.filter((e) => e.id !== edgeId));
    toast({ title: "Conexão removida" });
  }, []);

  /* Pick parent: prioriza cliente da aba ativa */
  const pickParentGroup = useCallback((resolvedClientId?: string | null): string | null => {
    if (resolvedClientId) return resolvedClientId;
    if (activeClientId) return activeClientId;
    if (clientGroups.length === 1) return clientGroups[0].id;
    return null;
  }, [activeClientId, clientGroups]);

  /* Quando o usuário tenta criar um node sem cliente ativo e existem várias pastas,
   * abre o seletor de cliente para evitar nodes "órfãos".
   * Retorna o id do cliente/pasta que deve receber o novo node. */
  const ensureActiveClient = useCallback((): string | null => {
    if (clientGroups.length === 0) {
      toast({
        title: "Adicione um cliente primeiro",
        description: "Cada esteira pertence a uma pasta de cliente.",
      });
      setClientPickerOpen(true);
      return null;
    }

    const resolvedClientId = activeClientId ?? clientGroups[0]?.id ?? null;
    if (resolvedClientId && activeClientId !== resolvedClientId) {
      setActiveClientId(resolvedClientId);
    }
    return resolvedClientId;
  }, [activeClientId, clientGroups]);

  /* Add a project node at chosen kind+stage */
  const addProjectNode = useCallback(async (
    kind: ProjectNodeKind,
    stage: AceleraStageKey,
    opts: { sourceId?: string | null; dir?: "right" | "bottom" | null } = {},
  ) => {
    // Must have a client folder selected
    const resolvedParent = ensureActiveClient();
    if (!resolvedParent) return;
    const meta = getProjectTypeMeta(kind);
    if (!meta) return;
    const dbType = projectKindToDbNodeType(kind);

    // Compute position: based on source if connecting, else stack inside the active client's stage column
    let pos_x = stageColumnX(stage) + NODE_X_OFFSET;
    let pos_y = CONTENT_TOP + 16;
    if (opts.sourceId) {
      const src = dbNodes.find((n) => n.id === opts.sourceId);
      if (src) {
        if (opts.dir === "right") {
          pos_x = Number(src.pos_x ?? 0) + 280;
          pos_y = Number(src.pos_y ?? CONTENT_TOP);
        } else {
          pos_x = Number(src.pos_x ?? 0);
          pos_y = Number(src.pos_y ?? CONTENT_TOP) + NODE_VERTICAL;
        }
      }
    } else {
      // Stack new node below existing nodes in the same stage AND same client folder
      const sameStage = projectNodes.filter((n) => n.parent_node_id === resolvedParent && nodeStageOf(n) === stage);
      const maxY = sameStage.length === 0 ? CONTENT_TOP + 16 : Math.max(...sameStage.map((n) => Number(n.pos_y ?? CONTENT_TOP)));
      pos_y = sameStage.length === 0 ? CONTENT_TOP + 16 : maxY + NODE_VERTICAL;
    }

    const parent = pickParentGroup(resolvedParent);
    const initialTitle = `${meta.titleTemplate}`;
    let connectionLabel: string | null = null;

    if (opts.sourceId) {
      const sourceNode = dbNodes.find((n) => n.id === opts.sourceId);
      if (sourceNode) {
        const previewTarget = {
          ...sourceNode,
          id: "preview-target",
          title: initialTitle,
          node_type: dbType,
          parent_node_id: parent,
          data: { kind, stage },
        } as CanvasNodeRow;
        const validation = validateCanvasConnection(sourceNode, previewTarget);
        if (!validation.allowed) {
          toast({
            title: "Ligação incompatível",
            description: validation.reason ?? "Esse tipo de node não faz sentido como próximo passo daqui.",
            variant: "destructive",
          });
          return;
        }
        connectionLabel = validation.label;
      }
    }

    const { data, error } = await supabase
      .from("canvas_nodes")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        node_type: dbType,
        title: initialTitle,
        status: "draft",
        description: null,
        pos_x,
        pos_y,
        parent_node_id: parent,
        data: { kind, stage, checklist: getChecklistTemplate(kind) } as Record<string, unknown>,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao criar node", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      const newRow = data as CanvasNodeRow;
      setDbNodes((prev) => [...prev, newRow]);

      // Auto connect from source if requested
      if (opts.sourceId) {
        const { data: edgeRow, error: eErr } = await supabase
          .from("canvas_edges")
          .insert({
            workspace_id: workspaceId,
            source_node_id: opts.sourceId,
            target_node_id: newRow.id,
            edge_type: "ops",
            label: connectionLabel,
          })
          .select()
          .single();
        if (!eErr && edgeRow) setDbEdges((prev) => [...prev, edgeRow as CanvasEdgeRecord]);
      }

      setRfNodes((nodes) => nodes.map((node) => ({ ...node, selected: node.id === newRow.id })));
      window.setTimeout(() => {
        rfInstanceRef.current?.setCenter(
          Number(newRow.pos_x ?? 0) + 170,
          Number(newRow.pos_y ?? 0) + 60,
          { zoom: 1, duration: 400 },
        );
      }, 100);
    }
  }, [clientId, dbNodes, ensureActiveClient, pickParentGroup, projectNodes, workspaceId]);

  const addAiOrb = useCallback(async (orbType: AiOrbType) => {
    const parent = ensureActiveClient();
    if (!parent) return;
    const sameParentOrbs = dbNodes.filter((node) => node.parent_node_id === parent && node.node_type === "ai_orb");
    const ORB_SPACING_X = 220;
    const ORB_SPACING_Y = 180;
    const ORBS_PER_ROW = 3;
    const ORB_BAND_Y = CONTENT_TOP + 720;
    const ORB_BAND_X = OPS_FLOW_X.engine - 220;
    const indexInRow = sameParentOrbs.length % ORBS_PER_ROW;
    const row = Math.floor(sameParentOrbs.length / ORBS_PER_ROW);
    const pos_x = ORB_BAND_X + indexInRow * ORB_SPACING_X;
    const pos_y = ORB_BAND_Y + row * ORB_SPACING_Y;
    const { data, error } = await supabase.from("canvas_nodes").insert(buildAiOrbNodePayload({
      orbType,
      workspaceId,
      clientId,
      parentNodeId: parent,
      x: pos_x,
      y: pos_y,
    })).select().single();
    if (error) {
      if (error.message?.includes("invalid input") && error.message?.includes("ai_orb")) {
        toast({
          title: "Banco desatualizado",
          description: "Execute a migração SQL para adicionar 'ai_orb' ao enum canvas_node_type.",
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Erro ao criar AI Orb", description: error.message, variant: "destructive" });
      return;
    }
    if (data) setDbNodes((prev) => [...prev, data as CanvasNodeRow]);
  }, [clientId, dbNodes, ensureActiveClient, workspaceId]);

  const addChatNode = useCallback(async (fn: ChatNodeFunction = "free", opts: { connectToNodeId?: string } = {}) => {
    const parent = ensureActiveClient();
    if (!parent) return null;
    const existingChats = dbNodes.filter((n) => n.node_type === "front" && (n.data as Record<string,unknown> | null)?.kind === "chat_node" && n.parent_node_id === parent);
    // Distribute chats in 2-column grid to prevent vertical stacking
    const chatIdx = existingChats.length;
    const chatCol = chatIdx % 2;
    const chatRow = Math.floor(chatIdx / 2);
    const pos_x = OPS_FLOW_X.engine + 460 + chatCol * 380;
    const pos_y = CONTENT_TOP + 40 + chatRow * 420;
    const chatData: ChatNodeData = {
      scope: "node",
      fn,
      label: "Chat IA",
      messages: [],
      connectedNodeIds: opts.connectToNodeId ? [opts.connectToNodeId] : [],
      workspaceId,
      clientId,
      isExpanded: true,
      isProcessing: false,
    };
    const fnTitle = fn === "briefing" ? "Briefing" : fn === "planning" ? "Planejamento" : fn === "production" ? "Produção" : fn === "analysis" ? "Análise" : "Livre";
    const { data, error } = await supabase.from("canvas_nodes").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      node_type: "front",
      title: `Chat · ${fnTitle}`,
      status: "active",
      description: "Node de chat inteligente com contexto do workspace",
      pos_x,
      pos_y,
      parent_node_id: parent,
      data: { kind: "chat_node", ...chatData },
    }).select().single();
    if (error) { toast({ title: "Erro ao criar Chat", description: error.message, variant: "destructive" }); return null; }
    const newNode = data as CanvasNodeRow;
    setDbNodes((prev) => [...prev, newNode]);

    // Auto-connect edge from source to chat if requested
    if (opts.connectToNodeId) {
      const { data: edgeData, error: edgeErr } = await supabase.from("canvas_edges").insert({
        workspace_id: workspaceId,
        source_node_id: opts.connectToNodeId,
        target_node_id: newNode.id,
        edge_type: "ops",
        label: "alimenta chat",
      }).select().single();
      if (!edgeErr && edgeData) setDbEdges((prev) => [...prev, edgeData as CanvasEdgeRecord]);
    }

    return newNode;
  }, [clientId, dbNodes, ensureActiveClient, workspaceId]);

  /** Abre (ou cria e abre) um ChatNode conectado ao nodeId fornecido */
  const openChatForNode = useCallback(async (sourceNodeId: string) => {
    // Verifica se já existe chat conectado a esse node
    const existingChatId = dbEdges.find((e) => e.source_node_id === sourceNodeId)?.target_node_id;
    const existingChat = existingChatId ? dbNodes.find((n) => n.id === existingChatId && (n.data as Record<string,unknown> | null)?.kind === "chat_node") : null;

    let chatNode = existingChat;
    if (!chatNode) {
      chatNode = await addChatNode("production", { connectToNodeId: sourceNodeId }) ?? null;
    }
    if (!chatNode) return;

    // Fecha drawer
    setSelectedNode(null);

    // Centraliza canvas no chat node
    setTimeout(() => {
      rfInstanceRef.current?.setCenter(
        Number(chatNode!.pos_x ?? 0) + 160,
        Number(chatNode!.pos_y ?? 0) + 200,
        { zoom: 1.1, duration: 500 },
      );
    }, 150);
  }, [dbNodes, dbEdges, addChatNode]);

  const patchAiOrbData = useCallback((patch: Record<string, unknown>) => {
    if (!aiOrbConfigNode) return;
    const nextData = { ...readAiOrbData(aiOrbConfigNode.data as Record<string, unknown> | null), ...patch };
    setAiOrbConfigNode((current) => current ? { ...current, data: nextData } : current);
    setDbNodes((prev) => prev.map((node) => node.id === aiOrbConfigNode.id ? { ...node, data: nextData } : node));
    supabase.from("canvas_nodes").update({ data: nextData, updated_at: new Date().toISOString() }).eq("id", aiOrbConfigNode.id).then(({ error }) => {
      if (error) toast({ title: "Erro ao atualizar Orb", description: error.message, variant: "destructive" });
    });
  }, [aiOrbConfigNode]);

  const generateFromAiOrb = useCallback(async (deterministic = false) => {
    if (!aiOrbConfigNode) return;
    const orb = readAiOrbData(aiOrbConfigNode.data as Record<string, unknown> | null);
    const generatingData = { ...orb, isGenerating: true, lastError: undefined };
    setBusyAction(`ai-orb-${aiOrbConfigNode.id}`);
    setDbNodes((prev) => prev.map((node) => node.id === aiOrbConfigNode.id ? { ...node, data: generatingData } : node));
    setAiOrbConfigNode((current) => current ? { ...current, data: generatingData } : current);
    await supabase.from("canvas_nodes").update({ data: generatingData, updated_at: new Date().toISOString() }).eq("id", aiOrbConfigNode.id);

    try {
      const result = await invokeAiOrbGenerate({
        orbId: aiOrbConfigNode.id,
        workspaceId,
        clientId,
        orbType: orb.orbType,
        aiEngine: orb.aiEngine,
        customPrompt: orb.systemPrompt,
        focusAreas: orb.focusAreas,
        deterministic,
      });
      const orbX = Number(aiOrbConfigNode.pos_x ?? OPS_FLOW_X.engine);
      const orbY = Number(aiOrbConfigNode.pos_y ?? CONTENT_TOP + 520);
      const parent = aiOrbConfigNode.parent_node_id ?? ensureActiveClient();
      if (!parent) return;

      const createdByRef: Record<string, CanvasNodeRow> = {};
      const createdNodes: CanvasNodeRow[] = [];
      for (const [index, spec] of result.nodes.entries()) {
        const pos = generatedNodePosition(orbX, orbY, index, result.nodes.length);
        const { data, error } = await supabase.from("canvas_nodes").insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_type: projectKindToDbNodeType(spec.kind),
          title: spec.title,
          status: "draft",
          description: spec.description,
          pos_x: pos.x,
          pos_y: pos.y,
          parent_node_id: parent,
          data: { kind: spec.kind, stage: spec.stage, checklist: getChecklistTemplate(spec.kind), generatedByAiOrb: aiOrbConfigNode.id, rationale: result.rationale },
        }).select().single();
        if (error || !data) throw error ?? new Error("Falha ao criar node gerado pelo Orb.");
        createdByRef[spec.ref] = data as CanvasNodeRow;
        createdNodes.push(data as CanvasNodeRow);
      }

      const generatedEdges = [
        ...createdNodes.map((node) => ({ source_node_id: aiOrbConfigNode.id, target_node_id: node.id, label: "gerado por IA" })),
        ...result.edges.map((edge) => {
          const source = createdByRef[edge.fromRef]?.id;
          const target = createdByRef[edge.toRef]?.id;
          return source && target ? { source_node_id: source, target_node_id: target, label: edge.label ?? "próxima" } : null;
        }).filter(Boolean) as Array<{ source_node_id: string; target_node_id: string; label: string | null }>,
      ];

      const { data: edgeRows, error: edgeError } = await supabase.from("canvas_edges").insert(generatedEdges.map((edge) => ({ workspace_id: workspaceId, edge_type: "ai", ...edge }))).select();
      if (edgeError) throw edgeError;

      const finalData = nextOrbDataAfterGeneration(orb, result, createdNodes.map((node) => node.id));
      await supabase.from("canvas_nodes").update({ data: finalData, updated_at: new Date().toISOString() }).eq("id", aiOrbConfigNode.id);
      setDbNodes((prev) => prev.map((node) => node.id === aiOrbConfigNode.id ? { ...node, data: finalData } : node).concat(createdNodes));
      if (edgeRows?.length) setDbEdges((prev) => prev.concat(edgeRows as CanvasEdgeRecord[]));
      setAiOrbConfigNode((current) => current ? { ...current, data: finalData } : current);
      toast({ title: "AI Orb executado", description: `${createdNodes.length} nodes e ${edgeRows?.length ?? 0} conexões gerados.` });
    } catch (err) {
      const failedData = { ...orb, isGenerating: false, lastError: err instanceof Error ? err.message : "Falha ao gerar." };
      await supabase.from("canvas_nodes").update({ data: failedData, updated_at: new Date().toISOString() }).eq("id", aiOrbConfigNode.id);
      setDbNodes((prev) => prev.map((node) => node.id === aiOrbConfigNode.id ? { ...node, data: failedData } : node));
      setAiOrbConfigNode((current) => current ? { ...current, data: failedData } : current);
      toast({ title: "Erro ao gerar com Orb", description: failedData.lastError, variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }, [aiOrbConfigNode, clientId, ensureActiveClient, workspaceId]);

  const expandEngineHub = useCallback(async (engineNodeId: string) => {
    const engineNode = dbNodes.find((node) => node.id === engineNodeId);
    if (!engineNode) return;

    if (nodeKindOf(engineNode) !== "engine") {
      toast({ title: "Hub indisponível", description: "Esse atalho só funciona em nodes Engine." });
      return;
    }

    const parent = engineNode.parent_node_id ?? ensureActiveClient();
    if (!parent) return;

    setBusyAction("engine-hub");
    try {
      const incomingToEngine = dbEdges
        .filter((edge) => edge.target_node_id === engineNodeId)
        .map((edge) => dbNodes.find((node) => node.id === edge.source_node_id))
        .filter(Boolean) as CanvasNodeRow[];
      const outgoingFromEngine = dbEdges
        .filter((edge) => edge.source_node_id === engineNodeId)
        .map((edge) => dbNodes.find((node) => node.id === edge.target_node_id))
        .filter(Boolean) as CanvasNodeRow[];

      const existingResult = outgoingFromEngine.find((node) => RESULT_KINDS.has(nodeKindOf(node)) && !PROOF_KINDS.has(nodeKindOf(node)));
      const existingAgent = outgoingFromEngine.find((node) => nodeKindOf(node) === "agente");
      const existingDecision = [
        ...outgoingFromEngine,
        ...(existingResult
          ? dbEdges
              .filter((edge) => edge.source_node_id === existingResult.id)
              .map((edge) => dbNodes.find((node) => node.id === edge.target_node_id))
              .filter(Boolean) as CanvasNodeRow[]
          : []),
      ].find((node) => nodeKindOf(node) === "decisao");

      const missingSpecs: Array<{ ref: string; kind: ProjectNodeKind; title: string; stage: AceleraStageKey; x: number; y: number; description: string }> = [];
      const engineX = Number(engineNode.pos_x ?? stageColumnX("planejamento") + NODE_X_OFFSET);
      const engineY = Number(engineNode.pos_y ?? CONTENT_TOP + 16);
      const proofY = engineY + 260;

      if (!incomingToEngine.some((node) => INPUT_KINDS.has(nodeKindOf(node)))) {
        missingSpecs.push({
          ref: "context",
          kind: "contexto_ops",
          title: "Contexto do hub",
          stage: "entrada",
          x: engineX - 500,
          y: engineY - 150,
          description: "Entradas estratégicas, ativos, briefing e restrições que alimentam a engine.",
        });
      }

      if (!incomingToEngine.some((node) => INSTRUCTION_KINDS.has(nodeKindOf(node)))) {
        missingSpecs.push({
          ref: "instruction",
          kind: "instrucao",
          title: "Instruções do hub",
          stage: "planejamento",
          x: engineX - 500,
          y: engineY + 90,
          description: "Regras, SOP, critérios de aceite e lógica do fluxo que entram na engine.",
        });
      }

      if (!existingResult) {
        missingSpecs.push({
          ref: "result",
          kind: "resultado",
          title: "Resultado do hub",
          stage: "producao",
          x: engineX + 500,
          y: engineY - 20,
          description: "Entregável principal que sai da engine já pronto para revisão, prova e aprovação.",
        });
      }

      if (!existingAgent) {
        missingSpecs.push({
          ref: "agent",
          kind: "agente",
          title: "Agente executor",
          stage: "producao",
          x: engineX + 500,
          y: engineY + 210,
          description: "Camada operacional que executa tarefas, handoffs e verificações a partir da engine.",
        });
      }

      if (!existingDecision) {
        missingSpecs.push({
          ref: "decision",
          kind: "decisao",
          title: "Decisão do hub",
          stage: "ativacao",
          x: engineX + 940,
          y: engineY - 20,
          description: "Node de aprovação, revisão ou próxima ação do fluxo disparado pela engine.",
        });
      }

      const existingProofKinds = new Set(
        dbEdges
          .filter((edge) => [engineNodeId, existingResult?.id, existingDecision?.id].filter(Boolean).includes(edge.source_node_id))
          .map((edge) => dbNodes.find((node) => node.id === edge.target_node_id))
          .filter(Boolean)
          .map((node) => nodeKindOf(node as CanvasNodeRow)),
      );

      if (!existingProofKinds.has("metrica")) {
        missingSpecs.push({ ref: "metric", kind: "metrica", title: `KPI: ${engineNode.title}`, stage: "ativacao", x: engineX + 500, y: proofY, description: "Medição quantitativa conectada ao resultado da engine." });
      }
      if (!existingProofKinds.has("before_after")) {
        missingSpecs.push({ ref: "beforeAfter", kind: "before_after", title: `Before/After: ${engineNode.title}`, stage: "ativacao", x: engineX + 940, y: proofY, description: "Evidência visual comparando estado anterior e entrega realizada." });
      }
      if (!existingProofKinds.has("case")) {
        missingSpecs.push({ ref: "case", kind: "case", title: `Case: ${engineNode.title}`, stage: "ativacao", x: engineX + 1380, y: proofY, description: "Narrativa comercial consolidada a partir de resultado, KPI e evidência visual." });
      }

      if (missingSpecs.length === 0) {
        toast({ title: "Hub já montado", description: "Esse Engine já tem entradas e saídas principais conectadas." });
        return;
      }

      const createdNodes: CanvasNodeRow[] = [];
      const createdByRef: Record<string, CanvasNodeRow> = {};

      for (const spec of missingSpecs) {
        const { data, error } = await supabase
          .from("canvas_nodes")
          .insert({
            workspace_id: workspaceId,
            client_id: clientId,
            node_type: projectKindToDbNodeType(spec.kind),
            title: spec.title,
            status: "draft",
            description: spec.description,
            pos_x: spec.x,
            pos_y: spec.y,
            parent_node_id: parent,
            data: { kind: spec.kind, stage: spec.stage, checklist: getChecklistTemplate(spec.kind), generatedByEngineHub: engineNodeId },
          })
          .select()
          .single();

        if (error || !data) throw error ?? new Error("Falha ao criar node do hub.");
        const row = data as CanvasNodeRow;
        createdNodes.push(row);
        createdByRef[spec.ref] = row;
      }

      const resultNode = existingResult ?? createdByRef.result;
      const edgesToCreate = [
        createdByRef.context ? { source_node_id: createdByRef.context.id, target_node_id: engineNodeId, label: "contexto" } : null,
        createdByRef.instruction ? { source_node_id: createdByRef.instruction.id, target_node_id: engineNodeId, label: "regra" } : null,
        createdByRef.agent ? { source_node_id: engineNodeId, target_node_id: createdByRef.agent.id, label: "aciona" } : null,
        createdByRef.result ? { source_node_id: engineNodeId, target_node_id: createdByRef.result.id, label: "gera" } : null,
        createdByRef.decision && resultNode ? { source_node_id: resultNode.id, target_node_id: createdByRef.decision.id, label: "aprovar" } : null,
        createdByRef.metric && resultNode ? { source_node_id: resultNode.id, target_node_id: createdByRef.metric.id, label: "mede" } : null,
        createdByRef.beforeAfter && (createdByRef.metric ?? resultNode) ? { source_node_id: (createdByRef.metric ?? resultNode).id, target_node_id: createdByRef.beforeAfter.id, label: "compara" } : null,
        createdByRef.case && createdByRef.beforeAfter ? { source_node_id: createdByRef.beforeAfter.id, target_node_id: createdByRef.case.id, label: "vira case" } : null,
      ].filter(Boolean) as Array<{ source_node_id: string; target_node_id: string; label: string }>;

      const dedupedEdges = edgesToCreate.filter((edge, index, arr) => (
        arr.findIndex((candidate) => candidate.source_node_id === edge.source_node_id && candidate.target_node_id === edge.target_node_id) === index
        && !dbEdges.some((existing) => existing.source_node_id === edge.source_node_id && existing.target_node_id === edge.target_node_id)
      ));

      let createdEdges: CanvasEdgeRecord[] = [];
      if (dedupedEdges.length > 0) {
        const { data: edgeRows, error: edgeError } = await supabase
          .from("canvas_edges")
          .insert(dedupedEdges.map((edge) => ({
            workspace_id: workspaceId,
            edge_type: "ops",
            ...edge,
          })))
          .select();
        if (edgeError) throw edgeError;
        createdEdges = ((edgeRows ?? []) as CanvasEdgeRecord[]);
      }

      setDbNodes((prev) => [...prev, ...createdNodes]);
      if (createdEdges.length > 0) setDbEdges((prev) => [...prev, ...createdEdges]);
      setSelectedNode(engineNode);
      toast({
        title: "Hub inteligente montado",
        description: `${createdNodes.length} nodes e ${createdEdges.length} conexões foram organizados ao redor da engine.`,
      });
    } catch (err) {
      toast({
        title: "Erro ao montar hub",
        description: err instanceof Error ? err.message : "Falha ao expandir a engine.",
        variant: "destructive",
      });
    } finally {
      setBusyAction(null);
    }
  }, [clientId, dbEdges, dbNodes, ensureActiveClient, workspaceId]);

  useEffect(() => {
    expandEngineHubRef.current = expandEngineHub;
  }, [expandEngineHub]);

  /* Pick existing client → group */
  const handlePickClient = async (c: { id: string; name: string }) => {
    const existingGroups = clientGroups;
    const x = existingGroups.length === 0
      ? 80
      : Math.max(...existingGroups.map((g) => Number(g.pos_x ?? 0))) + CLIENT_BAR_GAP + 40;

    const { data, error } = await supabase
      .from("canvas_nodes")
      .insert({
        workspace_id: workspaceId,
        client_id: c.id,
        node_type: "client",
        title: c.name,
        status: "active",
        description: null,
        pos_x: x,
        pos_y: CLIENT_BAR_Y,
        linked_entity_type: "clients",
        linked_entity_id: c.id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao adicionar cliente", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      const created = data as CanvasNodeRow;
      setDbNodes((prev) => [...prev, created]);
      setActiveClientId(created.id);
    }
    toast({ title: "Pasta de cliente criada", description: `${c.name} agora tem esteira própria.` });
  };

  /** Aplica um EsteiraTemplate completo: cria o cliente (se preciso), cria todos os
   *  nodes nas suas colunas/etapas, empilhando por etapa, e gera as edges. */
  const applyEsteiraTemplate = useCallback(async (tpl: EsteiraTemplate) => {
    setBusyAction("base");
    try {
      // 1) Garante o cliente (folder)
      let clientNodeId: string | null = activeClientId ?? (clientGroups[0]?.id ?? null);
      if (!clientNodeId) {
        const { data: clientNode, error: cErr } = await supabase
          .from("canvas_nodes")
          .insert({
            workspace_id: workspaceId,
            client_id: clientId,
            node_type: "client",
            title: clientName,
            status: "active",
            pos_x: 80,
            pos_y: CLIENT_BAR_Y,
            linked_entity_type: "clients",
            linked_entity_id: clientId,
          })
          .select()
          .single();
        if (cErr) {
          toast({ title: "Erro ao gerar esteira", description: cErr.message, variant: "destructive" });
          return;
        }
        clientNodeId = (clientNode as CanvasNodeRow).id;
        setDbNodes((prev) => [...prev, clientNode as CanvasNodeRow]);
        setActiveClientId(clientNodeId);
      }

      // 2) Calcula posições por etapa, empilhando após nodes existentes do mesmo cliente
      const startYByStage: Record<string, number> = {};
      ACELERA_STAGES.forEach((s) => {
        const existing = projectNodes.filter(
          (n) => n.parent_node_id === clientNodeId && nodeStageOf(n) === s.key,
        );
        const maxY = existing.length === 0
          ? CONTENT_TOP + 16
          : Math.max(...existing.map((n) => Number(n.pos_y ?? CONTENT_TOP))) + NODE_VERTICAL;
        startYByStage[s.key] = maxY;
      });

      // 3) Insere nodes em ordem; mantém map ref → row para wirar edges
      const refToId: Record<string, string> = {};
      const newRows: CanvasNodeRow[] = [];

      for (const tn of tpl.nodes) {
        const meta = getProjectTypeMeta(tn.kind);
        const dbType = projectKindToDbNodeType(tn.kind);
        const pos_x = stageColumnX(tn.stage) + NODE_X_OFFSET;
        const pos_y = startYByStage[tn.stage] ?? CONTENT_TOP + 16;
        startYByStage[tn.stage] = pos_y + NODE_VERTICAL;

        const { data: row, error } = await supabase
          .from("canvas_nodes")
          .insert({
            workspace_id: workspaceId,
            client_id: clientId,
            node_type: dbType,
            title: tn.title || meta?.titleTemplate || tn.kind,
            status: "draft",
            description: tn.description ?? null,
            pos_x,
            pos_y,
            parent_node_id: clientNodeId,
            data: {
              kind: tn.kind,
              stage: tn.stage,
              checklist: getChecklistTemplate(tn.kind),
            } as Record<string, unknown>,
          })
          .select()
          .single();

        if (error) {
          toast({ title: `Falha ao criar "${tn.title}"`, description: error.message, variant: "destructive" });
          continue;
        }
        if (row) {
          refToId[tn.ref] = (row as CanvasNodeRow).id;
          newRows.push(row as CanvasNodeRow);
        }
      }

      // 4) Insere edges baseadas no template
      const edgePayload = tpl.edges
        .map((e) => {
          const source = refToId[e.fromRef];
          const target = refToId[e.toRef];
          if (!source || !target) return null;
          return {
            workspace_id: workspaceId,
            source_node_id: source,
            target_node_id: target,
            edge_type: "next",
            label: e.label ?? null,
          };
        })
        .filter(Boolean) as Array<Record<string, unknown>>;

      if (edgePayload.length > 0) {
        await supabase.from("canvas_edges").insert(edgePayload);
      }

      toast({
        title: `Esteira "${tpl.label}" criada`,
        description: `${newRows.length} nodes · ${edgePayload.length} conexões`,
      });
      setGenerateDialogOpen(false);
      await fetchData();
    } finally {
      setBusyAction(null);
    }
  }, [
    activeClientId, clientGroups, projectNodes, workspaceId, clientId, clientName, fetchData,
  ]);

  /** Apply a saved canvas template to current client */
  const applyCanvasTemplate = useCallback(async (template: CanvasTemplate, targetClientId: string) => {
    setBusyAction("template");
    try {
      // Compute origin offset — place new nodes relative to the active client stage
      const baseX = 80;
      const baseY = CONTENT_TOP + 16;
      const refToId = new Map<string, string>();

      // Create nodes preserving relative positions
      const rows = (template.nodes as any[]).map((n, idx) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        parent_node_id: targetClientId,
        node_type: n.node_type,
        title: n.title,
        description: n.description ?? null,
        status: n.status ?? "draft",
        pos_x: baseX + (Number(n.pos_x_rel ?? 0)),
        pos_y: baseY + (Number(n.pos_y_rel ?? idx * 160)),
        data: n.data ?? {},
      }));

      const { data: inserted, error: nodeErr } = await supabase.from("canvas_nodes").insert(rows).select();
      if (nodeErr) throw new Error(nodeErr.message);
      (inserted as any[]).forEach((dbNode, i) => {
        const tmplNode = template.nodes[i] as any;
        if (tmplNode?.ref) refToId.set(tmplNode.ref, dbNode.id);
      });

      // Create edges
      const edgeRows = (template.edges as any[])
        .map((e) => {
          const source_node_id = refToId.get(e.source_ref);
          const target_node_id = refToId.get(e.target_ref);
          if (!source_node_id || !target_node_id) return null;
          return {
            workspace_id: workspaceId,
            source_node_id, target_node_id,
            edge_type: e.edge_type ?? "ops",
            label: e.label ?? null,
          };
        })
        .filter(Boolean);

      if (edgeRows.length > 0) {
        await supabase.from("canvas_edges").insert(edgeRows);
      }

      await fetchData();
    } finally {
      setBusyAction(null);
    }
  }, [workspaceId, clientId, fetchData]);

  const applyOpsFlowBlueprint = useCallback(async () => {
    const parent = ensureActiveClient();
    if (!parent) return;
    setBusyAction("ops-flow");
    try {
      const blueprint: Array<{ ref: string; kind: ProjectNodeKind; title: string; stage: AceleraStageKey; x: number; y: number; status?: string; description: string }> = [
        { ref: "context", kind: "contexto_ops", title: "Contexto central", stage: "entrada", x: OPS_FLOW_X.context, y: CONTENT_TOP + 120, description: "Briefing, assets, acessos, links, oferta e regras que alimentam a operação." },
        { ref: "instruction", kind: "instrucao", title: "Instruções e critérios", stage: "planejamento", x: OPS_FLOW_X.instruction, y: CONTENT_TOP + 340, description: "SOPs, prompts, regras de execução e critérios de aceite." },
        { ref: "engine", kind: "engine", title: "Engine: Planejamento Ops", stage: "planejamento", x: OPS_FLOW_X.engine, y: CONTENT_TOP + 220, status: "active", description: "Hub que consolida entradas e transforma contexto em plano, tarefas e entregáveis." },
        { ref: "result", kind: "resultado", title: "Resultado: Plano operacional", stage: "producao", x: OPS_FLOW_X.result, y: CONTENT_TOP + 120, description: "Output versionado com owner, prazo, evidência e próximos passos." },
        { ref: "agent", kind: "agente", title: "Agente: Orion Ops", stage: "producao", x: OPS_FLOW_X.execution, y: CONTENT_TOP + 340, description: "Assistente operacional conectado ao contexto, instruções e outputs." },
        { ref: "decision", kind: "decisao", title: "Decisão: Aprovação / Revisão", stage: "ativacao", x: OPS_FLOW_X.decision, y: CONTENT_TOP + 120, description: "Roteia aprovado para próxima etapa ou retorna para revisão." },
        { ref: "metric", kind: "metrica", title: "KPI da entrega", stage: "ativacao", x: OPS_FLOW_X.proof, y: CONTENT_TOP + 590, description: "Medição quantitativa que comprova impacto da entrega." },
        { ref: "beforeAfter", kind: "before_after", title: "Before/After visual", stage: "ativacao", x: OPS_FLOW_X.decision, y: CONTENT_TOP + 590, description: "Evidência visual do estado anterior versus entrega concluída." },
        { ref: "case", kind: "case", title: "Case comercial", stage: "ativacao", x: OPS_FLOW_X.narrative, y: CONTENT_TOP + 590, description: "Narrativa consolidada para reaproveitar prova em venda, retenção e expansão." },
      ];
      const created: Record<string, string> = {};
      const rows: CanvasNodeRow[] = [];
      for (const item of blueprint) {
        const { data, error } = await supabase.from("canvas_nodes").insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_type: projectKindToDbNodeType(item.kind),
          title: item.title,
          status: item.status ?? "draft",
          description: item.description,
          pos_x: item.x,
          pos_y: item.y,
          parent_node_id: parent,
          data: { kind: item.kind, stage: item.stage, checklist: getChecklistTemplate(item.kind) },
        }).select().single();
        if (error) throw error;
        created[item.ref] = (data as CanvasNodeRow).id;
        rows.push(data as CanvasNodeRow);
      }
      const edges = [
        ["context", "engine", "contexto"], ["instruction", "engine", "regra"], ["engine", "agent", "aciona"],
        ["engine", "result", "gera"], ["result", "decision", "aprovar"], ["decision", "instruction", "revisar"],
        ["result", "metric", "mede"], ["metric", "beforeAfter", "compara"], ["beforeAfter", "case", "vira case"],
      ].map(([from, to, label]) => ({ workspace_id: workspaceId, source_node_id: created[from], target_node_id: created[to], edge_type: "ops", label }));
      await supabase.from("canvas_edges").insert(edges);
      toast({ title: "Fluxo Ops criado", description: `${rows.length} nodes · ${edges.length} conexões inteligentes` });
      await fetchData();
    } catch (err) {
      toast({ title: "Erro ao criar fluxo", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }, [clientId, ensureActiveClient, fetchData, workspaceId]);


  /* Auto-layout fordista: 8 etapas ACELERA × faixas operacionais */
  const handleAutoLayout = async () => {
    const targetNodes = activeClientId
      ? projectNodes.filter((n) => n.parent_node_id === activeClientId)
      : projectNodes;
    if (targetNodes.length === 0) return;
    setBusyAction("layout");
    const edgeMap = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    targetNodes.forEach((n) => inDegree.set(n.id, 0));
    dbEdges.forEach((e) => {
      if (!inDegree.has(e.target_node_id) || !inDegree.has(e.source_node_id)) return;
      edgeMap.set(e.source_node_id, [...(edgeMap.get(e.source_node_id) ?? []), e.target_node_id]);
      inDegree.set(e.target_node_id, (inDegree.get(e.target_node_id) ?? 0) + 1);
    });

    const depth = new Map<string, number>();
    const queue: string[] = [];
    targetNodes.forEach((n) => {
      if ((inDegree.get(n.id) ?? 0) === 0) {
        depth.set(n.id, 0);
        queue.push(n.id);
      }
    });
    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentDepth = depth.get(current) ?? 0;
      (edgeMap.get(current) ?? []).forEach((child) => {
        depth.set(child, Math.max(depth.get(child) ?? 0, currentDepth + 1));
        const remaining = (inDegree.get(child) ?? 1) - 1;
        inDegree.set(child, remaining);
        if (remaining === 0) queue.push(child);
      });
    }

    const FAMILY_LANE: Record<string, number> = {
      entry: 0, structure: 1, plan: 2, tech: 2, build: 3,
      content: 4, launch: 5, growth: 6, proof: 7,
    };
    // Proper spacing — no more stacking
    const NODE_WIDTH = 280;
    const NODE_HEIGHT = 140;
    const H_GAP = 40;    // horizontal gap between nodes in same bucket
    const V_GAP = 24;    // vertical gap between rows
    const LANE_GAP = 60; // gap between lanes
    const COLUMN_WIDTH = (NODE_WIDTH + H_GAP) * 2; // 640 — each column fits 2 nodes side-by-side
    const GRID_ORIGIN_Y = CONTENT_TOP + 40;
    const gridBuckets = new Map<string, CanvasNodeRow[]>();

    targetNodes.forEach((n) => {
      const stageIdx = ACELERA_STAGES.findIndex((s) => s.key === nodeStageOf(n));
      const col = Math.max(0, stageIdx);
      const lane = FAMILY_LANE[getNodeFamily(nodeKindOf(n))] ?? 3;
      const bucketKey = `${col}:${lane}`;
      gridBuckets.set(bucketKey, [...(gridBuckets.get(bucketKey) ?? []), n]);
    });

    // Track bottom Y of each lane to prevent overlap between lanes with many nodes
    const laneBottomY = new Map<number, number>();

    const updates: Array<{ id: string; pos_x: number; pos_y: number }> = [];
    const sortedBuckets = Array.from(gridBuckets.entries()).sort((a, b) => {
      const [colA, laneA] = a[0].split(":").map(Number);
      const [colB, laneB] = b[0].split(":").map(Number);
      if (laneA !== laneB) return laneA - laneB;
      return colA - colB;
    });

    sortedBuckets.forEach(([key, nodes]) => {
      const [colStr, laneStr] = key.split(":");
      const col = Number(colStr);
      const lane = Number(laneStr);
      const sorted = nodes.slice().sort((a, b) => (depth.get(a.id) ?? 0) - (depth.get(b.id) ?? 0));

      const laneStartY = Math.max(
        GRID_ORIGIN_Y + lane * (NODE_HEIGHT * 2 + LANE_GAP),
        laneBottomY.get(lane) ?? 0
      );

      sorted.forEach((n, idx) => {
        // Distribute in 2-column sub-grid when many nodes in one bucket
        const subCol = idx % 2;
        const subRow = Math.floor(idx / 2);
        const pos_x = col * COLUMN_WIDTH + 40 + subCol * (NODE_WIDTH + H_GAP);
        const pos_y = laneStartY + subRow * (NODE_HEIGHT + V_GAP);
        updates.push({ id: n.id, pos_x, pos_y });
      });

      // Update lane bottom
      const rowsUsed = Math.ceil(sorted.length / 2);
      const bucketBottom = laneStartY + rowsUsed * (NODE_HEIGHT + V_GAP);
      laneBottomY.set(lane, Math.max(laneBottomY.get(lane) ?? 0, bucketBottom));
    });

    const orbs = dbNodes.filter((n) => n.node_type === "ai_orb" && (!activeClientId || n.parent_node_id === activeClientId));
    const ORB_BAND_Y = (Math.max(0, ...Array.from(laneBottomY.values())) || GRID_ORIGIN_Y) + 80;
    orbs.forEach((orb, idx) => {
      updates.push({ id: orb.id, pos_x: 40 + (idx % 6) * 200, pos_y: ORB_BAND_Y + Math.floor(idx / 6) * 180 });
    });

    await Promise.all(
      updates.map((p) =>
        supabase.from("canvas_nodes").update({ pos_x: p.pos_x, pos_y: p.pos_y, updated_at: new Date().toISOString() }).eq("id", p.id),
      ),
    );
    toast({ title: "Esteira reorganizada", description: `${updates.length} nodes posicionados por etapa ACELERA.` });
    await fetchData();
    window.setTimeout(() => rfInstanceRef.current?.fitView({ padding: 0.2, duration: 400 }), 200);
    setBusyAction(null);
  };

  const handleClearFilters = () => {
    setSearch("");
    setTypeFilter(null);
    setStatusFilter(null);
    setApprovalFilter("all");
    setBlockedFilter("all");
    setOwnerFilter(null);
  };

  const handleOpenDependencies = (node: CanvasNodeRow) => {
    const deps = readCanvasOperationalMeta(node.data as Record<string, unknown> | null).dependencyNodeIds ?? [];
    const firstDependency = deps.map((id) => dbNodes.find((n) => n.id === id)).find(Boolean) as CanvasNodeRow | undefined;
    if (firstDependency) setSelectedNode(firstDependency);
    else toast({ title: "Dependências registradas", description: "Nenhuma dependência relacionada está visível neste escopo." });
  };

  const handleDeleteNode = async (id: string) => {
    const node = dbNodes.find((n) => n.id === id);
    if (node?.node_type === "client") {
      await supabase.from("canvas_nodes").update({ parent_node_id: null }).eq("parent_node_id", id);
    }
    await supabase.from("canvas_edges").delete().or(`source_node_id.eq.${id},target_node_id.eq.${id}`).eq("workspace_id", workspaceId);
    const { error } = await supabase.from("canvas_nodes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Node removido" });
      setSelectedNode(null);
      await fetchData();
    }
  };

  const summary = useMemo(() => ({
    clients: clientGroups.length,
    projects: projectNodes.length,
    edges: dbEdges.length,
    proof: scopedProjectNodes.filter((node) => ["measurement", "proof", "narrative"].includes(getNodeFlowRole(nodeKindOf(node)))).length,
    pending: scopedProjectNodes.filter((node) => readCanvasOperationalMeta(node.data as Record<string, unknown> | null).approvalStatus === "pending").length,
  }), [clientGroups.length, projectNodes.length, dbEdges.length, scopedProjectNodes]);

  const proofTrail = useMemo(() => ({
    entrega: scopedProjectNodes.filter((node) => getNodeFlowRole(nodeKindOf(node)) === "result").length,
    kpi: scopedProjectNodes.filter((node) => nodeKindOf(node) === "metrica").length,
    beforeAfter: scopedProjectNodes.filter((node) => nodeKindOf(node) === "before_after").length,
    cases: scopedProjectNodes.filter((node) => nodeKindOf(node) === "case").length,
  }), [scopedProjectNodes]);

  const togglePalette = useCallback(() => setPaletteCollapsed((v) => !v), []);
  const toggleInspector = useCallback(() => setInspectorCollapsed((v) => !v), []);
  const handlePaletteAdd = useCallback((kind: ProjectNodeKind, stage: AceleraStageKey) => addProjectNode(kind, stage), [addProjectNode]);
  const openClientPicker = useCallback(() => setClientPickerOpen(true), []);
  const openAdvanced = useCallback(() => setAdvancedOpen(true), []);
  const fitCanvasView = useCallback(() => rfInstanceRef.current?.fitView({ padding: 0.32, duration: 280 }), []);
  const toggleLockedNodes = useCallback(() => setLockedNodes((v) => !v), []);
  const toggleGridVisible = useCallback(() => setGridVisible((v) => !v), []);
  const handleDockGroupChange = useCallback((group: string | null) => setOpenDockGroup(group), []);
  const handleDockPickKind = useCallback((kind: ProjectNodeKind) => {
    handlePaletteAdd(kind, getProjectTypeMeta(kind)?.defaultStage ?? "producao");
    setOpenDockGroup(null);
  }, [handlePaletteAdd]);
  const handleDockPickOrb = useCallback((orbType: AiOrbType) => {
    void addAiOrb(orbType);
    setOpenDockGroup(null);
  }, [addAiOrb]);

  const handleDockPickChat = useCallback((fn: ChatNodeFunction) => {
    void addChatNode(fn);
    setOpenDockGroup(null);
  }, [addChatNode]);

  const hasFilters = !!search || !!typeFilter || !!statusFilter || approvalFilter !== "all" || blockedFilter !== "all" || !!ownerFilter;
  const interactionConfig = useMemo(() => getCanvasInteractionConfig(activeTool), [activeTool]);
  const existingClientIds = useMemo(
    () => clientGroups.filter((n) => n.linked_entity_id).map((n) => n.linked_entity_id as string),
    [clientGroups],
  );

  /* Quick add menu (advanced popover) */
  const advancedAdd = (kind: ProjectNodeKind) => {
    const meta = getProjectTypeMeta(kind);
    if (meta) addProjectNode(kind, meta.defaultStage);
    setAdvancedOpen(false);
  };

  /* Quick add from inline + on a node */
  const quickAddFromNode = (kind: ProjectNodeKind) => {
    const src = dbNodes.find((n) => n.id === quickAddState.sourceId);
    const stage = src ? nodeStageOf(src) : (getProjectTypeMeta(kind)?.defaultStage ?? "producao");
    addProjectNode(kind, stage, { sourceId: quickAddState.sourceId, dir: quickAddState.dir });
    setQuickAddState({ open: false, sourceId: null, dir: null });
  };

  return (
    <div className={`flex flex-col bg-background ${fullscreen ? "h-full" : "h-[80vh] rounded-lg border border-border/70 overflow-hidden"} ${focusMode ? "canvas-focus-mode" : ""}`}>
      {/* Top bar — hidden in focus mode */}
      {!focusMode && (
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/70 bg-background/95">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          <p className="text-sm font-semibold text-foreground truncate">Execução operacional</p>
          <span className="text-[11px] text-muted-foreground hidden sm:inline truncate">
            {activeClientId
              ? `${clientGroups.find((c) => c.id === activeClientId)?.title ?? "Cliente"} · ${visibleCanvasNodes.length}/${scopedProjectNodes.length} passos · ${summary.proof} provas`
              : `Todos · ${summary.clients} cliente${summary.clients === 1 ? "" : "s"} · ${summary.projects} nodes`}
          </span>
          <div className="hidden xl:flex items-center gap-1.5 text-[10px] text-muted-foreground">
            {FLOW_GRAMMAR.map((item, index) => (
              <span key={item} className="inline-flex items-center gap-1">
                <span>{item}</span>
                {index < FLOW_GRAMMAR.length - 1 && <span className="text-muted-foreground/40">→</span>}
              </span>
            ))}
          </div>
          {summary.pending > 0 && <span className="hidden lg:inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{summary.pending} aprovações pendentes</span>}
          {rfNodes.length > 80 && (
            <span
              className="hidden md:inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-amber-400 px-2 py-0.5 text-[10px] font-medium"
              title="Performance: usar filtros ou selecionar cliente específico para reduzir renderização"
            >
              ⚡ {rfNodes.length} nodes · virtualizando
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={handleAutoLayout} disabled={busyAction === "layout" || projectNodes.length === 0}>
            {busyAction === "layout" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Reorganizar</span>
          </Button>
          <Button size="sm" variant="secondary" className="h-8" onClick={applyOpsFlowBlueprint} disabled={busyAction === "ops-flow"}>
            {busyAction === "ops-flow" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Workflow className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Fluxo Ops</span>
          </Button>
          <Button size="sm" variant="outline" className="h-8"
            onClick={() => {
              if (!ensureActiveClient()) return;
              setGenerateDialogOpen(true);
            }}
            disabled={busyAction === "base"}>
            {busyAction === "base" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Gerar esteira</span>
          </Button>
          <Button size="sm" variant="outline" className="h-8"
            onClick={() => setTemplatesDialogOpen(true)}
            disabled={busyAction === "template"}>
            {busyAction === "template" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutTemplate className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Templates</span>
          </Button>
          {activeClientId && clientPlanName && (
            <ApplyPlaybookButton
              workspaceId={workspaceId}
              clientId={clientId}
              clientName={clientGroups.find(c => c.id === activeClientId)?.title ?? clientName}
              planName={clientPlanName}
              parentNodeId={activeClientId}
              currentNodeCount={scopedProjectNodes.length}
              onApplied={fetchData}
            />
          )}
          <div className="h-5 w-px bg-border mx-1" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onToggleFullscreen} aria-label="Alternar tela cheia">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      )}

      {/* Client tabs (folders) — hidden in focus mode */}
      {!focusMode && (
      <CanvasClientTabs
        tabs={clientTabs}
        activeId={activeClientId}
        onSelect={setActiveClientId}
        onAddClient={() => setClientPickerOpen(true)}
        onRemoveClient={async (id) => {
          await handleDeleteNode(id);
          if (activeClientId === id) setActiveClientId(null);
        }}
        onRenameClient={async (id, newTitle) => {
          const target = clientGroups.find((c) => c.id === id);
          // Optimistic local update
          setDbNodes((prev) => prev.map((n) => (n.id === id ? { ...n, title: newTitle } : n)));
          const { error } = await supabase
            .from("canvas_nodes")
            .update({ title: newTitle, updated_at: new Date().toISOString() })
            .eq("id", id);
          if (error) {
            toast({ title: "Erro ao renomear", description: error.message, variant: "destructive" });
            await fetchData();
            return;
          }
          // If linked to a real client, also rename the client record (best-effort)
          if (target?.linked_entity_id) {
            const { error: cErr } = await supabase
              .from("clients")
              .update({ name: newTitle })
              .eq("id", target.linked_entity_id);
            if (cErr) {
              toast({
                title: "Pasta renomeada",
                description: "Mas não consegui atualizar o nome do cliente vinculado.",
              });
              return;
            }
          }
          toast({ title: "Renomeado", description: newTitle });
        }}
        onChangeLogo={async (id) => {
          const target = clientGroups.find((c) => c.id === id);
          if (!target?.linked_entity_id) {
            toast({
              title: "Pasta sem cliente vinculado",
              description: "Vincule um cliente para personalizar o logo.",
              variant: "destructive",
            });
            return;
          }
          const currentLogo = clientLogos[target.linked_entity_id] ?? "";
          const next = window.prompt(
            `URL do logo para "${target.title}" (deixe em branco para remover):`,
            currentLogo,
          );
          if (next === null) return; // cancelled
          const trimmed = next.trim();
          const newUrl = trimmed === "" ? null : trimmed;
          if (newUrl && !/^https?:\/\//i.test(newUrl)) {
            toast({ title: "URL inválida", description: "Use http(s)://...", variant: "destructive" });
            return;
          }
          // Optimistic
          setClientLogos((prev) => ({ ...prev, [target.linked_entity_id as string]: newUrl }));
          const { error } = await supabase
            .from("clients")
            .update({ logo_url: newUrl })
            .eq("id", target.linked_entity_id);
          if (error) {
            toast({ title: "Erro ao trocar logo", description: error.message, variant: "destructive" });
            await fetchData();
            return;
          }
          toast({ title: newUrl ? "Logo atualizado" : "Logo removido" });
        }}
        onMoveToStart={async (id) => {
          // Lowest pos_x among current client groups, then place this one before it
          const currentMin = clientGroups.reduce(
            (min, c) => Math.min(min, Number(c.pos_x ?? 0)),
            Number.POSITIVE_INFINITY,
          );
          const newX = Number.isFinite(currentMin) ? currentMin - 400 : 80;
          // Optimistic
          setDbNodes((prev) => prev.map((n) => (n.id === id ? { ...n, pos_x: newX } : n)));
          const { error } = await supabase
            .from("canvas_nodes")
            .update({ pos_x: newX, updated_at: new Date().toISOString() })
            .eq("id", id);
          if (error) {
            toast({ title: "Erro ao reordenar", description: error.message, variant: "destructive" });
            await fetchData();
            return;
          }
          setActiveClientId(id);
          toast({ title: "Movido para o início" });
        }}
        onReorder={async (orderedIds) => {
          // Re-stripe pos_x in the requested sequence (step 400)
          const STEP = 400;
          const updates = orderedIds.map((id, i) => ({ id, pos_x: 80 + i * STEP }));

          // Optimistic local update so the tabs reorder immediately
          setDbNodes((prev) => {
            const next = prev.slice();
            updates.forEach((u) => {
              const idx = next.findIndex((n) => n.id === u.id);
              if (idx >= 0) next[idx] = { ...next[idx], pos_x: u.pos_x };
            });
            return next;
          });

          // Persist (parallel updates)
          const stamp = new Date().toISOString();
          const results = await Promise.all(
            updates.map((u) =>
              supabase
                .from("canvas_nodes")
                .update({ pos_x: u.pos_x, updated_at: stamp })
                .eq("id", u.id),
            ),
          );
          const failed = results.find((r) => r.error);
          if (failed?.error) {
            toast({ title: "Erro ao reordenar", description: failed.error.message, variant: "destructive" });
            await fetchData();
          }
        }}
      />
      )}

      {/* Body: palette + canvas + inspector */}
      <div className="flex flex-1 min-h-0">
        <OperationalCanvasToolbar
          activeTool={activeTool}
          gridVisible={gridVisible}
          lockedNodes={lockedNodes}
          fullscreen={fullscreen}
          focusMode={focusMode}
          onToolChange={setActiveTool}
          onFit={fitCanvasView}
          onToggleLock={toggleLockedNodes}
          onToggleGrid={toggleGridVisible}
          onToggleFullscreen={onToggleFullscreen}
          onToggleFocus={() => setFocusMode((v) => !v)}
        />

        <div className="flex-1 min-w-0 relative">
          {!loading && scopedProjectNodes.length > 0 && (
            <div className="pointer-events-none absolute left-3 top-3 z-10 hidden lg:flex items-center gap-2 rounded-full border border-border/70 bg-card/92 px-3 py-1.5 text-[10px] text-muted-foreground shadow-sm backdrop-blur-sm">
              <span>Entrega {proofTrail.entrega}</span>
              <span className="text-muted-foreground/40">→</span>
              <span>KPI {proofTrail.kpi}</span>
              <span className="text-muted-foreground/40">→</span>
              <span>Before/After {proofTrail.beforeAfter}</span>
              <span className="text-muted-foreground/40">→</span>
              <span>Case {proofTrail.cases}</span>
              <span className="text-muted-foreground/40">•</span>
              <span>Arraste dos conectores laterais para ligar nodes</span>
              <span className="text-muted-foreground/40">•</span>
              <span>Use “Hub” no Engine para montar o fluxo central</span>
            </div>
          )}
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : clientGroups.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-base font-semibold text-foreground mb-1">Nenhum cliente na esteira</p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Cada cliente tem sua própria esteira de produção, com histórico, contexto e nodes isolados.
                  Comece adicionando uma pasta de cliente.
                </p>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap justify-center">
                <Button size="sm" onClick={() => setClientPickerOpen(true)}>
                  <Building2 className="h-3.5 w-3.5 mr-1" /> Adicionar cliente
                </Button>
                <Button size="sm" variant="outline" onClick={() => setGenerateDialogOpen(true)} disabled={busyAction === "base"}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar esteira por plano
                </Button>
              </div>
            </div>
          ) : scopedProjectNodes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center relative">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-base font-semibold text-foreground mb-1">
                  Esteira de {clientGroups.find((c) => c.id === activeClientId)?.title ?? "todos os clientes"} vazia
                </p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Use a paleta lateral ou o botão abaixo para começar a esteira deste cliente.
                  Cada etapa ACELERA tem seus próprios tipos de node.
                </p>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap justify-center">
                <Button size="sm" onClick={() => setAdvancedOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar primeiro node
                </Button>
                <Button size="sm" variant="secondary" onClick={applyOpsFlowBlueprint} disabled={busyAction === "ops-flow"}>
                  <Workflow className="h-3.5 w-3.5 mr-1" /> Criar fluxo Ops
                </Button>
                <Button size="sm" variant="outline" onClick={() => setGenerateDialogOpen(true)} disabled={busyAction === "base"}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar esteira do plano
                </Button>
              </div>
            </div>
          ) : (
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onEdgeContextMenu={onEdgeContextMenu}
              onEdgeDoubleClick={onEdgeDoubleClick}
              isValidConnection={isValidConnection}
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onInit={handleRfInit}
              onMoveEnd={handleMoveEnd}
              fitViewOptions={FIT_VIEW_OPTIONS}
              minZoom={0.1}
              maxZoom={2}
              panOnDrag={interactionConfig.panOnDrag}
              panOnScroll={false}
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              selectionOnDrag={interactionConfig.selectionOnDrag}
              selectionKeyCode={SELECTION_KEY_CODE}
              multiSelectionKeyCode={MULTI_SELECTION_KEY_CODE}
              selectionMode={SelectionMode.Partial}
              proOptions={PRO_OPTIONS}
              className="bg-background canvas-flow acelera-ops-flow"
              defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
              connectionLineStyle={CONNECTION_LINE_STYLE}
              connectionLineType={ConnectionLineType.Bezier}
              connectionRadius={18}
              connectionMode={ConnectionMode.Loose}
              onlyRenderVisibleElements={rfNodes.length > 40}
              elevateNodesOnSelect
              nodesDraggable={!lockedNodes}
              edgesFocusable
              edgesReconnectable
              onReconnect={handleReconnectEdge}
              deleteKeyCode={["Backspace", "Delete"]}
              nodesConnectable
              onPaneContextMenu={(event) => event.preventDefault()}
            >
              {gridVisible && <Background gap={32} size={1} className="opacity-20" />}
            </ReactFlow>
          )}
          {!loading && clientGroups.length > 0 && (
            <NodeTypeDock
              openGroup={openDockGroup}
              onOpenGroup={handleDockGroupChange}
              onPickKind={handleDockPickKind}
              onPickOrb={handleDockPickOrb}
              onPickChat={handleDockPickChat}
            />
          )}
        </div>

        {/* Right inspector — hidden in focus mode */}
        {!focusMode && (
        <CanvasInspectorAdapter
          nodes={scopedProjectNodes}
          edges={dbEdges.length}
          search={search}
          onSearch={setSearch}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          approvalFilter={approvalFilter}
          onApprovalFilter={setApprovalFilter}
          blockedFilter={blockedFilter}
          onBlockedFilter={setBlockedFilter}
          ownerFilter={ownerFilter}
          onOwnerFilter={setOwnerFilter}
          onOpenDependencies={handleOpenDependencies}
          onPick={(n) => setSelectedNode(n)}
          selectedId={selectedNode?.id ?? null}
          collapsed={inspectorCollapsed}
          onToggleCollapse={toggleInspector}
        />
        )}
      </div>

      {/* Quick add modal — used by inline + and Advanced button */}
      <Dialog
        open={advancedOpen || quickAddState.open}
        onOpenChange={(v) => {
          if (!v) {
            setAdvancedOpen(false);
            setQuickAddState({ open: false, sourceId: null, dir: null });
          }
        }}
      >
        <DialogContent className="sm:max-w-md p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 border-b border-border">
            <DialogTitle className="text-base">
              {quickAddState.sourceId ? "Conectar próximo node" : "Adicionar node"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {quickAddState.sourceId
                ? "Escolha o tipo do próximo passo da esteira."
                : "Escolha o tipo de projeto/entregável."}
            </DialogDescription>
          </DialogHeader>
          <QuickAddInline onPick={quickAddState.sourceId ? quickAddFromNode : advancedAdd} />
        </DialogContent>
      </Dialog>

      <CanvasClientPicker
        open={clientPickerOpen}
        onOpenChange={setClientPickerOpen}
        existingClientIds={existingClientIds}
        onPick={handlePickClient}
        hasOtherClients={summary.clients > 0}
      />

      <GenerateEsteiraDialog
        open={generateDialogOpen}
        onOpenChange={setGenerateDialogOpen}
        clientId={clientId}
        workspaceId={workspaceId}
        generating={busyAction === "base"}
        onConfirm={(tpl) => applyEsteiraTemplate(tpl)}
      />

      {/* ═══ Edge Context Menu (right-click na conexão) ═══ */}
      {edgeMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setEdgeMenu(null)}
            onContextMenu={(e) => { e.preventDefault(); setEdgeMenu(null); }}
          />
          <div
            className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-card shadow-xl overflow-hidden"
            style={{ left: edgeMenu.x, top: edgeMenu.y }}
          >
            <button
              type="button"
              onClick={() => {
                const edge = rfEdges.find(e => e.id === edgeMenu.edgeId);
                if (edge) {
                  onEdgeDoubleClick({} as React.MouseEvent, edge);
                }
                setEdgeMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
            >
              ✏️ Editar rótulo
            </button>
            <button
              type="button"
              onClick={() => { invertEdgeDirection(edgeMenu.edgeId); setEdgeMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-foreground hover:bg-secondary transition-colors"
            >
              ⇄ Inverter direção
            </button>
            <div className="h-px bg-border" />
            <button
              type="button"
              onClick={() => { deleteEdgeById(edgeMenu.edgeId); setEdgeMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-400/10 transition-colors"
            >
              🗑 Remover conexão
            </button>
          </div>
        </>
      )}

      <CanvasTemplatesDialog
        open={templatesDialogOpen}
        onOpenChange={setTemplatesDialogOpen}
        workspaceId={workspaceId}
        activeClientId={activeClientId}
        currentNodes={dbNodes as unknown as NodeSnapshot[]}
        currentEdges={dbEdges as unknown as EdgeSnapshot[]}
        onApply={applyCanvasTemplate}
      />

      <AiOrbConfigPanel
        open={!!aiOrbConfigNode}
        onOpenChange={(open) => !open && setAiOrbConfigNode(null)}
        data={aiOrbConfigNode ? readAiOrbData(aiOrbConfigNode.data as Record<string, unknown> | null) : null}
        onDataChange={patchAiOrbData}
        onGenerate={generateFromAiOrb}
        generating={!!aiOrbConfigNode && busyAction === `ai-orb-${aiOrbConfigNode.id}`}
      />

      <ProjectNodeDrawer
        node={selectedNode}
        open={!!selectedNode}
        onOpenChange={(o) => !o && setSelectedNode(null)}
        workspaceId={workspaceId}
        onUpdated={fetchData}
        onDelete={handleDeleteNode}
        availableNodes={scopedProjectNodes}
        onOpenChat={openChatForNode}
        clientFolders={clientGroups.map((c) => ({
          id: c.id,
          name: c.title,
          linkedClientId: c.linked_entity_id,
          logoUrl: c.linked_entity_id ? clientLogos[c.linked_entity_id] ?? null : null,
        }))}
        onMoveToFolder={async (nodeId, targetFolderId) => {
          // Optimistic local update
          setDbNodes((prev) =>
            prev.map((n) => (n.id === nodeId ? { ...n, parent_node_id: targetFolderId } : n)),
          );
          setSelectedNode((cur) => (cur && cur.id === nodeId ? { ...cur, parent_node_id: targetFolderId } : cur));
          const { error } = await supabase
            .from("canvas_nodes")
            .update({ parent_node_id: targetFolderId, updated_at: new Date().toISOString() })
            .eq("id", nodeId);
          if (error) {
            toast({ title: "Erro ao mover", description: error.message, variant: "destructive" });
            await fetchData();
            return;
          }
          // Switch active tab to target folder so user sees the node land there
          if (targetFolderId) setActiveClientId(targetFolderId);
          const targetName = clientGroups.find((c) => c.id === targetFolderId)?.title ?? "Sem pasta";
          toast({ title: "Node movido", description: `→ ${targetName}` });
        }}
      />
    </div>
  );
}

/* Inline quick-pick used by inline + and advanced popovers (search + grid) */
function QuickAddInline({ onPick }: { onPick: (kind: ProjectNodeKind) => void }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return PROJECT_TYPES;
    return PROJECT_TYPES.filter((p) =>
      p.label.toLowerCase().includes(query) || p.shortLabel.toLowerCase().includes(query) || p.kind.toLowerCase().includes(query),
    );
  }, [q]);
  return (
    <>
      <div className="p-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tipo…" className="h-8 pl-7 text-xs" autoFocus />
        </div>
      </div>
      <ScrollArea className="max-h-72">
        <div className="p-1.5 grid grid-cols-2 gap-1">
          {filtered.map((p) => {
            const Icon = p.icon;
            const stage = getStageMeta(p.defaultStage);
            return (
              <button
                key={p.kind}
                onClick={() => onPick(p.kind)}
                className={`flex items-start gap-1.5 p-2 rounded-md border ${p.color} ${p.bg} hover:scale-[1.02] active:scale-95 transition-transform text-left`}
              >
                <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold leading-tight truncate">{p.shortLabel}</p>
                  <p className={`text-[9px] leading-tight opacity-70 ${stage.color.split(" ")[0]}`}>{stage.letter} · {stage.short}</p>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
}

export const OperationalCanvasToolbar = memo(function OperationalCanvasToolbar({
  activeTool, gridVisible, lockedNodes, fullscreen, focusMode, onToolChange, onFit, onToggleLock, onToggleGrid, onToggleFullscreen, onToggleFocus,
}: {
  activeTool: "select" | "hand";
  gridVisible: boolean;
  lockedNodes: boolean;
  fullscreen: boolean;
  focusMode: boolean;
  onToolChange: (tool: "select" | "hand") => void;
  onFit: () => void;
  onToggleLock: () => void;
  onToggleGrid: () => void;
  onToggleFullscreen: () => void;
  onToggleFocus: () => void;
}) {
  const tools = [
    { id: "select", label: "Selecionar · V", icon: MousePointer2, active: activeTool === "select", onClick: () => onToolChange("select") },
    { id: "hand", label: "Mover canvas · H", icon: Hand, active: activeTool === "hand", onClick: () => onToolChange("hand") },
    { id: "fit", label: "Fit view · F", icon: Maximize2, active: false, onClick: onFit, separator: true },
    { id: "focus", label: focusMode ? "Sair do modo foco" : "Modo foco (só canvas + chat)", icon: focusMode ? Eye : Focus, active: focusMode, onClick: onToggleFocus },
    { id: "lock", label: lockedNodes ? "Desbloquear nodes" : "Bloquear nodes", icon: Lock, active: lockedNodes, onClick: onToggleLock },
    { id: "fullscreen", label: fullscreen ? "Sair da tela cheia" : "Tela cheia", icon: fullscreen ? Minimize2 : Maximize2, active: fullscreen, onClick: onToggleFullscreen },
    { id: "grid", label: "Grid · G", icon: Grid3X3, active: gridVisible, onClick: onToggleGrid },
    { id: "shot", label: "Screenshot", icon: Camera, active: false, onClick: () => toast({ title: "Screenshot", description: "Use o export do navegador por enquanto." }), separator: true },
  ];

  return (
    <TooltipProvider delayDuration={160}>
      <aside className="canvas-toolrail">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <div key={tool.id} className={tool.separator ? "pt-2 mt-1 border-t border-border/70" : ""}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" onClick={tool.onClick} className={`canvas-toolrail-button ${tool.active ? "is-active" : ""}`} aria-label={tool.label}>
                    <Icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">{tool.label}</TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </aside>
    </TooltipProvider>
  );
});

const CHAT_FN_OPTIONS: Array<{ fn: ChatNodeFunction; label: string; hint: string }> = [
  { fn: "briefing",   label: "Briefing",      hint: "perguntas e preenchimento" },
  { fn: "planning",   label: "Planejamento",   hint: "OKRs, roadmap, priorização" },
  { fn: "production", label: "Produção",       hint: "organizar e produzir" },
  { fn: "analysis",   label: "Análise",        hint: "diagnóstico e insights" },
  { fn: "free",       label: "Livre",          hint: "conversa sem função fixa" },
];

export const NodeTypeDock = memo(function NodeTypeDock({
  openGroup, onOpenGroup, onPickKind, onPickOrb, onPickChat,
}: {
  openGroup: string | null;
  onOpenGroup: (group: string | null) => void;
  onPickKind: (kind: ProjectNodeKind) => void;
  onPickOrb: (orbType: AiOrbType) => void;
  onPickChat: (fn: ChatNodeFunction) => void;
}) {
  return (
    <div className="node-type-dock-wrap">
      {openGroup && (
        <div className="node-type-dock-menu">
          {openGroup === "ai" ? AI_ORBS.map((orb) => (
            <button key={orb.type} type="button" onClick={() => onPickOrb(orb.type)} className={`node-type-dock-option ai-orb-${orb.type}`}>
              <Bot className="h-3.5 w-3.5" />
              <span>{orb.label}</span>
              <small>{orb.specialization}</small>
            </button>
          )) : openGroup === "chat" ? CHAT_FN_OPTIONS.map((item) => (
            <button key={item.fn} type="button" onClick={() => onPickChat(item.fn)} className="node-type-dock-option">
              <MessageCircle className="h-3.5 w-3.5" />
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          )) : DOCK_GROUPS.find((group) => group.id === openGroup)?.kinds.map((kind) => {
            const meta = getProjectTypeMeta(kind);
            if (!meta) return null;
            const Icon = meta.icon;
            const stage = getStageMeta(meta.defaultStage);
            return (
              <button key={kind} type="button" onClick={() => onPickKind(kind)} className="node-type-dock-option">
                <Icon className="h-3.5 w-3.5" />
                <span>{meta.shortLabel}</span>
                <small>{stage.short}</small>
              </button>
            );
          })}
        </div>
      )}
      <div className="node-type-dock">
        {DOCK_GROUPS.map((group) => {
          const Icon = group.icon;
          const active = openGroup === group.id;
          return (
            <button key={group.id} type="button" onClick={() => onOpenGroup(resolveDockGroupClick(openGroup, group.id))} className={`node-type-dock-button dock-${group.id} ${active ? "is-active" : ""}`}>
              <Icon className="h-4 w-4" />
              <span>{group.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
});

/* Inspector adapter — reuses existing component with filter callbacks but ignores group nodes */
function CanvasInspectorAdapter(props: React.ComponentProps<typeof CanvasInspector>) {
  return <CanvasInspector {...props} />;
}

export default function CanvasStudio(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasStudioInner {...props} />
    </ReactFlowProvider>
  );
}

