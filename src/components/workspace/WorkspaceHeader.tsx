import { User, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStagePremiumLabel, PIPELINE_STAGES_ORDERED } from "./aceleraConstants";
import { getPlanDefinition } from "./aceleraConstants";

const STAGES: string[] = [...PIPELINE_STAGES_ORDERED];

interface WorkspaceHeaderProps {
  clientName: string;
  ownerName: string | null;
  status: string;
  currentStage: string;
  changingStage: boolean;
  onStageChange: (stage: string) => void;
  planName?: string | null;
}

export default function WorkspaceHeader({
  clientName, ownerName, status, currentStage, changingStage, onStageChange, planName,
}: WorkspaceHeaderProps) {
  const stageIdx = (s: string) => STAGES.indexOf(s);
  const current = stageIdx(currentStage);
  const plan = getPlanDefinition(planName);

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="label-sm mb-2">Workspace em execução</p>
          <h1 className="truncate text-3xl font-semibold tracking-tight text-foreground">{clientName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline" className="h-7 px-3 text-xs">{status}</Badge>
            {plan && <Badge className="h-7 border-primary/30 bg-primary/15 px-3 text-xs text-primary">{plan.label}</Badge>}
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/40 px-3 py-1.5">
              {ownerName ? ownerName : <><User className="h-3.5 w-3.5" /> Não atribuído</>}
            </span>
          </div>
        </div>

        <div className="w-full xl:w-[360px]">
          <span className="label-sm mb-2 block">Etapa atual</span>
          <Select value={currentStage} onValueChange={onStageChange} disabled={changingStage}>
            <SelectTrigger className="h-11 w-full text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{getStagePremiumLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s} className="flex shrink-0 items-center gap-2">
              {i > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground/40" />}
              <span
                className={`rounded-md px-3.5 py-2 text-sm transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-semibold border border-primary/30"
                    : done
                      ? "bg-primary/5 text-primary/70"
                      : "text-muted-foreground"
                }`}
              >
                {getStagePremiumLabel(s)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
