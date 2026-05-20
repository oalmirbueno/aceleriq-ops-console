import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useBriefingClient, useBriefingEntry } from "@/briefings/data/useBriefings";
import BriefingConsolidatedView from "@/components/workspace/BriefingConsolidatedView";

export default function BriefingsAnswerPage() {
  const { clientId, entryId } = useParams<{ clientId: string; entryId: string }>();
  const { data: client } = useBriefingClient(clientId);
  const { data: entry, isLoading } = useBriefingEntry(entryId);

  if (isLoading) {
    return <div className="mx-auto max-w-4xl px-6 py-10 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!entry || !client) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link to={`/briefings/${clientId}`} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <p className="mt-6">Resposta não encontrada.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        to={`/briefings/${clientId}`}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {client.name as string}
      </Link>

      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">{entry.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Resposta consolidada — gere ou regenere a versão executiva abaixo.
        </p>
      </header>

      <BriefingConsolidatedView
        workspaceId={entry.workspace_id}
        clientId={entry.client_id}
        clientName={client.name as string}
      />
    </div>
  );
}