/**
 * NodePrefillStatus
 *
 * Banner no topo do drawer mostrando o estado do auto-preenchimento:
 *  - generating: IA está rascunhando agora
 *  - ready:      preenchido + timestamp + fontes
 *  - error:      falha + retry
 *  - empty:      nunca foi preenchido (drawer abre vazio com botão manual)
 */
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles, AlertCircle, RefreshCw, CheckCircle2 } from "lucide-react";
import type { NodePrefillPayload } from "../nodePrefillTypes";

interface Props {
  status: "generating" | "ready" | "error" | "empty";
  prefill?: NodePrefillPayload | null;
  errorMessage?: string;
  onGenerate: () => void;
  onRegenerate: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  briefing: "briefing IA",
  context:  "contextos",
  metrics:  "métricas",
  fronts:   "fronts",
  client:   "cliente",
  assets:   "anexos",
  siblings: "outros nodes",
};

export default function NodePrefillStatus({ status, prefill, errorMessage, onGenerate, onRegenerate }: Props) {
  if (status === "generating") {
    return (
      <div className="rounded-md border border-border bg-muted/10 px-3 py-2 flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin shrink-0" />
        <p className="text-xs text-muted-foreground flex-1">
          IA está rascunhando este node a partir do contexto do cliente...
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-md border border-border bg-muted/10 px-3 py-2 flex items-start gap-2">
        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">Falha ao auto-preencher: {errorMessage ?? "erro desconhecido"}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Você pode preencher manualmente ou tentar novamente.</p>
        </div>
        <Button size="sm" variant="outline" onClick={onRegenerate} className="h-6 text-[10px] gap-1 shrink-0">
          <RefreshCw className="h-3 w-3" /> Tentar de novo
        </Button>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="rounded-md border border-dashed border-border bg-card/40 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
          <p className="text-xs text-muted-foreground">
            Pré-preencher este node automaticamente a partir do briefing, contextos e métricas?
          </p>
        </div>
        <Button size="sm" onClick={onGenerate} className="h-7 text-[11px] gap-1 shrink-0">
          <Sparkles className="h-3 w-3" /> Auto-preencher
        </Button>
      </div>
    );
  }

  // status === "ready"
  if (!prefill) return null;
  const when = new Date(prefill.generated_at);
  const sources = prefill.sources_used.map((s) => SOURCE_LABELS[s] ?? s).join(", ");
  return (
    <div className="rounded-md border border-border bg-muted/10 px-3 py-1.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <CheckCircle2 className="h-3 w-3 text-muted-foreground shrink-0" />
        <p className="text-[11px] text-muted-foreground truncate">
          Pré-preenchido <span className="text-foreground/80">{when.toLocaleString("pt-BR")}</span>
          {sources && <span className="opacity-70"> · fontes: {sources}</span>}
        </p>
        <Badge variant="outline" className="text-[9px] border-border text-muted-foreground shrink-0">
          {prefill.ai_model.split("/").pop()}
        </Badge>
      </div>
      <Button size="sm" variant="ghost" onClick={onRegenerate} className="h-6 text-[10px] gap-1 shrink-0">
        <RefreshCw className="h-3 w-3" /> Regenerar
      </Button>
    </div>
  );
}
