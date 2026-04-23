/**
 * WorkspaceTabDossie — dossiê operacional do cliente.
 * Layout: completude bar → contrato em cards → briefings → 8 blocos em grid
 */
import { useState, useEffect, useCallback } from "react";
import {
  FileText, Building2, Target, ShoppingCart, Settings, Globe, Key,
  Search, Scale, ClipboardList, Shield, Zap, Package, AlertTriangle,
  Lightbulb, Loader2, ChevronDown, ChevronRight, CheckCircle2, Circle,
  Download, Sparkles, X, ArrowRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ScopeBadge from "./ScopeBadge";
import { getPlanDefinition, BRIEFING_DEFINITIONS, type BriefingType, type ScopeClassification } from "./aceleraConstants";
import { getContextLabel } from "./contextTypes";
import { getDossierSignalsByBlock } from "./briefingSignals";
import { exportBriefingPdf, exportBriefingMarkdown, type ConsolidatedBriefing } from "@/lib/briefingExport";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface Props {
  workspaceId: string;
  clientId: string;
  planName?: string | null;
  clientMetadata?: Record<string, unknown> | null;
  workspaceMetadata?: Record<string, unknown> | null;
}

interface ContextEntry {
  id: string; context_type: string; title: string; content: string;
  is_key_decision: boolean; metadata: Record<string, unknown> | null;
  tags: string[]; created_at: string;
}

// ─── Block config ─────────────────────────────────────────────

const BLOCKS = [
  { key: "identity",    label: "Identidade",          icon: Building2,    color: "#60A5FA", types: ["briefing"],                   hint: "Posicionamento, diferencial e proposta de valor" },
  { key: "offer",       label: "Oferta e ICP",         icon: Target,       color: "#EC4899", types: ["briefing","objetivo"],        hint: "O que vende, para quem, cliente ideal" },
  { key: "commercial",  label: "Estrutura Comercial",  icon: ShoppingCart, color: "#F59E0B", types: ["objetivo","decisao"],         hint: "Funil, metas e processo comercial" },
  { key: "operational", label: "Operação",             icon: Settings,     color: "#10B981", types: ["anotacao","decisao"],         hint: "Fluxo de entrega, equipe, responsabilidades" },
  { key: "digital",     label: "Estrutura Digital",    icon: Globe,        color: "#8B5CF6", types: ["acesso","anotacao"],          hint: "Canais, ferramentas e métricas" },
  { key: "access",      label: "Acessos",              icon: Key,          color: "#F97316", types: ["acesso"],                    hint: "Credenciais e dependências técnicas" },
  { key: "diagnostic",  label: "Diagnóstico",          icon: Search,       color: "#14B8A6", types: ["diagnostico","dor"],          hint: "Gargalos, dores e lacunas identificadas" },
  { key: "decisions",   label: "Decisões",             icon: Scale,        color: "#A78BFA", types: ["decisao","dor","objetivo"],   hint: "Estratégia, prioridades e gaps" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────

function readBriefingKind(m: Record<string, unknown> | null) {
  return (m?.briefing_kind as string) ?? (m?.briefing_type as string) ?? undefined;
}
function readDossierBlock(m: Record<string, unknown> | null) {
  return (m?.dossier_block as string) ?? undefined;
}
function readScope(m: Record<string, unknown> | null): ScopeClassification | undefined {
  return (m?.scope_classification as ScopeClassification) ?? undefined;
}
function strip(s: string) {
  return s.replace(/^##\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/---/g, " ").replace(/\n+/g, " ").trim();
}
function preview(entry: ContextEntry): string {
  const sigs = entry.metadata?.structured_signals as Record<string, { summary?: string }> | undefined;
  if (sigs) {
    const arr = Object.values(sigs).map((s) => s?.summary?.trim()).filter(Boolean).slice(0, 2) as string[];
    if (arr.length) return arr.join(" · ");
  }
  return strip(entry.content ?? "").slice(0, 200);
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Glass Sheet ──────────────────────────────────────────────

function GlassSheet({ open, onClose, children }: {
  open: boolean; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col border-l border-white/10"
        style={{
          background: "rgba(9, 17, 10, 0.82)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
        }}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

// ─── Briefing Sheet content ───────────────────────────────────

function BriefingSheetContent({ entry, workspaceId, clientId, clientName, onClose }: {
  entry: ContextEntry; workspaceId: string; clientId: string;
  clientName?: string; onClose: () => void;
}) {
  const [consolidated, setConsolidated] = useState<ConsolidatedBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const kind = readBriefingKind(entry.metadata);
  const kindLabel = kind ? (BRIEFING_DEFINITIONS[kind as BriefingType]?.label ?? kind) : "Briefing";
  const reviewed = entry.metadata?.import_review_status === "reviewed";

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase.functions.invoke("consolidate-briefing", {
          body: { workspaceId, clientId, cacheOnly: true },
        });
        if (data?.briefing) setConsolidated(data.briefing as ConsolidatedBriefing);
      } catch { /* cache miss */ }
      setLoading(false);
    })();
  }, [workspaceId, clientId]);

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("consolidate-briefing", {
        body: { workspaceId, clientId, force: true },
      });
      if (error) throw error;
      if (data?.briefing) { setConsolidated(data.briefing as ConsolidatedBriefing); toast({ title: "Consolidado" }); }
    } catch (e) {
      toast({ title: "Erro", description: e instanceof Error ? e.message : "Tente novamente", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const downloadPdf = () => {
    if (consolidated) { exportBriefingPdf(consolidated, clientName ?? "Cliente"); return; }
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${entry.title}</title>
    <style>body{font-family:'Segoe UI',system-ui,sans-serif;padding:48px;max-width:800px;margin:0 auto;color:#111;line-height:1.7}
    h1{font-size:22px;border-bottom:2px solid #00ff88;padding-bottom:10px;margin-bottom:6px}
    h2{font-size:14px;color:#166534;margin-top:28px;font-weight:700;letter-spacing:.02em}
    p{font-size:13px;color:#374151}hr{border:none;border-top:1px solid #d1fae5;margin:20px 0}
    .meta{font-size:11px;color:#9CA3AF;margin-bottom:28px}</style></head><body>
    <h1>${entry.title}</h1>
    <p class="meta">${clientName ?? ""} · ${kindLabel} · ${fmtDate(entry.created_at)}</p>
    ${(entry.content ?? "")
      .replace(/## (.+)/g, "<h2>$1</h2>")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/---/g, "<hr>")
      .replace(/\n/g, "<br>")}
    </body></html>`);
    w.document.close(); w.print();
  };

  const downloadMd = () => {
    if (consolidated) { exportBriefingMarkdown(consolidated, clientName ?? "Cliente"); return; }
    const blob = new Blob([entry.content ?? ""], { type: "text/markdown" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = entry.title.replace(/[^a-z0-9]/gi, "_") + ".md"; a.click();
  };

  return (
    <>
      {/* Header */}
      <div className="px-5 py-5 border-b border-white/10 shrink-0">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">{kindLabel}</span>
              {reviewed && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-400/15 text-emerald-400 border-emerald-400/30">Revisado</Badge>}
            </div>
            <h2 className="text-lg font-semibold text-white leading-tight">{entry.title}</h2>
            <p className="text-xs text-white/40 mt-1">{fmtDate(entry.created_at)}</p>
          </div>
          <button type="button" onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors shrink-0">
            <X className="h-3.5 w-3.5 text-white/60" />
          </button>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={generate} disabled={generating} size="sm"
            className="h-7 text-xs gap-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 rounded-full">
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {consolidated ? "Regenerar" : "Consolidar com IA"}
          </Button>
          <Button onClick={downloadPdf} size="sm" variant="outline"
            className="h-7 text-xs gap-1.5 border-white/15 bg-white/5 text-white/70 hover:bg-white/10 rounded-full">
            <Download className="h-3 w-3" /> PDF
          </Button>
          <Button onClick={downloadMd} size="sm" variant="outline"
            className="h-7 text-xs gap-1.5 border-white/15 bg-white/5 text-white/70 hover:bg-white/10 rounded-full">
            <Download className="h-3 w-3" /> Markdown
          </Button>
        </div>
      </div>

      {/* Body */}
      <ScrollArea className="flex-1">
        <div className="px-5 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-white/30" />
            </div>
          ) : consolidated ? (
            <div className="space-y-7">
              {consolidated.sections?.map((sec: any, si: number) => (
                <section key={si}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-3">{sec.title}</p>
                  <div className="space-y-4">
                    {sec.answers?.map((ans: any, ai: number) => (
                      <div key={ai}>
                        <p className="text-xs font-semibold text-white/70 mb-1">{ans.question}</p>
                        <p className="text-sm text-white/50 leading-relaxed">{ans.answer}</p>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-white/80">Versão consolidada por IA</p>
                </div>
                <p className="text-xs text-white/40 mb-3">Gere uma versão estruturada com análise e próximos passos.</p>
                <Button onClick={generate} disabled={generating} size="sm"
                  className="h-7 text-xs gap-1.5 bg-primary/15 text-primary border border-primary/30 rounded-full">
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  Gerar agora
                </Button>
              </div>
              <div className="space-y-2 text-sm text-white/50 leading-relaxed">
                {(entry.content ?? "").split("\n").map((line, i) => {
                  if (line.startsWith("## ")) return <p key={i} className="text-xs font-bold text-white/70 mt-5 mb-1 uppercase tracking-wide">{line.replace("## ", "")}</p>;
                  if (/^\*\*(.+)\*\*$/.test(line)) return <p key={i} className="text-xs font-semibold text-white/60 mt-3">{line.replace(/\*\*/g, "")}</p>;
                  if (line === "---") return <hr key={i} className="border-white/10 my-3" />;
                  if (!line.trim()) return <div key={i} className="h-1" />;
                  return <p key={i}>{line}</p>;
                })}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

// ─── Entry Sheet content ──────────────────────────────────────

function EntrySheetContent({ entry, onClose }: { entry: ContextEntry; onClose: () => void }) {
  const scope = readScope(entry.metadata);
  return (
    <>
      <div className="px-5 py-5 border-b border-white/10 shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">{getContextLabel(entry.context_type)}</span>
              {entry.is_key_decision && <span className="text-[10px] text-amber-400 font-semibold">Decisão-chave</span>}
              {scope && <ScopeBadge scope={scope} className="text-[10px]" />}
            </div>
            <h2 className="text-lg font-semibold text-white leading-tight">{entry.title}</h2>
            <p className="text-xs text-white/40 mt-1">{fmtDate(entry.created_at)}</p>
          </div>
          <button type="button" onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center bg-white/5 hover:bg-white/10 transition-colors shrink-0">
            <X className="h-3.5 w-3.5 text-white/60" />
          </button>
        </div>
        {entry.tags && entry.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {entry.tags.map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-white/50 border border-white/10">{t}</span>)}
          </div>
        )}
      </div>
      <ScrollArea className="flex-1">
        <p className="px-5 py-5 text-sm text-white/50 leading-relaxed whitespace-pre-wrap">
          {entry.content || <span className="italic opacity-40">Sem conteúdo.</span>}
        </p>
      </ScrollArea>
    </>
  );
}

// ─── Collapsible block card ───────────────────────────────────

function BlockCard({ blockKey, label, icon: Icon, color, hint, children, count, defaultOpen = true }: {
  blockKey: string; label: string; icon: React.ElementType; color: string;
  hint: string; children: React.ReactNode; count: number; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={cn(
      "rounded-xl border overflow-hidden transition-all duration-200",
      open ? "border-border bg-card" : "border-border/50 bg-card/40",
      count === 0 && "opacity-40"
    )}>
      {/* Header — clicking this toggles the whole card */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-secondary/20 transition-colors select-none"
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{ background: `${color}12`, border: `1px solid ${color}28` }}
        >
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{label}</span>
            {count > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded-full font-bold tabular-nums"
                style={{ background: `${color}15`, color }}
              >
                {count}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground leading-none mt-0.5">{hint}</p>
        </div>
        <div className="shrink-0 text-muted-foreground/40 transition-transform duration-200" style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
          <ChevronDown className="h-4 w-4" />
        </div>
      </button>

      {/* Body — only rendered when open */}
      {open && count > 0 && (
        <div className="border-t border-border/50">
          {children}
        </div>
      )}

      {/* Empty state when open */}
      {open && count === 0 && (
        <div className="border-t border-border/40 px-4 py-4">
          <p className="text-xs text-muted-foreground/40 italic">Nenhuma informação registrada neste bloco.</p>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────

export default function WorkspaceTabDossie({ workspaceId, clientId, planName, clientMetadata, workspaceMetadata }: Props) {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [tasks, setTasks] = useState({ total: 0, done: 0, in_progress: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [briefingSheet, setBriefingSheet] = useState<ContextEntry | null>(null);
  const [entrySheet, setEntrySheet] = useState<ContextEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, tRes] = await Promise.all([
      supabase.from("context_entries").select("id,context_type,title,content,is_key_decision,metadata,tags,created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      supabase.from("tasks").select("id,status").eq("workspace_id", workspaceId),
    ]);
    setContexts((cRes.data as ContextEntry[] | null) ?? []);
    const t = tRes.data ?? [];
    setTasks({ total: t.length, done: t.filter((x: any) => x.status === "done").length, in_progress: t.filter((x: any) => x.status === "in_progress").length, blocked: t.filter((x: any) => x.status === "blocked").length });
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  // Derived
  const briefings = contexts.filter((c) => c.context_type === "briefing");
  const briefingKinds = briefings.map((c) => readBriefingKind(c.metadata)).filter(Boolean) as string[];
  const allSignals = new Map<string, { label: string; summary: string }[]>();
  for (const b of briefings) {
    for (const [block, items] of getDossierSignalsByBlock(b.metadata)) {
      if (!allSignals.has(block)) allSignals.set(block, []);
      allSignals.get(block)!.push(...items);
    }
  }
  const reviewedIds = new Set(briefings.filter((b) => b.metadata?.import_review_status === "reviewed" && b.metadata?.structured_signals && Object.keys(b.metadata.structured_signals as object).length > 0).map((b) => b.id));
  const getBlockCtx = (key: string, types: readonly string[]) => {
    const byBlock = contexts.filter((c) => !reviewedIds.has(c.id) && readDossierBlock(c.metadata) === key);
    return byBlock.length > 0 ? byBlock : contexts.filter((c) => !reviewedIds.has(c.id) && types.includes(c.context_type));
  };

  const filledBlocks = BLOCKS.filter((b) => (allSignals.get(b.key)?.length ?? 0) > 0 || getBlockCtx(b.key, b.types).length > 0).length;
  const completeness = Math.round((filledBlocks / BLOCKS.length) * 100);

  // Contract
  const contractRaw = (clientMetadata?.contract ?? workspaceMetadata?.contract ?? {}) as any;
  const plan = getPlanDefinition(planName ?? contractRaw.plan_name);
  const enabledFronts: string[] = contractRaw.enabled_fronts ?? [];
  const activeAddons: string[] = contractRaw.active_addons ?? [];
  const standalone: string[] = contractRaw.standalone_services ?? [];
  const extraCosts: string[] = contractRaw.extra_costs ?? [];
  const futureOpps: string[] = contractRaw.future_opportunities ?? [];

  const contractCards = [
    { label: "Frentes habilitadas", icon: Zap,           color: "#10B981", items: enabledFronts },
    { label: "Add-ons ativos",      icon: Package,       color: "#8B5CF6", items: activeAddons },
    { label: "Serviços avulsos",    icon: FileText,      color: "#F59E0B", items: standalone },
    { label: "Custos extras",       icon: AlertTriangle, color: "#EF4444", items: extraCosts },
    { label: "Oportunidades",       icon: Lightbulb,     color: "#60A5FA", items: futureOpps },
  ];

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ══ COMPLETUDE ═══════════════════════════════════ */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Dossiê operacional</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className={cn("text-sm font-bold", completeness === 100 ? "text-emerald-400" : completeness > 60 ? "text-primary" : "text-amber-400")}>{completeness}%</span>
            <span>{filledBlocks}/{BLOCKS.length} blocos</span>
            <span>{briefings.length} briefings</span>
          </div>
        </div>
        <Progress value={completeness} className="h-1 mb-3" />
        <div className="flex flex-wrap gap-1.5">
          {BLOCKS.map((b) => {
            const filled = (allSignals.get(b.key)?.length ?? 0) > 0 || getBlockCtx(b.key, b.types).length > 0;
            return (
              <div key={b.key} className={cn("flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border",
                filled ? "border-border/60 bg-secondary/40 text-foreground" : "border-dashed border-border/30 text-muted-foreground/30")}>
                {filled ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> : <Circle className="h-2.5 w-2.5" />}
                {b.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ CONTRATO OPERACIONAL ═════════════════════════ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-secondary/20 border-b border-border">
          <Shield className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Contrato operacional</p>
        </div>

        {/* Plan hero — full width */}
        <div className="p-5 border-b border-border/60">
          {plan ? (
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 border border-primary/25 shrink-0">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                  <h3 className="text-base font-bold text-foreground">{plan.label}</h3>
                  <Badge className="text-[10px] bg-primary/10 text-primary border-primary/25">Plano ativo</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{plan.description}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-lg bg-secondary/40 px-3 py-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Objetivo</p>
                    <p className="text-xs text-foreground leading-relaxed">{plan.objective}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/40 px-3 py-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Profundidade</p>
                    <p className="text-xs text-foreground leading-relaxed">{plan.depth}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum plano definido.</p>
          )}
        </div>

        {/* Contract cards — horizontal grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-0 divide-x divide-y divide-border/40">
          {contractCards.map(({ label, icon: Icon, color, items }) => (
            <div key={label} className="px-4 py-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
                {items.length > 0 && (
                  <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color }}>{items.length}</span>
                )}
              </div>
              {items.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/40 italic">Nenhum</p>
              ) : (
                <div className="space-y-1.5">
                  {items.map((item, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <div className="h-1.5 w-1.5 rounded-full mt-1 shrink-0" style={{ background: color }} />
                      <p className="text-xs text-muted-foreground leading-tight">{item}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ══ BRIEFINGS ════════════════════════════════════ */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3 bg-secondary/20 border-b border-border">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Central de briefings</p>
          <span className="ml-auto text-xs text-muted-foreground">{briefings.length} registrado{briefings.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="divide-y divide-border/40">
          {(Object.values(BRIEFING_DEFINITIONS) as typeof BRIEFING_DEFINITIONS[BriefingType][]).map((def) => {
            const match = briefings.find((b) => readBriefingKind(b.metadata) === def.key);
            const exists = !!match;
            const reviewed = match?.metadata?.import_review_status === "reviewed";
            const prev = match ? preview(match) : null;
            return (
              <div
                key={def.key}
                className={cn("flex items-center gap-3 px-5 py-3.5 transition-colors",
                  exists ? "hover:bg-secondary/20 cursor-pointer" : "cursor-default opacity-50")}
                onClick={() => exists && match && setBriefingSheet(match)}
              >
                <div className={cn("h-2 w-2 rounded-full shrink-0",
                  exists ? reviewed ? "bg-emerald-400" : "bg-primary" : "border border-border")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-semibold text-foreground">{def.label}</span>
                    {exists && !reviewed && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">Pendente revisão</Badge>}
                    {reviewed && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-400/10 text-emerald-400 border-emerald-400/25">Revisado</Badge>}
                    {!exists && def.importable && <span className="text-[10px] text-muted-foreground/40 border border-dashed border-border/40 px-1.5 py-0.5 rounded">Importável</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{def.description}</p>
                  {prev && <p className="text-[11px] text-muted-foreground/50 mt-0.5 line-clamp-1 italic">{prev}</p>}
                </div>
                {exists && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ══ BLOCOS DE CONHECIMENTO ═══════════════════════ */}
      <div className="grid gap-3 lg:grid-cols-2">
        {BLOCKS.map((block) => {
          const blockCtx = getBlockCtx(block.key, block.types);
          const sigs = allSignals.get(block.key) ?? [];
          const count = sigs.length + blockCtx.length;
          const Icon = block.icon;
          return (
            <BlockCard key={block.key} blockKey={block.key} label={block.label} icon={Icon}
              color={block.color} hint={block.hint} count={count}>
              <div className="divide-y divide-border/30">
                {sigs.map((sig, i) => (
                  <div key={i} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <div className="mt-1 h-1.5 w-1.5 rounded-full shrink-0" style={{ background: block.color }} />
                      <div>
                        <p className="text-xs font-semibold text-foreground">{sig.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sig.summary}</p>
                      </div>
                    </div>
                  </div>
                ))}
                {blockCtx.slice(0, 6).map((ctx) => (
                  <button key={ctx.id} type="button"
                    onClick={() => ctx.context_type === "briefing" ? setBriefingSheet(ctx) : setEntrySheet(ctx)}
                    className="w-full flex items-start gap-2.5 px-4 py-3 hover:bg-secondary/20 transition-colors text-left group">
                    <div className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 opacity-40" style={{ background: block.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="text-xs font-medium text-foreground">{ctx.title}</span>
                        {ctx.is_key_decision && <span className="text-[10px] text-amber-400">Decisão-chave</span>}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{ctx.content}</p>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                  </button>
                ))}
                {blockCtx.length > 6 && (
                  <p className="px-4 py-2 text-[10px] text-muted-foreground/50">+{blockCtx.length - 6} entradas</p>
                )}
              </div>
            </BlockCard>
          );
        })}
      </div>

      {/* ══ PLANO DE TASKS ═══════════════════════════════ */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Plano operacional ativo</p>
          {tasks.total > 0 && <span className="ml-auto text-sm font-bold text-primary">{Math.round((tasks.done / tasks.total) * 100)}%</span>}
        </div>
        {tasks.total === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma task criada neste workspace.</p>
        ) : (
          <>
            <Progress value={(tasks.done / tasks.total) * 100} className="h-1 mb-3" />
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Total",       v: tasks.total,       c: "text-foreground" },
                { label: "Concluídas",  v: tasks.done,        c: "text-emerald-400" },
                { label: "Em andamento",v: tasks.in_progress, c: "text-primary" },
                { label: "Bloqueadas",  v: tasks.blocked,     c: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-secondary/30 py-2.5 text-center">
                  <p className={cn("text-xl font-bold tabular-nums", s.c)}>{s.v}</p>
                  <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ══ SHEETS ═══════════════════════════════════════ */}
      <GlassSheet open={!!briefingSheet} onClose={() => setBriefingSheet(null)}>
        {briefingSheet && (
          <BriefingSheetContent entry={briefingSheet} workspaceId={workspaceId} clientId={clientId}
            clientName={clientMetadata?.name as string | undefined} onClose={() => setBriefingSheet(null)} />
        )}
      </GlassSheet>
      <GlassSheet open={!!entrySheet} onClose={() => setEntrySheet(null)}>
        {entrySheet && <EntrySheetContent entry={entrySheet} onClose={() => setEntrySheet(null)} />}
      </GlassSheet>
    </div>
  );
}
