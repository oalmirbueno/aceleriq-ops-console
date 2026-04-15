import { User, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStagePremiumLabel, PIPELINE_STAGES_ORDERED } from "./aceleraConstants";
import { getPlanDefinition } from "./aceleraConstants";

const STAGES = [...PIPELINE_STAGES_ORDERED];

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
    <div className="space-y-4">
      {/* Info bar */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="label-sm">Status</span>
          <Badge variant="outline">{status}</Badge>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="label-sm">Etapa</span>
          <Select value={currentStage} onValueChange={onStageChange} disabled={changingStage}>
            <SelectTrigger className="h-8 w-[260px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGES.map((s) => (
                <SelectItem key={s} value={s}>{getStagePremiumLabel(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {plan && (
          <div className="flex items-center gap-2 text-sm">
            <span className="label-sm">Plano</span>
            <Badge className="bg-primary/15 text-primary border-primary/30">{plan.label}</Badge>
          </div>
        )}

        <div className="flex items-center gap-2 text-sm">
          <span className="label-sm">Responsável</span>
          {ownerName ? (
            <span className="text-foreground">{ownerName}</span>
          ) : (
            <span className="flex items-center gap-1 text-muted-foreground">
              <User className="h-3 w-3" /> Não atribuído
            </span>
          )}
        </div>
      </div>

      {/* Stage progress */}
      <div className="flex items-center gap-1 flex-wrap">
        {STAGES.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={s} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/40" />}
              <span
                className={`rounded-full px-3 py-1 text-xs transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-medium border border-primary/30"
                    : done
                      ? "bg-primary/5 text-primary/60"
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
