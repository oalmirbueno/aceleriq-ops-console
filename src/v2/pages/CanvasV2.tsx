/**
 * Canvas V2 — Legacy UI Adapter
 *
 * - Fonte de dados: Portal bridge (getProject, listMilestones, listTasks).
 * - UI/UX: componentes oficiais do canvas antigo (ProjectNodeCard, DeletableEdge,
 *   CSS .canvas-flow.acelera-ops-flow, multi-handles flex-handle).
 * - Read-only: nenhum callback de mutação é passado aos nodes/edges.
 * - Drag local + conexões locais permitidos (não persistem).
 * - Sem canvas_nodes, sem auto-sync, sem materialize.
 */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType, addEdge, ConnectionMode, ConnectionLineType,
  SelectionMode,
  type Node, type Edge, type NodeMouseHandler, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  RefreshCw, ExternalLink, Layers, ListChecks,
  PanelRightClose, PanelRightOpen,
  Maximize2, Minimize2, ChevronDown,
} from "lucide-react";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import {
  portalClient,
  type PortalTask, type PortalTaskStatus, type PortalMilestone,
} from "@/v2/data/portalClient";
import { QueryError } from "@/v2/components/QueryState";
import { Skeleton } from "@/components/ui/skeleton";
import ProjectNodeCard from "@/components/workspace/ProjectNodeCard";
import CanvasGroupNode from "@/components/workspace/CanvasGroupNode";
import DeletableEdge from "@/components/workspace/DeletableEdge";
import { portalTaskToNodeData } from "@/v2/components/canvas/portalToLegacy";
import { useV2Setting, V2_SETTINGS } from "@/v2/lib/v2Settings";
import CanvasDockV2 from "@/v2/components/canvas/CanvasDockV2";
import IAHubV2 from "@/v2/components/canvas/IAHubV2";
import TaskInspectorV2 from "@/v2/components/canvas/TaskInspectorV2";
import AddTaskBlockedDialog from "@/v2/components/canvas/AddTaskBlockedDialog";
import { TaskNodeV2 } from "@/v2/components/canvas/TaskNodeV2";

const NODE_TYPES = {
  projectCard: ProjectNodeCard,
  taskCardV2: TaskNodeV2 as React.ComponentType<NodeProps>,
  canvasGroup: CanvasGroupNode,
};
const EDGE_TYPES = { deletable: DeletableEdge };

const STATUS_LANES: PortalTaskStatus[] = ["todo", "in_progress", "blocked", "done", "archived"];
const LANE_LABEL: Record<PortalTaskStatus, string> = {
  todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueadas", done: "Concluídas", archived: "Arquivadas",
};
const LANE_COLOR: Record<PortalTaskStatus, string> = {
  todo: "hsl(220 9% 60%)", in_progress: "hsl(145 100% 50%)", blocked: "hsl(0 84% 60%)",
  done: "hsl(145 70% 45%)", archived: "hsl(220 9% 40%)",
};

/* ───────── Layout ─────────
   Posiciona nodes do Portal em colunas por status (lanes). Tamanho e gaps
   variam conforme renderer/nodeSize/density escolhidos nas configurações. */
const NODE_SIZE_CONFIG: Record<"sm" | "md" | "lg", { w: number; h: number }> = {
  sm: { w: 240, h: 190 },
  md: { w: 280, h: 220 },
  lg: { w: 340, h: 250 },
};
const TASK_SIZE_CONFIG: Record<"sm" | "md" | "lg", { w: number; h: number }> = {
  sm: { w: 280, h: 180 },
  md: { w: 320, h: 200 },
  lg: { w: 380, h: 220 },
};
const DENSITY_GAP: Record<"comfortable" | "compact", { col: number; row: number }> = {
  comfortable: { col: 120, row: 40 },
  compact:     { col: 56,  row: 14 },
};

function buildLayout(
  tasks: PortalTask[],
  renderer: "legacy" | "task-v2",
  nodeSize: "sm" | "md" | "lg",
  density: "comfortable" | "compact",
): { nodes: Node[]; edges: Edge[] } {
  const sizeMap = renderer === "task-v2" ? TASK_SIZE_CONFIG : NODE_SIZE_CONFIG;
  const { w: NODE_W, h: NODE_H } = sizeMap[nodeSize];
  const { col: COL_GAP, row: ROW_GAP } = DENSITY_GAP[density];
  const COL_X_START = 80;
  const ROW_Y_START = 80;
  const grouped = new Map<PortalTaskStatus, PortalTask[]>();
  for (const t of tasks) {
    const arr = grouped.get(t.status) ?? [];
    arr.push(t); grouped.set(t.status, arr);
  }
  const activeLanes = STATUS_LANES.filter((s) => grouped.has(s));

  const nodes: Node[] = [];
  activeLanes.forEach((status, colIdx) => {
    const x = COL_X_START + colIdx * (NODE_W + COL_GAP);
    const arr = grouped.get(status) ?? [];
    arr.forEach((task, rowIdx) => {
      nodes.push({
        id: task.id,
        type: renderer === "task-v2" ? "taskCardV2" : "projectCard",
        position: { x, y: ROW_Y_START + rowIdx * (NODE_H + ROW_GAP) },
        data: (renderer === "task-v2"
          ? { task, __nodeSize: nodeSize }
          : portalTaskToNodeData(task)) as unknown as Record<string, unknown>,
        draggable: true,
      });
    });
  });

  // Sugestão visual de fluxo: liga primeira task de cada lane à da próxima.
  const edges: Edge[] = [];
  for (let i = 0; i < activeLanes.length - 1; i++) {
    const from = grouped.get(activeLanes[i])?.[0];
    const to = grouped.get(activeLanes[i + 1])?.[0];
    if (from && to) {
      edges.push({
        id: `lane-${from.id}-${to.id}`,
        source: from.id, target: to.id,
        sourceHandle: "r2", targetHandle: "l2",
        type: "deletable",
        animated: activeLanes[i + 1] === "in_progress",
        style: { stroke: "hsl(var(--foreground) / 0.55)", strokeWidth: 2, strokeDasharray: "5 5" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--foreground) / 0.7)", width: 16, height: 16 },
      });
    }
  }
  return { nodes, edges };
}

export default function CanvasV2() {
  return (
    <ReactFlowProvider>
      <CanvasV2Inner />
    </ReactFlowProvider>
  );
}

function CanvasV2Inner() {
  const { projectId = "" } = useParams();
  const [milestoneId, setMilestoneId] = useState<string>("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showSidePanel] = useV2Setting(V2_SETTINGS.canvasShowSidePanel);
  const [defaultFullscreen] = useV2Setting(V2_SETTINGS.canvasDefaultFullscreen);
  const [showMinimap] = useV2Setting(V2_SETTINGS.canvasShowMinimap);
  const [renderer] = useV2Setting(V2_SETTINGS.canvasNodeRenderer);
  const [density] = useV2Setting(V2_SETTINGS.canvasDensity);
  const [nodeSize] = useV2Setting(V2_SETTINGS.canvasNodeSize);
  const [showDock] = useV2Setting(V2_SETTINGS.canvasShowDock);
  const [showIAHub] = useV2Setting(V2_SETTINGS.canvasShowIAHub);
  const [panelOpen, setPanelOpen] = useState(showSidePanel);
  const [fullscreen, setFullscreen] = useState(defaultFullscreen);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [iaHubOpen, setIaHubOpen] = useState(false);
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<PortalTaskStatus>>(new Set());

  const project = usePortalQuery(
    () => projectId ? portalClient.getProject(projectId) : Promise.resolve(null),
    [projectId],
  );
  const milestones = usePortalQuery(
    () => projectId ? portalClient.listMilestones(projectId) : Promise.resolve([]),
    [projectId],
  );

  const activeMilestoneId =
    milestoneId ||
    project.data?.currentMilestoneId ||
    milestones.data?.[0]?.id ||
    "";

  const tasks = usePortalQuery(
    () => activeMilestoneId
      ? portalClient.listTasks({ projectId, milestoneId: activeMilestoneId })
      : Promise.resolve<PortalTask[]>([]),
    [projectId, activeMilestoneId],
  );

  const briefings = usePortalQuery(
    () => portalClient.listBriefings(),
    [],
  );
  const briefing = useMemo(() => {
    const list = briefings.data ?? [];
    const cid = project.data?.clientId;
    const cname = project.data?.clientName;
    return (
      list.find((b) => cid && (b.opsClientId === cid || b.portalClientId === cid || b.clientId === cid)) ||
      list.find((b) => cname && b.clientName?.toLowerCase() === cname.toLowerCase()) ||
      null
    );
  }, [briefings.data, project.data]);

  // Debug seguro (Modo Dev)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dev =
      window.localStorage.getItem("ops:dev-mode:v1") === "1" ||
      window.localStorage.getItem("canvas:debug") === "1";
    if (!dev) return;
    if (milestones.loading || tasks.loading) return;
    // eslint-disable-next-line no-console
    console.groupCollapsed(`%c[canvas-v2] project=${projectId.slice(0, 8)}…`, "color:#22c55e");
    // eslint-disable-next-line no-console
    console.log("milestones:", milestones.data?.length ?? 0,
      milestones.data?.map((m) => ({ id: m.id.slice(0, 8), title: m.title, t: `${m.tasksDoneCount}/${m.tasksCount}` })));
    // eslint-disable-next-line no-console
    console.log("active milestone:", activeMilestoneId.slice(0, 8) || "(nenhum)");
    // eslint-disable-next-line no-console
    console.log("tasks:", tasks.data?.length ?? 0);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }, [projectId, activeMilestoneId, milestones.loading, milestones.data, tasks.loading, tasks.data]);

  const selectedMilestone = useMemo(
    () => milestones.data?.find((m) => m.id === activeMilestoneId) ?? null,
    [milestones.data, activeMilestoneId],
  );

  const layout = useMemo(
    () => buildLayout(tasks.data ?? [], renderer, nodeSize, density),
    [tasks.data, renderer, nodeSize, density],
  );

  const visibleLayout = useMemo(() => {
    if (hiddenStatuses.size === 0) return layout;
    const taskById = new Map((tasks.data ?? []).map((t) => [t.id, t] as const));
    const visibleNodes = layout.nodes.filter((n) => {
      const t = taskById.get(n.id);
      return !t || !hiddenStatuses.has(t.status);
    });
    const visibleIds = new Set(visibleNodes.map((n) => n.id));
    const visibleEdges = layout.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
    return { nodes: visibleNodes, edges: visibleEdges };
  }, [layout, hiddenStatuses, tasks.data]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>(layout.nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(layout.edges);
  const [layoutTick, setLayoutTick] = useState(0);

  useEffect(() => {
    setRfNodes(visibleLayout.nodes);
    setRfEdges(visibleLayout.edges);
    setSelectedTaskId(null);
  }, [visibleLayout, setRfNodes, setRfEdges, layoutTick]);

  const organize = useCallback(() => setLayoutTick((n) => n + 1), []);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelectedTaskId(node.id);
    if (!panelOpen) setPanelOpen(true);
  }, [panelOpen]);

  // Conexões locais (não persistem)
  const onConnect = useCallback((connection: Connection) => {
    setRfEdges((eds) => addEdge({
      ...connection,
      type: "deletable",
      style: { stroke: "hsl(145 100% 50% / 0.85)", strokeWidth: 2.4 },
      markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(145 100% 50%)", width: 18, height: 18 },
    }, eds));
  }, [setRfEdges]);

  const selectedTask = useMemo(
    () => tasks.data?.find((t) => t.id === selectedTaskId) ?? null,
    [tasks.data, selectedTaskId],
  );
  const upcomingTasks = useMemo(
    () => (tasks.data ?? []).filter((t) => t.status === "todo" || t.status === "in_progress"),
    [tasks.data],
  );

  const reloadAll = () => {
    project.reload(); milestones.reload(); tasks.reload(); briefings.reload();
  };

  const portalUrl = `https://portal.aceleriq.com.br/projects/${projectId}`;
  const counts = useMemo(() => {
    const c = new Map<PortalTaskStatus, number>();
    (tasks.data ?? []).forEach((t) => c.set(t.status, (c.get(t.status) ?? 0) + 1));
    return c;
  }, [tasks.data]);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 bg-background flex flex-col"
          : "fixed top-[80px] left-0 right-0 bottom-0 flex flex-col bg-background"
      }
    >
      {/* Compact header bar */}
      <div className="flex items-center gap-3 px-4 h-12 border-b border-border bg-card/40 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Layers className="h-4 w-4 text-primary shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium leading-none">Canvas</p>
            <p className="text-xs text-foreground font-medium truncate leading-tight mt-0.5">
              {project.data ? `${project.data.clientName} · ${project.data.name}` : "Carregando…"}
            </p>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex justify-center">
          {milestones.loading ? (
            <Skeleton className="h-7 w-56" />
          ) : milestones.data && milestones.data.length > 0 ? (
            <MilestoneSelector
              milestones={milestones.data}
              activeId={activeMilestoneId}
              onSelect={setMilestoneId}
            />
          ) : (
            <span className="text-xs text-muted-foreground">Sem milestones</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={reloadAll}
            className="h-7 w-7 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
            title="Recarregar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="h-7 w-7 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
            title="Abrir no Portal"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={() => setFullscreen((v) => !v)}
            className="h-7 w-7 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
            title={fullscreen ? "Sair do fullscreen" : "Fullscreen"}
          >
            {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setPanelOpen((v) => !v)}
            className="h-7 w-7 grid place-items-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground hover:border-foreground/30"
            title={panelOpen ? "Recolher painel" : "Abrir painel"}
          >
            {panelOpen ? <PanelRightClose className="h-3.5 w-3.5" /> : <PanelRightOpen className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 flex min-h-0">
        <div className="relative flex-1 min-w-0 overflow-hidden">
          {!activeMilestoneId ? (
            <CanvasOverlay icon={Layers} title="Selecione um milestone" text="O Canvas mostra as tarefas reais do milestone selecionado." />
          ) : tasks.loading ? (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="grid grid-cols-2 gap-3 opacity-70">
                <Skeleton className="h-[140px] w-[260px] rounded-xl" />
                <Skeleton className="h-[140px] w-[260px] rounded-xl" />
                <Skeleton className="h-[140px] w-[260px] rounded-xl" />
                <Skeleton className="h-[140px] w-[260px] rounded-xl" />
              </div>
            </div>
          ) : tasks.error ? (
            <div className="absolute inset-0 grid place-items-center p-6 z-20">
              <QueryError error={tasks.error} onRetry={tasks.reload} />
            </div>
          ) : (tasks.data?.length ?? 0) === 0 ? (
            <CanvasOverlay icon={ListChecks} title="Sem tarefas neste milestone" text="As tarefas vivem no Portal. Quando forem criadas, aparecem aqui." />
          ) : null}

          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            onConnect={onConnect}
            fitView
            fitViewOptions={{ padding: 0.32, maxZoom: 1 }}
            minZoom={0.15}
            maxZoom={2.5}
            nodesDraggable
            nodesConnectable
            edgesReconnectable
            elementsSelectable
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            panOnDrag
            selectionOnDrag={false}
            selectionMode={SelectionMode.Partial}
            connectionMode={ConnectionMode.Loose}
            connectionLineType={ConnectionLineType.Bezier}
            connectionLineStyle={{ stroke: "hsl(145 100% 50%)", strokeWidth: 3, opacity: 1 }}
            connectionRadius={34}
            proOptions={{ hideAttribution: true }}
            className="bg-background canvas-flow acelera-ops-flow animate-fade-in"
            key={activeMilestoneId || "empty"}
            deleteKeyCode={null}
            defaultEdgeOptions={{
              type: "deletable",
              markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--foreground) / 0.82)", width: 18, height: 18 },
              style: { stroke: "hsl(var(--foreground) / 0.82)", strokeWidth: 2.6 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={48} size={1} color="hsl(var(--foreground) / 0.08)" />
            <Controls
              showInteractive={false}
              className="!bg-card !border !border-border !rounded-lg overflow-hidden !shadow-xl"
            />
            {showMinimap && <MiniMap
              pannable
              zoomable
              maskColor="hsl(var(--background) / 0.85)"
              className="!bg-card !border !border-border !rounded-lg !shadow-xl"
              nodeColor={(n) => {
                const portalTask = (n.data as { __portalTask?: PortalTask } | undefined)?.__portalTask;
                if (!portalTask) return "hsl(var(--muted))";
                return LANE_COLOR[portalTask.status];
              }}
            />}
          </ReactFlow>

          {/* Lane legend */}
          {(tasks.data?.length ?? 0) > 0 && (
            <div className="absolute top-3 left-3 z-10 flex gap-1.5 pointer-events-none flex-wrap max-w-[60%]">
              {STATUS_LANES.filter((s) => counts.has(s)).map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-border bg-card/80 backdrop-blur px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5"
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: LANE_COLOR[s] }} />
                  {LANE_LABEL[s]} · <span className="tabular-nums text-foreground/80">{counts.get(s)}</span>
                </span>
              ))}
            </div>
          )}

          {(tasks.data?.length ?? 0) > 0 && (
            <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
              <span className="rounded-full border border-border bg-card/80 backdrop-blur px-2.5 py-1 text-[10px] text-muted-foreground/80">
                Arraste das laterais dos nodes para conectar · conexões locais, não persistem
              </span>
            </div>
          )}

          {/* Floating dock (bottom center) */}
          {showDock && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20">
              <CanvasDockV2
                onOrganize={organize}
                onAddBlocked={() => setAddDialogOpen(true)}
                onToggleIAHub={() => setIaHubOpen((v) => !v)}
                iaHubOpen={iaHubOpen}
                iaHubEnabled={showIAHub}
                hiddenStatuses={hiddenStatuses}
                onChangeFilters={setHiddenStatuses}
                portalUrl={portalUrl}
              />
            </div>
          )}

          {/* IA Hub orb (bottom right) */}
          {showIAHub && (
            <div className="absolute bottom-4 right-4 z-20">
              <IAHubV2
                open={iaHubOpen}
                onOpenChange={setIaHubOpen}
                clientName={project.data?.clientName}
                projectName={project.data?.name}
                milestone={selectedMilestone}
                selectedTask={selectedTask}
                upcomingTasks={upcomingTasks}
                briefing={briefing}
              />
            </div>
          )}
        </div>

        {/* Side panel */}
        {panelOpen && (
          <aside className="w-[400px] shrink-0 border-l border-border bg-card/40 backdrop-blur-sm">
            <TaskInspectorV2
              task={selectedTask}
              milestone={selectedMilestone}
              projectName={project.data?.name}
              clientName={project.data?.clientName}
              portalUrl={portalUrl}
              onClose={() => setPanelOpen(false)}
            />
          </aside>
        )}
      </div>

      <AddTaskBlockedDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        portalUrl={portalUrl}
        milestoneTitle={selectedMilestone?.title}
      />
    </div>
  );
}

function MilestoneSelector({
  milestones, activeId, onSelect,
}: {
  milestones: PortalMilestone[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = milestones.find((m) => m.id === activeId) ?? milestones[0];
  if (!active) return null;
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background h-7 px-2.5 text-xs hover:border-foreground/30"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        <span className="font-medium text-foreground truncate max-w-[280px]">{active.title}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
          {active.tasksDoneCount}/{active.tasksCount}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-9 left-1/2 -translate-x-1/2 z-50 w-[360px] rounded-lg border border-border bg-card shadow-2xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Milestones do projeto</p>
            </div>
            <div className="max-h-[60vh] overflow-y-auto py-1">
              {milestones.map((m) => {
                const isActive = m.id === activeId;
                return (
                  <button
                    key={m.id}
                    onClick={() => { onSelect(m.id); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 hover:bg-muted/50 flex items-center gap-2 ${
                      isActive ? "bg-primary/5" : ""
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        m.status === "in_progress" ? "bg-primary" :
                        m.status === "done" ? "bg-emerald-400" :
                        m.status === "paused" ? "bg-amber-400" : "bg-muted-foreground/50"
                      }`}
                    />
                    <span className={`flex-1 text-xs truncate ${isActive ? "text-primary font-medium" : "text-foreground"}`}>
                      {m.title}
                    </span>
                    <span className="text-[10px] text-muted-foreground tabular-nums font-mono shrink-0">
                      {m.tasksDoneCount}/{m.tasksCount}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CanvasOverlay({
  icon: Icon, title, text,
}: { icon: typeof Layers; title: string; text: string }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-background/60 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-2 text-center px-6">
        <div className="rounded-xl border border-border bg-card p-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground max-w-sm">{text}</p>
      </div>
    </div>
  );
}
