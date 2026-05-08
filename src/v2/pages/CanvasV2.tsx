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
  type Node, type Edge, type NodeMouseHandler, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  RefreshCw, ExternalLink, Sparkles, Layers, ListChecks, Info,
  PanelRightClose, PanelRightOpen, Plus, Brain, FileText, Lock,
  Maximize2, Minimize2, ChevronDown, Eye,
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

const NODE_TYPES = {
  projectCard: ProjectNodeCard,
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
const MILESTONE_STATUS_LABEL: Record<PortalMilestone["status"], string> = {
  planned: "Planejada", in_progress: "Em curso", done: "Concluída", paused: "Pausada",
};

/* ───────── Layout ─────────
   Posiciona nodes do Portal em colunas por status (lanes), com largura
   compatível com o ProjectNodeCard (280px) e gaps suficientes para
   conexões livres. Não reaproveitamos ACELERA_STAGES para evitar inferência
   sobre dados do Portal. */
const NODE_W = 280;
const NODE_H = 220;
const COL_GAP = 120;
const ROW_GAP = 40;
const COL_X_START = 80;
const ROW_Y_START = 80;

function buildLayout(tasks: PortalTask[]): { nodes: Node[]; edges: Edge[] } {
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
        type: "projectCard",
        position: { x, y: ROW_Y_START + rowIdx * (NODE_H + ROW_GAP) },
        data: portalTaskToNodeData(task) as unknown as Record<string, unknown>,
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
  const [panelOpen, setPanelOpen] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);

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

  const layout = useMemo(() => buildLayout(tasks.data ?? []), [tasks.data]);

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>(layout.nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(layout.edges);

  useEffect(() => {
    setRfNodes(layout.nodes);
    setRfEdges(layout.edges);
    setSelectedTaskId(null);
  }, [layout, setRfNodes, setRfEdges]);

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
            onClick={() => setAddDialogOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 h-7 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
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
            className="bg-background canvas-flow acelera-ops-flow"
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
            <MiniMap
              pannable
              zoomable
              maskColor="hsl(var(--background) / 0.85)"
              className="!bg-card !border !border-border !rounded-lg !shadow-xl"
              nodeColor={(n) => {
                const portalTask = (n.data as { __portalTask?: PortalTask } | undefined)?.__portalTask;
                if (!portalTask) return "hsl(var(--muted))";
                return LANE_COLOR[portalTask.status];
              }}
            />
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
        </div>

        {/* Side panel */}
        {panelOpen && (
          <aside className="w-[340px] shrink-0 border-l border-border bg-card/40 backdrop-blur-sm overflow-y-auto">
            <SidePanel
              project={project.data}
              milestone={selectedMilestone}
              task={selectedTask}
              taskCount={tasks.data?.length ?? 0}
              briefing={briefing}
              briefingsLoading={briefings.loading}
              opsClientId={briefing?.opsClientId ?? project.data?.clientId ?? ""}
            />
          </aside>
        )}
      </div>

      {addDialogOpen && (
        <AddTaskNotice onClose={() => setAddDialogOpen(false)} portalUrl={portalUrl} />
      )}
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

function SidePanel({
  project, milestone, task, taskCount, briefing, briefingsLoading, opsClientId,
}: {
  project: { name: string; clientName: string; progress: number; clientId?: string } | null;
  milestone: PortalMilestone | null;
  task: PortalTask | null;
  taskCount: number;
  briefing: import("@/v2/data/portalClient").BriefingSummary | null;
  briefingsLoading: boolean;
  opsClientId: string;
}) {
  return (
    <div className="p-3 space-y-3">
      {/* IA Hub */}
      <div className="rounded-xl border border-border/80 bg-gradient-to-br from-primary/[0.06] to-transparent p-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="h-6 w-6 rounded-md bg-primary/15 grid place-items-center">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="text-xs font-semibold text-foreground">IA Hub</p>
          <span className="ml-auto text-[9px] uppercase tracking-wider text-muted-foreground/70 font-medium">read-only</span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
          Próximos passos sugeridos com base no briefing essencial e no estado real do projeto.
        </p>
        <div className="space-y-1.5">
          <SuggestionRow icon={Brain} text="Sugestões em breve" />
          <SuggestionRow icon={ListChecks} text="Memória do projeto" />
          <SuggestionRow icon={FileText} text="Decisões registradas" />
        </div>
      </div>

      {/* Briefing essencial */}
      <div className="rounded-xl border border-border/80 bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Briefing essencial</p>
        </div>
        {briefingsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : briefing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-xs text-foreground font-medium">Preenchido</span>
              <span className="ml-auto text-[10px] text-muted-foreground tabular-nums font-mono">
                {briefing.approxFields} campos
              </span>
            </div>
            <Field label="Cliente" value={briefing.clientName} />
            {briefing.company && <Field label="Empresa" value={briefing.company} />}
            <Field label="Atualizado" value={briefing.updatedAt ? new Date(briefing.updatedAt).toLocaleDateString("pt-BR") : "—"} />
            {opsClientId && (
              <a
                href={`/clients/${opsClientId}/briefing`}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-primary hover:underline"
              >
                <Eye className="h-3 w-3" /> Abrir preview no OPS antigo
              </a>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum briefing essencial disponível para este cliente.</p>
        )}
      </div>

      {/* Contexto */}
      <div className="rounded-xl border border-border/80 bg-card p-3 space-y-1.5">
        <div className="flex items-center gap-2 mb-1">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Contexto</p>
        </div>
        <Field label="Cliente" value={project?.clientName ?? "—"} />
        <Field label="Projeto" value={project?.name ?? "—"} />
        <Field label="Milestone" value={milestone?.title ?? "—"} />
        <Field label="Status" value={milestone ? MILESTONE_STATUS_LABEL[milestone.status] : "—"} />
        <Field label="Tarefas" value={milestone ? String(taskCount) : "—"} />
      </div>

      {/* Detalhe da tarefa */}
      <div className="rounded-xl border border-border/80 bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Tarefa selecionada</p>
        </div>
        {task ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-foreground leading-snug">{task.title}</p>
            {task.description && (
              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap leading-relaxed">{task.description}</p>
            )}
            <div className="pt-1 space-y-1.5">
              <Field label="Status" value={statusLabel(task.status)} />
              <Field label="Progresso" value={`${Math.round(task.progress * 100)}%`} />
              <Field label="Responsável" value={task.assigneeName ?? "—"} />
              <Field label="Prazo" value={task.dueAt ? new Date(task.dueAt).toLocaleDateString("pt-BR") : "—"} />
            </div>
            <p className="pt-2 mt-1 border-t border-border text-[10px] text-muted-foreground/70 inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Read-only · edite no Portal.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Clique em um node para ver detalhes.</p>
        )}
      </div>
    </div>
  );
}

function SuggestionRow({ icon: Icon, text }: { icon: typeof Brain; text: string }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-foreground/[0.02] border border-border/40">
      <Icon className="h-3 w-3 text-muted-foreground/70" />
      <span className="text-[11px] text-muted-foreground">{text}</span>
    </div>
  );
}

function statusLabel(s: PortalTaskStatus): string {
  return ({
    todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueada", done: "Concluída", archived: "Arquivada",
  } as const)[s];
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-muted-foreground/80 shrink-0 text-[11px]">{label}</span>
      <span className="text-foreground text-right font-medium truncate text-[11px]">{value}</span>
    </div>
  );
}

function AddTaskNotice({ onClose, portalUrl }: { onClose: () => void; portalUrl: string }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[420px] rounded-xl border border-border bg-card shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <div className="h-8 w-8 rounded-md bg-primary/15 grid place-items-center">
            <Lock className="h-4 w-4 text-primary" />
          </div>
          <p className="text-sm font-semibold text-foreground">Disponível na fase de edição</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed mb-4">
          Adicionar tarefas no Canvas V2 ainda não está disponível. Tarefas são criadas no Portal Aceleriq —
          quando a fase de edição estiver liberada, este botão criará uma task no Portal automaticamente.
        </p>
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-background px-3 h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            Fechar
          </button>
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 h-8 text-xs text-primary hover:bg-primary/15"
          >
            <ExternalLink className="h-3 w-3" /> Abrir Portal
          </a>
        </div>
      </div>
    </div>
  );
}
