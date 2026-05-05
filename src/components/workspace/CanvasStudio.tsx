import { memo, useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from "react";
import {
  ReactFlow, ReactFlowProvider, Background,
  applyNodeChanges, applyEdgeChanges,
  ConnectionMode, ConnectionLineType,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection, type NodeProps,
  type ReactFlowInstance, type Viewport, SelectionMode, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Sparkles, LayoutGrid, Maximize2, Minimize2, Loader2, Building2, Search, Workflow, MousePointer2, Hand, Lock, Grid3X3, Camera, Type, Image, FileStack, Bot, Megaphone, Trophy, MessageCircle, Focus, Eye, LayoutTemplate, RefreshCw } from "lucide-react";
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
import { CanvasViewport } from "./CanvasViewport";
import ProjectNodeDrawer from "./ProjectNodeDrawer";
import CanvasInspector from "./CanvasInspector";
import CanvasClientPicker from "./CanvasClientPicker";
import CanvasClientTabs, { type CanvasClientTab } from "./CanvasClientTabs";
import CanvasMilestoneTabs from "./CanvasMilestoneTabs";
import GenerateEsteiraDialog from "./GenerateEsteiraDialog";
import CanvasTemplatesDialog, { type CanvasTemplate, type NodeSnapshot, type EdgeSnapshot } from "./CanvasTemplatesDialog";
import ApplyPlaybookButton from "./ApplyPlaybookButton";
import CanvasProjectLinker from "./CanvasProjectLinker";
import DeletableEdge from "./DeletableEdge";
import type { EsteiraTemplate } from "./esteiraTemplates";
import { syncNodeCreated, syncNodeDeleted } from "./syncToPortalEvents";
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
import type { AgentId } from "@/lib/aiAgents";

// CanvasStudio é uma camada visual operacional complementar: não substitui o briefing mestre,
// não cria nova lógica/tabela de sinais estruturados e não usa IA opaca como núcleo decisório.

interface CanvasEdgeRecord {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle?: string | null;
  target_handle?: string | null;
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

function FordismoLaneNode({ data }: NodeProps) {
  const d = data as { title?: string; total?: number; done?: number };
  return (
    <div className="pointer-events-none h-full w-full rounded-lg border border-border/70 bg-card/45 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-border/60 bg-background/70 px-3 py-2">
        <span className="text-[11px] font-semibold uppercase text-foreground truncate">{d.title}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">{d.done ?? 0}/{d.total ?? 0}</span>
      </div>
    </div>
  );
}

const nodeTypes = {
  projectCard: ProjectNodeCard,
  canvasGroup: CanvasGroupNode,
  aiOrb: AiOrbNode,
  chatNode: ChatNode,
  fordismoLane: FordismoLaneNode,
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

type EdgeSide = "left" | "right" | "top" | "bottom";

const HANDLE_BY_SIDE: Record<EdgeSide, string> = {
  left: "l2",
  right: "r2",
  top: "t2",
  bottom: "b2",
};

const CHAT_HANDLE_BY_SIDE: Record<EdgeSide, string> = {
  left: "l",
  right: "r",
  top: "t",
  bottom: "b",
};

function sideFromHandle(handle?: string | null): EdgeSide | null {
  const prefix = handle?.[0];
  if (prefix === "l") return "left";
  if (prefix === "r") return "right";
  if (prefix === "t") return "top";
  if (prefix === "b") return "bottom";
  return null;
}

function handleForNodeSide(node: CanvasNodeRow, side: EdgeSide) {
  return nodeKindOf(node) === "chat_node" ? CHAT_HANDLE_BY_SIDE[side] : HANDLE_BY_SIDE[side];
}

function handleVariantsForNodeSide(node: CanvasNodeRow, side: EdgeSide) {
  if (nodeKindOf(node) === "chat_node") return [CHAT_HANDLE_BY_SIDE[side]];
  const prefix = side[0];
  const variants = nodeKindOf(node) === "ai_orb" ? [2, 1] : [2, 1, 3];
  return variants.map((slot) => `${prefix}${slot}`);
}

function normalizeEdgeHandle(node: CanvasNodeRow, handle?: string | null, fallback?: string | null) {
  const side = sideFromHandle(handle) ?? sideFromHandle(fallback);
  if (!side) return undefined;
  const variants = handleVariantsForNodeSide(node, side);
  if (handle && variants.includes(handle)) return handle;
  if (fallback && variants.includes(fallback)) return fallback;
  return handleForNodeSide(node, side);
}

function reserveEdgeHandle(node: CanvasNodeRow, handle: string | undefined, usage: Map<string, Set<string>>) {
  const side = sideFromHandle(handle);
  if (!side) return handle;
  const variants = handleVariantsForNodeSide(node, side);
  if (variants.length <= 1) return variants[0] ?? handle;

  const key = `${node.id}:${side}`;
  const used = usage.get(key) ?? new Set<string>();
  const preferred = handle && variants.includes(handle) ? handle : handleForNodeSide(node, side);
  const chosen = !used.has(preferred)
    ? preferred
    : variants.find((candidate) => !used.has(candidate)) ?? variants[used.size % variants.length];

  used.add(chosen);
  usage.set(key, used);
  return chosen;
}

function inferNodeSize(node: CanvasNodeRow) {
  const data = (node.data as Record<string, unknown> | null) ?? {};
  if (node.node_type === "ai_orb" || data.kind === "ai_orb") return { width: 118, height: 118 };
  if (data.kind === "chat_node") {
    const size = (data.size as string | undefined) ?? "M";
    const widths: Record<string, number> = { S: 320, M: 420, L: 560, XL: 720 };
    return { width: widths[size] ?? 420, height: 220 };
  }
  return { width: nodeKindOf(node) === "engine" ? 400 : 280, height: 112 };
}

function inferEdgeHandles(source: CanvasNodeRow, target: CanvasNodeRow) {
  const sourceSize = inferNodeSize(source);
  const targetSize = inferNodeSize(target);
  const sourceCenter = {
    x: Number(source.pos_x ?? 0) + sourceSize.width / 2,
    y: Number(source.pos_y ?? CONTENT_TOP) + sourceSize.height / 2,
  };
  const targetCenter = {
    x: Number(target.pos_x ?? 0) + targetSize.width / 2,
    y: Number(target.pos_y ?? CONTENT_TOP) + targetSize.height / 2,
  };
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sourceSide: EdgeSide = horizontal ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "bottom" : "top");
  const targetSide: EdgeSide = horizontal ? (dx >= 0 ? "left" : "right") : (dy >= 0 ? "top" : "bottom");
  return { sourceHandle: handleForNodeSide(source, sourceSide), targetHandle: handleForNodeSide(target, targetSide) };
}

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
  if (sourceKind === "ai_orb" || targetKind === "ai_orb") return { label: edge.label ?? "IA", stroke: "hsl(var(--node-tech))", animated: false, className: "edge-ai", strokeWidth: 2.6 };
  if (PROOF_KINDS.has(targetKind) || PROOF_KINDS.has(sourceKind)) return { label: edge.label ?? "prova", stroke: "hsl(var(--node-proof))", animated: false, className: "edge-proof", strokeWidth: 2.8 };
  if (targetKind === "engine") return { label: edge.label ?? "input", stroke: "hsl(var(--node-tech))", animated: false, className: "edge-input", strokeWidth: 2.7 };
  if (sourceKind === "engine") return { label: edge.label ?? "gera", stroke: "hsl(var(--node-build))", animated: false, className: "edge-engine", strokeWidth: 3 };
  if (targetKind === "decisao" || sourceKind === "decisao") return { label: edge.label ?? "aprova", stroke: "hsl(var(--node-growth))", animated: false, className: "edge-decision", strokeWidth: 2.7 };
  return { label: edge.label ?? undefined, stroke: "hsl(var(--primary))", animated: false, className: "edge-flow", strokeWidth: 2.8 };
}

const EMPTY_OPERATIONAL_META = {} as CanvasOperationalMeta;

function shallowArrayEqual(a: unknown[], b: unknown[]) {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

function canvasNodeDataEqual(a: Record<string, unknown> | undefined, b: Record<string, unknown> | undefined) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === "function" && typeof bv === "function") continue;
    if (Array.isArray(av) && Array.isArray(bv)) {
      if (!shallowArrayEqual(av, bv)) return false;
      continue;
    }
    if (av !== bv) return false;
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(`${label} demorou demais`)), ms);
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); },
    );
  });
}

function CanvasStudioInner({
  workspaceId, clientId, clientName,
  fullscreen, onToggleFullscreen, onTimelineRefresh, initialStatusFilter,
}: Props) {
  
  // Cache em memória por workspaceId — evita "carrega ao abrir / carrega ao sair"
  // Quando voltar ao mesmo workspace, mostramos cache instantâneo e revalidamos em background.
  const cacheRef = useRef<Map<string, { nodes: CanvasNodeRow[]; edges: CanvasEdgeRecord[]; logos: Record<string, string | null> }>>(
    (CanvasStudioInner as any).__cache ?? ((CanvasStudioInner as any).__cache = new Map())
  );
  const cached = cacheRef.current.get(workspaceId);
  const [dbNodes, setDbNodes] = useState<CanvasNodeRow[]>(cached?.nodes ?? []);
  const [dbEdges, setDbEdges] = useState<CanvasEdgeRecord[]>(cached?.edges ?? []);
  const [clientLogos, setClientLogos] = useState<Record<string, string | null>>(cached?.logos ?? {});
  // Só mostra spinner na PRIMEIRA carga sem cache. Voltas usam cache enquanto revalida.
  const [loading, setLoading] = useState(!cached);
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
  const clientLogosRef = useRef<Record<string, string | null>>({});
  const autoPortalSyncRef = useRef<{ inFlight: boolean; timer: number | null; interval: number | null }>({ inFlight: false, timer: null, interval: null });
  const portalPushDebounceRef = useRef<number | null>(null);
  const portalPushSignatureRef = useRef<string>("");

  // Active client folder (null = "Todos")
  const [activeClientId, setActiveClientId] = useState<string | null>(null);
  // Plan name of the currently displayed client (fetched from clients table)
  const [clientPlanName, setClientPlanName] = useState<string | null>(null);
  const [clientProjectType, setClientProjectType] = useState<string | null>(null);
  // Milestone "fordismo" — quando setado, a esteira mostra só as tarefas desse milestone
  // organizadas por estágio (todo → doing → review → done).
  // Persistido em URL (?milestone=...) + localStorage por (workspace, cliente)
  // pra sobreviver a refresh e troca de aba.
  const milestoneStorageKey = `canvas:milestone:${workspaceId}:${activeClientId ?? "all"}`;
  const [selectedMilestoneId, setSelectedMilestoneIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("milestone");
    if (fromUrl) return fromUrl;
    return null;
  });

  const setSelectedMilestoneId = useCallback((next: string | null | ((prev: string | null) => string | null)) => {
    setSelectedMilestoneIdState((prev) => {
      const value = typeof next === "function" ? (next as (p: string | null) => string | null)(prev) : next;
      if (typeof window !== "undefined") {
        try {
          const url = new URL(window.location.href);
          if (value) url.searchParams.set("milestone", value);
          else url.searchParams.delete("milestone");
          window.history.replaceState(null, "", url.toString());
          if (activeClientId !== null || workspaceId) {
            if (value) localStorage.setItem(milestoneStorageKey, value);
            else localStorage.removeItem(milestoneStorageKey);
          }
        } catch (err) {
          console.warn("[CanvasStudio] persist milestone failed", err);
        }
      }
      return value;
    });
  }, [activeClientId, workspaceId, milestoneStorageKey]);

  // Restaura do localStorage quando troca de cliente (URL tem prioridade na primeira render)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const fromUrl = url.searchParams.get("milestone");
    if (fromUrl) {
      setSelectedMilestoneIdState(fromUrl);
      return;
    }
    const stored = localStorage.getItem(milestoneStorageKey);
    setSelectedMilestoneIdState(stored ?? null);
  }, [milestoneStorageKey]);

  useEffect(() => { dbNodesRef.current = dbNodes; }, [dbNodes]);
  useEffect(() => { dbEdgesRef.current = dbEdges; }, [dbEdges]);
  useEffect(() => { clientLogosRef.current = clientLogos; }, [clientLogos]);

  const setDbNodesImmediate = useCallback((updater: CanvasNodeRow[] | ((prev: CanvasNodeRow[]) => CanvasNodeRow[])) => {
    setDbNodes((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dbNodesRef.current = next;
      cacheRef.current.set(workspaceId, { nodes: next, edges: dbEdgesRef.current, logos: clientLogosRef.current });
      return next;
    });
  }, [workspaceId]);

  const setDbEdgesImmediate = useCallback((updater: CanvasEdgeRecord[] | ((prev: CanvasEdgeRecord[]) => CanvasEdgeRecord[])) => {
    setDbEdges((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      dbEdgesRef.current = next;
      cacheRef.current.set(workspaceId, { nodes: dbNodesRef.current, edges: next, logos: clientLogosRef.current });
      return next;
    });
  }, [workspaceId]);

  const syncPortalNow = useCallback(async (options: { pull?: boolean; push?: boolean; limit?: number } = {}) => {
    const shouldPull = options.pull ?? true;
    const shouldPush = options.push ?? true;
    const limit = options.limit ?? 120;
    let pulled = 0;
    let pullFailed = false;
    if (shouldPull) try {
      const { data, error } = await withTimeout(supabase.functions.invoke("pull-portal-tasks", {
        body: { workspaceId },
      }), 20000, "Portal→Ops");
      pulled = Number(((data as any)?.created ?? 0) + ((data as any)?.updated ?? 0));
      pullFailed = !!error || (data as any)?.ok === false;
    } catch (error) {
      console.error("[CanvasStudio] pull_portal_tasks failed", error);
      pullFailed = true;
    }

    const { data: freshNodes } = await supabase
      .from("canvas_nodes")
      .select("id, node_type, title, status, pos_x, pos_y, parent_node_id, client_id, data")
      .eq("workspace_id", workspaceId);
    const allNodes = ((freshNodes ?? dbNodesRef.current) as CanvasNodeRow[]);
    const clientRoot = allNodes.find((node) => node.node_type === "client" && (node.client_id === clientId || node.linked_entity_id === clientId));
    const baseX = Number(clientRoot?.pos_x ?? 60);
    const baseY = Number(clientRoot?.pos_y ?? 0);

    const portalOrder = (node: CanvasNodeRow) => {
      const value = Number((node.data as Record<string, unknown> | null)?.portal_position ?? 9999);
      return Number.isFinite(value) ? value : 9999;
    };
    const projectGroups = allNodes
      .filter((node) => String((node.data as Record<string, unknown> | null)?.kind ?? "") === "project_group")
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
    const milestoneGroups = allNodes
      .filter((node) => String((node.data as Record<string, unknown> | null)?.kind ?? "") === "milestone_group")
      .sort((a, b) => portalOrder(a) - portalOrder(b) || String(a.title).localeCompare(String(b.title)));
    const layoutUpdates: Array<{ id: string; pos_x: number; pos_y: number; parent_node_id?: string | null }> = [];
    const nonGroupTask = (node: CanvasNodeRow) => {
      const type = (node.node_type ?? "").toLowerCase();
      const kind = String((node.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
      return !["client", "ai_orb", "chat_node"].includes(type) && !["project_group", "milestone_group", "chat_node"].includes(kind);
    };
    projectGroups.forEach((project, projectIndex) => {
      const projectData = (project.data as Record<string, unknown> | null) ?? {};
      const portalProjectId = typeof projectData.portal_project_id === "string" ? projectData.portal_project_id : null;
      const projectX = baseX + projectIndex * 1760;
      layoutUpdates.push({ id: project.id, pos_x: projectX, pos_y: baseY + 190, parent_node_id: clientRoot?.id ?? project.parent_node_id ?? null });
      const milestones = milestoneGroups.filter((milestone) => {
        const data = (milestone.data as Record<string, unknown> | null) ?? {};
        return portalProjectId && data.portal_project_id === portalProjectId;
      });
      milestones.forEach((milestone, milestoneIndex) => {
        const milestoneX = projectX + 32 + milestoneIndex * 360;
        const milestoneY = baseY + 350;
        layoutUpdates.push({ id: milestone.id, pos_x: milestoneX, pos_y: milestoneY, parent_node_id: project.id });
        const milestoneData = (milestone.data as Record<string, unknown> | null) ?? {};
        const tasks = allNodes
          .filter((node) => {
            if (!nonGroupTask(node)) return false;
            const data = (node.data as Record<string, unknown> | null) ?? {};
            return node.parent_node_id === milestone.id
              || (!!portalProjectId && data.portal_project_id === portalProjectId && (
                (milestoneData.portal_milestone_id && data.portal_milestone_id === milestoneData.portal_milestone_id)
                || (milestoneData.milestone_key && data.milestone_key === milestoneData.milestone_key)
              ));
          })
          .sort((a, b) => portalOrder(a) - portalOrder(b) || String(a.title).localeCompare(String(b.title)));
        tasks.forEach((task, taskIndex) => {
          layoutUpdates.push({ id: task.id, pos_x: milestoneX + 32, pos_y: baseY + 480 + taskIndex * 136, parent_node_id: milestone.id });
        });
      });
    });
    const changedLayoutUpdates = layoutUpdates.filter((item) => {
      const current = allNodes.find((node) => node.id === item.id);
      if (!current) return false;
      return Math.round(Number(current.pos_x ?? 0)) !== Math.round(item.pos_x)
        || Math.round(Number(current.pos_y ?? 0)) !== Math.round(item.pos_y)
        || (item.parent_node_id !== undefined && current.parent_node_id !== item.parent_node_id);
    });
    if (changedLayoutUpdates.length > 0) {
      await Promise.all(changedLayoutUpdates.map((item) => supabase.from("canvas_nodes").update({
        pos_x: item.pos_x,
        pos_y: item.pos_y,
        parent_node_id: item.parent_node_id,
        updated_at: new Date().toISOString(),
      }).eq("id", item.id)));
    }
    const nodeById = new Map(allNodes.map((node) => [node.id, node] as const));
    const groupPortalProjectById = new Map<string, string>();
    allNodes.forEach((node) => {
      const data = (node.data as Record<string, unknown> | null) ?? {};
      const kind = String(data.kind ?? "").toLowerCase();
      const portalProjectId = typeof data.portal_project_id === "string" ? data.portal_project_id : null;
      if ((kind === "project_group" || kind === "milestone_group") && portalProjectId) groupPortalProjectById.set(node.id, portalProjectId);
    });

    const portalProjectForNode = (node: CanvasNodeRow) => {
      const direct = (node.data as Record<string, unknown> | null)?.portal_project_id;
      if (typeof direct === "string" && direct) return direct;
      let parentId = node.parent_node_id ?? null;
      for (let depth = 0; parentId && depth < 4; depth++) {
        const parentProject = groupPortalProjectById.get(parentId);
        if (parentProject) return parentProject;
        parentId = nodeById.get(parentId)?.parent_node_id ?? null;
      }
      return null;
    };

    const syncableNodes = shouldPush ? allNodes.filter((node) => {
      const type = (node.node_type ?? "").toLowerCase();
      const kind = ((node.data as Record<string, unknown> | null)?.kind as string | undefined ?? "").toLowerCase();
      // Pula pastas/clientes; só tarefas viram cards reais no kanban do portal.
      if (["client", "ai_orb", "chat_node"].includes(type)) return false;
      if (kind === "chat_node" || kind === "project_group" || kind === "milestone_group") return false;
      return true;
    }).slice(0, limit) : [];

    let sent = 0;
    let failed = 0;
    for (const node of syncableNodes) {
      const ndata = (node.data as Record<string, unknown> | null) ?? {};
      const hasPortalTask = typeof ndata.portal_task_id === "string" && (ndata.portal_task_id as string).length > 0;
      const portalProjectId = portalProjectForNode(node);
      try {
        const { data, error } = await withTimeout(supabase.functions.invoke("sync-to-portal", {
          body: {
            // Já vinculado → atualiza (status/progresso). Novo → cria card no portal.
            event: hasPortalTask ? "node_updated" : "node_created",
            workspaceId,
            clientId: node.client_id ?? clientId,
            nodeId: node.id,
            nodeTitle: node.title,
            nodeType: node.node_type,
            status: node.status ?? "draft",
            portalProjectId: portalProjectId ?? undefined,
          },
        }), 4500, "Ops→Portal");
        if (error || (data as any)?.ok === false || (data as any)?.skipped) failed++;
        else sent++;
      } catch (error) {
        console.error("[CanvasStudio] sync-to-portal node failed", node.id, error);
        failed++;
      }
    }

    // ── Progresso por milestone (project_group) e progresso geral do cliente ──
    try {
      const COMPLETED = new Set(["done", "completed", "concluido", "concluída", "concluida"]);
      const groups = allNodes.filter((n) => {
        const k = ((n.data as Record<string, unknown> | null)?.kind as string | undefined) ?? "";
        return k === "milestone_group";
      });

      const tasksByGroup = new Map<string, typeof allNodes>();
      for (const g of groups) tasksByGroup.set(g.id, [] as any);
      for (const n of allNodes) {
        if (!n.parent_node_id) continue;
        const arr = tasksByGroup.get(n.parent_node_id);
        if (!arr) continue;
        const t = (n.node_type ?? "").toLowerCase();
        const k = ((n.data as Record<string, unknown> | null)?.kind as string | undefined) ?? "";
        if (["client", "ai_orb", "chat_node"].includes(t) || k === "chat_node" || k === "project_group" || k === "milestone_group") continue;
        arr.push(n);
      }

      const projectProgress = new Map<string, number[]>();
      for (const g of groups) {
        const tasks = tasksByGroup.get(g.id) ?? [];
        if (tasks.length === 0) continue;
        const doneCount = tasks.filter((t) => COMPLETED.has((t.status ?? "").toLowerCase())).length;
        const pct = Math.round((doneCount / tasks.length) * 100);
        const portalProjectId = ((g.data as Record<string, unknown> | null)?.portal_project_id as string | undefined) ?? null;
        if (!portalProjectId) continue;
        projectProgress.set(portalProjectId, [...(projectProgress.get(portalProjectId) ?? []), pct]);
        const gdata = (g.data as Record<string, unknown> | null) ?? {};
        await supabase.from("canvas_nodes").update({ data: { ...gdata, portal_progress: pct }, updated_at: new Date().toISOString() }).eq("id", g.id);
      }

      const projectAverages: number[] = [];
      for (const [portalProjectId, values] of projectProgress) {
        const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
        projectAverages.push(avg);
        await supabase.functions.invoke("sync-to-portal", {
          body: { event: "project_progress", workspaceId, clientId, portalProjectId, progress: avg, message: `Progresso do projeto: ${avg}%` },
        }).catch(() => {});
      }

      // Média geral do cliente (média dos projetos/milestones reais)
      if (projectAverages.length > 0) {
        const avg = Math.round(projectAverages.reduce((a, b) => a + b, 0) / projectAverages.length);
        await supabase.functions.invoke("sync-to-portal", {
          body: {
            event: "client_progress",
            workspaceId,
            clientId,
            progress: avg,
            message: `Progresso geral da conta: ${avg}%`,
          },
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("[CanvasStudio] progress rollup failed", err);
    }

    await fetchDataRef.current?.();
    return { total: syncableNodes.length, sent, failed, pulled, pullFailed };
  }, [clientId, workspaceId]);

  // Load client plan_name + project_type for ApplyPlaybookButton
  useEffect(() => {
    if (!clientId) { setClientPlanName(null); setClientProjectType(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("plan_name, project_type")
        .eq("id", clientId)
        .maybeSingle();
      if (!cancelled) {
        setClientPlanName((data?.plan_name as string | null) ?? null);
        setClientProjectType((data?.project_type as string | null) ?? null);
      }
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
    // Só ativa skeleton se não tem nada em tela ainda
    setLoading((prev) => prev && dbNodesRef.current.length === 0);
    // ── Fase 1: payload leve para renderizar nodes na tela rapidamente.
    // (data jsonb e description podem ser grandes — buscamos depois em paralelo)
    const lightSel = "id, node_type, title, status, pos_x, pos_y, parent_node_id, linked_entity_id, linked_entity_type, workspace_id, client_id, created_at, updated_at";
    const [{ data: lightNodes }, { data: edgesData }] = await Promise.all([
      supabase.from("canvas_nodes").select(lightSel).eq("workspace_id", workspaceId).order("created_at"),
      supabase.from("canvas_edges")
        .select("id, source_node_id, target_node_id, source_handle, target_handle, edge_type, label, workspace_id")
        .eq("workspace_id", workspaceId),
    ]);
    const lightNodesArr = (lightNodes ?? []) as CanvasNodeRow[];
    const edges = (edgesData ?? []) as CanvasEdgeRecord[];

    // Mescla com `data`/`description` já em memória (cache) para não regredir cards
    const prevById = new Map(dbNodesRef.current.map((n) => [n.id, n] as const));
    const merged = lightNodesArr.map((n) => {
      const prev = prevById.get(n.id);
      return prev ? { ...prev, ...n, data: prev.data, description: prev.description } : n;
    });

    dbNodesRef.current = merged;
    dbEdgesRef.current = edges;
    setDbNodes(merged);
    setDbEdges(edges);
    setLoading(false);

    // ── Fase 2 (background): enriquece com data + description, em chunks.
    void (async () => {
      const ids = lightNodesArr.map((n) => n.id);
      const CHUNK = 80;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        const { data: detail } = await supabase
          .from("canvas_nodes")
          .select("id, data, description")
          .in("id", slice);
        if (!detail || detail.length === 0) continue;
        const detailMap = new Map(detail.map((d: any) => [d.id, d] as const));
        setDbNodes((prev) => {
          const next = prev.map((n) => {
            const d = detailMap.get(n.id);
            if (!d) return n;
            return { ...n, data: d.data ?? n.data, description: d.description ?? n.description };
          });
          dbNodesRef.current = next;
          return next;
        });
        // pequeno yield pro browser respirar
        await new Promise((r) => setTimeout(r, 0));
      }
    })();

    // Fetch logos for all linked clients (tolerant if column doesn't exist)
    const linkedIds = Array.from(
      new Set(
        lightNodesArr
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
        clientLogosRef.current = map;
        setClientLogos(map);
        cacheRef.current.set(workspaceId, { nodes: merged, edges, logos: map });
      }
    } else {
      clientLogosRef.current = {};
      setClientLogos({});
      cacheRef.current.set(workspaceId, { nodes: merged, edges, logos: {} });
    }
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Mantém refs estáveis sincronizados
  useEffect(() => { fetchDataRef.current = fetchData; }, [fetchData]);

  useEffect(() => {
    if (!workspaceId || !clientId) return;
    const state = autoPortalSyncRef.current;
    const run = (pull: boolean) => {
      if (state.inFlight) return;
      state.inFlight = true;
      void syncPortalNow({ pull, push: true, limit: 120 })
        .catch((err) => console.warn("[CanvasStudio] auto portal sync failed", err))
        .finally(() => { state.inFlight = false; });
    };
    state.timer = window.setTimeout(() => run(true), 900);
    state.interval = window.setInterval(() => run(true), 45000);
    return () => {
      if (state.timer) window.clearTimeout(state.timer);
      if (state.interval) window.clearInterval(state.interval);
      state.timer = null;
      state.interval = null;
    };
  }, [workspaceId, clientId, syncPortalNow]);

  useEffect(() => {
    if (!workspaceId || !clientId || dbNodes.length === 0) return;
    const signature = dbNodes
      .filter((node) => {
        const type = (node.node_type ?? "").toLowerCase();
        const kind = String((node.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
        return !["client", "ai_orb", "chat_node"].includes(type) && !["project_group", "milestone_group", "chat_node"].includes(kind);
      })
      .map((node) => `${node.id}:${node.title}:${node.status}`)
      .join("|");
    if (!signature || signature === portalPushSignatureRef.current) return;
    portalPushSignatureRef.current = signature;
    if (portalPushDebounceRef.current) window.clearTimeout(portalPushDebounceRef.current);
    portalPushDebounceRef.current = window.setTimeout(() => {
      void syncPortalNow({ pull: false, push: true, limit: 120 }).catch((err) => console.warn("[CanvasStudio] auto portal push failed", err));
    }, 1800);
    return () => {
      if (portalPushDebounceRef.current) window.clearTimeout(portalPushDebounceRef.current);
      portalPushDebounceRef.current = null;
    };
  }, [workspaceId, clientId, dbNodes, syncPortalNow]);

  // Realtime: novos nodes (criados pelo portal ou outra sessão) aparecem ao vivo.
  useEffect(() => {
    if (!workspaceId) return;
    const channel = supabase
      .channel(`canvas-nodes-${workspaceId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "canvas_nodes",
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        const row = payload.new as CanvasNodeRow;
        setDbNodes((prev) => prev.some((n) => n.id === row.id) ? prev : [...prev, row]);
      })
      .on("postgres_changes", {
        event: "UPDATE", schema: "public", table: "canvas_nodes",
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        const row = payload.new as CanvasNodeRow;
        setDbNodes((prev) => prev.map((n) => n.id === row.id ? { ...n, ...row } : n));
      })
      .on("postgres_changes", {
        event: "DELETE", schema: "public", table: "canvas_nodes",
        filter: `workspace_id=eq.${workspaceId}`,
      }, (payload) => {
        const oldId = (payload.old as { id?: string }).id;
        if (!oldId) return;
        setDbNodes((prev) => prev.filter((n) => n.id !== oldId));
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [workspaceId]);

  // Auto-cria o node "client" quando o canvas vem de um workspace e ainda não tem pasta
  useEffect(() => {
    if (loading || !workspaceId || !clientId || !clientName) return;
    const hasClientNode = dbNodes.some((n) => n.node_type === "client");
    if (hasClientNode) return;

    let cancelled = false;
    (async () => {
      const { data: clientData } = await supabase
        .from("clients")
        .select("id, name, company_name, portal_client_id, metadata")
        .eq("id", clientId)
        .single();
      if (cancelled || !clientData) return;

      const { data: newNode, error } = await supabase
        .from("canvas_nodes")
        .insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_type: "client",
          title: clientData.name,
          description: clientData.company_name || null,
          status: "active",
          pos_x: 60,
          pos_y: 0,
          data: {
            kind: "client",
            linked_entity_id: clientData.id,
            company_name: clientData.company_name,
            portal_client_id: clientData.portal_client_id,
          },
        })
        .select("*")
        .single();
      if (!cancelled && !error && newNode) {
        await fetchData();
      }
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [loading, dbNodes, workspaceId, clientId, clientName, fetchData]);

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
      // Prefere o cliente do workspace atual quando existir
      const match = clientId
        ? clientGroups.find(
            (g) =>
              (g.data as Record<string, unknown> | null)?.linked_entity_id === clientId ||
              g.client_id === clientId,
          )
        : null;
      setActiveClientId((match ?? clientGroups[0]).id);
    }
    // If active client was removed, fall back
    if (activeClientId && !clientGroups.find((c) => c.id === activeClientId)) {
      setActiveClientId(clientGroups[0]?.id ?? null);
    }
  }, [loading, clientGroups, activeClientId, clientId]);

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
    const activeGroup = clientGroups.find((group) => group.id === activeClientId);
    const linkedClientId = activeGroup?.linked_entity_id ?? activeGroup?.client_id ?? null;
    // Inclui descendentes (project_group → tasks → ...) recursivamente.
    const allowed = new Set<string>([activeClientId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of projectNodes) {
        if (!allowed.has(n.id) && n.parent_node_id && allowed.has(n.parent_node_id)) {
          allowed.add(n.id);
          changed = true;
        }
      }
    }
    return projectNodes.filter(
      (n) =>
        allowed.has(n.id) ||
        (!n.parent_node_id && linkedClientId && n.client_id === linkedClientId),
    );
  }, [projectNodes, activeClientId, clientGroups]);

  type QuickAddState = { open: boolean; sourceId: string | null; dir: "right" | "bottom" | null };
  const [quickAddState, setQuickAddState] = useState<QuickAddState>({ open: false, sourceId: null, dir: null });

  const quickConnectFromNode = useCallback((sourceId: string, dir: "right" | "bottom") => {
    setQuickAddState({ open: true, sourceId, dir });
  }, []);

  // Refs estáveis pra handlers passados dentro de data dos nodes
  // Evita que reactFlowNodes seja invalidado sempre que fetchData/handleDeleteNode mudam
  const fetchDataRef = useRef<() => Promise<void>>();
  const handleDeleteNodeRef = useRef<(id: string) => Promise<void>>();
  const stableOnPrefilled = useCallback(() => { void fetchDataRef.current?.(); }, []);
  const stableOnDeleteNode = useCallback((id: string) => { void handleDeleteNodeRef.current?.(id); }, []);
  const stableOnQuickConnect = useCallback((sourceId: string, dir: "right" | "bottom") => {
    setQuickAddState({ open: true, sourceId, dir });
  }, []);
  const stableOnExpandHub = useCallback((engineNodeId: string) => {
    void expandEngineHubRef.current?.(engineNodeId);
  }, []);

  const visibleCanvasNodes = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    // Fordismo acontece dentro do canvas: sem seleção, nada some; com milestone
    // selecionado, focamos projeto + pasta do milestone + tarefas reais dele.
    const milestoneById = new Map(scopedProjectNodes.map((n) => [n.id, n] as const));
    const isFolder = (node: CanvasNodeRow) => {
      const type = (node.node_type ?? "").toLowerCase();
      const kind = String((node.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
      return type === "client" || kind === "project_group" || kind === "milestone_group";
    };
    const belongsToMilestone = (node: CanvasNodeRow, milestoneId: string): boolean => {
      if (node.id === milestoneId) return false;
      const milestone = milestoneById.get(milestoneId);
      if (!milestone) return false;
      const mData = (milestone.data as Record<string, unknown> | null) ?? {};
      const data = (node.data as Record<string, unknown> | null) ?? {};
      if (node.parent_node_id === milestoneId) return true;
      if (mData.portal_milestone_id && data.portal_milestone_id === mData.portal_milestone_id) return true;
      if (mData.milestone_key && data.milestone_key === mData.milestone_key && data.portal_project_id === mData.portal_project_id) return true;
      return false;
    };
    return scopedProjectNodes.filter((node) => {
      // Pastinhas (project_group / milestone_group) saíram do canvas:
      // agora vivem na barra superior CanvasMilestoneTabs. Os nodes ainda
      // existem no DB para a sincronia bidirecional com o Portal.
      const folderKind = String((node.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
      if (folderKind === "project_group" || folderKind === "milestone_group") return false;
      if (selectedMilestoneId) {
        const selected = milestoneById.get(selectedMilestoneId);
        if (!belongsToMilestone(node, selectedMilestoneId)) return false;
      }
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
  }, [scopedProjectNodes, deferredSearch, typeFilter, statusFilter, approvalFilter, blockedFilter, ownerFilter, selectedMilestoneId]);

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
    if (selectedMilestoneId) {
      inst.fitView({ padding: 0.12, duration: 300 });
      return;
    }
    if (restoredScopesRef.current.has(viewportScope)) return;
    const saved = readSavedViewport(viewportScope);
    if (saved) inst.setViewport(saved, { duration: 250 });
    else inst.fitView({ padding: 0.4, duration: 250 });
    restoredScopesRef.current.add(viewportScope);
  }, [viewportScope, readSavedViewport, selectedMilestoneId]);

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

  // Cache de conexões por node — evita filter() linear de dbEdges em cada render
  const connectionsByNodeId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const e of dbEdges) {
      // Adiciona target ao source
      const fromList = map.get(e.source_node_id) ?? [];
      fromList.push(e.target_node_id);
      map.set(e.source_node_id, fromList);
      // Adiciona source ao target (relação bidirecional para ChatNodes)
      const toList = map.get(e.target_node_id) ?? [];
      toList.push(e.source_node_id);
      map.set(e.target_node_id, toList);
    }
    return map;
  }, [dbEdges]);

  const reactFlowNodes = useMemo(() => {
    // Layout fordista: quando um milestone está selecionado, reposicionamos as tarefas
    // em "estações" horizontais (uma coluna por status), mantendo a ordem do portal.
    const FORDISMO_STAGES: Array<{ key: string; title: string; match: (s: string) => boolean }> = [
      { key: "ideia", title: "Ideia", match: (s) => s === "ideia" || s === "planejado" || s === "draft" },
      { key: "em_producao", title: "Em produção", match: (s) => s === "em_producao" || s === "active" || s === "ativo" || s === "doing" },
      { key: "revisao", title: "Revisão", match: (s) => s === "revisao" || s === "review" },
      { key: "bloqueado", title: "Bloqueado", match: (s) => s === "bloqueado" || s === "blocked" },
      { key: "concluido", title: "Concluído", match: (s) => s === "concluido" || s === "done" },
    ];
    const FORDISMO_COL_W = 360;
    const FORDISMO_ROW_H = 156;
    const FORDISMO_ORIGIN_X = 120;
    const FORDISMO_ORIGIN_Y = 330;
    const fordismoOverride = new Map<string, { x: number; y: number }>();
    const fordismoStageTotals = new Map<string, { total: number; done: number }>();
    const stageCounts = new Map<string, number>();
    if (selectedMilestoneId) {
      const selectedMilestone = visibleCanvasNodes.find((node) => node.id === selectedMilestoneId);
      const selectedProject = selectedMilestone?.parent_node_id
        ? visibleCanvasNodes.find((node) => node.id === selectedMilestone.parent_node_id)
        : null;
      if (selectedProject) fordismoOverride.set(selectedProject.id, { x: FORDISMO_ORIGIN_X, y: 96 });
      if (selectedMilestone) fordismoOverride.set(selectedMilestone.id, { x: FORDISMO_ORIGIN_X, y: 210 });
      const sorted = visibleCanvasNodes.filter((node) => {
        const kind = String((node.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
        const type = (node.node_type ?? "").toLowerCase();
        return !["client", "ai_orb", "chat_node"].includes(type) && !["project_group", "milestone_group", "chat_node"].includes(kind);
      }).sort((a, b) => {
        const pa = Number((a.data as Record<string, unknown> | null)?.portal_position ?? 9999);
        const pb = Number((b.data as Record<string, unknown> | null)?.portal_position ?? 9999);
        if (pa !== pb) return pa - pb;
        return String(a.title).localeCompare(String(b.title));
      });
      sorted.forEach((node) => {
        const status = mapLegacyStatus(node.status ?? "");
        let stageIdx = FORDISMO_STAGES.findIndex((s) => s.match(status));
        if (stageIdx < 0) stageIdx = 0;
        const key = FORDISMO_STAGES[stageIdx].key;
        const row = stageCounts.get(key) ?? 0;
        stageCounts.set(key, row + 1);
        const current = fordismoStageTotals.get(key) ?? { total: 0, done: 0 };
        fordismoStageTotals.set(key, { total: current.total + 1, done: current.done + (key === "concluido" ? 1 : 0) });
        fordismoOverride.set(node.id, {
          x: FORDISMO_ORIGIN_X + stageIdx * FORDISMO_COL_W,
          y: FORDISMO_ORIGIN_Y + row * FORDISMO_ROW_H,
        });
      });
    }
    const laneNodes: Node[] = selectedMilestoneId ? FORDISMO_STAGES.map((stage, index) => {
      const totals = fordismoStageTotals.get(stage.key) ?? { total: 0, done: 0 };
      return {
        id: `fordismo-lane-${selectedMilestoneId}-${stage.key}`,
        type: "fordismoLane",
        position: { x: FORDISMO_ORIGIN_X + index * FORDISMO_COL_W - 18, y: FORDISMO_ORIGIN_Y - 58 },
        draggable: false,
        selectable: false,
        data: { title: stage.title, total: totals.total, done: totals.done, __layoutPositionKey: `fordismo-lane:${selectedMilestoneId}:${stage.key}` },
        style: { width: 316, height: Math.max(520, (stageCounts.get(stage.key) ?? 0) * FORDISMO_ROW_H + 112), zIndex: -1 },
      } satisfies Node;
    }) : [];
    // Progresso real por pasta (project_group / milestone_group): conta tarefas filhas
    // (diretas ou matched por portal_milestone_id/milestone_key) e quantas estão done.
    const groupProgressById = new Map<string, { total: number; done: number }>();
    {
      const COMPLETED = new Set(["done", "completed", "concluido", "concluída", "concluida"]);
      const isTaskish = (node: CanvasNodeRow) => {
        const t = (node.node_type ?? "").toLowerCase();
        const k = String((node.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
        return !["client", "ai_orb", "chat_node"].includes(t) && !["project_group", "milestone_group", "chat_node"].includes(k);
      };
      const milestoneNodes = visibleCanvasNodes.filter((node) => String((node.data as Record<string, unknown> | null)?.kind ?? "") === "milestone_group");
      const projectNodes = visibleCanvasNodes.filter((node) => String((node.data as Record<string, unknown> | null)?.kind ?? "") === "project_group");
      for (const m of milestoneNodes) {
        const md = (m.data as Record<string, unknown> | null) ?? {};
        const mPid = md.portal_milestone_id as string | undefined;
        const mKey = md.milestone_key as string | undefined;
        const mProj = md.portal_project_id as string | undefined;
        const tasks = visibleCanvasNodes.filter((n) => {
          if (!isTaskish(n)) return false;
          if (n.parent_node_id === m.id) return true;
          const d = (n.data as Record<string, unknown> | null) ?? {};
          if (mPid && d.portal_milestone_id === mPid) return true;
          if (mKey && d.milestone_key === mKey && d.portal_project_id === mProj) return true;
          return false;
        });
        const done = tasks.filter((t) => COMPLETED.has((t.status ?? "").toLowerCase())).length;
        groupProgressById.set(m.id, { total: tasks.length, done });
      }
      for (const p of projectNodes) {
        const pd = (p.data as Record<string, unknown> | null) ?? {};
        const pPid = pd.portal_project_id as string | undefined;
        const tasks = visibleCanvasNodes.filter((n) => {
          if (!isTaskish(n)) return false;
          const d = (n.data as Record<string, unknown> | null) ?? {};
          return !!pPid && d.portal_project_id === pPid;
        });
        const done = tasks.filter((t) => COMPLETED.has((t.status ?? "").toLowerCase())).length;
        groupProgressById.set(p.id, { total: tasks.length, done });
      }
    }
    const cardNodes = visibleCanvasNodes.map((n): Node => {
      const owner = n.parent_node_id ? groupMeta[n.parent_node_id] : null;
      const dataObj = (n.data as Record<string, unknown> | null) ?? {};
      const operationalMeta = (dataObj.operationalMeta ?? dataObj.operational_meta ?? EMPTY_OPERATIONAL_META) as CanvasOperationalMeta;
      const attachmentList = (dataObj.attachments as Array<{ url?: string; type?: string; label?: string }> | undefined) ?? [];
      const isAiOrb = n.node_type === "ai_orb" || dataObj.kind === "ai_orb";
      const isChatNode = dataObj.kind === "chat_node";
      const override = fordismoOverride.get(n.id);
      const posX = override ? override.x : Number(n.pos_x ?? 0);
      const posY = override ? override.y : Number(n.pos_y ?? CONTENT_TOP);

      if (isChatNode) {
        const connectedIds = connectionsByNodeId.get(n.id) ?? [];
        return {
          id: n.id,
          type: "chatNode",
          position: { x: posX, y: posY },
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
        position: { x: posX, y: posY },
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
          checklistTotal: (() => {
            const k = String(dataObj.kind ?? "").toLowerCase();
            if (k === "milestone_group" || k === "project_group") return groupProgressById.get(n.id)?.total ?? 0;
            return (dataObj.checklist as Array<{ done?: boolean }> | undefined)?.length ?? 0;
          })(),
          checklistDone: (() => {
            const k = String(dataObj.kind ?? "").toLowerCase();
            if (k === "milestone_group" || k === "project_group") return groupProgressById.get(n.id)?.done ?? 0;
            return (dataObj.checklist as Array<{ done?: boolean }> | undefined)?.filter((c) => c.done).length ?? 0;
          })(),
          clientName: owner?.name ?? null,
          clientSeed: owner?.seed ?? null,
          clientLogoUrl: owner?.logoUrl ?? null,
          operationalMeta,
          nodeId: n.id,
          workspaceId,
          onPrefilled: stableOnPrefilled,
            onQuickConnect: stableOnQuickConnect,
            onDelete: stableOnDeleteNode,
          canExpandHub: nodeKindOf(n) === "engine",
            onExpandHub: stableOnExpandHub,
          typeData: dataObj,
          __layoutPositionKey: selectedMilestoneId || dataObj.from_portal || dataObj.portal_task_id || dataObj.portal_project_id
            ? `${n.id}:${Math.round(posX)}:${Math.round(posY)}`
            : undefined,
          pulse: !!dataObj.from_portal && !dataObj.touched_at,
        } satisfies ProjectNodeData,
      };
    });
    return [...laneNodes, ...cardNodes];
  }, [visibleCanvasNodes, groupMeta, workspaceId, lockedNodes, stableOnPrefilled, stableOnQuickConnect, stableOnDeleteNode, stableOnExpandHub, connectionsByNodeId, clientId, selectedMilestoneId]);

  /** Delete edge — instant local update + DB delete. Usado pelo DeletableEdge e context menu. */
  const deleteEdgeById = useCallback(async (edgeId: string) => {
    // Otimista: remove local PRIMEIRO, depois confirma no banco
    setDbEdges((prev) => prev.filter((e) => e.id !== edgeId));
    const { error } = await supabase.from("canvas_edges").delete().eq("id", edgeId);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      // Rollback: recarrega para re-adicionar se a deleção falhou
      await fetchData();
      return;
    }
    toast({ title: "Conexão removida" });
  }, [fetchData]);

  /** Edit edge label — update otimista no local + DB. */
  const editEdgeLabel = useCallback(async (edgeId: string, newLabel: string | null) => {
    setDbEdges((prev) => prev.map((e) => e.id === edgeId ? { ...e, label: newLabel } : e));
    const { error } = await supabase
      .from("canvas_edges")
      .update({ label: newLabel, updated_at: new Date().toISOString() })
      .eq("id", edgeId);
    if (error) {
      toast({ title: "Erro ao editar rótulo", description: error.message, variant: "destructive" });
      await fetchData();
      return;
    }
    toast({ title: newLabel ? "Rótulo atualizado" : "Rótulo removido" });
  }, [fetchData]);

  // Refs estáveis das callbacks para evitar que reactFlowEdges seja invalidado
  // sempre que deleteEdgeById/editEdgeLabel mudarem de identidade.
  // As edges passam essas refs no data e DeletableEdge chama através delas.
  const deleteEdgeByIdRef = useRef(deleteEdgeById);
  const editEdgeLabelRef = useRef(editEdgeLabel);
  useEffect(() => { deleteEdgeByIdRef.current = deleteEdgeById; }, [deleteEdgeById]);
  useEffect(() => { editEdgeLabelRef.current = editEdgeLabel; }, [editEdgeLabel]);

  const stableOnDelete = useCallback((edgeId: string) => deleteEdgeByIdRef.current(edgeId), []);
  const stableOnEditLabel = useCallback((edgeId: string, label: string | null) => editEdgeLabelRef.current(edgeId, label), []);
  const stableOnSelectEdge = useCallback((edgeId: string) => {
    setRfEdges((edges) => edges.map((edge) => ({ ...edge, selected: edge.id === edgeId })));
    setRfNodes((nodes) => nodes.map((node) => ({ ...node, selected: false })));
  }, []);

  const reactFlowEdges = useMemo(() => {
    const visibleIds = new Set(visibleCanvasNodes.map((n) => n.id));
    const visibleById = new Map(visibleCanvasNodes.map((n) => [n.id, n]));
    const edgeHandleUsage = new Map<string, Set<string>>();
    return dbEdges
      .filter((e) => visibleIds.has(e.source_node_id) && visibleIds.has(e.target_node_id))
      .map((e): Edge => {
        const intent = edgeIntent(e, visibleById);
        const sourceNode = visibleById.get(e.source_node_id);
        const targetNode = visibleById.get(e.target_node_id);
        const inferredHandles = sourceNode && targetNode ? inferEdgeHandles(sourceNode, targetNode) : null;
        const normalizedSourceHandle = sourceNode ? normalizeEdgeHandle(sourceNode, e.source_handle, inferredHandles?.sourceHandle) : undefined;
        const normalizedTargetHandle = targetNode ? normalizeEdgeHandle(targetNode, e.target_handle, inferredHandles?.targetHandle) : undefined;
        const sourceHandle = sourceNode ? reserveEdgeHandle(sourceNode, normalizedSourceHandle, edgeHandleUsage) : undefined;
        const targetHandle = targetNode ? reserveEdgeHandle(targetNode, normalizedTargetHandle, edgeHandleUsage) : undefined;
        return {
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          sourceHandle,
          targetHandle,
          label: intent.label,
          animated: intent.animated,
          type: "deletable",
          zIndex: 30,
          className: intent.className,
          markerEnd: { type: MarkerType.ArrowClosed, color: intent.stroke, width: 18, height: 18 },
          style: { stroke: intent.stroke, strokeWidth: intent.strokeWidth },
          data: {
            onDelete: stableOnDelete,
            onEditLabel: stableOnEditLabel,
            onSelect: stableOnSelectEdge,
          },
        };
      });
  }, [dbEdges, visibleCanvasNodes, stableOnDelete, stableOnEditLabel, stableOnSelectEdge]);

  /* DB → ReactFlow — preserva posição LOCAL quando o node já existe no canvas.
   * Motivo: sem isso, ao adicionar/editar qualquer node TODOS os outros voltam
   * para pos_x/pos_y do DB, desfazendo organização manual do usuário. */
  useEffect(() => {
    setRfNodes((currentRfNodes) => {
      const byId = new Map(currentRfNodes.map(n => [n.id, n]));
      const result: Node[] = [];
      let hasChanges = currentRfNodes.length !== reactFlowNodes.length;

      for (const newNode of reactFlowNodes) {
        const existing = byId.get(newNode.id);

        // Node novo → usa posição do DB
        if (!existing) {
          result.push(newNode);
          hasChanges = true;
          continue;
        }

        // Node sendo arrastado → mantém referência atual (não toca pra não interromper drag)
        if (draggingNodesRef.current.has(newNode.id)) {
          result.push(existing);
          continue;
        }

        // Compara conteúdo da data — callbacks estáveis não invalidam render.
        const sameData = canvasNodeDataEqual(existing.data as Record<string, unknown>, newNode.data as Record<string, unknown>);
        const sameConfig = existing.type === newNode.type && existing.draggable === newNode.draggable;
        const layoutChanged = (existing.data as Record<string, unknown> | undefined)?.__layoutPositionKey !== (newNode.data as Record<string, unknown> | undefined)?.__layoutPositionKey;
        if (sameData && sameConfig) {
          // Sem mudança em data — reusa objeto existente (mantém referência)
          result.push(existing);
        } else {
          // Data mudou — mantém posição local, exceto quando o modo fordismo recalcula a esteira.
          result.push(layoutChanged ? newNode : { ...newNode, position: existing.position });
          hasChanges = true;
        }
      }

      // Se nada mudou, retorna o mesmo array pra não disparar re-render do React Flow
      return hasChanges ? result : currentRfNodes;
    });
  }, [reactFlowNodes]);

  useEffect(() => {
    setRfEdges((current) => {
      // Compara comprimento E identidade dos edges antes de substituir
      if (current.length !== reactFlowEdges.length) return reactFlowEdges;
      // Se algum edge mudou de identidade, substitui
      const sameIds = current.every((e, i) => e.id === reactFlowEdges[i]?.id);
      if (!sameIds) return reactFlowEdges;
      // IDs iguais — só substitui se conexão, rótulo ou aparência mudaram de fato
      const changed = current.some((e, i) => {
        const ne = reactFlowEdges[i];
        return e.source !== ne.source
          || e.target !== ne.target
          || e.sourceHandle !== ne.sourceHandle
          || e.targetHandle !== ne.targetHandle
          || e.data !== ne.data
          || e.label !== ne.label
          || e.animated !== ne.animated
          || (e.style as React.CSSProperties | undefined)?.stroke !== (ne.style as React.CSSProperties | undefined)?.stroke
          || (e.style as React.CSSProperties | undefined)?.strokeWidth !== (ne.style as React.CSSProperties | undefined)?.strokeWidth
          || (e.markerEnd as { color?: string } | undefined)?.color !== (ne.markerEnd as { color?: string } | undefined)?.color;
      });
      return changed ? reactFlowEdges : current;
    });
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
    let shouldFlushPositions = false;
    for (const c of changes) {
      if (c.type === "remove") {
        positionUpdateQueueRef.current.delete(c.id);
        draggingNodesRef.current.delete(c.id);
        void handleDeleteNodeRef.current?.(c.id);
        continue;
      }
      if (c.type === "position") {
        if (c.dragging === true) {
          draggingNodesRef.current.add(c.id);
        } else if (c.dragging === false && c.position) {
          draggingNodesRef.current.delete(c.id);
            const nextPosition = { x: c.position.x, y: c.position.y };
            setDbNodesImmediate((prev) => prev.map((node) => (
              node.id === c.id ? { ...node, pos_x: nextPosition.x, pos_y: nextPosition.y } : node
            )));
          // Enqueue instead of firing DB call immediately
            positionUpdateQueueRef.current.set(c.id, nextPosition);
          if (positionFlushTimerRef.current) window.clearTimeout(positionFlushTimerRef.current);
            shouldFlushPositions = true;
        }
      }
    }
      if (shouldFlushPositions) flushPositionUpdates();
  }, [flushPositionUpdates, setDbNodesImmediate]);

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    setRfEdges((eds) => applyEdgeChanges(changes, eds));
    for (const c of changes) {
      if (c.type === "remove") {
        // Update otimista — remove do state imediatamente + deleta em background
        setDbEdges((prev) => prev.filter((e) => e.id !== c.id));
        supabase.from("canvas_edges").delete().eq("id", c.id).then(({ error }) => {
          if (error) {
            toast({ title: "Erro ao remover conexão", description: error.message, variant: "destructive" });
            // Se falhou, recarrega só as edges (não tudo)
            supabase.from("canvas_edges").select("*").eq("workspace_id", workspaceId).then(({ data }) => {
              if (data) setDbEdges(data as CanvasEdgeRecord[]);
            });
          }
        });
      }
    }
  }, [workspaceId]);

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

    const optimisticEdge: CanvasEdgeRecord = {
      id: `temp-${crypto.randomUUID()}`,
      workspace_id: workspaceId,
      source_node_id: conn.source,
      target_node_id: conn.target,
      source_handle: conn.sourceHandle ?? null,
      target_handle: conn.targetHandle ?? null,
      edge_type: "ops",
      label: validation.label,
    };
    setDbEdgesImmediate((prev) => [...prev, optimisticEdge]);

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
      setDbEdgesImmediate((prev) => prev.filter((e) => e.id !== optimisticEdge.id));
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setDbEdgesImmediate((prev) => prev.map((e) => e.id === optimisticEdge.id ? data as CanvasEdgeRecord : e));
    }

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
  }, [workspaceId, onTimelineRefresh, setDbEdgesImmediate]);

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

    const previousEdge = dbEdgesRef.current.find((e) => e.id === oldEdge.id) ?? null;
    setDbEdgesImmediate((prev) => prev.map((e) =>
      e.id === oldEdge.id
        ? { ...e, source_node_id: newConn.source!, target_node_id: newConn.target!, source_handle: newConn.sourceHandle ?? null, target_handle: newConn.targetHandle ?? null }
        : e
    ));

    // Persistência em background — visual já mudou no canvas
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
      if (previousEdge) setDbEdgesImmediate((prev) => prev.map((e) => e.id === oldEdge.id ? previousEdge : e));
      toast({ title: "Erro ao reconectar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Conexão atualizada", description: `${sourceNode.title} → ${targetNode.title}` });
  }, [setDbEdgesImmediate]);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    const found = dbNodesRef.current.find((n) => n.id === node.id);
    if (!found) return;
    if (found.node_type === "client") return; // client groups don't open drawer
    // Pasta de milestone → abre a esteira do milestone (modo fordismo)
    const kind = String((found.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
    if (kind === "milestone_group") {
      setSelectedMilestoneId((current) => current === found.id ? null : found.id);
      return;
    }
    if (kind === "project_group") {
      if (selectedMilestoneId) {
        setSelectedMilestoneId(null);
        return;
      }
      // Abre o primeiro milestone do projeto, se houver
      const projectData = (found.data as Record<string, unknown> | null) ?? {};
      const first = dbNodesRef.current.find((m) => {
        const d = (m.data as Record<string, unknown> | null) ?? {};
        return String(d.kind ?? "").toLowerCase() === "milestone_group"
          && d.portal_project_id === projectData.portal_project_id;
      });
      if (first) setSelectedMilestoneId(first.id);
      return;
    }
    if (nodeKindOf(found) === "ai_orb") {
      setAiOrbConfigNode(found);
      return;
    }
    // ChatNode handles interactions inline — não abre drawer
    if (nodeKindOf(found) === "chat_node") return;
    // Modo híbrido: ao abrir um node-tarefa que está em "draft" e veio do portal,
    // promove automaticamente para "active" (em andamento) — a menos que o
    // operador tenha travado o auto-status nesse node (data.lock_status = true).
    {
      const data = (found.data as Record<string, unknown> | null) ?? {};
      const fromPortal = !!data.from_portal || !!data.portal_task_id;
      const lockStatus = !!data.lock_status;
      const status = (found.status ?? "").toLowerCase();
      if (fromPortal && !lockStatus && (status === "draft" || status === "todo" || status === "backlog")) {
        void supabase.from("canvas_nodes").update({
          status: "active",
          data: { ...data, touched_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        }).eq("id", found.id);
        // Atualiza otimisticamente para o drawer abrir já com status novo
        found.status = "active";
      }
    }
    setSelectedNode(found);
  }, [selectedMilestoneId]);

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
      syncNodeCreated({ workspaceId, clientId, nodeId: newRow.id, nodeTitle: newRow.title, nodeType: newRow.node_type });

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

  const generateFromAiOrb = useCallback(async (options: { agentId: AgentId; customPrompt: string; targetNodes: number; model?: string } | boolean = {} as any) => {
    if (!aiOrbConfigNode) return;

    // Compat: se vier boolean (chamada antiga), converte pra deterministic
    const opts = typeof options === "boolean"
      ? { agentId: "strategist" as AgentId, customPrompt: "", targetNodes: 10, deterministic: options }
      : { agentId: (options.agentId ?? "strategist") as AgentId, customPrompt: options.customPrompt ?? "", targetNodes: options.targetNodes ?? 10, model: options.model, deterministic: false };

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
        customPrompt: opts.customPrompt || orb.systemPrompt,
        focusAreas: orb.focusAreas,
        deterministic: opts.deterministic,
        agentId: opts.agentId,
        targetNodes: opts.targetNodes,
        model: opts.model,
      });
      const orbX = Number(aiOrbConfigNode.pos_x ?? OPS_FLOW_X.engine);
      const orbY = Number(aiOrbConfigNode.pos_y ?? CONTENT_TOP + 520);
      const parent = aiOrbConfigNode.parent_node_id ?? ensureActiveClient();
      if (!parent) return;

      const createdByRef: Record<string, CanvasNodeRow> = {};
      const createdNodes: CanvasNodeRow[] = [];
      for (const [index, spec] of result.nodes.entries()) {
        const pos = generatedNodePosition(orbX, orbY, index, result.nodes.length);
        // Merge: data específica retornada pela IA + metadados padrão
        const specData = (spec as any).data && typeof (spec as any).data === "object" ? (spec as any).data : {};
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
          data: {
            kind: spec.kind,
            stage: spec.stage,
            checklist: getChecklistTemplate(spec.kind),
            generatedByAiOrb: aiOrbConfigNode.id,
            rationale: result.rationale,
            agent_id: opts.agentId,
            ...specData,
          },
        }).select().single();
        if (error || !data) throw error ?? new Error("Falha ao criar node gerado pelo Orb.");
        createdByRef[spec.ref] = data as CanvasNodeRow;
        createdNodes.push(data as CanvasNodeRow);
        const row = data as CanvasNodeRow;
        syncNodeCreated({ workspaceId, clientId, nodeId: row.id, nodeTitle: row.title, nodeType: row.node_type });
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

      const baseData = nextOrbDataAfterGeneration(orb, result, createdNodes.map((node) => node.id));
      const finalData = {
        ...baseData,
        // v3: tracking rico
        last_rationale: (result as any).rationale,
        last_insights: (result as any).insights,
        last_model: (result as any).model_used,
        last_cost_usd: (result as any).cost_usd,
        last_nodes_generated: createdNodes.length,
        last_agent_id: opts.agentId,
      };
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
        syncNodeCreated({ workspaceId, clientId, nodeId: row.id, nodeTitle: row.title, nodeType: row.node_type });
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

      // Valida que o clientNodeId realmente existe na DB. Se for stale (apontando
      // para um node removido ou nunca persistido), força recriar pra evitar FK
      // violation no parent_node_id ao inserir os nodes filhos.
      if (clientNodeId) {
        const { data: exists } = await supabase
          .from("canvas_nodes")
          .select("id")
          .eq("id", clientNodeId)
          .maybeSingle();
        if (!exists) {
          clientNodeId = null;
        }
      }

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
          // FK violation no parent_node_id é fatal — aborta o lote inteiro
          // pra não mostrar "Esteira criada (0 nodes)" sem feedback útil.
          const isFkError = /foreign key/i.test(error.message)
            || /violates foreign key constraint/i.test(error.message);
          if (isFkError && newRows.length === 0) {
            toast({
              title: "Erro ao gerar esteira",
              description: "Pasta do cliente inválida ou removida. Recarregue a página e tente de novo.",
              variant: "destructive",
            });
            return;
          }
          toast({ title: `Falha ao criar "${tn.title}"`, description: error.message, variant: "destructive" });
          continue;
        }
        if (row) {
          refToId[tn.ref] = (row as CanvasNodeRow).id;
          newRows.push(row as CanvasNodeRow);
          const r = row as CanvasNodeRow;
          syncNodeCreated({ workspaceId, clientId, nodeId: r.id, nodeTitle: r.title, nodeType: r.node_type });
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
        if (dbNode?.node_type !== "client") {
          syncNodeCreated({ workspaceId, clientId, nodeId: dbNode.id, nodeTitle: dbNode.title, nodeType: dbNode.node_type });
        }
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
        const r = data as CanvasNodeRow;
        syncNodeCreated({ workspaceId, clientId, nodeId: r.id, nodeTitle: r.title, nodeType: r.node_type });
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
    const targetNodes = activeClientId ? scopedProjectNodes : projectNodes;
    if (targetNodes.length === 0) return;
    setBusyAction("layout");
    const portalProjects = targetNodes.filter((node) => String((node.data as Record<string, unknown> | null)?.kind ?? "") === "project_group");
    if (portalProjects.length > 0) {
      const portalMilestones = targetNodes.filter((node) => String((node.data as Record<string, unknown> | null)?.kind ?? "") === "milestone_group");
      const root = clientGroups.find((group) => group.id === activeClientId) ?? clientGroups[0];
      const baseX = Number(root?.pos_x ?? 60);
      const baseY = Number(root?.pos_y ?? 0);
      const updates: Array<{ id: string; pos_x: number; pos_y: number; parent_node_id?: string | null }> = [];
      const portalOrder = (node: CanvasNodeRow) => {
        const value = Number((node.data as Record<string, unknown> | null)?.portal_position ?? 9999);
        return Number.isFinite(value) ? value : 9999;
      };
      const isTask = (node: CanvasNodeRow) => {
        const type = (node.node_type ?? "").toLowerCase();
        const kind = String((node.data as Record<string, unknown> | null)?.kind ?? "").toLowerCase();
        return !["client", "ai_orb", "chat_node"].includes(type) && !["project_group", "milestone_group", "chat_node"].includes(kind);
      };
      portalProjects.sort((a, b) => a.title.localeCompare(b.title)).forEach((project, projectIndex) => {
        const portalProjectId = (project.data as Record<string, unknown> | null)?.portal_project_id;
        const projectX = baseX + projectIndex * 1760;
        updates.push({ id: project.id, pos_x: projectX, pos_y: baseY + 190, parent_node_id: root?.id ?? project.parent_node_id ?? null });
        portalMilestones
          .filter((milestone) => (milestone.data as Record<string, unknown> | null)?.portal_project_id === portalProjectId)
          .sort((a, b) => portalOrder(a) - portalOrder(b) || a.title.localeCompare(b.title))
          .forEach((milestone, milestoneIndex) => {
            const milestoneX = projectX + 32 + milestoneIndex * 360;
            updates.push({ id: milestone.id, pos_x: milestoneX, pos_y: baseY + 350, parent_node_id: project.id });
            const milestoneData = (milestone.data as Record<string, unknown> | null) ?? {};
            targetNodes.filter((task) => {
              if (!isTask(task)) return false;
              const taskData = (task.data as Record<string, unknown> | null) ?? {};
              return task.parent_node_id === milestone.id
                || (taskData.portal_project_id === portalProjectId && (
                  (milestoneData.portal_milestone_id && taskData.portal_milestone_id === milestoneData.portal_milestone_id)
                  || (milestoneData.milestone_key && taskData.milestone_key === milestoneData.milestone_key)
                ));
            }).sort((a, b) => portalOrder(a) - portalOrder(b) || a.title.localeCompare(b.title)).forEach((task, taskIndex) => {
              updates.push({ id: task.id, pos_x: milestoneX + 32, pos_y: baseY + 480 + taskIndex * 136, parent_node_id: milestone.id });
            });
          });
      });
      await Promise.all(updates.map((p) => supabase.from("canvas_nodes").update({ pos_x: p.pos_x, pos_y: p.pos_y, parent_node_id: p.parent_node_id, updated_at: new Date().toISOString() }).eq("id", p.id)));
      await fetchData();
      setBusyAction(null);
      return;
    }
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
    const previousNodes = dbNodesRef.current;
    const previousEdges = dbEdgesRef.current;
    const node = previousNodes.find((n) => n.id === id);
    if (!node) return;

    setSelectedNode((current) => (current?.id === id ? null : current));
    setAiOrbConfigNode((current) => (current?.id === id ? null : current));
    setDbNodesImmediate((prev) => prev.filter((n) => n.id !== id && n.parent_node_id !== id));
    setDbEdgesImmediate((prev) => prev.filter((e) => e.source_node_id !== id && e.target_node_id !== id));

    if (node?.node_type === "client") {
      await supabase.from("canvas_nodes").update({ parent_node_id: null }).eq("parent_node_id", id);
    }
    await supabase.from("canvas_edges").delete().or(`source_node_id.eq.${id},target_node_id.eq.${id}`).eq("workspace_id", workspaceId);
    const { error } = await supabase.from("canvas_nodes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      setDbNodesImmediate(previousNodes);
      setDbEdgesImmediate(previousEdges);
    } else {
      toast({ title: "Node removido" });
      syncNodeDeleted({ workspaceId, clientId: node?.client_id ?? null, nodeId: id });
    }
  };

  // Sincroniza ref para que stableOnDeleteNode use a versão mais recente sem invalidar memos
  useEffect(() => { handleDeleteNodeRef.current = handleDeleteNode; });

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
              projectType={clientProjectType}
              parentNodeId={activeClientId}
              currentNodeCount={scopedProjectNodes.length}
              onApplied={fetchData}
            />
          )}
          <div className="h-5 w-px bg-border mx-1" />
          <CanvasProjectLinker
            workspaceId={workspaceId}
            clientId={clientId}
            onLinked={async () => {
              try {
                setBusyAction("portal-sync");
                const result = await syncPortalNow();
                toast({
                  title: "Projeto vinculado e sincronizado",
                  description: `Ops→Portal ${result.sent}/${result.total} · Portal→Ops ${result.pulled}`,
                });
              } catch (err) {
                toast({
                  title: "Vinculado, mas sync falhou",
                  description: err instanceof Error ? err.message : "Tente o botão Sync",
                  variant: "destructive",
                });
              } finally {
                setBusyAction(null);
              }
            }}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={async () => {
              try {
                setBusyAction("portal-sync");
                const result = await syncPortalNow();
                toast({
                  title: result.failed || result.pullFailed ? "Sync com portal parcial" : "Sync com portal",
                  description: `Ops→Portal ${result.sent}/${result.total} · Portal→Ops ${result.pulled}${result.failed || result.pullFailed ? " · confira vínculos/secrets" : ""}`,
                  variant: result.sent === 0 && result.pulled === 0 ? "destructive" : undefined,
                });
              } catch (error) {
                toast({ title: "Sync com portal falhou", description: error instanceof Error ? error.message : "Erro inesperado", variant: "destructive" });
              } finally {
                setBusyAction(null);
              }
            }}
            disabled={busyAction === "portal-sync"}
            title="Sincronizar nodes existentes com o portal e puxar tasks do kanban"
          >
            {busyAction === "portal-sync" ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
            Sync portal
          </Button>
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

      {/* Milestone tabs (fordismo): substituem as pastinhas dentro do canvas. */}
      {!focusMode && (
        <CanvasMilestoneTabs
          nodes={scopedProjectNodes}
          selectedMilestoneId={selectedMilestoneId}
          onSelectMilestone={(id) => setSelectedMilestoneId(id)}
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
            clientId && clientName ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center relative">
              <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
              <div>
                <p className="text-base font-semibold text-foreground mb-1">Preparando esteira de {clientName}...</p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Criando a pasta do cliente automaticamente.
                </p>
              </div>
            </div>
            ) : (
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
            )
          ) : scopedProjectNodes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center relative">
              <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground mb-1">
                  Esteira de {clientGroups.find((c) => c.id === activeClientId)?.title ?? "cliente"} pronta pra começar
                </p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Gere uma esteira com IA baseada no contexto do cliente, aplique um playbook por tipo de projeto,
                  ou adicione nodes manualmente.
                </p>
              </div>
              <div className="flex gap-2 mt-2 flex-wrap justify-center">
                <Button size="sm" onClick={() => setGenerateDialogOpen(true)} disabled={busyAction === "base"}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar esteira com IA
                </Button>
                {activeClientId && clientPlanName && (
                  <ApplyPlaybookButton
                    workspaceId={workspaceId}
                    clientId={clientId}
                    clientName={clientGroups.find((c) => c.id === activeClientId)?.title ?? clientName}
                    planName={clientPlanName}
                    projectType={clientProjectType}
                    parentNodeId={activeClientId}
                    currentNodeCount={scopedProjectNodes.length}
                    onApplied={fetchData}
                  />
                )}
                <Button size="sm" variant="outline" onClick={() => setAdvancedOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar manualmente
                </Button>
              </div>
            </div>
          ) : (
            <CanvasViewport
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onConnectStart={onConnectStart}
              onConnectEnd={onConnectEnd}
              onEdgeContextMenu={onEdgeContextMenu}
              onEdgeDoubleClick={onEdgeDoubleClick}
              isValidConnection={isValidConnection}
              onNodeClick={onNodeClick}
              onInit={handleRfInit}
              onMoveEnd={handleMoveEnd}
              onReconnect={handleReconnectEdge}
              panOnDrag={interactionConfig.panOnDrag}
              selectionOnDrag={interactionConfig.selectionOnDrag}
              gridVisible={gridVisible}
              lockedNodes={lockedNodes}
            />
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
const CanvasInspectorAdapter = memo(function CanvasInspectorAdapter(props: React.ComponentProps<typeof CanvasInspector>) {
  return <CanvasInspector {...props} />;
});

export default function CanvasStudio(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasStudioInner {...props} />
    </ReactFlowProvider>
  );
}

