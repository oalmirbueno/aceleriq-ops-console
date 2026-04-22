import { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from "react";
import {
  ReactFlow, ReactFlowProvider, Background,
  applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
  type ReactFlowInstance, type Viewport, SelectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Sparkles, LayoutGrid, Maximize2, Minimize2, Loader2, Building2, Search, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ProjectNodeCard, { type ProjectNodeData } from "./ProjectNodeCard";
import CanvasGroupNode from "./CanvasGroupNode";
import ProjectNodeDrawer from "./ProjectNodeDrawer";
import CanvasEsteiraPalette from "./CanvasEsteiraPalette";
import CanvasInspector from "./CanvasInspector";
import CanvasClientPicker from "./CanvasClientPicker";
import CanvasClientTabs, { type CanvasClientTab } from "./CanvasClientTabs";
import GenerateEsteiraDialog from "./GenerateEsteiraDialog";
import type { EsteiraTemplate } from "./esteiraTemplates";
import { readCanvasOperationalMeta, type ApprovalStatus, type CanvasOperationalMeta } from "./canvasOperationalMeta";
import {
  ACELERA_STAGES, PROJECT_TYPES, STAGE_COLUMN_WIDTH,
  getProjectTypeMeta, getStageMeta, stageColumnX, getChecklistTemplate,
  projectKindToDbNodeType, getNodeFlowRole, type ProjectNodeKind, type AceleraStageKey,
} from "./canvasProjectTypes";
import { mapLegacyStatus, premiumStatusToDb } from "./canvasEsteiraStatus";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

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

type ConnectionValidation = { allowed: boolean; label: string | null; reason: string | null };
const allowConnection = (label: string): ConnectionValidation => ({ allowed: true, label, reason: null });
const blockConnection = (reason: string): ConnectionValidation => ({ allowed: false, label: null, reason });

function nodeLabel(row: CanvasNodeRow) {
  const kind = nodeKindOf(row);
  return getProjectTypeMeta(kind)?.shortLabel ?? row.title;
}

function validateCanvasConnection(source: CanvasNodeRow, target: CanvasNodeRow) {
  const sourceKind = nodeKindOf(source);
  const targetKind = nodeKindOf(target);
  const sourceLabel = nodeLabel(source);
  const targetLabel = nodeLabel(target);

  if (source.parent_node_id && target.parent_node_id && source.parent_node_id !== target.parent_node_id) {
    return blockConnection("Conecte nodes dentro da mesma pasta de cliente para manter rastreabilidade e evitar fluxo cruzado.");
  }

  if (INPUT_KINDS.has(sourceKind) && ENGINE_KINDS.has(targetKind)) return allowConnection("input");
  if (INSTRUCTION_KINDS.has(sourceKind) && ENGINE_KINDS.has(targetKind)) return allowConnection("regra");
  if (ENGINE_KINDS.has(sourceKind) && RESULT_KINDS.has(targetKind)) return allowConnection("gera");
  if (RESULT_KINDS.has(sourceKind) && DECISION_KINDS.has(targetKind)) return allowConnection("aprovar");
  if ((RESULT_KINDS.has(sourceKind) || DECISION_KINDS.has(sourceKind)) && PROOF_KINDS.has(targetKind)) return allowConnection("prova");
  if (sourceKind === "metrica" && targetKind === "before_after") return allowConnection("compara");
  if (sourceKind === "before_after" && targetKind === "case") return allowConnection("vira case");
  if (DECISION_KINDS.has(sourceKind) && (INSTRUCTION_KINDS.has(targetKind) || ENGINE_KINDS.has(targetKind) || RESULT_KINDS.has(targetKind))) return allowConnection("próxima");

  if (INPUT_KINDS.has(sourceKind) && INSTRUCTION_KINDS.has(targetKind)) return allowConnection("base");
  if (INSTRUCTION_KINDS.has(sourceKind) && RESULT_KINDS.has(targetKind)) return allowConnection("guia");
  if (INPUT_KINDS.has(sourceKind) && RESULT_KINDS.has(targetKind)) return allowConnection("referência");
  if (ENGINE_KINDS.has(sourceKind) && DECISION_KINDS.has(targetKind)) return allowConnection("decide");
  if (RESULT_KINDS.has(sourceKind) && INSTRUCTION_KINDS.has(targetKind)) return allowConnection("revisar");

  return blockConnection(`${sourceLabel} não deve alimentar ${targetLabel} diretamente. Fluxo esperado: Contexto/Instrução → Engine → Resultado → Decisão → Próxima ação.`);
}

function edgeIntent(edge: CanvasEdgeRecord, nodesById: Map<string, CanvasNodeRow>) {
  const sourceKind = edge.source_node_id ? nodeKindOf(nodesById.get(edge.source_node_id)!) : "";
  const targetKind = edge.target_node_id ? nodeKindOf(nodesById.get(edge.target_node_id)!) : "";
  if (PROOF_KINDS.has(targetKind) || PROOF_KINDS.has(sourceKind)) return { label: edge.label ?? "prova", stroke: "hsl(var(--node-proof))", animated: false };
  if (targetKind === "engine") return { label: edge.label ?? "input", stroke: "hsl(var(--node-tech))", animated: true };
  if (sourceKind === "engine") return { label: edge.label ?? "gera", stroke: "hsl(var(--node-build))", animated: true };
  if (targetKind === "decisao" || sourceKind === "decisao") return { label: edge.label ?? "aprova", stroke: "hsl(var(--node-growth))", animated: false };
  return { label: edge.label ?? undefined, stroke: "hsl(var(--primary))", animated: true };
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

  // Active client folder (null = "Todos")
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  useEffect(() => {
    setStatusFilter(initialStatusFilter ?? null);
  }, [initialStatusFilter]);

  // Quick add menu (advanced)
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Generate esteira (per-plan template) dialog
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: nodesData }, { data: edgesData }] = await Promise.all([
      supabase.from("canvas_nodes").select("*").eq("workspace_id", workspaceId).order("created_at"),
      supabase.from("canvas_edges").select("*").eq("workspace_id", workspaceId),
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
  const restoredScopesRef = useRef<Set<string>>(new Set());
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

      return {
        id: n.id,
        type: "projectCard",
        position: { x: Number(n.pos_x ?? 0), y: Number(n.pos_y ?? CONTENT_TOP) },
        data: {
          title: n.title,
          kind: nodeKindOf(n),
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
          onQuickConnect: (dir: "right" | "bottom") => quickConnectFromNode(n.id, dir),
        } satisfies ProjectNodeData,
      };
    });
  }, [visibleCanvasNodes, groupMeta, quickConnectFromNode]);

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
          label: intent.label,
          animated: intent.animated,
          style: { stroke: intent.stroke, strokeWidth: 2 },
          labelStyle: { fill: "hsl(var(--muted-foreground))", fontSize: 10, fontWeight: 600 },
          labelBgStyle: { fill: "hsl(var(--card))", fillOpacity: 0.92 },
        };
      });
  }, [dbEdges, visibleCanvasNodes]);

  /* DB → ReactFlow */
  useEffect(() => {
    setRfNodes(reactFlowNodes);
    setRfEdges(reactFlowEdges);
  }, [reactFlowNodes, reactFlowEdges]);

  /* ReactFlow handlers */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
    for (const c of changes) {
      if (c.type === "position" && c.dragging === false && c.position) {
        supabase
          .from("canvas_nodes")
          .update({ pos_x: c.position.x, pos_y: c.position.y, updated_at: new Date().toISOString() })
          .eq("id", c.id)
          .then(({ error }) => { if (error) console.error("position persist failed", error); });
      }
    }
  }, []);

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
    const sourceNode = dbNodes.find((n) => n.id === conn.source);
    const targetNode = dbNodes.find((n) => n.id === conn.target);
    if (!sourceNode || !targetNode) return;

    const validation = validateCanvasConnection(sourceNode, targetNode);
    if (!validation.allowed) {
      toast({
        title: "Ligação incompatível",
        description: validation.reason ?? "Essa conexão não segue o fluxo operacional do canvas.",
        variant: "destructive",
      });
      return;
    }

    const alreadyExists = dbEdges.some((edge) => edge.source_node_id === conn.source && edge.target_node_id === conn.target);
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
    await onTimelineRefresh?.();
  }, [workspaceId, onTimelineRefresh, dbNodes, dbEdges]);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    const found = dbNodes.find((n) => n.id === node.id);
    if (!found) return;
    if (found.node_type === "client") return; // client groups don't open drawer
    setSelectedNode(found);
  }, [dbNodes]);

  /* Pick parent: prioriza cliente da aba ativa */
  const pickParentGroup = (): string | null => {
    if (activeClientId) return activeClientId;
    if (clientGroups.length === 1) return clientGroups[0].id;
    return null;
  };

  /* Quando o usuário tenta criar um node sem cliente ativo e existem várias pastas,
   * abre o seletor de cliente para evitar nodes "órfãos". */
  const ensureActiveClient = (): boolean => {
    if (clientGroups.length === 0) {
      toast({
        title: "Adicione um cliente primeiro",
        description: "Cada esteira pertence a uma pasta de cliente.",
      });
      setClientPickerOpen(true);
      return false;
    }
    if (!activeClientId) {
      // Há clientes mas nenhuma aba selecionada — selecione automaticamente
      setActiveClientId(clientGroups[0].id);
    }
    return true;
  };

  /* Add a project node at chosen kind+stage */
  const addProjectNode = useCallback(async (
    kind: ProjectNodeKind,
    stage: AceleraStageKey,
    opts: { sourceId?: string | null; dir?: "right" | "bottom" | null } = {},
  ) => {
    // Must have a client folder selected
    if (!ensureActiveClient()) return;
    const meta = getProjectTypeMeta(kind);
    if (!meta) return;
    const dbType = projectKindToDbNodeType(kind);

    // Compute position: based on source if connecting, else stack inside stage column
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
      // Stack new node below existing nodes in same stage
      const sameStage = projectNodes.filter((n) => nodeStageOf(n) === stage);
      const maxY = sameStage.length === 0 ? CONTENT_TOP + 16 : Math.max(...sameStage.map((n) => Number(n.pos_y ?? CONTENT_TOP)));
      pos_y = sameStage.length === 0 ? CONTENT_TOP + 16 : maxY + NODE_VERTICAL;
    }

    const parent = pickParentGroup();
    const initialTitle = `${meta.titleTemplate}`;

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
            edge_type: "next",
          })
          .select()
          .single();
        if (!eErr && edgeRow) setDbEdges((prev) => [...prev, edgeRow as CanvasEdgeRecord]);
      }

      setSelectedNode(newRow);
    }
  }, [dbNodes, projectNodes, clientGroups, workspaceId, clientId]);

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

  const applyOpsFlowBlueprint = useCallback(async () => {
    if (!ensureActiveClient()) return;
    const parent = pickParentGroup();
    if (!parent) return;
    setBusyAction("ops-flow");
    try {
      const blueprint: Array<{ ref: string; kind: ProjectNodeKind; title: string; stage: AceleraStageKey; description: string }> = [
        { ref: "context", kind: "contexto_ops", title: "Contexto central", stage: "entrada", description: "Briefing, assets, acessos, links, oferta e regras que alimentam a operação." },
        { ref: "instruction", kind: "instrucao", title: "Instruções e critérios", stage: "planejamento", description: "SOPs, prompts, regras de execução e critérios de aceite." },
        { ref: "engine", kind: "engine", title: "Engine: Planejamento Ops", stage: "planejamento", description: "Hub que consolida entradas e transforma contexto em plano, tarefas e entregáveis." },
        { ref: "agent", kind: "agente", title: "Agente: Orion Ops", stage: "producao", description: "Assistente operacional conectado ao contexto, instruções e outputs." },
        { ref: "result", kind: "resultado", title: "Resultado: Plano operacional", stage: "producao", description: "Output versionado com owner, prazo, evidência e próximos passos." },
        { ref: "decision", kind: "decisao", title: "Decisão: Aprovação / Revisão", stage: "ativacao", description: "Roteia aprovado para próxima etapa ou retorna para revisão." },
      ];
      const created: Record<string, string> = {};
      const rows: CanvasNodeRow[] = [];
      for (const [i, item] of blueprint.entries()) {
        const { data, error } = await supabase.from("canvas_nodes").insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_type: projectKindToDbNodeType(item.kind),
          title: item.title,
          status: item.kind === "engine" ? "active" : "draft",
          description: item.description,
          pos_x: stageColumnX(item.stage) + NODE_X_OFFSET,
          pos_y: CONTENT_TOP + 16 + (i % 2) * NODE_VERTICAL,
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
      ].map(([from, to, label]) => ({ workspace_id: workspaceId, source_node_id: created[from], target_node_id: created[to], edge_type: "ops", label }));
      await supabase.from("canvas_edges").insert(edges);
      toast({ title: "Fluxo Ops criado", description: `${rows.length} nodes · ${edges.length} conexões inteligentes` });
      await fetchData();
    } catch (err) {
      toast({ title: "Erro ao criar fluxo", description: err instanceof Error ? err.message : "Tente novamente.", variant: "destructive" });
    } finally {
      setBusyAction(null);
    }
  }, [workspaceId, clientId, fetchData, activeClientId, clientGroups]);


  /* Auto-layout: por etapa, empilha vertical (apenas nodes do cliente ativo) */
  const handleAutoLayout = async () => {
    const targetNodes = activeClientId
      ? projectNodes.filter((n) => n.parent_node_id === activeClientId)
      : projectNodes;
    if (targetNodes.length === 0) return;
    setBusyAction("layout");
    const byStage: Record<string, CanvasNodeRow[]> = {};
    const incoming = new Map<string, number>();
    const outgoing = new Map<string, number>();
    dbEdges.forEach((e) => {
      outgoing.set(e.source_node_id, (outgoing.get(e.source_node_id) ?? 0) + 1);
      incoming.set(e.target_node_id, (incoming.get(e.target_node_id) ?? 0) + 1);
    });
    const flowRank: Record<string, number> = { contexto_ops: 0, briefing: 1, documento: 2, instrucao: 3, engine: 4, agente: 5, resultado: 6, decisao: 7 };
    targetNodes.forEach((n) => {
      const s = nodeStageOf(n);
      (byStage[s] ??= []).push(n);
    });
    const updates: Array<{ id: string; pos_x: number; pos_y: number }> = [];
    Object.entries(byStage).forEach(([stage, list]) => {
      list
        .slice()
        .sort((a, b) => {
          const ar = flowRank[nodeKindOf(a)] ?? 20;
          const br = flowRank[nodeKindOf(b)] ?? 20;
          if (ar !== br) return ar - br;
          return (incoming.get(a.id) ?? 0) - (incoming.get(b.id) ?? 0) || (outgoing.get(b.id) ?? 0) - (outgoing.get(a.id) ?? 0);
        })
        .forEach((n, i) => {
        updates.push({
          id: n.id,
          pos_x: stageColumnX(stage as AceleraStageKey) + NODE_X_OFFSET,
          pos_y: CONTENT_TOP + 16 + i * NODE_VERTICAL,
        });
      });
    });
    await Promise.all(
      updates.map((p) =>
        supabase.from("canvas_nodes").update({ pos_x: p.pos_x, pos_y: p.pos_y, updated_at: new Date().toISOString() }).eq("id", p.id),
      ),
    );
    toast({ title: "Esteira reorganizada" });
    await fetchData();
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

  const hasFilters = !!search || !!typeFilter || !!statusFilter || approvalFilter !== "all" || blockedFilter !== "all" || !!ownerFilter;
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
      <div className={`flex flex-col bg-background ${fullscreen ? "h-full" : "h-[80vh] rounded-lg border border-border/70 overflow-hidden"}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/70 bg-background/95">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
          <p className="text-sm font-semibold text-foreground truncate">Execução operacional</p>
          <span className="text-[11px] text-muted-foreground hidden sm:inline truncate">
            {activeClientId
              ? `${clientGroups.find((c) => c.id === activeClientId)?.title ?? "Cliente"} · ${visibleCanvasNodes.length}/${scopedProjectNodes.length} passos · ${summary.proof} provas`
              : `Todos · ${summary.clients} cliente${summary.clients === 1 ? "" : "s"} · ${summary.projects} nodes`}
          </span>
          {summary.pending > 0 && <span className="hidden lg:inline-flex rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">{summary.pending} aprovações pendentes</span>}
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
          <Button size="sm" variant="outline" className="h-8" onClick={() => setGenerateDialogOpen(true)} disabled={busyAction === "base"}>
            {busyAction === "base" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Gerar esteira</span>
          </Button>
          <div className="h-5 w-px bg-border mx-1" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onToggleFullscreen} aria-label="Alternar tela cheia">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Client tabs (folders) — sempre visíveis */}
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

      {/* Body: palette + canvas + inspector */}
      <div className="flex flex-1 min-h-0">
        <CanvasEsteiraPalette
          collapsed={paletteCollapsed}
          onToggleCollapse={() => setPaletteCollapsed((v) => !v)}
          onAdd={(kind, stage) => addProjectNode(kind, stage)}
          onAddClient={() => setClientPickerOpen(true)}
          onOpenAdvanced={() => setAdvancedOpen(true)}
        />

        <div className="flex-1 min-w-0 relative">
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
              onNodeClick={onNodeClick}
              nodeTypes={nodeTypes}
              onInit={handleRfInit}
              onMoveEnd={handleMoveEnd}
              fitViewOptions={{ padding: 0.4 }}
              minZoom={0.1}
              maxZoom={2}
              panOnDrag={[0, 1, 2]}
              panOnScroll={false}
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              selectionOnDrag={false}
              selectionKeyCode={["Shift"]}
              multiSelectionKeyCode={["Meta", "Control"]}
              selectionMode={SelectionMode.Partial}
              proOptions={{ hideAttribution: true }}
              className="bg-background canvas-flow acelera-ops-flow"
              defaultEdgeOptions={{ type: "smoothstep", animated: true }}
              onPaneContextMenu={(event) => event.preventDefault()}
            >
              <Background gap={32} size={1} className="opacity-20" />
            </ReactFlow>
          )}
        </div>

        {/* Right inspector — adapted: filters + list */}
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
          onToggleCollapse={() => setInspectorCollapsed((v) => !v)}
        />
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

      <ProjectNodeDrawer
        node={selectedNode}
        open={!!selectedNode}
        onOpenChange={(o) => !o && setSelectedNode(null)}
        workspaceId={workspaceId}
        onUpdated={fetchData}
        onDelete={handleDeleteNode}
        availableNodes={scopedProjectNodes}
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

