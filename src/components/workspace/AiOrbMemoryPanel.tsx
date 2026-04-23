import { ScrollArea } from "@/components/ui/scroll-area";
import type { AiOrbMemoryEntry } from "./aiOrbConstants";

export default function AiOrbMemoryPanel({ memory }: { memory: AiOrbMemoryEntry[] }) {
  if (!memory.length) {
    return <p className="text-xs text-muted-foreground">Sem memória registrada ainda.</p>;
  }

  return (
    <ScrollArea className="h-32 rounded-md border border-border/70 bg-background/40 p-2">
      <div className="space-y-2">
        {memory.slice().reverse().map((entry, index) => (
          <div key={`${entry.timestamp}-${index}`} className="rounded-md border border-border/60 bg-card/70 p-2">
            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span>{entry.action}</span>
              <span>{new Date(entry.timestamp).toLocaleDateString("pt-BR")}</span>
            </div>
            <p className="text-xs leading-relaxed text-foreground/85">{entry.insight}</p>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}