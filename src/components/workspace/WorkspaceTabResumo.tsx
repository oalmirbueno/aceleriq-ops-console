import { FileText, Clock, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStagePremiumLabel } from "./aceleraConstants";

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  happened_at: string;
}

interface WorkspaceTabResumoProps {
  clientName: string;
  workspaceName: string;
  status: string;
  currentStage: string;
  ownerName: string | null;
  summary: string | null;
  recentEvents: TimelineEvent[];
}

export default function WorkspaceTabResumo({
  clientName, workspaceName, status, currentStage, ownerName, summary, recentEvents,
}: WorkspaceTabResumoProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 animate-fade-in">
      {/* Dados do workspace */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Informações
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Cliente" value={clientName} />
          <Row label="Workspace" value={workspaceName} />
          <Row label="Status" value={status} />
          <Row label="Etapa" value={currentStage.replace("_", " ")} capitalize />
          <Row label="Responsável" value={ownerName ?? "Não atribuído"} muted={!ownerName} />
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Resumo executivo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {summary ? (
            <p className="text-sm text-foreground whitespace-pre-line">{summary}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum resumo registrado ainda.</p>
          )}
        </CardContent>
      </Card>

      {/* Próximos passos placeholder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-muted-foreground" />
            Próximos passos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhum próximo passo definido ainda.</p>
        </CardContent>
      </Card>

      {/* Últimos eventos */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Últimos eventos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          ) : (
            <div className="space-y-2">
              {recentEvents.slice(0, 5).map((ev) => (
                <div key={ev.id} className="flex gap-2 text-sm">
                  <div className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                  <div>
                    <p className="text-foreground">{ev.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(ev.happened_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, muted, capitalize }: { label: string; value: string; muted?: boolean; capitalize?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${muted ? "text-muted-foreground" : "text-foreground"} ${capitalize ? "capitalize" : ""}`}>
        {value}
      </span>
    </div>
  );
}
