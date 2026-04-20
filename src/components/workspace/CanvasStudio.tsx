import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Sparkles, LayoutGrid, Maximize2, Minimize2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CanvasNodeCard, { type CanvasNodeData } from "./CanvasNodeCard";
import CanvasGroupNode from "./CanvasGroupNode";
import CanvasNodeDrawer, { type CanvasNodeRecord } from "./CanvasNodeDrawer";
import AddCanvasNodeDialog from "./AddCanvasNodeDialog";
import CanvasPalette from "./CanvasPalette";
import CanvasInspector from "./CanvasInspector";
import CanvasClientPicker from "./CanvasClientPicker";
import { computeAutoLayout, nextNodePosition } from "./canvasLayout";
import { CANVAS_TIMELINE_EVENT_TYPE, buildCanvasTitle, buildCanvasDescription } from "./canvasTimeline";
import type { CanvasNodeType } from "./canvasConstants";

interface CanvasEdgeRecord {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string | null;
  label: string | null;
}

/** Extends CanvasNodeRecord with optional parent_node_id (added by migration) */
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
  canvasCard: CanvasNodeCard,
  canvasGroup: CanvasGroupNode,
};

const GROUP_WIDTH = 760;
const GROUP_HEIGHT = 520;
const GROUP_GAP = 60;

function CanvasStudioInner({
  workspaceId, clientId, clientName,
  fullscreen, onToggleFullscreen, onTimelineRefresh,
}: Props) {
  const [dbNodes, setDbNodes] = useState<CanvasNodeRow[]>([]);
  const [dbEdges, setDbEdges] = useState<CanvasEdgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [clientPickerOpen, setClientPickerOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<CanvasNodeRecord | null>(null);

  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  const [paletteCollapsed, setPaletteCollapsed] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

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

  /* DB → ReactFlow with filters + grouping */
  useEffect(() => {
    const q = search.trim().toLowerCase();
    const visible = dbNodes.filter((n) => {
      // client groups always visible (they're frames)
      if (n.node_type === "client") return true;
      if (typeFilter && n.node_type !== typeFilter) return false;
      if (statusFilter && n.status !== statusFilter) return false;
      if (q && !n.title.toLowerCase().includes(q)) return false;
      return true;
    });
    const visibleIds = new Set(visible.map((n) => n.id));

    const childCounts: Record<string, number> = {};
    visible.forEach((n) => {
      if (n.parent_node_id) {
        childCounts[n.parent_node_id] = (childCounts[n.parent_node_id] ?? 0) + 1;
      }
    });

    const built: Node[] = visible.map((n): Node => {
      if (n.node_type === "client") {
        return {
          id: n.id,
          type: "canvasGroup",
          position: { x: Number(n.pos_x ?? 0), y: Number(n.pos_y ?? 0) },
          style: { width: GROUP_WIDTH, height: GROUP_HEIGHT, zIndex: 0 },
          data: {
            title: n.title,
            childCount: childCounts[n.id] ?? 0,
          },
        };
      }
      const base: Node = {
        id: n.id,
        type: "canvasCard",
        position: { x: Number(n.pos_x ?? 0), y: Number(n.pos_y ?? 0) },
        data: {
          title: n.title,
          node_type: n.node_type,
          status: n.status,
          description: n.description,
          hasLinkedEntity: !!n.linked_entity_id,
        } satisfies CanvasNodeData,
      };
      if (n.parent_node_id && visibleIds.has(n.parent_node_id)) {
        base.parentId = n.parent_node_id;
        base.extent = "parent";
      }
      return base;
    });

    setRfNodes(built);
    setRfEdges(
      dbEdges
        .filter((e) => visibleIds.has(e.source_node_id) && visibleIds.has(e.target_node_id))
        .map((e): Edge => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label ?? undefined,
          animated: false,
          style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5 },
        })),
    );
  }, [dbNodes, dbEdges, search, typeFilter, statusFilter]);

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
        edge_type: "related",
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao conectar", description: error.message, variant: "destructive" });
      return;
    }
    const sourceTitle = dbNodes.find((n) => n.id === conn.source)?.title ?? "?";
    const targetTitle = dbNodes.find((n) => n.id === conn.target)?.title ?? "?";

    await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: CANVAS_TIMELINE_EVENT_TYPE,
      title: buildCanvasTitle({ action: "node_connected", nodeTitle: sourceTitle, targetTitle }),
      description: buildCanvasDescription({ action: "node_connected", nodeTitle: sourceTitle }),
      happened_at: new Date().toISOString(),
    });

    if (data) setDbEdges((prev) => [...prev, data as CanvasEdgeRecord]);
    await onTimelineRefresh?.();
  }, [workspaceId, clientId, dbNodes, onTimelineRefresh]);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    const found = dbNodes.find((n) => n.id === node.id);
    if (found) setSelectedNode(found);
  }, [dbNodes]);

  /* ─── Pick existing client → create group node ─── */
  const handlePickClient = async (c: { id: string; name: string }) => {
    // Compute next group position (stack horizontally)
    const existingGroups = dbNodes.filter((n) => n.node_type === "client");
    const x = existingGroups.length === 0
      ? 80
      : Math.max(...existingGroups.map((g) => Number(g.pos_x ?? 0))) + GROUP_WIDTH + GROUP_GAP;

    const { data, error } = await supabase
      .from("canvas_nodes")
      .insert({
        workspace_id: workspaceId,
        client_id: c.id, // link to chosen client (not workspace's clientId)
        node_type: "client",
        title: c.name,
        status: "active",
        description: "Pasta do cliente",
        pos_x: x,
        pos_y: 80,
        linked_entity_type: "clients",
        linked_entity_id: c.id,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao adicionar cliente", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: CANVAS_TIMELINE_EVENT_TYPE,
      title: buildCanvasTitle({ action: "node_created", nodeTitle: c.name }),
      description: buildCanvasDescription({ action: "node_created", nodeTitle: c.name, nodeType: "client" }),
      happened_at: new Date().toISOString(),
    });

    toast({ title: "Cliente adicionado", description: `Pasta criada para ${c.name}` });
    if (data) setDbNodes((prev) => [...prev, data as CanvasNodeRow]);
    await onTimelineRefresh?.();
  };

  /* Pick parent group automatically: nearest client group OR null */
  const pickParentGroup = (): string | null => {
    const groups = dbNodes.filter((n) => n.node_type === "client");
    if (groups.length === 0) return null;
    if (groups.length === 1) return groups[0].id;
    return null; // ambiguous: leave free, user can assign in drawer
  };

  /* Quick-add via paleta */
  const handleQuickAdd = async (type: CanvasNodeType) => {
    if (type === "client") {
      setClientPickerOpen(true);
      return;
    }
    const labelByType: Record<string, string> = {
      dossier: "Dossiê", context: "Contexto",
      front: "Frente", task: "Task", asset: "Asset",
      metric: "Métrica", before_after: "Before/After", case: "Case",
    };
    const parent = pickParentGroup();
    const pos = parent
      ? { x: 40, y: 80 + (dbNodes.filter((n) => n.parent_node_id === parent).length * 110) }
      : nextNodePosition(dbNodes);

    const { data, error } = await supabase
      .from("canvas_nodes")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        node_type: type,
        title: `${labelByType[type] ?? type} novo`,
        status: "draft",
        pos_x: pos.x,
        pos_y: pos.y,
        parent_node_id: parent,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao criar node", description: error.message, variant: "destructive" });
      return;
    }
    if (data) {
      setDbNodes((prev) => [...prev, data as CanvasNodeRow]);
      setSelectedNode(data as CanvasNodeRecord);
    }
  };

  const handleCreateNode = async (input: {
    node_type: string; title: string; status: string; description: string | null;
  }) => {
    if (input.node_type === "client") {
      // Redirect: should pick existing client
      setClientPickerOpen(true);
      return;
    }
    const parent = pickParentGroup();
    const pos = parent
      ? { x: 40, y: 80 + (dbNodes.filter((n) => n.parent_node_id === parent).length * 110) }
      : nextNodePosition(dbNodes);

    const { data, error } = await supabase
      .from("canvas_nodes")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        node_type: input.node_type,
        title: input.title,
        status: input.status,
        description: input.description,
        pos_x: pos.x,
        pos_y: pos.y,
        parent_node_id: parent,
      })
      .select()
      .single();

    if (error) {
      toast({ title: "Erro ao criar node", description: error.message, variant: "destructive" });
      return;
    }
    await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: CANVAS_TIMELINE_EVENT_TYPE,
      title: buildCanvasTitle({ action: "node_created", nodeTitle: input.title }),
      description: buildCanvasDescription({ action: "node_created", nodeTitle: input.title, nodeType: input.node_type }),
      happened_at: new Date().toISOString(),
    });
    toast({ title: "Node criado" });
    if (data) setDbNodes((prev) => [...prev, data as CanvasNodeRow]);
    await onTimelineRefresh?.();
  };

  const handleGenerateBase = async () => {
    setBusyAction("base");
    const hasClient = dbNodes.some((n) => n.node_type === "client");
    const hasDossier = dbNodes.some((n) => n.node_type === "dossier");
    if (hasClient && hasDossier) {
      toast({ title: "Estrutura base já existe" });
      setBusyAction(null);
      return;
    }

    let clientNodeId: string | null = hasClient ? dbNodes.find((n) => n.node_type === "client")?.id ?? null : null;

    if (!hasClient) {
      const { data: clientNode, error: cErr } = await supabase
        .from("canvas_nodes")
        .insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_type: "client",
          title: clientName,
          status: "active",
          description: "Cliente raiz do workspace",
          pos_x: 80,
          pos_y: 80,
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
    }

    if (!hasDossier && clientNodeId) {
      const { data: dossierNode, error: dErr } = await supabase
        .from("canvas_nodes")
        .insert({
          workspace_id: workspaceId,
          client_id: clientId,
          node_type: "dossier",
          title: "Dossiê",
          status: "active",
          description: "Leitura operacional consolidada",
          pos_x: 40,
          pos_y: 80,
          parent_node_id: clientNodeId,
        })
        .select()
        .single();
      if (dErr) {
        toast({ title: "Erro ao gerar dossiê", description: dErr.message, variant: "destructive" });
        setBusyAction(null);
        return;
      }
      setDbNodes((prev) => [...prev, dossierNode as CanvasNodeRow]);
    }

    toast({ title: "Estrutura base criada" });
    await fetchData();
    await onTimelineRefresh?.();
    setBusyAction(null);
  };

  const handleAutoLayout = async () => {
    if (dbNodes.length === 0) return;
    setBusyAction("layout");
    // Layout only ungrouped nodes; leave parented nodes positioned within their parent
    const ungrouped = dbNodes.filter((n) => !n.parent_node_id && n.node_type !== "client");
    const layout = computeAutoLayout(ungrouped);
    await Promise.all(
      layout.map((p) =>
        supabase
          .from("canvas_nodes")
          .update({ pos_x: p.x, pos_y: p.y, updated_at: new Date().toISOString() })
          .eq("id", p.id),
      ),
    );
    toast({ title: "Layout reorganizado" });
    await fetchData();
    setBusyAction(null);
  };

  const handleClearFilters = () => {
    setSearch("");
    setTypeFilter(null);
    setStatusFilter(null);
  };

  const handleDeleteNode = async (id: string) => {
    // If it's a group, also reparent children to null first
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
    total: dbNodes.length,
    edges: dbEdges.length,
    visible: rfNodes.length,
    clients: dbNodes.filter((n) => n.node_type === "client").length,
  }), [dbNodes, dbEdges, rfNodes]);

  const hasFilters = !!search || !!typeFilter || !!statusFilter;
  const existingClientIds = useMemo(
    () => dbNodes.filter((n) => n.node_type === "client" && n.linked_entity_id).map((n) => n.linked_entity_id as string),
    [dbNodes],
  );

  return (
    <div className={`flex flex-col bg-background ${fullscreen ? "h-full" : "h-[80vh] rounded-lg border border-border overflow-hidden"}`}>
      {/* Top bar */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-2 w-2 rounded-full bg-primary shrink-0 animate-pulse" />
          <p className="text-sm font-semibold text-foreground truncate">Canvas</p>
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            {summary.clients} pasta{summary.clients === 1 ? "" : "s"} · {summary.total} nodes · {summary.edges} edges
            {hasFilters && ` · mostrando ${summary.visible}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={handleClearFilters}>
              Limpar filtros
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-8" onClick={handleAutoLayout} disabled={busyAction === "layout" || dbNodes.length === 0}>
            {busyAction === "layout" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LayoutGrid className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Auto-layout</span>
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={handleGenerateBase} disabled={busyAction === "base"}>
            {busyAction === "base" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            <span className="hidden md:inline ml-1 text-xs">Estrutura base</span>
          </Button>
          <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden md:inline ml-1 text-xs">Novo node</span>
          </Button>
          <div className="h-5 w-px bg-border mx-1" />
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onToggleFullscreen} aria-label="Alternar tela cheia">
            {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Body: palette + canvas + inspector */}
      <div className="flex flex-1 min-h-0">
        <CanvasPalette
          onAdd={handleQuickAdd}
          onOpenDialog={() => setAddOpen(true)}
          collapsed={paletteCollapsed}
          onToggleCollapse={() => setPaletteCollapsed((v) => !v)}
        />

        <div className="flex-1 min-w-0 relative">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : dbNodes.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
              <Sparkles className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="text-base font-semibold text-foreground mb-1">Canvas vazio</p>
                <p className="text-xs text-muted-foreground max-w-md">
                  Use a paleta lateral para adicionar nodes ou gere a estrutura base (Cliente + Dossiê) para começar a esteira operacional.
                </p>
              </div>
              <div className="flex gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={handleGenerateBase} disabled={busyAction === "base"}>
                  <Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar base
                </Button>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Criar node
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
              fitViewOptions={{ padding: 0.2 }}
              proOptions={{ hideAttribution: true }}
              className="bg-background"
            >
              <Background gap={20} size={1} className="opacity-40" />
              <Controls className="!bg-card !border-border" />
              <MiniMap className="!bg-card !border-border" nodeColor={() => "hsl(var(--primary))"} pannable zoomable />
            </ReactFlow>
          )}
        </div>

        <CanvasInspector
          nodes={dbNodes}
          edges={dbEdges.length}
          search={search}
          onSearch={setSearch}
          typeFilter={typeFilter}
          onTypeFilter={setTypeFilter}
          statusFilter={statusFilter}
          onStatusFilter={setStatusFilter}
          onPick={setSelectedNode}
          selectedId={selectedNode?.id ?? null}
          collapsed={inspectorCollapsed}
          onToggleCollapse={() => setInspectorCollapsed((v) => !v)}
        />
      </div>

      <AddCanvasNodeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={handleCreateNode}
      />

      <CanvasClientPicker
        open={clientPickerOpen}
        onOpenChange={setClientPickerOpen}
        existingClientIds={existingClientIds}
        onPick={handlePickClient}
        hasOtherClients={summary.clients > 0}
      />

      <CanvasNodeDrawer
        node={selectedNode}
        open={!!selectedNode}
        onOpenChange={(o) => !o && setSelectedNode(null)}
        workspaceId={workspaceId}
        clientId={clientId}
        onUpdated={fetchData}
        onDelete={handleDeleteNode}
      />
    </div>
  );
}

export default function CanvasStudio(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasStudioInner {...props} />
    </ReactFlowProvider>
  );
}
