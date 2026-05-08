import { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  ReactFlow, ReactFlowProvider, Background, BackgroundVariant, Controls, MiniMap,
  useNodesState, useEdgesState, MarkerType,
  type Node, type Edge, type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  RefreshCw, ExternalLink, Sparkles, Layers, ListChecks, Info,
} from "lucide-react";
import HeaderV2 from "@/v2/components/HeaderV2";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import {
  portalClient,
  type PortalTask, type PortalTaskStatus, type PortalMilestone,
} from "@/v2/data/portalClient";
import { QueryError } from "@/v2/components/QueryState";
import { Skeleton } from "@/components/ui/skeleton";
import { TaskNodeV2 } from "@/v2/components/canvas/TaskNodeV2";

const NODE_TYPES = { task: TaskNodeV2 };

const STATUS_LANES: PortalTaskStatus[] = ["todo", "in_progress", "blocked", "done", "archived"];
const LANE_LABEL: Record<PortalTaskStatus, string> = {
  todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueadas", done: "Concluídas", archived: "Arquivadas",
};
const MILESTONE_STATUS_LABEL: Record<PortalMilestone["status"], string> = {
  planned: "Planejada", in_progress: "Em curso", done: "Concluída", paused: "Pausada",
};

const NODE_W = 260;
const NODE_H = 168;
const COL_GAP = 80;
const ROW_GAP = 28;
const COL_X_START = 40;
const ROW_Y_START = 40;

function buildLayout(tasks: PortalTask[]): { nodes: Node[]; edges: Edge[] } {
  // Lanes by status — only lanes with at least one task
  const grouped = new Map<PortalTaskStatus, PortalTask[]>();
  for (const t of tasks) {
    const arr = grouped.get(t.status) ?? [];
    arr.push(t);
    grouped.set(t.status, arr);
  }
  const activeLanes = STATUS_LANES.filter((s) => grouped.has(s));

  const nodes: Node[] = [];
  activeLanes.forEach((status, colIdx) => {
    const x = COL_X_START + colIdx * (NODE_W + COL_GAP);
    const arr = grouped.get(status) ?? [];
    arr.forEach((task, rowIdx) => {
      nodes.push({
        id: task.id,
        type: "task",
        position: { x, y: ROW_Y_START + rowIdx * (NODE_H + ROW_GAP) },
        data: { task },
        draggable: true,
      });
    });
  });

  // Visual flow: connect lanes left → right (first node of each lane)
  const edges: Edge[] = [];
  for (let i = 0; i < activeLanes.length - 1; i++) {
    const from = grouped.get(activeLanes[i])?.[0];
    const to = grouped.get(activeLanes[i + 1])?.[0];
    if (from && to) {
      edges.push({
        id: `lane-${from.id}-${to.id}`,
        source: from.id,
        target: to.id,
        type: "smoothstep",
        animated: activeLanes[i + 1] === "in_progress",
        style: { stroke: "hsl(var(--foreground) / 0.35)", strokeWidth: 1.5, strokeDasharray: "4 4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--foreground) / 0.5)", width: 14, height: 14 },
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

  // Debug seguro (Modo Dev): expõe contagens e diagnósticos no console
  // sem vazar dados sensíveis. Ative com:
  //   localStorage.setItem("ops:dev-mode:v1","1") ou "canvas:debug","1"
  useEffect(() => {
    if (typeof window === "undefined") return;
    const dev =
      window.localStorage.getItem("ops:dev-mode:v1") === "1" ||
      window.localStorage.getItem("canvas:debug") === "1";
    if (!dev) return;
    if (milestones.loading || tasks.loading) return;
    // eslint-disable-next-line no-console
    console.groupCollapsed(`%c[canvas-v2:debug] project=${projectId.slice(0, 8)}…`, "color:#22c55e");
    // eslint-disable-next-line no-console
    console.log("milestones recebidos:", milestones.data?.length ?? 0,
      milestones.data?.map((m) => ({ id: m.id.slice(0, 8), title: m.title, t: `${m.tasksDoneCount}/${m.tasksCount}` })));
    // eslint-disable-next-line no-console
    console.log("activeMilestoneId:", activeMilestoneId.slice(0, 8) || "(nenhum)");
    // eslint-disable-next-line no-console
    console.log("tasks recebidas:", tasks.data?.length ?? 0);
    const sem = (tasks.data ?? []).filter((t) => !t.milestoneId);
    if (sem.length > 0) {
      // eslint-disable-next-line no-console
      console.warn("tasks sem milestoneId:", sem.length, sem.map((t) => t.id.slice(0, 8)));
    }
    // eslint-disable-next-line no-console
    console.groupEnd();
  }, [projectId, activeMilestoneId, milestones.loading, milestones.data, tasks.loading, tasks.data]);

  const selectedMilestone = useMemo(
    () => milestones.data?.find((m) => m.id === activeMilestoneId) ?? null,
    [milestones.data, activeMilestoneId],
  );

  const layout = useMemo(
    () => buildLayout(tasks.data ?? []),
    [tasks.data],
  );

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<Node>(layout.nodes);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState<Edge>(layout.edges);

  // Re-seed canvas when underlying tasks change
  useEffect(() => {
    setRfNodes(layout.nodes);
    setRfEdges(layout.edges);
    setSelectedTaskId(null);
  }, [layout, setRfNodes, setRfEdges]);

  const onNodeClick: NodeMouseHandler = useCallback((_e, node) => {
    setSelectedTaskId(node.id);
  }, []);

  const selectedTask = useMemo(
    () => tasks.data?.find((t) => t.id === selectedTaskId) ?? null,
    [tasks.data, selectedTaskId],
  );

  const reloadAll = () => {
    project.reload();
    milestones.reload();
    tasks.reload();
  };

  const portalUrl = `https://portal.aceleriq.com.br/projects/${projectId}`;

  return (
    <>
      <HeaderV2
        title="Canvas"
        subtitle={
          project.data
            ? `${project.data.clientName} · ${project.data.name}`
            : `Projeto ${projectId}`
        }
        actions={
          <>
            <button
              onClick={reloadAll}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Recarregar
            </button>
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Abrir no Portal
            </a>
          </>
        }
      />

      {/* Milestone selector */}
      <div className="border-b border-border bg-card/30 px-2 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium px-2">
            <Layers className="h-3.5 w-3.5" /> Milestone
          </span>
          {milestones.loading ? (
            <><Skeleton className="h-7 w-40" /><Skeleton className="h-7 w-40" /></>
          ) : milestones.error ? (
            <span className="text-xs text-destructive">{milestones.error.message}</span>
          ) : milestones.data && milestones.data.length > 0 ? (
            milestones.data.map((m) => {
              const active = m.id === activeMilestoneId;
              return (
                <button
                  key={m.id}
                  onClick={() => setMilestoneId(m.id)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                  }`}
                >
                  <span className="font-medium">{m.title}</span>
                  <span className="ml-2 text-[10px] opacity-70">{m.tasksDoneCount}/{m.tasksCount}</span>
                </button>
              );
            })
          ) : (
            <span className="text-xs text-muted-foreground">Nenhum milestone disponível.</span>
          )}
        </div>
      </div>

      {/* Canvas surface + inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-0 h-[calc(100vh-220px)] min-h-[520px]">
        <div className="relative bg-background border-r border-border overflow-hidden">
          {!activeMilestoneId ? (
            <CanvasOverlay icon={Layers} title="Selecione um milestone" text="O Canvas mostra as tarefas reais do milestone selecionado." />
          ) : tasks.loading ? (
            <div className="absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-3">
                <Skeleton className="h-32 w-64" />
                <Skeleton className="h-32 w-64" />
              </div>
            </div>
          ) : tasks.error ? (
            <div className="absolute inset-0 grid place-items-center p-6">
              <QueryError error={tasks.error} onRetry={tasks.reload} />
            </div>
          ) : (tasks.data?.length ?? 0) === 0 ? (
            <CanvasOverlay icon={ListChecks} title="Sem tarefas neste milestone" text="As tarefas vivem no Portal. Quando forem criadas, aparecem aqui." />
          ) : null}

          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            minZoom={0.2}
            maxZoom={2}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            zoomOnScroll
            zoomOnPinch
            zoomOnDoubleClick={false}
            panOnDrag
            proOptions={{ hideAttribution: true }}
            className="bg-background"
            deleteKeyCode={null}
          >
            <Background variant={BackgroundVariant.Dots} gap={32} size={1} color="hsl(var(--foreground) / 0.08)" />
            <Controls
              showInteractive={false}
              className="!bg-card !border !border-border !rounded-md overflow-hidden"
            />
            <MiniMap
              pannable
              zoomable
              maskColor="hsl(var(--background) / 0.85)"
              className="!bg-card !border !border-border !rounded-md"
              nodeColor={(n) => {
                const t = (n.data as { task?: PortalTask } | undefined)?.task;
                if (!t) return "hsl(var(--muted))";
                if (t.status === "done") return "hsl(145 70% 45%)";
                if (t.status === "in_progress") return "hsl(var(--primary))";
                if (t.status === "blocked") return "hsl(var(--destructive))";
                return "hsl(var(--muted-foreground) / 0.5)";
              }}
            />
          </ReactFlow>

          {/* Lane labels */}
          {(tasks.data?.length ?? 0) > 0 && (
            <LaneLegend tasks={tasks.data ?? []} />
          )}
        </div>

        {/* Inspector */}
        <aside className="bg-card/30 border-t xl:border-t-0 border-border overflow-y-auto">
          <Inspector
            project={project.data}
            milestone={selectedMilestone}
            task={selectedTask}
            taskCount={tasks.data?.length ?? 0}
          />
        </aside>
      </div>
    </>
  );
}

function LaneLegend({ tasks }: { tasks: PortalTask[] }) {
  const counts = useMemo(() => {
    const c = new Map<PortalTaskStatus, number>();
    tasks.forEach((t) => c.set(t.status, (c.get(t.status) ?? 0) + 1));
    return c;
  }, [tasks]);
  const lanes = STATUS_LANES.filter((s) => counts.has(s));
  if (lanes.length === 0) return null;
  return (
    <div className="absolute top-3 left-3 z-10 flex gap-2 pointer-events-none">
      {lanes.map((s) => (
        <span
          key={s}
          className="rounded-full border border-border bg-card/80 backdrop-blur px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
        >
          {LANE_LABEL[s]} · {counts.get(s)}
        </span>
      ))}
    </div>
  );
}

function CanvasOverlay({
  icon: Icon, title, text,
}: { icon: typeof Layers; title: string; text: string }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-background/80 backdrop-blur-sm">
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

function Inspector({
  project, milestone, task, taskCount,
}: {
  project: { name: string; clientName: string; progress: number } | null;
  milestone: PortalMilestone | null;
  task: PortalTask | null;
  taskCount: number;
}) {
  return (
    <div className="p-3 space-y-3">
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">IA Hub</p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Em breve: sugestões e próximos passos baseados no briefing essencial e no estado real do projeto.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Contexto</p>
        </div>
        <Field label="Cliente" value={project?.clientName ?? "—"} />
        <Field label="Projeto" value={project?.name ?? "—"} />
        <Field label="Milestone" value={milestone?.title ?? "—"} />
        <Field label="Status milestone" value={milestone ? MILESTONE_STATUS_LABEL[milestone.status] : "—"} />
        <Field label="Tarefas no canvas" value={milestone ? String(taskCount) : "—"} />
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Tarefa selecionada</p>
        </div>
        {task ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{task.title}</p>
            {task.description && (
              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{task.description}</p>
            )}
            <Field label="Status" value={statusLabel(task.status)} />
            <Field label="Progresso" value={`${Math.round(task.progress * 100)}%`} />
            <Field label="Responsável" value={task.assigneeName ?? "—"} />
            <Field label="Prazo" value={task.dueAt ? new Date(task.dueAt).toLocaleDateString("pt-BR") : "—"} />
            <p className="pt-2 mt-1 border-t border-border text-[10px] text-muted-foreground/70">
              Read-only. Para editar, use o Portal.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Clique em um node no canvas para ver detalhes.</p>
        )}
      </div>
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
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right font-medium truncate">{value}</span>
    </div>
  );
}
