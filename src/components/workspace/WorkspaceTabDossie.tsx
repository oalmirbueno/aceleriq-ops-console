/**
 * WorkspaceTabDossie — hub de conhecimento estruturado do cliente.
 *
 * Seções:
 *  1. Contrato operacional — plano, frentes, addons, serviços avulsos
 *  2. Central de briefings — cada briefing abre Sheet com preview/download
 *  3. Blocos de conhecimento — 8 áreas, collapsible, 2 colunas
 *  4. Plano operacional ativo — tasks
 */
import { useState, useEffect, useCallback } from "react";
import {
  FileText, Building2, Target, ShoppingCart, Settings, Globe, Key,
  Search, Scale, ClipboardList, Shield, Zap, Package, AlertTriangle,
  Lightbulb, Loader2, ChevronDown, ChevronRight, CheckCircle2, Circle,
  Download, Sparkles, RefreshCw, Eye, ExternalLink, X, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ScopeBadge from "./ScopeBadge";
import { getPlanDefinition, getBriefingLabel, BRIEFING_DEFINITIONS, type BriefingType, type ScopeClassification } from "./aceleraConstants";
import { getContextLabel } from "./contextTypes";
import { getDossierSignalsByBlock } from "./briefingSignals";
import { exportBriefingPdf, exportBriefingMarkdown, type ConsolidatedBriefing } from "@/lib/briefingExport";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string;
  clientId: string;
  planName?: string | null;
  clientMetadata?: Record<string, unknown> | null;
  workspaceMetadata?: Record<string, unknown> | null;
}

interface ContextEntry {
  id: string; context_type: string; title: string; content: string;
  is_key_decision: boolean; metadata: Record<string, unknown> | null; tags: string[];
  created_at: string; source_url: string | null; source_label: string | null;
}

interface TaskSummary { total: number; done: number; in_progress: number; blocked: number; }

// ─── Block config ────────────────────────────────────────────

const BLOCKS = [
  { key: "identity",    label: "Identidade",           icon: Building2,    color: "#60A5FA", types: ["briefing"],                     hint: "Posicionamento e proposta de valor" },
  { key: "offer",       label: "Oferta e ICP",          icon: Target,       color: "#EC4899", types: ["briefing", "objetivo"],         hint: "O que vende, para quem, cliente ideal" },
  { key: "commercial",  label: "Comercial",             icon: ShoppingCart, color: "#F59E0B", types: ["objetivo", "decisao"],          hint: "Funil, metas e processo de vendas" },
  { key: "operational", label: "Operação",              icon: Settings,     color: "#10B981", types: ["anotacao", "decisao"],          hint: "Fluxo de entrega, equipe, processos" },
  { key: "digital",     label: "Estrutura Digital",     icon: Globe,        color: "#8B5CF6", types: ["acesso", "anotacao"],           hint: "Canais, ferramentas, métricas" },
  { key: "access",      label: "Acessos",               icon: Key,          color: "#F97316", types: ["acesso"],                       hint: "Credenciais e dependências técnicas" },
  { key: "diagnostic",  label: "Diagnóstico",           icon: Search,       color: "#14B8A6", types: ["diagnostico", "dor"],           hint: "Gargalos, dores e lacunas" },
  { key: "decisions",   label: "Decisões",              icon: Scale,        color: "#A78BFA", types: ["decisao", "dor", "objetivo"],   hint: "Estratégia, gaps e prioridades" },
] as const;

// ─── Helpers ────────────────────────────────────────────────

function readBriefingKind(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.briefing_kind as string) ?? (meta?.briefing_type as string) ?? undefined;
}
function readDossierBlock(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.dossier_block as string) ?? undefined;
}
function readScopeClassification(meta: Record<string, unknown> | null): ScopeClassification | undefined {
  return (meta?.scope_classification as ScopeClassification) ?? undefined;
}
function stripMarkdown(s: string) {
  return s.replace(/^##\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/---/g, " ").replace(/\n+/g, " ").trim();
}
function getBriefingPreview(entry: ContextEntry): string {
  const sigs = entry.metadata?.structured_signals as Record<string, { summary?: string }> | undefined;
  if (sigs) {
    const arr = Object.values(sigs).map((s) => s?.summary?.trim()).filter(Boolean).slice(0, 2) as string[];
    if (arr.length) return arr.join(" · ");
  }
  return stripMarkdown(entry.content ?? "").slice(0, 200);
}

// ─── BriefingSheet — opens full briefing with preview + download ─

function BriefingSheet({ entry, workspaceId, clientId, clientName, onClose }: {
  entry: ContextEntry; workspaceId: string; clientId: string; clientName: string; onClose: () => void;
}) {
  const [consolidated, setConsolidated] = useState<ConsolidatedBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const kind = readBriefingKind(entry.metadata);
  const def = kind ? BRIEFING_DEFINITIONS[kind as BriefingType] : null;

  useEffect(() => {
    async function tryLoad() {
      setLoading(true);
      try {
        const { data } = await supabase.functions.invoke("consolidate-briefing", {
          body: { workspaceId, clientId, cacheOnly: true },
        });
        if (data?.briefing) setConsolidated(data.briefing as ConsolidatedBriefing);
      } catch { /* cache miss is ok */ }
      setLoading(false);
    }
    tryLoad();
  }, [workspaceId, clientId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("consolidate-briefing", {
        body: { workspaceId, clientId, force: true },
      });
      if (error) throw error;
      if (data?.briefing) { setConsolidated(data.briefing as ConsolidatedBriefing); toast({ title: "Briefing consolidado" }); }
    } catch (err) {
      toast({ title: "Erro ao gerar", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const downloadPdf = () => {
    if (!consolidated) {
      // Fallback: print raw content
      const w = window.open("", "_blank");
      if (!w) return;
      w.document.write(`<!DOCTYPE html><html><head><title>${entry.title}</title>
        <style>body{font-family:system-ui,sans-serif;padding:40px;max-width:800px;margin:0 auto;color:#111}
        h1{font-size:22px;margin-bottom:8px}p{font-size:13px;line-height:1.7;color:#444}
        .meta{font-size:11px;color:#888;margin-bottom:24px}</style></head><body>
        <h1>${entry.title}</h1>
        <p class="meta">${clientName} · ${new Date(entry.created_at).toLocaleDateString("pt-BR")}</p>
        ${(entry.content ?? "").replace(/\n/g, "<br>")}
        </body></html>`);
      w.document.close(); w.print();
      return;
    }
    exportBriefingPdf(consolidated, clientName);
  };

  const downloadMd = () => {
    if (!consolidated) return;
    exportBriefingMarkdown(consolidated, clientName);
  };

  const reviewStatus = entry.metadata?.import_review_status as string | undefined;
  const importSource = (entry.metadata?.import_source as string | undefined);

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col" style={{ background: "#09110A" }}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/30 shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-primary/70">Briefing</span>
                  {def && <Badge variant="outline" className="text-[10px] px-1.5 py-0">{def.label}</Badge>}
                  {reviewStatus === "reviewed" && <Badge className="text-[10px] px-1.5 py-0 bg-emerald-400/10 text-emerald-400 border-emerald-400/25">Revisado</Badge>}
                  {importSource && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Importado</Badge>}
                </div>
                <h2 className="text-base font-semibold text-foreground">{entry.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(entry.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 text-muted-foreground hover:text-foreground transition-colors mt-0.5">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button onClick={generate} disabled={generating} size="sm" className="h-7 text-xs gap-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25">
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {consolidated ? "Regenerar" : "Consolidar com IA"}
            </Button>
            <Button onClick={downloadPdf} size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Download className="h-3 w-3" /> PDF
            </Button>
            {consolidated && (
              <Button onClick={downloadMd} size="sm" variant="outline" className="h-7 text-xs gap-1.5">
                <Download className="h-3 w-3" /> Markdown
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : consolidated ? (
              <div className="space-y-5">
                {consolidated.sections?.map((sec: any, si: number) => (
                  <section key={si}>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-primary/70 mb-3 pb-2 border-b border-border/50">{sec.title}</h3>
                    <div className="space-y-3">
                      {sec.answers?.map((ans: any, ai: number) => (
                        <div key={ai} className="space-y-1">
                          <p className="text-xs font-semibold text-foreground/80">{ans.question}</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{ans.answer}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
                {!consolidated.sections?.length && (
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{JSON.stringify(consolidated, null, 2)}</pre>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Raw content with nice formatting */}
                <div className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {entry.content
                    ? entry.content
                        .split("\n")
                        .map((line, i) => {
                          if (line.startsWith("## ")) return <h3 key={i} className="text-sm font-semibold text-foreground mt-4 mb-1">{line.replace("## ", "")}</h3>;
                          if (line.startsWith("**") && line.endsWith("**")) return <p key={i} className="text-xs font-semibold text-foreground/80 mt-3">{line.replace(/\*\*/g, "")}</p>;
                          if (line === "---") return <hr key={i} className="border-border/40 my-3" />;
                          if (!line.trim()) return <br key={i} />;
                          return <p key={i} className="text-sm text-muted-foreground">{line}</p>;
                        })
                    : <p className="text-muted-foreground italic">Conteúdo indisponível.</p>
                  }
                </div>
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <p className="font-semibold text-foreground text-xs">Consolidar com IA</p>
                  </div>
                  <p className="text-xs text-muted-foreground">Gere uma versão consolidada e estruturada deste briefing com seções, análise de confiança e próximos passos.</p>
                  <Button onClick={generate} disabled={generating} size="sm" className="mt-3 h-7 text-xs gap-1.5">
                    {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Gerar agora
                  </Button>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ─── Context entry detail sheet ─────────────────────────────

function EntrySheet({ entry, onClose }: { entry: ContextEntry; onClose: () => void }) {
  const scope = readScopeClassification(entry.metadata);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col" style={{ background: "#09110A" }}>
        <div className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{getContextLabel(entry.context_type)}</span>
                {entry.is_key_decision && <span className="text-[10px] text-amber-400 font-semibold">Decisão-chave</span>}
                {scope && <ScopeBadge scope={scope} className="text-[10px]" />}
              </div>
              <h2 className="text-base font-semibold text-foreground">{entry.title}</h2>
            </div>
            <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X className="h-4 w-4" />
            </button>
          </div>
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {entry.tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{t}</span>)}
            </div>
          )}
        </div>
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {entry.content || <span className="italic">Sem conteúdo.</span>}
          </div>
        </ScrollArea>
        {entry.source_url && (
          <div className="px-5 py-3 border-t border-border shrink-0">
            <a href={entry.source_url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
              <ExternalLink className="h-3 w-3" /> {entry.source_label ?? "Fonte original"}
            </a>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main component ──────────────────────────────────────────

export default function WorkspaceTabDossie({ workspaceId, clientId, planName, clientMetadata, workspaceMetadata }: Props) {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskSummary>({ total: 0, done: 0, in_progress: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(BLOCKS.map((b) => b.key)));
  const [activeBriefing, setActiveBriefing] = useState<ContextEntry | null>(null);
  const [activeEntry, setActiveEntry] = useState<ContextEntry | null>(null);

  const toggle = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const [ctxRes, taskRes] = await Promise.all([
      supabase.from("context_entries").select("id,context_type,title,content,is_key_decision,metadata,tags,created_at,source_url,source_label").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      supabase.from("tasks").select("id,status").eq("workspace_id", workspaceId),
    ]);
    setContexts((ctxRes.data as ContextEntry[] | null) ?? []);
    const t = taskRes.data ?? [];
    setTaskSummary({ total: t.length, done: t.filter((x: any) => x.status === "done").length, in_progress: t.filter((x: any) => x.status === "in_progress").length, blocked: t.filter((x: any) => x.status === "blocked").length });
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  // Derived
  const briefings = contexts.filter((c) => c.context_type === "briefing");
  const briefingKinds = briefings.map((c) => readBriefingKind(c.metadata)).filter(Boolean) as string[];
  const allSignals = new Map<string, { key: string; label: string; summary: string }[]>();
  for (const b of briefings) {
    for (const [block, items] of getDossierSignalsByBlock(b.metadata)) {
      if (!allSignals.has(block)) allSignals.set(block, []);
      allSignals.get(block)!.push(...items);
    }
  }
  const reviewedIds = new Set(briefings.filter((b) => {
    const m = b.metadata;
    return m?.import_review_status === "reviewed" && m?.structured_signals && Object.keys(m.structured_signals as object).length > 0;
  }).map((b) => b.id));

  const getBlockCtx = (key: string, types: readonly string[]) => {
    const byBlock = contexts.filter((c) => !reviewedIds.has(c.id) && readDossierBlock(c.metadata) === key);
    return byBlock.length > 0 ? byBlock : contexts.filter((c) => !reviewedIds.has(c.id) && types.includes(c.context_type));
  };

  const filledBlocks = BLOCKS.filter((b) => (allSignals.get(b.key)?.length ?? 0) > 0 || getBlockCtx(b.key, b.types).length > 0).length;
  const completeness = Math.round((filledBlocks / BLOCKS.length) * 100);

  // Contract data
  const contractData = (clientMetadata?.contract ?? workspaceMetadata?.contract ?? {}) as any;
  const plan = getPlanDefinition(planName ?? contractData.plan_name);
  const enabledFronts: string[] = contractData.enabled_fronts ?? [];
  const activeAddons: string[] = contractData.active_addons ?? [];
  const standaloneServices: string[] = contractData.standalone_services ?? [];
  const extraCosts: string[] = contractData.extra_costs ?? [];
  const futureOpps: string[] = contractData.future_opportunities ?? [];

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ═══ COMPLETUDE ════════════════════════════════════ */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Dossiê operacional</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className={cn("font-bold text-sm", completeness === 100 ? "text-emerald-400" : completeness > 50 ? "text-primary" : "text-amber-400")}>{completeness}%</span>
            <span>{filledBlocks}/{BLOCKS.length} blocos</span>
            <span>{briefings.length} briefings</span>
          </div>
        </div>
        <Progress value={completeness} className="h-1 mb-3" />
        <div className="flex flex-wrap gap-1.5">
          {BLOCKS.map((b) => {
            const has = (allSignals.get(b.key)?.length ?? 0) > 0 || getBlockCtx(b.key, b.types).length > 0;
            return (
              <button key={b.key} type="button" onClick={() => toggle(b.key)}
                className={cn("flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors",
                  has ? "border-border/70 bg-secondary/50 text-foreground hover:bg-secondary" : "border-dashed border-border/40 text-muted-foreground/40 hover:border-border/60")}>
                {has ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400 shrink-0" /> : <Circle className="h-2.5 w-2.5 shrink-0" />}
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ═══ CONTRATO OPERACIONAL ══════════════════════════ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-secondary/20">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Contrato operacional</p>
        </div>

        {/* Plan */}
        <div className="p-5 border-b border-border/60">
          {plan ? (
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/25 shrink-0">
                <Shield className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h3 className="text-sm font-bold text-foreground">{plan.label}</h3>
                  <Badge className="text-[10px] bg-primary/10 text-primary border-primary/25 font-medium">Plano ativo</Badge>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{plan.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                  <div className="rounded-lg bg-secondary/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Objetivo</p>
                    <p className="text-xs text-foreground">{plan.objective}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">Profundidade</p>
                    <p className="text-xs text-foreground">{plan.depth}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum plano definido para este workspace.</p>
          )}
        </div>

        {/* Contract sections */}
        <div className="divide-y divide-border/50">
          {[
            { icon: Zap,           label: "Frentes habilitadas",       items: enabledFronts,       color: "#10B981", emptyText: "Nenhuma frente definida" },
            { icon: Package,       label: "Add-ons ativos",            items: activeAddons,        color: "#8B5CF6", emptyText: "Nenhum add-on ativo" },
            { icon: FileText,      label: "Serviços avulsos",          items: standaloneServices,  color: "#F59E0B", emptyText: "Nenhum serviço avulso" },
            { icon: AlertTriangle, label: "Custos extras previstos",   items: extraCosts,          color: "#EF4444", emptyText: "Nenhum custo extra" },
            { icon: Lightbulb,     label: "Oportunidades futuras",     items: futureOpps,          color: "#60A5FA", emptyText: "Nenhuma oportunidade mapeada" },
          ].map(({ icon: Icon, label, items, color, emptyText }) => (
            <div key={label} className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                <p className="text-xs font-semibold text-foreground">{label}</p>
                {items.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${color}15`, color }}>{items.length}</span>}
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 italic pl-5">{emptyText}</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 pl-5">
                  {items.map((item, i) => (
                    <span key={i} className="text-xs px-2.5 py-1 rounded-full border" style={{ background: `${color}08`, borderColor: `${color}25`, color }}>
                      {item}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ═══ CENTRAL DE BRIEFINGS ══════════════════════════ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2 bg-secondary/20">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Central de briefings</p>
          <span className="ml-auto text-xs text-muted-foreground">{briefings.length} registrado{briefings.length !== 1 ? "s" : ""}</span>
        </div>

        <div className="divide-y divide-border/50">
          {(Object.values(BRIEFING_DEFINITIONS) as typeof BRIEFING_DEFINITIONS[BriefingType][]).map((def) => {
            const match = briefings.find((b) => readBriefingKind(b.metadata) === def.key);
            const exists = !!match;
            const reviewed = match?.metadata?.import_review_status === "reviewed";
            const preview = match ? getBriefingPreview(match) : null;

            return (
              <div key={def.key} className={cn(
                "flex items-center gap-3 px-5 py-3.5 transition-colors",
                exists ? "hover:bg-secondary/20 cursor-pointer" : "opacity-50 cursor-default"
              )}
                onClick={() => exists && match && setActiveBriefing(match)}
              >
                {/* Status dot */}
                <div className={cn("h-2.5 w-2.5 rounded-full shrink-0 mt-0.5", exists ? reviewed ? "bg-emerald-400" : "bg-primary" : "border-2 border-border")} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-foreground">{def.label}</span>
                    {exists && !reviewed && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Pendente revisão</Badge>}
                    {reviewed && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-400/10 text-emerald-400 border-emerald-400/25">Revisado</Badge>}
                    {!exists && def.importable && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-dashed text-muted-foreground/50">Importável</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{def.description}</p>
                  {preview && <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-1 italic">{preview}</p>}
                </div>

                {/* Open arrow */}
                {exists && (
                  <div className="flex items-center gap-1.5 shrink-0 text-primary/60 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Eye className="h-3.5 w-3.5" />
                    <ArrowRight className="h-3 w-3" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ BLOCOS DE CONHECIMENTO ════════════════════════ */}
      <div className="grid gap-3 lg:grid-cols-2">
        {BLOCKS.map((block) => {
          const blockCtx = getBlockCtx(block.key, block.types);
          const sigs = allSignals.get(block.key) ?? [];
          const Icon = block.icon;
          const isExp = expanded.has(block.key);
          const count = sigs.length + blockCtx.length;
          const has = count > 0;

          return (
            <div key={block.key} className={cn("rounded-xl border bg-card overflow-hidden", !has && "opacity-50")}>
              {/* Block header — clickable toggle */}
              <button type="button" onClick={() => toggle(block.key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/20 transition-colors select-none">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                  style={{ background: `${block.color}15`, border: `1px solid ${block.color}25` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: block.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">{block.label}</span>
                    {count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                        style={{ background: `${block.color}15`, color: block.color }}>{count}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{block.hint}</p>
                </div>
                <div className="shrink-0 text-muted-foreground/60">
                  {isExp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </div>
              </button>

              {/* Block content */}
              {isExp && (
                <div className="border-t border-border/50 px-4 pb-4 pt-3 space-y-2">
                  {!has ? (
                    <p className="text-xs text-muted-foreground/50 italic">Nenhuma informação registrada neste bloco.</p>
                  ) : (
                    <>
                      {sigs.map((sig, i) => (
                        <div key={i} className="rounded-lg p-2.5"
                          style={{ background: `${block.color}08`, border: `0.5px solid ${block.color}20` }}>
                          <p className="text-xs font-semibold text-foreground mb-0.5">{sig.label}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">{sig.summary}</p>
                        </div>
                      ))}
                      {blockCtx.slice(0, 6).map((ctx) => {
                        const isBriefing = ctx.context_type === "briefing";
                        return (
                          <button key={ctx.id} type="button"
                            onClick={() => isBriefing ? setActiveBriefing(ctx) : setActiveEntry(ctx)}
                            className="w-full text-left rounded-lg bg-secondary/30 hover:bg-secondary/50 px-3 py-2.5 transition-colors group">
                            <div className="flex items-start gap-2">
                              <div className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: block.color }} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  <span className="text-[10px] text-muted-foreground">{getContextLabel(ctx.context_type)}</span>
                                  <span className="text-xs font-medium text-foreground">{ctx.title}</span>
                                  {ctx.is_key_decision && <span className="text-[10px] text-amber-400">Decisão-chave</span>}
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{ctx.content}</p>
                              </div>
                              <ArrowRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </button>
                        );
                      })}
                      {blockCtx.length > 6 && <p className="text-[10px] text-muted-foreground pl-4">+{blockCtx.length - 6} entradas</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══ PLANO OPERACIONAL ══════════════════════════════ */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Plano operacional ativo</p>
          {taskSummary.total > 0 && (
            <span className="ml-auto text-sm font-bold text-primary">
              {Math.round((taskSummary.done / taskSummary.total) * 100)}%
            </span>
          )}
        </div>
        {taskSummary.total === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma task criada neste workspace.</p>
        ) : (
          <>
            <Progress value={(taskSummary.done / taskSummary.total) * 100} className="h-1 mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Total",       v: taskSummary.total,       c: "text-foreground" },
                { label: "Concluídas",  v: taskSummary.done,        c: "text-emerald-400" },
                { label: "Em andamento",v: taskSummary.in_progress, c: "text-primary" },
                { label: "Bloqueadas",  v: taskSummary.blocked,     c: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-secondary/30 py-2 text-center">
                  <p className={cn("text-lg font-bold tabular-nums", s.c)}>{s.v}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ═══ SHEETS ════════════════════════════════════════ */}
      {activeBriefing && (
        <BriefingSheet
          entry={activeBriefing}
          workspaceId={workspaceId}
          clientId={clientId}
          clientName={clientMetadata?.name as string ?? "Cliente"}
          onClose={() => setActiveBriefing(null)}
        />
      )}
      {activeEntry && <EntrySheet entry={activeEntry} onClose={() => setActiveEntry(null)} />}
    </div>
  );
}
