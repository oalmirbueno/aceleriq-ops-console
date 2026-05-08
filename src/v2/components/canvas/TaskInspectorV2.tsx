import {
  X, Lock, Calendar, User, Tag, GitBranch, ExternalLink,
  CheckCircle2, Clock, AlertTriangle, Archive, Loader2, Edit3, ArrowRightLeft, Trash2,
} from "lucide-react";
import type { PortalTask, PortalTaskStatus, PortalMilestone } from "@/v2/data/portalClient";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const STATUS_LABEL: Record<PortalTaskStatus, string> = {
  todo: "A fazer", in_progress: "Em curso", blocked: "Bloqueada", done: "Concluída", archived: "Arquivada",
};
const STATUS_PILL: Record<PortalTaskStatus, string> = {
  todo: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
  in_progress: "border-primary/40 bg-primary/10 text-primary",
  blocked: "border-destructive/40 bg-destructive/10 text-destructive",
  done: "border-emerald-400/40 bg-emerald-400/10 text-emerald-300",
  archived: "border-muted-foreground/20 bg-muted/20 text-muted-foreground/70",
};
const STATUS_ICON: Record<PortalTaskStatus, typeof Clock> = {
  todo: Clock, in_progress: Loader2, blocked: AlertTriangle, done: CheckCircle2, archived: Archive,
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

/**
 * TaskInspectorV2 — painel lateral premium ao clicar num node.
 * Read-only: ações de edição/status/delete aparecem desabilitadas com tooltip "Fase 3".
 */
export default function TaskInspectorV2({
  task, milestone, projectName, clientName, portalUrl, onClose,
}: {
  task: PortalTask | null;
  milestone: PortalMilestone | null;
  projectName?: string;
  clientName?: string;
  portalUrl: string;
  onClose: () => void;
}) {
  if (!task) {
    return (
      <div className="h-full flex flex-col">
        <Header onClose={onClose} title="Detalhes da tarefa" />
        <div className="flex-1 grid place-items-center px-6 text-center">
          <div className="space-y-2">
            <div className="mx-auto h-10 w-10 rounded-full border border-border bg-card grid place-items-center">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-sm text-foreground font-medium">Nenhuma tarefa selecionada</p>
            <p className="text-xs text-muted-foreground">Clique em um node do Canvas para ver detalhes completos.</p>
          </div>
        </div>
      </div>
    );
  }

  const Icon = STATUS_ICON[task.status];
  const taskUrl = `${portalUrl}/tasks/${task.id}`;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="h-full flex flex-col">
        <Header onClose={onClose} title="Tarefa" />

        <div className="flex-1 overflow-y-auto">
          {/* Cabeçalho da task */}
          <div className="px-4 pt-4 pb-3 border-b border-border space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1">
                {clientName ?? "Cliente"} · {projectName ?? "Projeto"}
              </p>
              <h3 className="text-base font-semibold text-foreground leading-snug">{task.title}</h3>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_PILL[task.status]}`}>
                <Icon className={`h-3 w-3 ${task.status === "in_progress" ? "animate-spin" : ""}`} />
                {STATUS_LABEL[task.status]}
              </span>
              <span className="text-[10px] text-muted-foreground tabular-nums font-mono">
                {Math.round(task.progress * 100)}%
              </span>
            </div>

            {/* Barra de progresso */}
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${Math.max(2, Math.round(task.progress * 100))}%` }}
              />
            </div>
          </div>

          {/* Descrição */}
          {task.description && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Descrição</p>
              <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">{task.description}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Detalhes</p>
            <MetaRow icon={User} label="Responsável" value={task.assigneeName ?? "—"} />
            <MetaRow icon={Calendar} label="Prazo" value={fmtDate(task.dueAt)} />
            <MetaRow icon={GitBranch} label="Milestone" value={milestone?.title ?? "—"} />
            <MetaRow icon={Tag} label="Atualizada" value={fmtDate(task.updatedAt)} />
          </div>

          {/* Contexto */}
          <div className="px-4 py-3 border-b border-border">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Contexto</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Tarefa do milestone <span className="text-foreground font-medium">{milestone?.title ?? "—"}</span>
              {projectName && <> no projeto <span className="text-foreground font-medium">{projectName}</span></>}
              {clientName && <> de <span className="text-foreground font-medium">{clientName}</span></>}.
              Fonte de verdade no Portal Aceleriq.
            </p>
          </div>

          {/* Ações */}
          <div className="px-4 py-3 space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5">Ações</p>
            <a
              href={taskUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 h-9 text-xs text-foreground hover:border-foreground/30 hover:bg-muted/50"
            >
              <span className="inline-flex items-center gap-2">
                <ExternalLink className="h-3.5 w-3.5" /> Abrir no Portal
              </span>
              <span className="text-muted-foreground">↗</span>
            </a>

            <BlockedActionRow icon={Edit3} label="Editar tarefa" />
            <BlockedActionRow icon={ArrowRightLeft} label="Mudar status" />
            <BlockedActionRow icon={Trash2} label="Arquivar" tone="destructive" />

            <p className="pt-2 mt-1 text-[10px] text-muted-foreground/70 inline-flex items-center gap-1">
              <Lock className="h-3 w-3" /> Read-only nesta fase. Mutations são liberadas na Fase 3.
            </p>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 h-12 border-b border-border bg-card/40 backdrop-blur-sm shrink-0">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{title}</p>
      <button
        onClick={onClose}
        className="h-7 w-7 grid place-items-center rounded-md hover:bg-muted/50 text-muted-foreground hover:text-foreground"
        aria-label="Fechar"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function MetaRow({ icon: Icon, label, value }: { icon: typeof Calendar; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs">
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </span>
      <span className="text-foreground font-medium truncate max-w-[60%] text-right">{value}</span>
    </div>
  );
}

function BlockedActionRow({
  icon: Icon, label, tone = "default",
}: { icon: typeof Edit3; label: string; tone?: "default" | "destructive" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          disabled
          className={`w-full inline-flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 h-9 text-xs cursor-not-allowed opacity-60 ${
            tone === "destructive" ? "text-destructive/80" : "text-muted-foreground"
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <Icon className="h-3.5 w-3.5" /> {label}
          </span>
          <Lock className="h-3 w-3" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs">
        Disponível na Fase 3
      </TooltipContent>
    </Tooltip>
  );
}