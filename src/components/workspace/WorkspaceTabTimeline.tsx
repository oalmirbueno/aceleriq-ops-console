import { useMemo, useState } from "react";
import { ArrowRight, BarChart3, CheckCircle2, Clock, FileText, Sparkles, Upload, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TimelineEvent { id: string; event_type: string; title: string; description: string | null; happened_at: string; created_at: string; }
interface Props { events: TimelineEvent[]; }

const EVENT_CONFIG: Record<string, { icon: typeof Clock; dot: string; label: string }> = {
  stage_changed: { icon: ArrowRight, dot: "bg-info", label: "Etapa" },
  task_created: { icon: FileText, dot: "bg-muted-foreground", label: "Task" },
  task_completed: { icon: CheckCircle2, dot: "bg-primary", label: "Concluída" },
  briefing_reviewed: { icon: UserCheck, dot: "bg-primary", label: "Revisão" },
  briefing_imported: { icon: Upload, dot: "bg-warning", label: "Import" },
  fronts_generated: { icon: Sparkles, dot: "bg-primary", label: "Geração" },
  context_created: { icon: FileText, dot: "bg-info", label: "Contexto" },
  metric_added: { icon: BarChart3, dot: "bg-primary", label: "Métrica" },
};
const DEFAULT_CONFIG = { icon: Clock, dot: "bg-muted-foreground", label: "Evento" };
const getConfig = (type: string) => EVENT_CONFIG[type] ?? DEFAULT_CONFIG;

function formatDate(dateStr: string) { return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
function formatDay(dateStr: string) { return new Date(dateStr).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }); }
function formatTime(dateStr: string) { return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
function dayKey(dateStr: string) { return new Date(dateStr).toISOString().slice(0, 10); }

export default function WorkspaceTabTimeline({ events }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const grouped = useMemo(() => events.reduce<Array<{ key: string; label: string; events: TimelineEvent[] }>>((acc, event) => {
    const key = dayKey(event.happened_at);
    const group = acc.find((item) => item.key === key);
    if (group) group.events.push(event);
    else acc.push({ key, label: formatDay(event.happened_at), events: [event] });
    return acc;
  }, []), [events]);
  const visibleEvents = selectedId ? events.filter((event) => event.id === selectedId) : events;

  if (events.length === 0) return <div className="flex flex-col items-center justify-center py-20 page-enter"><Clock className="mb-4 h-10 w-10 text-muted-foreground" /><p className="text-sm font-medium text-foreground">Nenhum evento registrado</p><p className="text-xs text-muted-foreground">Eventos aparecerão aqui conforme a operação avança.</p></div>;

  return (
    <div className="page-enter space-y-6">
      <section className="surface-2 rounded-lg p-5">
        <div className="mb-4 flex items-center justify-between gap-3"><p className="label-sm">Linha do tempo visual</p><span className="text-xs text-muted-foreground">{events.length} eventos</span></div>
        <div className="relative overflow-x-auto pb-4">
          <div className="absolute left-8 right-8 top-[46px] h-px bg-border/70" />
          <div className="flex min-w-max gap-8 px-2">
            {events.slice(0, 14).reverse().map((event) => {
              const cfg = getConfig(event.event_type);
              const active = selectedId === event.id;
              return (
                <button key={event.id} onClick={() => setSelectedId(active ? null : event.id)} className="relative w-28 scroll-ml-4 text-center">
                  <p className="mb-4 text-[11px] text-muted-foreground">{formatDate(event.happened_at)}</p>
                  <span className={`mx-auto block h-4 w-4 rounded-full border-2 border-background ${cfg.dot} ${active ? "ring-4 ring-primary/20" : ""}`} />
                  <p className="mt-3 line-clamp-2 text-xs font-medium text-foreground">{event.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{cfg.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="surface-2 rounded-lg p-5">
        <div className="mb-4 flex items-center justify-between"><p className="label-sm">Histórico detalhado</p>{selectedId && <button onClick={() => setSelectedId(null)} className="text-xs text-primary">limpar filtro</button>}</div>
        <div className="space-y-6">
          {grouped.map((group) => {
            const groupEvents = group.events.filter((event) => visibleEvents.some((visible) => visible.id === event.id));
            if (groupEvents.length === 0) return null;
            return <div key={group.key}><div className="sticky top-[52px] z-10 mb-3 bg-card py-2 text-xs font-medium uppercase tracking-widest text-muted-foreground">{group.label}</div><div className="space-y-1">{groupEvents.map((event) => { const cfg = getConfig(event.event_type); const Icon = cfg.icon; return <button key={event.id} onClick={() => setSelectedId(event.id)} className="flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-secondary/50"><span className={`mt-1.5 h-2.5 w-2.5 rounded-full ${cfg.dot}`} /><Icon className="mt-0.5 h-4 w-4 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-medium text-foreground">{event.title}</p><Badge variant="outline" className="text-[11px]">{cfg.label}</Badge></div>{event.description && <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{event.description}</p>}</div><span className="shrink-0 text-xs text-muted-foreground">{formatTime(event.happened_at)}</span></button>; })}</div></div>;
          })}
        </div>
      </section>
    </div>
  );
}
