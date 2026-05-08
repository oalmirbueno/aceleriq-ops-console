import { useState } from "react";
import {
  Sparkles, X, FileText, ListChecks, Brain, Scale, ArrowRight, Lock,
  CheckCircle2, Loader2, Clock,
} from "lucide-react";
import type { PortalTask, PortalMilestone, BriefingSummary } from "@/v2/data/portalClient";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientName?: string;
  projectName?: string;
  milestone: PortalMilestone | null;
  selectedTask: PortalTask | null;
  upcomingTasks: PortalTask[];
  briefing: BriefingSummary | null;
}

export default function IAHubV2({
  open, onOpenChange, clientName, projectName, milestone, selectedTask, upcomingTasks, briefing,
}: Props) {
  return (
    <>
      {/* Floating orb */}
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

      {/* Side panel (slide-in) */}
      {open && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-background/30 backdrop-blur-[2px] animate-fade-in"
            onClick={() => onOpenChange(false)}
          />
          <aside
            className="fixed right-0 top-0 bottom-0 z-[56] w-[400px] max-w-[92vw] bg-card border-l border-border shadow-2xl flex flex-col animate-slide-in-right"
            style={{ animation: "slideInRight 0.22s ease-out both" }}
          >
            {/* Header */}
            <div className="px-4 h-14 border-b border-border bg-gradient-to-r from-primary/10 to-transparent flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="relative h-8 w-8 rounded-full bg-gradient-to-br from-primary to-primary/50 grid place-items-center">
                  <Sparkles className="h-4 w-4 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground leading-none">IA Hub</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">read-only · fase 2</p>
                </div>
              </div>
              <button
                onClick={() => onOpenChange(false)}
                className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Briefing */}
              <Section title="Briefing essencial" icon={FileText}>
                {briefing ? (
                  <div className="space-y-1.5">
                    <Row label="Cliente" value={briefing.clientName} />
                    {briefing.company && <Row label="Empresa" value={briefing.company} />}
                    <Row label="Campos" value={`${briefing.approxFields} preenchidos`} />
                    <Row
                      label="Status"
                      value={briefing.isFilled ? "Preenchido" : "Pendente"}
                      valueClass={briefing.isFilled ? "text-primary" : "text-muted-foreground"}
                    />
                  </div>
                ) : (
                  <Empty text="Sem briefing essencial vinculado a este projeto." />
                )}
              </Section>

              {/* Milestone atual */}
              <Section title="Milestone atual" icon={ListChecks}>
                {milestone ? (
                  <div className="space-y-1.5">
                    <Row label="Título" value={milestone.title} />
                    <Row label="Status" value={statusMs(milestone.status)} />
                    <Row label="Tarefas" value={`${milestone.tasksDoneCount}/${milestone.tasksCount}`} />
                  </div>
                ) : (
                  <Empty text="Nenhum milestone selecionado." />
                )}
              </Section>

              {/* Task selecionada */}
              <Section title="Tarefa selecionada" icon={ArrowRight}>
                {selectedTask ? (
                  <div className="space-y-1.5">
                    <p className="text-xs text-foreground font-medium leading-snug">{selectedTask.title}</p>
                    <Row label="Status" value={statusTask(selectedTask.status)} />
                    {selectedTask.assigneeName && <Row label="Responsável" value={selectedTask.assigneeName} />}
                  </div>
                ) : (
                  <Empty text="Clique em um node do Canvas para destacar uma tarefa aqui." />
                )}
              </Section>

              {/* Próximas ações */}
              <Section title="Próximas ações sugeridas" icon={Brain}>
                {upcomingTasks.length === 0 ? (
                  <Empty text="Sem tarefas pendentes neste milestone." />
                ) : (
                  <ul className="space-y-1.5">
                    {upcomingTasks.slice(0, 5).map((t) => (
                      <li
                        key={t.id}
                        className="flex items-start gap-2 px-2 py-1.5 rounded-md border border-border/60 bg-background/40"
                      >
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-foreground truncate">{t.title}</p>
                          <p className="text-[10px] text-muted-foreground">{statusTask(t.status)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {/* Decisões / Memória */}
              <Section title="Decisões & Memória" icon={Scale}>
                <Empty text="Nenhuma decisão registrada ainda. Quando houver registros no Portal, aparecem aqui." />
              </Section>

              <div className="pt-2 text-[10px] text-muted-foreground/70 inline-flex items-center gap-1">
                <Lock className="h-3 w-3" /> Perguntar à IA é liberado na Fase 3.
              </div>
            </div>

            <div className="border-t border-border p-3 bg-card/60">
              <button
                disabled
                className="w-full rounded-md border border-border bg-background/40 px-3 h-9 text-xs text-muted-foreground inline-flex items-center justify-center gap-2 cursor-not-allowed opacity-60"
                title="Disponível na Fase 3"
              >
                <Sparkles className="h-3.5 w-3.5" /> Perguntar à IA
                <Lock className="h-3 w-3 ml-1" />
              </button>
              <p className="mt-1.5 text-center text-[10px] text-muted-foreground/70">
                {clientName && projectName ? `${clientName} · ${projectName}` : "OPS V2"}
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
      <span className={`text-foreground font-medium truncate max-w-[60%] text-right ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-muted-foreground leading-relaxed">{text}</p>;
}
function statusMs(s: PortalMilestone["status"]): string {
  return ({ planned: "Planejado", in_progress: "Em curso", done: "Concluído", paused: "Pausado" } as const)[s];
}
function statusTask(s: PortalTask["status"]): string {
  return ({ todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueada", done: "Concluída", archived: "Arquivada" } as const)[s];
}

// suppress unused
void CheckCircle2; void Loader2; void Clock;