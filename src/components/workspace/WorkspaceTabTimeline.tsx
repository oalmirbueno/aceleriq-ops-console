import { useState } from "react";
import {
  Clock, FileText, CheckCircle2, AlertTriangle, Layers, Plus,
  ArrowRight, Sparkles, Upload, UserCheck, BarChart3,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  happened_at: string;
  created_at: string;
}

interface Props {
  events: TimelineEvent[];
}

const EVENT_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  stage_changed: { icon: ArrowRight, color: "text-blue-400 bg-blue-400/15 border-blue-400/30", label: "Etapa" },
  task_created: { icon: Plus, color: "text-violet-400 bg-violet-400/15 border-violet-400/30", label: "Task" },
  task_completed: { icon: CheckCircle2, color: "text-emerald-400 bg-emerald-400/15 border-emerald-400/30", label: "Concluída" },
  briefing_reviewed: { icon: UserCheck, color: "text-amber-400 bg-amber-400/15 border-amber-400/30", label: "Revisão" },
  briefing_imported: { icon: Upload, color: "text-cyan-400 bg-cyan-400/15 border-cyan-400/30", label: "Import" },
  front_created: { icon: Layers, color: "text-primary bg-primary/15 border-primary/30", label: "Frente" },
  fronts_generated: { icon: Sparkles, color: "text-primary bg-primary/15 border-primary/30", label: "Geração" },
  context_created: { icon: FileText, color: "text-muted-foreground bg-muted/30 border-border", label: "Contexto" },
  metric_added: { icon: BarChart3, color: "text-emerald-400 bg-emerald-400/15 border-emerald-400/30", label: "Métrica" },
};

const DEFAULT_CONFIG = { icon: Clock, color: "text-muted-foreground bg-muted/30 border-border", label: "Evento" };

function getConfig(type: string) {
  return EVENT_CONFIG[type] ?? DEFAULT_CONFIG;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function groupByDate(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const map = new Map<string, TimelineEvent[]>();
  for (const ev of events) {
    const key = formatDate(ev.happened_at);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(ev);
  }
  return map;
}

export default function WorkspaceTabTimeline({ events }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
        <Clock className="h-10 w-10 text-muted-foreground mb-4" />
        <p className="text-sm font-medium text-foreground mb-1">Nenhum evento registrado</p>
        <p className="text-xs text-muted-foreground">Eventos aparecerão aqui conforme a operação avança.</p>
      </div>
    );
  }

  const grouped = groupByDate(events);

  return (
    <div className="animate-fade-in">
      {/* Stats bar */}
      <div className="flex items-center gap-6 mb-6 text-sm">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{events.length} eventos</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {Object.entries(
            events.reduce((acc, ev) => {
              const cfg = getConfig(ev.event_type);
              acc[cfg.label] = (acc[cfg.label] ?? 0) + 1;
              return acc;
            }, {} as Record<string, number>)
          ).slice(0, 4).map(([label, count]) => (
            <span key={label}>{label}: {count}</span>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />

        <div className="space-y-8">
          {Array.from(grouped.entries()).map(([date, dateEvents]) => (
            <div key={date}>
              {/* Date header */}
              <div className="relative flex items-center gap-3 mb-4">
                <div className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm font-semibold text-foreground">{date}</span>
                <span className="text-xs text-muted-foreground">({dateEvents.length} evento{dateEvents.length > 1 ? "s" : ""})</span>
              </div>

              {/* Events for this date */}
              <div className="space-y-3 ml-1">
                {dateEvents.map((ev) => {
                  const cfg = getConfig(ev.event_type);
                  const Icon = cfg.icon;
                  const isExpanded = expandedId === ev.id;

                  return (
                    <div
                      key={ev.id}
                      className="relative flex items-start gap-4 cursor-pointer group"
                      onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                    >
                      {/* Node */}
                      <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${cfg.color} transition-transform group-hover:scale-110`}>
                        <Icon className="h-4 w-4" />
                      </div>

                      {/* Content */}
                      <Card className={`flex-1 transition-colors ${isExpanded ? "border-primary/30" : "hover:border-primary/20"}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-medium text-foreground">{ev.title}</span>
                                <Badge variant="outline" className={`text-[11px] px-2 py-0.5 ${cfg.color}`}>
                                  {cfg.label}
                                </Badge>
                              </div>
                              {ev.description && (
                                <p className={`text-sm text-muted-foreground leading-relaxed ${isExpanded ? "" : "line-clamp-2"}`}>
                                  {ev.description}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                              {formatTime(ev.happened_at)}
                            </span>
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground space-y-1">
                              <div className="flex gap-4">
                                <span>Tipo: <span className="text-foreground">{ev.event_type}</span></span>
                                <span>Registrado: <span className="text-foreground">{new Date(ev.created_at).toLocaleString("pt-BR")}</span></span>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
