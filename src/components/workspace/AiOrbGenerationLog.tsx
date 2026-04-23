import type { AiOrbData } from "./aiOrbConstants";

export default function AiOrbGenerationLog({ data }: { data: AiOrbData }) {
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div className="rounded-md border border-border/70 bg-background/40 p-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Gerações</p>
        <p className="text-sm font-semibold text-foreground">{data.generationCount ?? 0}</p>
      </div>
      <div className="rounded-md border border-border/70 bg-background/40 p-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Engine</p>
        <p className="truncate text-sm font-semibold text-foreground">{data.aiEngine}</p>
      </div>
      <div className="rounded-md border border-border/70 bg-background/40 p-2">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Nodes</p>
        <p className="text-sm font-semibold text-foreground">{data.generatedNodeIds?.length ?? 0}</p>
      </div>
    </div>
  );
}