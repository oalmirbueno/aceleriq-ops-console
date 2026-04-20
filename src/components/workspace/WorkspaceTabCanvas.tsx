import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CanvasNodeCard, { type CanvasNodeData } from "./CanvasNodeCard";
import CanvasNodeDrawer, { type CanvasNodeRecord } from "./CanvasNodeDrawer";
import AddCanvasNodeDialog from "./AddCanvasNodeDialog";
import { CANVAS_TIMELINE_EVENT_TYPE, buildCanvasTitle, buildCanvasDescription } from "./canvasTimeline";

interface CanvasEdgeRecord {
  id: string;
  workspace_id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string | null;
  label: string | null;
}

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  onTimelineRefresh?: () => Promise<void> | void;
}

const nodeTypes = { canvasCard: CanvasNodeCard };

function WorkspaceTabCanvasInner({ workspaceId, clientId, clientName, onTimelineRefresh }: Props) {
  const [dbNodes, setDbNodes] = useState<CanvasNodeRecord[]>([]);
  const [dbEdges, setDbEdges] = useState<CanvasEdgeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<CanvasNodeRecord | null>(null);

  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: nodesData }, { data: edgesData }] = await Promise.all([
      supabase.from("canvas_nodes").select("*").eq("workspace_id", workspaceId).order("created_at"),
      supabase.from("canvas_edges").select("*").eq("workspace_id", workspaceId),
    ]);
    setDbNodes((nodesData ?? []) as CanvasNodeRecord[]);
    setDbEdges((edgesData ?? []) as CanvasEdgeRecord[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ─── Sync DB → ReactFlow ─── */
  useEffect(() => {
    setRfNodes(
      dbNodes.map((n): Node => ({
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
      })),
    );
  }, [dbNodes]);

  useEffect(() => {
    setRfEdges(
      dbEdges.map((e): Edge => ({
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        label: e.label ?? undefined,
        animated: false,
        style: { stroke: "hsl(var(--primary))", strokeWidth: 1.5 },
      })),
    );
  }, [dbEdges]);

  /* ─── ReactFlow handlers ─── */
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));

    // Persist position changes when drag ends
    for (const c of changes) {
      if (c.type === "position" && c.dragging === false && c.position) {
        supabase
          .from("canvas_nodes")
          .update({ pos_x: c.position.x, pos_y: c.position.y, updated_at: new Date().toISOString() })
          .eq("id", c.id)
          .then(({ error }) => {
            if (error) console.error("position persist failed", error);
          });
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

  /* ─── Create node ─── */
  const handleCreateNode = async (input: {
    node_type: string; title: string; status: string; description: string | null;
  }) => {
    // Position new node in viewport center-ish, offset by count
    const offset = dbNodes.length * 40;
    const { data, error } = await supabase
      .from("canvas_nodes")
      .insert({
        workspace_id: workspaceId,
        client_id: clientId,
        node_type: input.node_type,
        title: input.title,
        status: input.status,
        description: input.description,
        pos_x: 200 + offset,
        pos_y: 150 + offset,
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
    if (data) setDbNodes((prev) => [...prev, data as CanvasNodeRecord]);
    await onTimelineRefresh?.();
  };

  /* ─── Generate base structure (deterministic, small) ─── */
  const handleGenerateBase = async () => {
    const hasClient = dbNodes.some((n) => n.node_type === "client");
    const hasDossier = dbNodes.some((n) => n.node_type === "dossier");
    if (hasClient && hasDossier) {
      toast({ title: "Estrutura base já existe", description: "Os nodes Cliente e Dossiê já estão no Canvas." });
      return;
    }

    const inserts: Array<Record<string, unknown>> = [];
    if (!hasClient) inserts.push({
      workspace_id: workspaceId, client_id: clientId, node_type: "client", title: clientName,
      status: "active", description: "Cliente raiz do workspace",
      pos_x: 100, pos_y: 100,
    });
    if (!hasDossier) inserts.push({
      workspace_id: workspaceId, client_id: clientId, node_type: "dossier", title: "Dossiê",
      status: "active", description: "Leitura operacional consolidada",
      pos_x: 100, pos_y: 280,
    });

    const { data, error } = await supabase.from("canvas_nodes").insert(inserts).select();
    if (error) {
      toast({ title: "Erro ao gerar base", description: error.message, variant: "destructive" });
      return;
    }

    // Connect client → dossier if both inserted
    if (data && data.length === 2) {
      const [clientNode, dossierNode] = data as CanvasNodeRecord[];
      await supabase.from("canvas_edges").insert({
        workspace_id: workspaceId,
        source_node_id: clientNode.id,
        target_node_id: dossierNode.id,
        edge_type: "structural",
      });
    }

    for (const n of (data ?? []) as CanvasNodeRecord[]) {
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: CANVAS_TIMELINE_EVENT_TYPE,
        title: buildCanvasTitle({ action: "node_created", nodeTitle: n.title }),
        description: buildCanvasDescription({ action: "node_created", nodeTitle: n.title, nodeType: n.node_type }),
        happened_at: new Date().toISOString(),
      });
    }

    toast({ title: "Estrutura base criada" });
    await fetchData();
    await onTimelineRefresh?.();
  };

  const handleDeleteNode = async (id: string) => {
    // Delete edges first (no cascade assumption)
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

  const summary = useMemo(() => {
    return {
      total: dbNodes.length,
      edges: dbEdges.length,
      linked: dbNodes.filter((n) => n.linked_entity_id).length,
    };
  }, [dbNodes, dbEdges]);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Canvas operacional</p>
          <p className="text-xs text-muted-foreground">
            {summary.total} nodes · {summary.edges} conexões · {summary.linked} vinculados
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleGenerateBase}>
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Estrutura base
          </Button>
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo Node
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="border border-border rounded-lg bg-background/50 overflow-hidden" style={{ height: "70vh" }}>
        {loading ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Carregando canvas...</p>
        ) : dbNodes.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-8 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Canvas vazio</p>
              <p className="text-xs text-muted-foreground max-w-md">
                Crie o primeiro node manualmente ou gere a estrutura base (Cliente + Dossiê) para começar o mapa operacional.
              </p>
            </div>
            <div className="flex gap-2 mt-2">
              <Button size="sm" variant="outline" onClick={handleGenerateBase}>
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
            <MiniMap className="!bg-card !border-border" nodeColor={() => "hsl(var(--primary))"} />
          </ReactFlow>
        )}
      </div>

      <AddCanvasNodeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onCreate={handleCreateNode}
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

export default function WorkspaceTabCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <WorkspaceTabCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
