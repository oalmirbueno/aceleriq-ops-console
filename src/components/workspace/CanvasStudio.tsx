import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Sparkles, LayoutGrid, Maximize2, Minimize2, Loader2, Building2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ProjectNodeCard, { type ProjectNodeData } from "./ProjectNodeCard";
import CanvasGroupNode from "./CanvasGroupNode";
import StageLanesBg from "./StageLanesBg";
import ProjectNodeDrawer from "./ProjectNodeDrawer";
import CanvasEsteiraPalette from "./CanvasEsteiraPalette";
import CanvasInspector from "./CanvasInspector";
import CanvasClientPicker from "./CanvasClientPicker";
import CanvasClientTabs, { type CanvasClientTab } from "./CanvasClientTabs";
import {
  ACELERA_STAGES, PROJECT_TYPES, STAGE_COLUMN_WIDTH, STAGE_HEADER_HEIGHT,
  getProjectTypeMeta, getStageMeta, stageColumnX, getChecklistTemplate,
  type ProjectNodeKind, type AceleraStageKey,
} from "./canvasProjectTypes";
import { mapLegacyStatus, premiumStatusToDb } from "./canvasEsteiraStatus";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";


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
}

const nodeTypes = {
  projectCard: ProjectNodeCard,
  canvasGroup: CanvasGroupNode,
};

const CLIENT_BAR_Y = 0;
const CLIENT_BAR_HEIGHT = 52;
const CLIENT_BAR_GAP = 220;
const CONTENT_TOP = CLIENT_BAR_HEIGHT + 12;
const STAGE_BAND_HEIGHT = 1800; // long enough for many nodes
const NODE_VERTICAL = 130;
const NODE_X_OFFSET = 36; // x inside column

function nodeStageOf(row: CanvasNodeRow): AceleraStageKey {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const stage = (data.stage ?? data.acelera_stage) as AceleraStageKey | undefined;
  return stage ?? "producao";
}

function nodeKindOf(row: CanvasNodeRow): string {
  const data = (row.data ?? {}) as Record<string, unknown>;
  return (data.kind as string | undefined) ?? row.node_type;
}

function CanvasStudioInner({
  workspaceId, clientId, clientName,
  fullscreen, onToggleFullscreen, onTimelineRefresh,
}: Props) {
  
  const [dbNodes, setDbNodes] = useState<CanvasNodeRow[]>([]);
  const [dbEdges, setDbEdges] = useState<CanvasEdgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<CanvasNodeRow | null>(null);

  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(true);

  // Active client folder (null = "Todos")
  const [activeClientId, setActiveClientId] = useState<string | null>(null);

  // Quick add menu (advanced)
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: nodesData }, { data: edgesData }] = await Promise.all([
      supabase.from("canvas_nodes").select("*").eq("workspace_id", workspaceId).order("created_at"),
      supabase.from("canvas_edges").select("*").eq("workspace_id", workspaceId),
    ]);
    setDbNodes((nodesData ?? []) as CanvasNodeRow[]);
    setDbEdges((edgesData ?? []) as CanvasEdgeRecord[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* Derive groups (clients) and per-stage lanes */
  const clientGroups = useMemo(
    () => dbNodes.filter((n) => n.node_type === "client"),
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
    })),
    [clientGroups, projectNodes],
  );

  /* Project nodes visible based on active tab */
  const scopedProjectNodes = useMemo(() => {
    if (activeClientId === null) return projectNodes;
    return projectNodes.filter((n) => n.parent_node_id === activeClientId);
  }, [projectNodes, activeClientId]);


  /* Quick connect helper */
  const quickConnectFromNode = (sourceId: string, dir: "right" | "bottom") => {
    setQuickAddState({ open: true, sourceId, dir });
  };

  type QuickAddState = { open: boolean; sourceId: string | null; dir: "right" | "bottom" | null };
  const [quickAddState, setQuickAddState] = useState<QuickAddState>({ open: false, sourceId: null, dir: null });

  /* DB → ReactFlow */
  useEffect(() => {
    const q = search.trim().toLowerCase();

    // No more group nodes inside ReactFlow — pastas viraram abas no topo.
    // Filtra projetos pelo cliente ativo (ou todos quando activeClientId === null).
    const sourceProjects = activeClientId === null
      ? projectNodes
      : projectNodes.filter((n) => n.parent_node_id === activeClientId);

    const visibleProjects = sourceProjects.filter((n) => {
      if (typeFilter && nodeKindOf(n) !== typeFilter && n.node_type !== typeFilter) return false;
      if (statusFilter && mapLegacyStatus(n.status) !== statusFilter) return false;
      if (q && !n.title.toLowerCase().includes(q)) return false;
      return true;
    });

    const visibleIds = new Set(visibleProjects.map((n) => n.id));

    const projRfNodes: Node[] = visibleProjects.map((n): Node => ({
      id: n.id,
      type: "projectCard",
      position: { x: Number(n.pos_x ?? 0), y: Number(n.pos_y ?? CONTENT_TOP) },
      data: {
        title: n.title,
        kind: nodeKindOf(n),
        status: n.status,
        description: n.description,
        hasLinkedEntity: !!n.linked_entity_id,
        links: ((n.data as Record<string, unknown> | null)?.links as unknown[] | undefined)?.length ?? 0,
        attachments: ((n.data as Record<string, unknown> | null)?.attachments as unknown[] | undefined)?.length ?? 0,
        checklistTotal: ((n.data as Record<string, unknown> | null)?.checklist as Array<{ done?: boolean }> | undefined)?.length ?? 0,
        checklistDone: ((n.data as Record<string, unknown> | null)?.checklist as Array<{ done?: boolean }> | undefined)?.filter((c) => c.done).length ?? 0,
        onQuickConnect: (dir: "right" | "bottom") => quickConnectFromNode(n.id, dir),
      } satisfies ProjectNodeData,
    }));

    setRfNodes(projRfNodes);

    setRfEdges(
      dbEdges
        .filter((e) => visibleIds.has(e.source_node_id) && visibleIds.has(e.target_node_id))
        .map((e): Edge => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label ?? undefined,
          animated: true,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5 },
        })),
    );
  }, [projectNodes, dbEdges, search, typeFilter, statusFilter, activeClientId]);

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
    const { data, error } = await supabase
      .from("canvas_edges")
      .insert({
        workspace_id: workspaceId,
        source_node_id: conn.source,
        target_node_id: conn.target,
        edge_type: "next",
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
      return;
    }
    if (data) setDbEdges((prev) => [...prev, data as CanvasEdgeRecord]);
    await onTimelineRefresh?.();
  }, [workspaceId, onTimelineRefresh]);

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
    const dbType = (() => {
      switch (kind) {
        case "asset": return "asset";
        case "metrica": return "metric";
        case "before_after": return "before_after";
        case "case": return "case";
        case "briefing":
        case "documento":
        case "contato": return "context";
        case "checklist": return "task";
        default: return "front";
      }
    })();

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

  /* Estrutura base: cria pasta cliente + briefing + landing como exemplo de esteira */
  const handleGenerateBase = async () => {
    setBusyAction("base");
    // Use cliente da aba ativa se houver
    let clientNodeId: string | null = activeClientId
      ?? (clientGroups[0]?.id ?? null);

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
        toast({ title: "Erro ao gerar base", description: cErr.message, variant: "destructive" });
        setBusyAction(null);
        return;
      }
      clientNodeId = (clientNode as CanvasNodeRow).id;
      setDbNodes((prev) => [...prev, clientNode as CanvasNodeRow]);
      setActiveClientId(clientNodeId);
    }

    // Briefing in entrada
    const { data: bri } = await supabase.from("canvas_nodes").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      node_type: "context",
      title: "Briefing inicial",
      status: "draft",
      pos_x: stageColumnX("entrada") + NODE_X_OFFSET,
      pos_y: CONTENT_TOP + 16,
      parent_node_id: clientNodeId,
      data: { kind: "briefing", stage: "entrada" } as Record<string, unknown>,
    }).select().single();

    // Landing page in producao
    const { data: lp } = await supabase.from("canvas_nodes").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      node_type: "front",
      title: "Landing Page",
      status: "draft",
      pos_x: stageColumnX("producao") + NODE_X_OFFSET,
      pos_y: CONTENT_TOP + 16,
      parent_node_id: clientNodeId,
      data: { kind: "landing_page", stage: "producao" } as Record<string, unknown>,
    }).select().single();

    if (bri && lp) {
      await supabase.from("canvas_edges").insert({
        workspace_id: workspaceId,
        source_node_id: (bri as CanvasNodeRow).id,
        target_node_id: (lp as CanvasNodeRow).id,
        edge_type: "next",
      });
    }

    toast({ title: "Esteira inicial criada", description: "Briefing → Landing Page" });
    await fetchData();
    setBusyAction(null);
  };

  /* Auto-layout: por etapa, empilha vertical */
  const handleAutoLayout = async () => {
    if (projectNodes.length === 0) return;
    setBusyAction("layout");
    const byStage: Record<string, CanvasNodeRow[]> = {};
    projectNodes.forEach((n) => {
      const s = nodeStageOf(n);
      (byStage[s] ??= []).push(n);
    });
    const updates: Array<{ id: string; pos_x: number; pos_y: number }> = [];
    Object.entries(byStage).forEach(([stage, list]) => {
      list.forEach((n, i) => {
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
  }), [clientGroups, projectNodes, dbEdges]);

  const hasFilters = !!search || !!typeFilter || !!statusFilter;
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
    <div className={`flex flex-col bg-background ${fullscreen ? "h-full" : "h-[80vh] rounded-lg border border-border overflow-hidden"}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
          <p className="text-sm font-semibold text-foreground truncate">Esteira de produção</p>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            {summary.clients} cliente{summary.clients === 1 ? "" : "s"} · {summary.projects} nodes · {summary.edges} conexões
          </span>
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
          <Button size="sm" variant="outline" className="h-8" onClick={handleGenerateBase} disabled={busyAction === "base"}>
            {busyAction === "base" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Esteira inicial</span>
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
                <Button size="sm" variant="outline" onClick={handleGenerateBase} disabled={busyAction === "base"}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar esteira inicial
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
                <Button size="sm" variant="outline" onClick={handleGenerateBase} disabled={busyAction === "base"}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar Briefing → Landing
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
              fitView
              fitViewOptions={{ padding: 0.4 }}
              minZoom={0.2}
              maxZoom={2}
              panOnDrag
              panOnScroll={false}
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              selectionOnDrag={false}
              proOptions={{ hideAttribution: true }}
              className="bg-background"
              defaultEdgeOptions={{ type: "smoothstep", animated: true }}
            >
              <StageLanesBg height={STAGE_BAND_HEIGHT} offsetY={CONTENT_TOP - 12} />
              <Background gap={24} size={1} className="opacity-30" />
              <Controls className="!bg-card !border-border" showInteractive={false} />
              <MiniMap
                className="!bg-card !border-border"
                nodeColor={() => "hsl(var(--primary))"}
                pannable
                zoomable
              />
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

      <ProjectNodeDrawer
        node={selectedNode}
        open={!!selectedNode}
        onOpenChange={(o) => !o && setSelectedNode(null)}
        workspaceId={workspaceId}
        onUpdated={fetchData}
        onDelete={handleDeleteNode}
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
