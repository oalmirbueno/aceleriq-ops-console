/**
 * BriefingConsolidatedView
 *
 * Renders a consolidated briefing for a client, generating it on demand
 * via the `consolidate-briefing` edge function. Supports:
 *  - On first mount: tries to load cached version; if none, shows "Gerar agora" CTA
 *  - "Regenerar" button to force re-run with latest context
 *  - Download menu: PDF / Markdown / JSON / TXT
 *  - Per-answer source badge (cliente / IA / a definir / dados)
 *  - Next actions list
 *
 * Used in two places:
 *  1. ProjectNodeDrawer (when node_type === "briefing")
 *  2. WorkspaceTabContexto header (briefing section)
 */
import { useEffect, useState, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Sparkles, RefreshCw, Download, FileText, FileJson, FileType,
  Loader2, AlertCircle, CheckCircle2, ChevronDown, BadgeCheck,
  HelpCircle, Bot, User, Database,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  exportBriefingPdf, exportBriefingMarkdown, exportBriefingJson, exportBriefingTxt,
  type ConsolidatedBriefing, type BriefingAnswer,
} from "@/lib/briefingExport";

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  /** Compact mode: tighter spacing, no card chrome — for use inside drawers. */
  compact?: boolean;
}

const SOURCE_META: Record<BriefingAnswer["source"], { label: string; cls: string; icon: typeof User }> = {
  client:      { label: "Cliente",        cls: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10", icon: User },
  ai_inferred: { label: "IA inferiu",     cls: "border-violet-500/40 text-violet-400 bg-violet-500/10",   icon: Bot },
  to_define:   { label: "A definir",      cls: "border-amber-500/40 text-amber-400 bg-amber-500/10",      icon: HelpCircle },
  data:        { label: "Dados sistema",  cls: "border-sky-500/40 text-sky-400 bg-sky-500/10",            icon: Database },
};

const CONFIDENCE_CLS: Record<BriefingAnswer["confidence"], string> = {
  high:   "text-emerald-400",
  medium: "text-amber-400",
  low:    "text-rose-400",
};

export default function BriefingConsolidatedView({ workspaceId, clientId, clientName, compact = false }: Props) {
  const [briefing, setBriefing] = useState<ConsolidatedBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);

  const callConsolidate = useCallback(
    async (force: boolean, cacheOnly: boolean) => {
      const { data, error } = await supabase.functions.invoke("consolidate-briefing", {
        body: { workspaceId, clientId, force, cacheOnly },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { consolidated: ConsolidatedBriefing | null; cached: boolean };
    },
    [workspaceId, clientId],
  );

  // Try cache on mount
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    callConsolidate(false, true)
      .then((res) => {
        if (cancelled) return;
        if (res.consolidated) {
          setBriefing(res.consolidated);
          setCached(res.cached);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erro ao carregar");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [callConsolidate]);

  const handleGenerate = async (force: boolean) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await callConsolidate(force, false);
      if (res.consolidated) {
        setBriefing(res.consolidated);
        setCached(false);
        toast({
          title: force ? "Briefing regenerado" : "Briefing gerado",
          description: `${res.consolidated.sections.length} seções · ${res.consolidated.next_actions.length} próximas ações`,
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro inesperado";
      setError(msg);
      toast({ title: "Falha na geração", description: msg, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleExport = (format: "pdf" | "md" | "json" | "txt") => {
    if (!briefing) return;
    try {
      if (format === "pdf") exportBriefingPdf(briefing, clientName);
      else if (format === "md") exportBriefingMarkdown(briefing, clientName);
      else if (format === "json") exportBriefingJson(briefing, clientName);
      else exportBriefingTxt(briefing, clientName);
      toast({ title: "Download iniciado", description: format.toUpperCase() });
    } catch (e) {
      toast({ title: "Erro no download", description: e instanceof Error ? e.message : "—", variant: "destructive" });
    }
  };

  const stats = useMemo(() => {
    if (!briefing) return null;
    let total = 0, fromClient = 0, fromAi = 0, toDefine = 0;
    briefing.sections.forEach((s) => {
      s.answers.forEach((a) => {
        total++;
        if (a.source === "client") fromClient++;
        else if (a.source === "ai_inferred") fromAi++;
        else if (a.source === "to_define") toDefine++;
      });
    });
    return { total, fromClient, fromAi, toDefine };
  }, [briefing]);

  // ── Empty state (no cache, never generated)
  if (loading && !briefing) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        <span className="text-sm">Carregando briefing consolidado...</span>
      </div>
    );
  }

  if (!briefing) {
    return (
      <Card className={compact ? "border-dashed" : ""}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Briefing consolidado por IA
          </CardTitle>
          <CardDescription>
            A IA reúne tudo que foi preenchido (formulário, contextos importados, anexos, métricas, dados do cliente),
            reescreve em tom profissional, preenche lacunas e organiza por seções.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="text-xs text-destructive mb-3 flex items-center gap-1.5">
              <AlertCircle className="h-3.5 w-3.5" /> {error}
            </div>
          )}
          <Button onClick={() => handleGenerate(false)} disabled={generating} size="sm">
            {generating ? (
              <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Gerando com IA...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 mr-1" /> Gerar briefing consolidado</>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const headerNode = (
    <div className="flex items-start justify-between gap-3 flex-wrap">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Briefing consolidado</h3>
          {cached && <Badge variant="outline" className="text-[9px]">cache</Badge>}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{briefing.client_summary}</p>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span>Gerado: {new Date(briefing.generated_at).toLocaleString("pt-BR")}</span>
          <span>Modelo: <code className="font-mono">{briefing.ai_model}</code></span>
          {stats && (
            <span>
              {stats.fromClient} cliente · {stats.fromAi} IA · {stats.toDefine} a definir
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button size="sm" variant="outline" onClick={() => handleGenerate(true)} disabled={generating}>
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          <span className="ml-1 hidden sm:inline text-xs">Regenerar</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="default">
              <Download className="h-3.5 w-3.5 mr-1" />
              Baixar
              <ChevronDown className="h-3 w-3 ml-1 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Formato</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => handleExport("pdf")}>
              <FileText className="h-3.5 w-3.5 mr-2 text-rose-400" /> PDF (formatado)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport("md")}>
              <FileType className="h-3.5 w-3.5 mr-2 text-blue-400" /> Markdown (.md)
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => handleExport("json")}>
              <FileJson className="h-3.5 w-3.5 mr-2 text-amber-400" /> JSON estruturado
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => handleExport("txt")}>
              <FileText className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Texto puro (.txt)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  const sectionsNode = (
    <div className="space-y-4">
      {briefing.sections.map((s, idx) => (
        <div key={idx} className="rounded-lg border border-border bg-card/40 p-3">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10px] font-mono text-primary opacity-70">{String(idx + 1).padStart(2, "0")}</span>
            <h4 className="text-sm font-semibold">{s.title}</h4>
          </div>
          {s.description && <p className="text-[11px] text-muted-foreground mb-3">{s.description}</p>}
          <div className="space-y-2.5">
            {s.answers.map((a, aIdx) => {
              const meta = SOURCE_META[a.source];
              const Icon = meta.icon;
              return (
                <div key={aIdx} className="rounded-md border border-border/60 bg-background/40 p-2.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-xs font-medium text-foreground flex-1">{a.question}</p>
                    <Badge variant="outline" className={`shrink-0 text-[9px] ${meta.cls} flex items-center gap-1 px-1.5 py-0`}>
                      <Icon className="h-2.5 w-2.5" />
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{a.answer}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[9px]">
                    <span className={CONFIDENCE_CLS[a.confidence]}>● confiança {a.confidence}</span>
                    {a.citation && <span className="text-muted-foreground italic truncate">ref: {a.citation}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {briefing.next_actions?.length > 0 && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-semibold">Próximas ações sugeridas</h4>
          </div>
          <ol className="space-y-1.5 text-xs">
            {briefing.next_actions.map((act, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="font-mono text-[10px] text-primary mt-0.5 shrink-0">{i + 1}.</span>
                <span className="text-foreground/90">{act}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <div className="space-y-3">
        {headerNode}
        <Separator />
        <ScrollArea className="max-h-[60vh] pr-3">
          {sectionsNode}
        </ScrollArea>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">{headerNode}</CardHeader>
      <CardContent>{sectionsNode}</CardContent>
    </Card>
  );
}
