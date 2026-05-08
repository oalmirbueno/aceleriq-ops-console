import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  FileText, Brain, Scale, ArrowRight, ExternalLink, Eye,
  CheckCircle2, Clock, Database, Hash,
} from "lucide-react";
import { usePortalQuery } from "@/v2/data/usePortalQuery";
import { portalClient, type BriefingSummary, type BriefingDetail } from "@/v2/data/portalClient";
import { QueryError, LoadingState } from "@/v2/components/QueryState";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

export default function ContextTabV2() {
  const { projectId = "" } = useParams();
  const [openDetail, setOpenDetail] = useState<BriefingSummary | null>(null);

  const { data: project } = usePortalQuery(
    () => projectId ? portalClient.getProject(projectId) : Promise.resolve(null),
    [projectId],
  );
  const projectClientId = project?.clientId;
  const projectClientName = project?.clientName;

  const { data: briefings, error, loading, reload } = usePortalQuery(
    // Lista todos os briefings — a resolução cliente-Portal↔OPS é feita no cliente.
    () => portalClient.listBriefings(),
    [],
  );

  const essential = resolveEssentialBriefing(
    briefings ?? [],
    projectClientId,
    projectClientName,
  );
  const opsClientIdForLink = essential?.opsClientId ?? essential?.clientId ?? projectClientId ?? "";

  return (
    <div className="space-y-8">
      <Section
        title="Briefings"
        description="Informações perenes do cliente. Fonte de verdade no Portal Aceleriq."
      >
        {loading || !projectClientId ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" />
          </div>
        ) : error ? (
          <QueryError error={error} onRetry={reload} />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            <EssentialBriefingCard
              opsClientId={opsClientIdForLink}
              summary={essential}
              onView={() => essential && setOpenDetail(essential)}
            />
            <FutureBriefingCard
              icon={Scale}
              title="Estruturação Empresarial"
              description="Mapa societário, governança, processos e organograma."
            />
            <FutureBriefingCard
              icon={Brain}
              title="Automação e IA"
              description="Oportunidades de automação, dados e agentes operacionais."
            />
          </div>
        )}
      </Section>

      <Section title="Memória" description="Histórico vivo do projeto.">
        <PendingBlock icon={Database} text="Memória estruturada chega na próxima fase." />
      </Section>

      <Section title="Decisões" description="Registros de decisões tomadas no projeto.">
        <PendingBlock icon={Scale} text="Registro de decisões chega na próxima fase." />
      </Section>

      <Section title="Próximos passos" description="O que vem agora neste projeto.">
        <PendingBlock icon={ArrowRight} text="Próximos passos chegam na próxima fase." />
      </Section>

      <BriefingDetailDialog
        open={!!openDetail}
        summary={openDetail}
        onClose={() => setOpenDetail(null)}
      />
    </div>
  );
}

function Section({
  title, description, children,
}: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function EssentialBriefingCard({
  opsClientId, summary, onView,
}: { opsClientId: string; summary: BriefingSummary | null; onView: () => void }) {
  const filled = !!summary?.isFilled;
  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-primary/10 p-2"><FileText className="h-4 w-4 text-primary" /></div>
          <div>
            <p className="text-sm font-medium text-foreground">Briefing Essencial</p>
            <p className="text-[11px] text-muted-foreground">Identidade perene do cliente</p>
          </div>
        </div>
        <StatusBadge filled={filled} />
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <Row icon={Clock} label="Atualizado" value={formatDate(summary?.updatedAt ?? null)} />
        <Row icon={Hash} label="Campos" value={summary ? String(summary.approxFields) : "—"} />
        <Row icon={Database} label="Tamanho" value={summary ? `${summary.contentLength.toLocaleString("pt-BR")} chars` : "—"} />
        <Row
          icon={CheckCircle2}
          label="Portal sync"
          value={summary?.hasLastPortalBriefingSync ? "sim" : summary ? "não" : "—"}
        />
        <Row
          icon={CheckCircle2}
          label="Raw responses"
          value={summary?.hasRawPortalResponses ? "sim" : summary ? "não" : "—"}
        />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onView}
          disabled={!filled}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Eye className="h-3.5 w-3.5" /> Ver detalhes
        </button>
        <a
          href={`/ops/clients/${opsClientId}`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Abrir no OPS antigo
        </a>
      </div>
    </div>
  );
}

function FutureBriefingCard({
  icon: Icon, title, description,
}: { icon: typeof FileText; title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-4 flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-muted p-2"><Icon className="h-4 w-4 text-muted-foreground" /></div>
          <div>
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="text-[11px] text-muted-foreground">{description}</p>
          </div>
        </div>
        <span className="rounded-full border border-border bg-background px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          Pendente
        </span>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Disponível em fase futura.</p>
    </div>
  );
}

function StatusBadge({ filled }: { filled: boolean }) {
  return filled ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
      <CheckCircle2 className="h-3 w-3" /> Preenchido
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
      <Clock className="h-3 w-3" /> Pendente
    </span>
  );
}

function Row({
  icon: Icon, label, value,
}: { icon: typeof FileText; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

function PendingBlock({ icon: Icon, text }: { icon: typeof FileText; text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
      <Icon className="h-4 w-4" /> {text}
    </div>
  );
}

function BriefingDetailDialog({
  open, summary, onClose,
}: { open: boolean; summary: BriefingSummary | null; onClose: () => void }) {
  const { data, error, loading } = usePortalQuery<BriefingDetail | null>(
    () => summary ? portalClient.getBriefing({ briefingId: summary.briefingId }) : Promise.resolve(null),
    [summary?.briefingId ?? ""],
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl w-full max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base">Briefing Essencial</DialogTitle>
          <DialogDescription className="text-xs">
            Visualização read-only. Para editar, use o OPS antigo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {loading && <LoadingState />}
          {error && <p className="text-xs text-destructive">{error.message}</p>}
          {data && <BriefingDetailBody detail={data} />}
          {!loading && !error && !data && (
            <p className="text-xs text-muted-foreground">Sem conteúdo disponível.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BriefingDetailBody({ detail }: { detail: BriefingDetail }) {
  const content = detail.content;
  return (
    <>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <Meta label="Atualizado" value={formatDate(detail.updatedAt)} />
        <Meta label="Portal sync" value={formatDate(detail.lastPortalBriefingSync)} />
        <Meta label="Status público" value={detail.publicBriefingStatus ?? "—"} />
        <Meta label="Review" value={detail.importReviewStatus ?? "—"} />
      </div>

      <ContentBlocks content={content} />

      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1">
        <p className="font-medium text-foreground">Dados técnicos</p>
        <p className="text-muted-foreground">
          Dados brutos do Portal: {detail.rawPortalResponses ? "disponíveis" : "não disponíveis"}
        </p>
        <p className="text-muted-foreground">
          Sinais estruturados: {detail.structuredSignals ? "disponíveis" : "não disponíveis"}
        </p>
        <p className="text-[10px] text-muted-foreground/70">
          Payloads técnicos não são exibidos nesta visualização.
        </p>
      </div>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-foreground">{value}</p>
    </div>
  );
}

function ContentBlocks({ content }: { content: unknown }) {
  if (content == null) {
    return <p className="text-xs text-muted-foreground">Sem conteúdo.</p>;
  }
  if (typeof content === "string") {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-xs whitespace-pre-wrap text-foreground">{content}</p>
      </div>
    );
  }
  if (typeof content === "object") {
    const HIDDEN_KEYS = new Set([
      "raw_portal_responses",
      "structured_signals",
      "last_portal_briefing_sync",
      "raw_portal_response",
      "portal_raw",
    ]);
    const MAX_VALUE_CHARS = 4000;
    const entries = Object.entries(content as Record<string, unknown>).filter(
      ([key, val]) => {
        if (HIDDEN_KEYS.has(key)) return false;
        // Hide oversized technical payloads
        if (val && typeof val === "object") {
          try {
            if (JSON.stringify(val).length > MAX_VALUE_CHARS) return false;
          } catch { return false; }
        }
        return true;
      },
    );
    if (entries.length === 0) {
      return <p className="text-xs text-muted-foreground">Sem campos.</p>;
    }
    return (
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <div key={key} className="rounded-lg border border-border bg-card p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{key}</p>
            <div className="mt-1 text-xs text-foreground">
              {renderValue(val)}
            </div>
          </div>
        ))}
      </div>
    );
  }
  return <p className="text-xs text-foreground">{String(content)}</p>;
}

function renderValue(val: unknown): React.ReactNode {
  if (val == null) return <span className="text-muted-foreground">—</span>;
  if (typeof val === "string") return <span className="whitespace-pre-wrap">{val || "—"}</span>;
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <ul className="list-disc list-inside space-y-0.5">
        {val.map((item, i) => <li key={i}>{renderValue(item)}</li>)}
      </ul>
    );
  }
  return (
    <pre className="text-[11px] bg-muted/40 rounded p-2 overflow-x-auto">
      {JSON.stringify(val, null, 2)}
    </pre>
  );
}

/**
 * Resolve qual briefing essencial corresponde ao projeto.
 * Ordem (read-only, sem mutation):
 *   1. portalClientId === project.clientId
 *   2. clientId === project.clientId
 *   3. opsClientId === project.clientId
 *   4. match único por nome (clientName/company), só se não houver ambiguidade.
 */
function resolveEssentialBriefing(
  briefings: BriefingSummary[],
  projectClientId: string | undefined,
  projectClientName: string | undefined,
): BriefingSummary | null {
  const essentials = briefings.filter((b) => b.kind === "essential");
  if (essentials.length === 0) return null;

  if (projectClientId) {
    const byPortal = essentials.find((b) => b.portalClientId && b.portalClientId === projectClientId);
    if (byPortal) return byPortal;
    const byClientId = essentials.find((b) => b.clientId === projectClientId);
    if (byClientId) return byClientId;
    const byOps = essentials.find((b) => b.opsClientId === projectClientId);
    if (byOps) return byOps;
  }

  if (projectClientName) {
    const target = projectClientName.trim().toLowerCase();
    if (target && target !== "cliente") {
      const matches = essentials.filter((b) => {
        const a = (b.clientName ?? "").trim().toLowerCase();
        const c = (b.company ?? "").trim().toLowerCase();
        return a === target || c === target;
      });
      if (matches.length === 1) return matches[0];
    }
  }

  return null;
}
