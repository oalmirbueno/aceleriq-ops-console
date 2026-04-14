interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  happened_at: string;
}

interface WorkspaceTabTimelineProps {
  events: TimelineEvent[];
}

export default function WorkspaceTabTimeline({ events }: WorkspaceTabTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Nenhum evento registrado.</p>;
  }

  return (
    <div className="space-y-3 animate-fade-in">
      {events.map((ev) => (
        <div key={ev.id} className="flex gap-3 text-sm">
          <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/40" />
          <div>
            <p className="font-medium text-foreground">{ev.title}</p>
            {ev.description && <p className="text-xs text-muted-foreground">{ev.description}</p>}
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {new Date(ev.happened_at).toLocaleString("pt-BR")}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
