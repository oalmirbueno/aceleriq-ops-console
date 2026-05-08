import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  RefreshCw, ExternalLink, Sparkles, Layers, ListChecks,
  Clock, CheckCircle2, Circle, Pause, Archive, AlertCircle,
  ChevronRight, Info,
} from "lucide-react";
import HeaderV2 from "@/v2/components/HeaderV2";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient, type PortalTask, type PortalTaskStatus, type PortalMilestone } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS_META: Record<PortalTaskStatus, { label: string; icon: typeof Circle; cls: string; dot: string }> = {
  todo:        { label: "A fazer",     icon: Circle,        cls: "text-muted-foreground border-border",                           dot: "bg-muted-foreground/60" },
  in_progress: { label: "Em curso",    icon: Clock,         cls: "text-primary border-primary/40 bg-primary/10",                  dot: "bg-primary" },
  blocked:     { label: "Bloqueada",   icon: AlertCircle,   cls: "text-destructive border-destructive/40 bg-destructive/10",      dot: "bg-destructive" },
  done:        { label: "Concluída",   icon: CheckCircle2,  cls: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",      dot: "bg-emerald-400" },
  archived:    { label: "Arquivada",   icon: Archive,       cls: "text-muted-foreground border-border opacity-60",                dot: "bg-muted-foreground/40" },
};

const MILESTONE_STATUS_LABEL: Record<PortalMilestone["status"], string> = {
  planned: "Planejada", in_progress: "Em curso", done: "Concluída", paused: "Pausada",
};

export default function CanvasV2() {
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
      : Promise.resolve([]),
    [projectId, activeMilestoneId],
  );

  const selectedMilestone = useMemo(
    () => milestones.data?.find((m) => m.id === activeMilestoneId) ?? null,
    [milestones.data, activeMilestoneId],
  );

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

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 py-6">
        <div className="space-y-4 min-w-0">
          {/* Milestone selector */}
          <section className="rounded-xl border border-border bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                Milestone
              </p>
              <span className="text-[10px] text-muted-foreground/70">obrigatório</span>
            </div>
            {milestones.loading ? (
              <div className="flex gap-2">
                <Skeleton className="h-8 w-40" /><Skeleton className="h-8 w-40" />
              </div>
            ) : milestones.error ? (
              <QueryError error={milestones.error} onRetry={milestones.reload} />
            ) : milestones.data && milestones.data.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {milestones.data.map((m) => {
                  const active = m.id === activeMilestoneId;
                  return (
                    <button
                      key={m.id}
                      onClick={() => { setMilestoneId(m.id); setSelectedTaskId(null); }}
                      className={`group rounded-md border px-3 py-1.5 text-xs transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                      }`}
                    >
                      <span className="font-medium">{m.title}</span>
                      <span className="ml-2 text-[10px] opacity-70">
                        {m.tasksDoneCount}/{m.tasksCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum milestone neste projeto.</p>
            )}
          </section>

          {/* Canvas board */}
          <section className="rounded-xl border border-border bg-card/40 min-h-[480px] p-4">
            {!activeMilestoneId ? (
              <EmptyHint
                icon={Layers}
                title="Selecione um milestone"
                text="O Canvas mostra as tarefas reais do milestone selecionado."
              />
            ) : tasks.loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
              </div>
            ) : tasks.error ? (
              <QueryError error={tasks.error} onRetry={tasks.reload} />
            ) : tasks.data && tasks.data.length > 0 ? (
              <>
                <CanvasHeader milestone={selectedMilestone} taskCount={tasks.data.length} />
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {tasks.data.map((t) => (
                    <TaskNode
                      key={t.id}
                      task={t}
                      selected={t.id === selectedTaskId}
                      onSelect={() => setSelectedTaskId(t.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <EmptyHint
                icon={ListChecks}
                title="Sem tarefas neste milestone"
                text="As tarefas vivem no Portal. Quando forem criadas, aparecem aqui automaticamente."
              />
            )}
          </section>
        </div>

        {/* Side panel — IA Hub / contexto (read-only) */}
        <aside className="space-y-3 min-w-0">
          <SidePanel
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

function CanvasHeader({ milestone, taskCount }: { milestone: PortalMilestone | null; taskCount: number }) {
  if (!milestone) return null;
  return (
    <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{milestone.title}</p>
        <p className="text-[11px] text-muted-foreground">
          {MILESTONE_STATUS_LABEL[milestone.status]} ·{" "}
          {milestone.tasksDoneCount}/{milestone.tasksCount} concluídas ·{" "}
          {taskCount} {taskCount === 1 ? "tarefa carregada" : "tarefas carregadas"}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <ProgressBar value={milestone.progress} />
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {Math.round(milestone.progress * 100)}%
        </span>
      </div>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-1.5 w-32 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

function TaskNode({
  task, selected, onSelect,
}: { task: PortalTask; selected: boolean; onSelect: () => void }) {
  const meta = STATUS_META[task.status];
  const Icon = meta.icon;
  return (
    <button
      onClick={onSelect}
      className={`group text-left rounded-xl border bg-card p-3 transition-all hover:border-foreground/30 ${
        selected ? "border-primary ring-1 ring-primary/40" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
          <p className="text-sm font-medium text-foreground line-clamp-2">{task.title}</p>
        </div>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${meta.cls}`}>
          <Icon className="h-3 w-3" /> {meta.label}
        </span>
        {task.progress > 0 && task.status !== "done" && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {Math.round(task.progress * 100)}%
          </span>
        )}
      </div>

      {task.description && (
        <p className="mt-2 text-[11px] text-muted-foreground line-clamp-2">{task.description}</p>
      )}
    </button>
  );
}

function SidePanel({
  project, milestone, task, taskCount,
}: {
  project: { name: string; clientName: string; progress: number } | null;
  milestone: PortalMilestone | null;
  task: PortalTask | null;
  taskCount: number;
}) {
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            IA Hub
          </p>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Em breve: sugestões de próximos passos baseadas no briefing essencial e no estado real do projeto. Por ora, esta visão é apenas leitura.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Contexto do canvas
          </p>
        </div>
        <Field label="Cliente" value={project?.clientName ?? "—"} />
        <Field label="Projeto" value={project?.name ?? "—"} />
        <Field label="Milestone" value={milestone?.title ?? "—"} />
        <Field
          label="Tarefas carregadas"
          value={milestone ? String(taskCount) : "—"}
        />
      </div>

      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex items-center gap-2 mb-2">
          <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
            Detalhe da tarefa
          </p>
        </div>
        {task ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">{task.title}</p>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_META[task.status].cls}`}>
                {STATUS_META[task.status].label}
              </span>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {Math.round(task.progress * 100)}%
              </span>
            </div>
            {task.description && (
              <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{task.description}</p>
            )}
            <Field label="Responsável" value={task.assigneeName ?? "—"} />
            <Field label="Prazo" value={task.dueAt ? new Date(task.dueAt).toLocaleDateString("pt-BR") : "—"} />
            <p className="text-[10px] text-muted-foreground/70 pt-1 border-t border-border">
              Read-only. Para editar, use o Portal.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Selecione uma tarefa no canvas para ver detalhes.
          </p>
        )}
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right font-medium truncate">{value}</span>
    </div>
  );
}

function EmptyHint({
  icon: Icon, title, text,
}: { icon: typeof Layers; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 gap-2">
      <div className="rounded-xl border border-border bg-background p-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{text}</p>
    </div>
  );
}
