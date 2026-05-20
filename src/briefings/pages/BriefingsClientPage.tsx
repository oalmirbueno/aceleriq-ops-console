import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Building2, Bot, Plus, ExternalLink, CheckCircle2, Clock, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { useBriefingClient, useClientBriefings, ensureClientWorkspace } from "@/briefings/data/useBriefings";
import GenerateBriefingLinkDialog from "@/components/workspace/GenerateBriefingLinkDialog";
import { BRIEFING_KIND_LABELS, type BriefingKind } from "@/lib/briefingToken";

const KIND_META: Record<BriefingKind, { label: string; icon: typeof Building2; description: string }> = {
  enterprise_structuring: {
    label: BRIEFING_KIND_LABELS.enterprise_structuring,
    icon: Building2,
    description: "12 blocos sobre empresa, oferta, operação e prioridades.",
  },
  ai_automation: {
    label: BRIEFING_KIND_LABELS.ai_automation,
    icon: Bot,
    description: "Blocos sobre processos, ferramentas e oportunidades de IA.",
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function BriefingsClientPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { data: client, isLoading: loadingClient } = useBriefingClient(clientId);
  const { data: entries, isLoading: loadingEntries } = useClientBriefings(clientId);

  const [openDialog, setOpenDialog] = useState<BriefingKind | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const groupedByKind = useMemo(() => {
    const map: Record<BriefingKind, ReturnType<typeof Object> | typeof entries> = {
      enterprise_structuring: [],
      ai_automation: [],
    } as never;
    for (const e of entries ?? []) {
      (map as Record<string, typeof entries>)[e.briefingKind] ??= [];
      ((map as Record<string, typeof entries>)[e.briefingKind] as NonNullable<typeof entries>).push(e);
    }
    return map as Record<BriefingKind, NonNullable<typeof entries>>;
  }, [entries]);

  async function handleOpen(kind: BriefingKind) {
    if (!client) return;
    try {
      const wsId = await ensureClientWorkspace(client.id as string, client.name as string);
      setWorkspaceId(wsId);
      setOpenDialog(kind);
    } catch (e) {
      toast({ title: "Erro ao preparar workspace", description: (e as Error).message, variant: "destructive" });
    }
  }

  if (loadingClient) {
    return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">Carregando…</div>;
  }
  if (!client) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Link to="/briefings" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <p className="mt-6">Cliente não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <button
        onClick={() => navigate("/briefings")}
        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Todos os clientes
      </button>

      <div className="flex items-center gap-4 mb-10">
        <div className="h-14 w-14 rounded-xl bg-muted/40 border border-border/60 grid place-items-center overflow-hidden shrink-0">
          {client.logo_url ? (
            <img src={client.logo_url as string} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="text-xl font-semibold text-muted-foreground">
              {(client.name as string).slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">{client.name as string}</h1>
          {client.company_name && (
            <p className="text-sm text-muted-foreground truncate">{client.company_name as string}</p>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {(Object.keys(KIND_META) as BriefingKind[]).map((kind) => {
          const meta = KIND_META[kind];
          const Icon = meta.icon;
          const list = groupedByKind[kind] ?? [];
          return (
            <section key={kind} className="rounded-xl border border-border bg-card">
              <header className="flex items-center justify-between px-5 py-4 border-b border-border/60">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 grid place-items-center shrink-0">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-medium">{meta.label}</h2>
                    <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => handleOpen(kind)} className="gap-1.5 shrink-0">
                  <Plus className="h-3.5 w-3.5" /> Gerar link
                </Button>
              </header>

              {loadingEntries ? (
                <div className="px-5 py-6 text-xs text-muted-foreground">Carregando…</div>
              ) : list.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <FileText className="h-6 w-6 text-muted-foreground/60 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum briefing enviado ainda.</p>
                </div>
              ) : (
                <ul className="divide-y divide-border/60">
                  {list.map((b) => {
                    const isSubmitted = b.status === "submitted";
                    return (
                      <li key={b.id} className="px-5 py-3 flex items-center gap-4 hover:bg-muted/20 transition-colors">
                        <Badge
                          variant="outline"
                          className={`gap-1 shrink-0 ${isSubmitted ? "border-primary/40 text-primary" : "border-border text-muted-foreground"}`}
                        >
                          {isSubmitted ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                          {isSubmitted ? "Respondido" : "Rascunho"}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate">{b.title}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {isSubmitted
                              ? `Enviado em ${formatDate(b.submittedAt ?? b.updated_at)}`
                              : `${b.answeredCount}/${b.totalQuestions || "?"} respostas · iniciado ${formatDate(b.created_at)}`}
                          </p>
                        </div>
                        {isSubmitted && (
                          <Link to={`/briefings/${client.id as string}/${b.id}`}>
                            <Button size="sm" variant="ghost" className="gap-1.5">
                              Ver resposta <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      {workspaceId && openDialog && (
        <GenerateBriefingLinkDialog
          open={!!openDialog}
          onOpenChange={(v) => { if (!v) setOpenDialog(null); }}
          workspaceId={workspaceId}
          clientId={client.id as string}
          clientName={client.name as string}
          defaultBriefingType={openDialog}
        />
      )}
    </div>
  );
}