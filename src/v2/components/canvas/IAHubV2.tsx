import { useMemo } from "react";
import {
  Sparkles, X, FileText, ListChecks, Brain, Scale, ArrowRight, Lock,
  AlertTriangle, User, Calendar, CheckCircle2, Clock, Circle, Archive,
} from "lucide-react";
import type { PortalTask, PortalTaskStatus, PortalMilestone, BriefingSummary } from "@/v2/data/portalClient";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientName?: string;
  projectName?: string;
  milestone: PortalMilestone | null;
  selectedTask: PortalTask | null;
  upcomingTasks: PortalTask[];
  allTasks: PortalTask[];
  briefing: BriefingSummary | null;
}

const STATUS_LABEL: Record<PortalTaskStatus, string> = {
  todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueada", done: "Concluída", archived: "Arquivada",
};
const STATUS_ICON: Record<PortalTaskStatus, typeof Circle> = {
  todo: Circle, in_progress: Clock, blocked: AlertTriangle, done: CheckCircle2, archived: Archive,
};
const STATUS_TONE: Record<PortalTaskStatus, string> = {
  todo: "text-muted-foreground border-muted-foreground/30 bg-muted/20",
  in_progress: "text-primary border-primary/35 bg-primary/10",
  blocked: "text-destructive border-destructive/35 bg-destructive/10",
  done: "text-emerald-300 border-emerald-400/35 bg-emerald-400/10",
  archived: "text-muted-foreground/60 border-border bg-muted/10",
};

export default function IAHubV2({
  open, onOpenChange, clientName, projectName, milestone, selectedTask, upcomingTasks, allTasks, briefing,
}: Props) {
  const insights = useMemo(() => {
    const counts = allTasks.reduce<Record<PortalTaskStatus, number>>((acc, task) => {
      acc[task.status] += 1;
      return acc;
    }, { todo: 0, in_progress: 0, blocked: 0, done: 0, archived: 0 });
    const nextTask = upcomingTasks.find((t) => t.status === "in_progress") ??
      upcomingTasks.find((t) => t.status === "blocked") ??
      upcomingTasks.find((t) => t.status === "todo") ?? null;
    const blocked = allTasks.filter((t) => t.status === "blocked");
    const noOwner = allTasks.filter((t) => t.status !== "done" && t.status !== "archived" && !t.assigneeName);
    const noDue = allTasks.filter((t) => t.status !== "done" && t.status !== "archived" && !t.dueAt);
    return { counts, nextTask, blocked, noOwner, noDue };
  }, [allTasks, upcomingTasks]);

  return (
    <>
      <button
        onClick={() => onOpenChange(!open)}
        className="group relative h-12 w-12 rounded-full bg-gradient-to-br from-primary to-primary/60 shadow-2xl shadow-primary/30 grid place-items-center hover:scale-105 active:scale-95 transition-transform"
        aria-label="Abrir IA Hub"
        title="IA Hub"
      >
        <span className="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-60" />
        <span className="absolute inset-0.5 rounded-full bg-gradient-to-br from-primary to-primary/40" />
        <Sparkles className="relative h-5 w-5 text-primary-foreground drop-shadow" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-background/30 backdrop-blur-[2px] animate-fade-in"
            onClick={() => onOpenChange(false)}
          />
          <aside
            className="fixed right-0 top-0 bottom-0 z-[56] w-[430px] max-w-[94vw] bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right"
            style={{ animation: "slideInRight 0.22s ease-out both" }}
          >
            <div className="px-4 h-14 border-b border-border bg-gradient-to-r from-primary/10 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/50 grid place-items-center">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-none">IA Hub</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">análise operacional · read-only</p>
                </div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-border bg-primary/5 text-[11px] text-muted-foreground flex items-start gap-2">
              <Lock className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <span>Modo read-only: a IA Hub só organiza contexto e sugere próximos passos. Não cria, edita, arquiva ou muda status.</span>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <Section title="Contexto atual" icon={FileText}>
                <div className="space-y-1.5">
                  <Row label="Cliente" value={clientName ?? briefing?.clientName ?? "—"} />
                  <Row label="Projeto" value={projectName ?? "—"} />
                  <Row label="Milestone" value={milestone?.title ?? "Nenhum selecionado"} />
                  <Row label="Briefing" value={briefing ? (briefing.isFilled ? "Preenchido" : "Pendente") : "Não vinculado"} valueClass={briefing?.isFilled ? "text-primary" : "text-muted-foreground"} />
                </div>
              </Section>

              <Section title="Milestone atual" icon={ListChecks}>
                {milestone ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Metric label="Progresso" value={`${Math.round(milestone.progress * 100)}%`} />
                      <Metric label="Tarefas" value={`${milestone.tasksDoneCount}/${milestone.tasksCount}`} />
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(Object.keys(insights.counts) as PortalTaskStatus[]).map((status) => (
                        <StatusCount key={status} status={status} value={insights.counts[status]} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <Empty text="Selecione um milestone para ver progresso e tarefas reais." />
                )}
              </Section>

              <Section title="Próxima task real sugerida" icon={ArrowRight}>
                {insights.nextTask ? <TaskLine task={insights.nextTask} emphasis /> : <Empty text="Sem tarefas abertas neste milestone." />}
              </Section>

              <Section title="Bloqueios aparentes" icon={AlertTriangle}>
                {insights.blocked.length === 0 ? (
                  <Empty text="Nenhuma task marcada como bloqueada." />
                ) : (
                  <ul className="space-y-1.5">
                    {insights.blocked.slice(0, 4).map((t) => <TaskLine key={t.id} task={t} />)}
                  </ul>
                )}
              </Section>

              <Section title="Higiene operacional" icon={Brain}>
                <div className="grid grid-cols-2 gap-2">
                  <Metric label="Sem responsável" value={String(insights.noOwner.length)} tone={insights.noOwner.length ? "warn" : "ok"} />
                  <Metric label="Sem prazo" value={String(insights.noDue.length)} tone={insights.noDue.length ? "warn" : "ok"} />
                </div>
                {(insights.noOwner.length > 0 || insights.noDue.length > 0) && (
                  <p className="mt-2 text-[11px] text-muted-foreground leading-relaxed">
                    Sugestão read-only: revisar responsável e prazo das tarefas abertas antes de avançar execução.
                  </p>
                )}
              </Section>

              <Section title="Tarefa selecionada" icon={ArrowRight}>
                {selectedTask ? <TaskLine task={selectedTask} emphasis /> : <Empty text="Clique em um node para ver contexto específico da tarefa." />}
              </Section>

              <Section title="Decisões & Memória" icon={Scale}>
                <Empty text="Sem decisões/memórias estruturadas nesta visualização. Quando houver registros do Portal, eles entram aqui como fonte de contexto, não como ação automática." />
              </Section>
            </div>

            <div className="border-t border-border p-3 bg-card/60">
              <button
                disabled
                className="w-full rounded-md border border-border bg-background/40 px-3 h-9 text-xs text-muted-foreground inline-flex items-center justify-center gap-2 cursor-not-allowed opacity-60"
                title="Disponível na Fase 3"
              >
                <Sparkles className="h-3.5 w-3.5" /> Executar ação com IA
                <Lock className="h-3 w-3 ml-1" />
              </button>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
                Sugestões apenas. Execução e mutations seguem bloqueadas até a Fase 3.
              </p>
            </div>
          </aside>
          <style>{`
            @keyframes slideInRight {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
          `}</style>
        </>
      )}
    </>
  );
}

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Sparkles; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background/30 p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
      </div>
      {children}
    </section>
  );
}
function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground font-medium truncate max-w-[62%] text-right ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p>;
}
function Metric({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" }) {
  const cls = tone === "ok" ? "text-primary" : tone === "warn" ? "text-amber-300" : "text-foreground";
  return (
    <div className="rounded-md border border-border/60 bg-card/50 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${cls}`}>{value}</p>
    </div>
  );
}
function StatusCount({ status, value }: { status: PortalTaskStatus; value: number }) {
  const Icon = STATUS_ICON[status];
  return (
    <div className={`rounded-md border px-1.5 py-1 text-center ${STATUS_TONE[status]}`} title={STATUS_LABEL[status]}>
      <Icon className={`mx-auto h-3 w-3 ${status === "in_progress" ? "animate-spin" : ""}`} />
      <p className="mt-0.5 text-[10px] font-mono tabular-nums">{value}</p>
    </div>
  );
}
function TaskLine({ task, emphasis }: { task: PortalTask; emphasis?: boolean }) {
  return (
    <li className={`list-none rounded-md border px-2 py-1.5 ${emphasis ? "border-primary/35 bg-primary/10" : "border-border/60 bg-background/40"}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider shrink-0 ${STATUS_TONE[task.status]}`}>
          {STATUS_LABEL[task.status]}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-foreground font-medium leading-snug line-clamp-2">{task.title}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground inline-flex flex-wrap gap-x-1.5 gap-y-0.5">
            <span className="inline-flex items-center gap-1"><User className="h-2.5 w-2.5" />{task.assigneeName ?? "sem responsável"}</span>
            <span className="inline-flex items-center gap-1"><Calendar className="h-2.5 w-2.5" />{task.dueAt ? formatShort(task.dueAt) : "sem prazo"}</span>
          </p>
        </div>
      </div>
    </li>
  );
}
function formatShort(iso: string): string {
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
  catch { return iso; }
}
