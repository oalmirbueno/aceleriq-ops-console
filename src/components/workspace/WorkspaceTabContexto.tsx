/**
 * WorkspaceTabContexto — hub de contexto operacional.
 *
 * 5 hubs visuais:
 *  1. Briefings do cliente (recebidos via link) — status live, preview, download
 *  2. Briefings internos (importados/essencial/sitebolt) — preview completo, download PDF
 *  3. Contexto importado (docs externos, PDFs, markdown) — upload e visualização
 *  4. Base de conhecimento (dores, objetivos, diagnósticos, anotações, decisões)
 *  5. Alinhamentos (reuniões, transcrições)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, Star, ExternalLink, Upload, FileText, FolderOpen,
  ChevronDown, ChevronRight, Eye, Link2, Download, Trash2,
  Send, Clock, CheckCircle2, AlertCircle, RefreshCw, Sparkles,
  Loader2, X, ArrowRight, Bot, Building2, MessageSquare,
  Paperclip, Target, Search, Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ContextEntryDialog, { type ContextFormData } from "./ContextEntryDialog";
import ImportContextDialog from "./ImportContextDialog";
import ImportBriefingDialog from "./ImportBriefingDialog";
import BriefingSignalReview from "./BriefingSignalReview";
import GenerateBriefingLinkDialog from "./GenerateBriefingLinkDialog";
import { normalizeTags } from "@/lib/normalizeTags";
import { CONTEXT_TYPES, getContextLabel, type ContextType } from "./contextTypes";
import { type BriefingKind } from "@/lib/briefingToken";
import { exportBriefingPdf, exportBriefingMarkdown, type ConsolidatedBriefing } from "@/lib/briefingExport";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────

interface ContextEntry {
  id: string;
  context_type: string;
  title: string;
  content: string;
  source_label: string | null;
  source_url: string | null;
  happened_at: string | null;
  is_key_decision: boolean;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  workspaceId: string;
  clientId: string;
  clientName?: string;
}

// ─── Helpers ─────────────────────────────────────────────────

function readBriefingKind(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.briefing_kind as string) ?? (meta?.briefing_type as string) ?? undefined;
}

function getImportSource(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.import_source as string) ?? (meta?.imported === true ? "legacy" : undefined);
}

function isClientSubmitted(meta: Record<string, unknown> | null): boolean {
  return meta?.import_source === "client_form" || meta?.submitted_by_client === true;
}

function getBriefingStatus(entry: ContextEntry): "submitted" | "draft" | "pending" {
  const meta = entry.metadata;
  if (!meta) return "pending";
  if (meta.public_briefing_status === "submitted" || meta.submitted_by_client === true) return "submitted";
  if (meta.public_briefing_status === "draft") return "draft";
  return "submitted"; // has content = submitted
}

function stripMd(s: string) {
  return s.replace(/^##\s+/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/---/g, " ").replace(/\n+/g, " ").trim();
}

function getPreview(entry: ContextEntry): string {
  const sigs = entry.metadata?.structured_signals as Record<string, { summary?: string }> | undefined;
  if (sigs) {
    const arr = Object.values(sigs).map((s) => s?.summary?.trim()).filter(Boolean).slice(0, 2) as string[];
    if (arr.length) return arr.join(" · ");
  }
  return stripMd(entry.content ?? "").slice(0, 180);
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

const BRIEFING_LABELS: Record<string, string> = {
  essential:              "Briefing Essencial",
  sitebolt:               "Briefing SiteBolt",
  enterprise_structuring: "Estruturação Empresarial",
  ai_automation:          "Automação e IA",
};

const BRIEFING_ICONS: Record<string, typeof FileText> = {
  essential:              FileText,
  sitebolt:               Building2,
  enterprise_structuring: Building2,
  ai_automation:          Bot,
};

const BRIEFING_COLORS: Record<string, string> = {
  essential:              "#00FF88",
  sitebolt:               "#60A5FA",
  enterprise_structuring: "#8B5CF6",
  ai_automation:          "#06B6D4",
};

const KNOWLEDGE_TYPES: Array<{ types: ContextType[]; label: string; icon: typeof Target; color: string; hint: string }> = [
  { types: ["dor"],       label: "Dores",         icon: AlertCircle,   color: "#EF4444", hint: "Problemas e gargalos identificados" },
  { types: ["objetivo"],  label: "Objetivos",     icon: Target,        color: "#10B981", hint: "Metas e resultados esperados" },
  { types: ["diagnostico"],label: "Diagnósticos", icon: Search,        color: "#14B8A6", hint: "Análises e mapeamentos" },
  { types: ["decisao"],   label: "Decisões",      icon: Scale,         color: "#F59E0B", hint: "Decisões estratégicas e prioridades" },
  { types: ["anotacao"],  label: "Anotações",     icon: Paperclip,     color: "#94A3B8", hint: "Registros e observações" },
];

const IMPORT_SOURCE_LABELS: Record<string, string> = {
  legacy_import:  "Importado",
  legacy:         "Importado",
  markdown:       "Markdown",
  pdf:            "PDF",
  document:       "Documento",
  notion:         "Notion",
  client_form:    "Cliente",
};

// ─── BriefingSheet ───────────────────────────────────────────

function BriefingSheet({ entry, workspaceId, clientId, clientName, onClose }: {
  entry: ContextEntry; workspaceId: string; clientId: string;
  clientName?: string; onClose: () => void;
}) {
  const [consolidated, setConsolidated] = useState<ConsolidatedBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const kind = readBriefingKind(entry.metadata);
  const Icon = kind ? (BRIEFING_ICONS[kind] ?? FileText) : FileText;
  const color = kind ? (BRIEFING_COLORS[kind] ?? "#00FF88") : "#00FF88";
  const kindLabel = kind ? (BRIEFING_LABELS[kind] ?? kind) : "Briefing";
  const status = getBriefingStatus(entry);

  useEffect(() => {
    async function tryLoad() {
      setLoading(true);
      try {
        const { data } = await supabase.functions.invoke("consolidate-briefing", {
          body: { workspaceId, clientId, cacheOnly: true },
        });
        if (data?.briefing) setConsolidated(data.briefing as ConsolidatedBriefing);
      } catch { /* cache miss */ }
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
      toast({ title: "Erro", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    } finally { setGenerating(false); }
  };

  const downloadPdf = () => {
    if (consolidated) { exportBriefingPdf(consolidated, clientName ?? "Cliente"); return; }
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${entry.title}</title>
      <style>body{font-family:'Segoe UI',system-ui,sans-serif;padding:40px;max-width:840px;margin:0 auto;color:#111}
      h1{font-size:22px;border-bottom:2px solid ${color};padding-bottom:10px;margin-bottom:20px}
      h2{font-size:14px;color:#444;margin-top:24px;font-weight:600}
      p{font-size:13px;line-height:1.7;color:#444}
      .meta{font-size:11px;color:#888;margin-bottom:20px}hr{border:none;border-top:1px solid #e5e7eb;margin:16px 0}
      </style></head><body>
      <h1>${entry.title}</h1>
      <p class="meta">${clientName ?? ""} · ${kindLabel} · ${formatDate(entry.created_at)}</p>
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
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entry.title.replace(/[^a-z0-9]/gi, "_")}.md`;
    a.click();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="p-0 gap-0 border border-white/10 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden sm:rounded-2xl" style={{ background: "rgba(9,17,10,0.92)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)" }}><DialogTitle className="sr-only">Detalhes</DialogTitle>
        <div className="px-5 py-4 border-b border-border shrink-0 pr-12" style={{ borderBottomColor: `${color}25` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
                style={{ background: `${color}15`, border: `1px solid ${color}35` }}>
                <Icon className="h-5 w-5" style={{ color }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{kindLabel}</span>
                  {status === "submitted" && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-400/10 text-emerald-400 border-emerald-400/25">Recebido</Badge>}
                  {status === "draft" && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-400 border-amber-400/30">Em preenchimento</Badge>}
                  {entry.metadata?.import_review_status === "reviewed" && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/25">Revisado</Badge>}
                </div>
                <h2 className="text-base font-semibold text-foreground leading-tight">{entry.title}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{formatDate(entry.created_at)}</p>
              </div>
            </div>
            </div>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <Button onClick={generate} disabled={generating} size="sm" className="h-7 text-xs gap-1.5"
              style={{ background: `${color}15`, color, border: `1px solid ${color}35` }}>
              {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              {consolidated ? "Regenerar" : "Consolidar com IA"}
            </Button>
            <Button onClick={downloadPdf} size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Download className="h-3 w-3" /> PDF
            </Button>
            <Button onClick={downloadMd} size="sm" variant="outline" className="h-7 text-xs gap-1.5">
              <Download className="h-3 w-3" /> Markdown
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-5">
            {loading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : consolidated ? (
              <div className="space-y-6">
                {consolidated.sections?.map((sec: any, si: number) => (
                  <section key={si}>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3 pb-2 border-b border-border/50"
                      style={{ color }}>{sec.title}</h3>
                    <div className="space-y-3">
                      {sec.answers?.map((ans: any, ai: number) => (
                        <div key={ai}>
                          <p className="text-xs font-semibold text-foreground/80 mb-0.5">{ans.question}</p>
                          <p className="text-sm text-muted-foreground leading-relaxed">{ans.answer}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground leading-relaxed">
                  {entry.content
                    ? entry.content.split("\n").map((line, i) => {
                        if (line.startsWith("## ")) return <h3 key={i} className="text-sm font-semibold text-foreground mt-5 mb-1.5">{line.replace("## ", "")}</h3>;
                        if (/^\*\*(.+)\*\*$/.test(line)) return <p key={i} className="text-xs font-semibold text-foreground/80 mt-4">{line.replace(/\*\*/g, "")}</p>;
                        if (line === "---") return <hr key={i} className="border-border/40 my-3" />;
                        if (!line.trim()) return <div key={i} className="h-2" />;
                        return <p key={i} className="text-sm text-muted-foreground leading-relaxed">{line}</p>;
                      })
                    : <p className="italic text-muted-foreground/60">Sem conteúdo disponível.</p>
                  }
                </div>
                <div className="rounded-xl border p-4" style={{ background: `${color}06`, borderColor: `${color}20` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5" style={{ color }} />
                    <p className="text-xs font-semibold text-foreground">Versão consolidada por IA</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">Gere uma versão estruturada com seções, análise e próximos passos.</p>
                  <Button onClick={generate} disabled={generating} size="sm" className="h-7 text-xs gap-1.5"
                    style={{ background: `${color}15`, color, border: `1px solid ${color}35` }}>
                    {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Gerar agora
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div></DialogContent></Dialog>
  );
}

// ─── EntrySheet ──────────────────────────────────────────────

function EntrySheet({ entry, onClose, onEdit, onDelete }: {
  entry: ContextEntry; onClose: () => void;
  onEdit: (entry: ContextEntry) => void;
  onDelete: (entry: ContextEntry) => void;
}) {
  const downloadFile = () => {
    const blob = new Blob([entry.content ?? ""], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${entry.title.replace(/[^a-z0-9]/gi, "_")}.txt`;
    a.click();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}><DialogContent className="p-0 gap-0 border border-white/10 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden sm:rounded-2xl" style={{ background: "rgba(9,17,10,0.92)", backdropFilter: "blur(32px) saturate(200%)", WebkitBackdropFilter: "blur(32px) saturate(200%)", boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)" }}><DialogTitle className="sr-only">Detalhes</DialogTitle>
        <div className="px-5 py-4 border-b border-border shrink-0 pr-12">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{getContextLabel(entry.context_type)}</span>
                {entry.is_key_decision && <span className="text-[10px] text-amber-400 font-semibold">Decisão-chave</span>}
                {entry.source_label && <span className="text-[10px] text-muted-foreground/70">{entry.source_label}</span>}
              </div>
              <h2 className="text-base font-semibold text-foreground">{entry.title}</h2>
              {entry.happened_at && <p className="text-xs text-muted-foreground mt-0.5">{formatDate(entry.happened_at)}</p>}
              {entry.tags && entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {entry.tags.map((t) => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground">{t}</span>)}
                </div>
              )}
            </div>
            </div>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => { onEdit(entry); onClose(); }}>
              Editar
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={downloadFile}>
              <Download className="h-3 w-3" /> Baixar
            </Button>
            {entry.source_url && (
              <a href={entry.source_url} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"><ExternalLink className="h-3 w-3" /> Fonte</Button>
              </a>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
              onClick={() => { onDelete(entry); onClose(); }}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {entry.content || <span className="italic opacity-50">Sem conteúdo.</span>}
          </div>
        </div></DialogContent></Dialog>
  );
}

// ─── Hub section wrapper ─────────────────────────────────────

function HubSection({ icon: Icon, label, color, count, hint, children, defaultOpen = true }: {
  icon: typeof FileText; label: string; color: string; count: number;
  hint?: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-secondary/20 transition-colors select-none">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{label}</span>
            {count > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
              style={{ background: `${color}15`, color }}>{count}</span>}
          </div>
          {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
        </div>
        {open ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
               : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />}
      </button>
      {open && <div className="border-t border-border/50">{children}</div>}
    </div>
  );
}

// ─── Entry card ──────────────────────────────────────────────

function EntryCard({ entry, onClick, onStar, color = "#00FF88" }: {
  entry: ContextEntry; onClick: () => void;
  onStar?: () => void; color?: string;
}) {
  const preview = getPreview(entry);
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors group border-b border-border/30 last:border-0">
      <div className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: color }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="text-sm font-medium text-foreground">{entry.title}</span>
          {entry.is_key_decision && <span className="text-[10px] text-amber-400 font-semibold">Decisão-chave</span>}
          {entry.tags?.slice(0, 2).map((t) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">{t}</span>
          ))}
        </div>
        {preview && <p className="text-xs text-muted-foreground line-clamp-1 leading-relaxed">{preview}</p>}
        {entry.happened_at && <p className="text-[10px] text-muted-foreground/50 mt-0.5">{formatDate(entry.happened_at)}</p>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {onStar && (
          <span onClick={(e) => { e.stopPropagation(); onStar(); }}
            className="p-1 rounded hover:bg-secondary transition-colors">
            <Star className={cn("h-3 w-3", entry.is_key_decision ? "text-amber-400 fill-amber-400" : "text-muted-foreground")} />
          </span>
        )}
        <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
      </div>
    </button>
  );
}

// ─── Main component ──────────────────────────────────────────

export default function WorkspaceTabContexto({ workspaceId, clientId, clientName }: Props) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ContextEntry | null>(null);
  const [briefingType, setBriefingType] = useState<"essential" | "sitebolt" | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkBriefingType, setLinkBriefingType] = useState<BriefingKind | undefined>(undefined);
  const [activeSheet, setActiveSheet] = useState<ContextEntry | null>(null);
  const [sheetMode, setSheetMode] = useState<"briefing" | "entry">("entry");

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("context_entries")
      .select("id, context_type, title, content, source_label, source_url, happened_at, is_key_decision, tags, metadata, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Erro ao carregar contextos", description: error.message, variant: "destructive" });
    setEntries((data as ContextEntry[]) ?? []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // Realtime: refresh when new briefing arrives from client
  useEffect(() => {
    const ch = supabase.channel(`ctx:${workspaceId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "context_entries",
        filter: `workspace_id=eq.${workspaceId}` }, () => { fetchEntries(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [workspaceId, fetchEntries]);

  const handleCreate = async (form: ContextFormData) => {
    const { error } = await supabase.from("context_entries").insert({
      workspace_id: workspaceId, client_id: clientId,
      context_type: form.context_type, title: form.title.trim(),
      content: form.content.trim(), happened_at: form.happened_at || null,
      source_label: form.source_label.trim() || null,
      source_url: form.source_url.trim() || null,
      tags: normalizeTags(form.tags), is_key_decision: form.is_key_decision,
    });
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); throw error; }
    if (form.is_key_decision || form.context_type === "decisao") {
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId, client_id: clientId, event_type: "context_added",
        title: `Contexto registrado: ${form.title.trim()}`,
        description: `Tipo: ${form.context_type}${form.is_key_decision ? " · Decisão-chave" : ""}`,
        happened_at: form.happened_at || new Date().toISOString(),
      });
    }
    toast({ title: "Contexto criado" });
    await fetchEntries();
  };

  const handleEdit = async (form: ContextFormData) => {
    if (!editEntry) return;
    const { error } = await supabase.from("context_entries").update({
      context_type: form.context_type, title: form.title.trim(), content: form.content.trim(),
      happened_at: form.happened_at || null, source_label: form.source_label.trim() || null,
      source_url: form.source_url.trim() || null, tags: normalizeTags(form.tags),
      is_key_decision: form.is_key_decision,
    }).eq("id", editEntry.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); throw error; }
    toast({ title: "Atualizado" });
    setEditEntry(null);
    await fetchEntries();
  };

  const toggleStar = async (entry: ContextEntry) => {
    const { error } = await supabase.from("context_entries")
      .update({ is_key_decision: !entry.is_key_decision }).eq("id", entry.id);
    if (!error) setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, is_key_decision: !e.is_key_decision } : e));
  };

  const deleteEntry = async (entry: ContextEntry) => {
    if (!window.confirm(`Excluir "${entry.title}"?`)) return;
    const { error } = await supabase.from("context_entries").delete().eq("id", entry.id);
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Removido" });
    await fetchEntries();
  };

  const openSheet = (entry: ContextEntry, mode: "briefing" | "entry") => {
    setActiveSheet(entry);
    setSheetMode(mode);
  };

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  // Partition entries
  const allBriefings     = entries.filter((e) => e.context_type === "briefing");
  const clientReceived   = allBriefings.filter((e) => isClientSubmitted(e.metadata));
  const clientPending    = allBriefings.filter((e) => {
    const m = e.metadata;
    return !isClientSubmitted(m) && (m?.public_briefing_status === "draft" || m?.source_token);
  });
  const internalBriefings = allBriefings.filter((e) => !isClientSubmitted(e.metadata) && !e.metadata?.source_token);
  const importedCtx      = entries.filter((e) => e.context_type !== "briefing" && !!getImportSource(e.metadata));
  const knowledge        = entries.filter((e) => e.context_type !== "briefing" && !getImportSource(e.metadata) && !["reuniao","transcricao"].includes(e.context_type));
  const alignments       = entries.filter((e) => ["reuniao","transcricao"].includes(e.context_type));
  const keyDecisions     = entries.filter((e) => e.is_key_decision);

  return (
    <div className="space-y-3 animate-fade-in">

      {/* ── Toolbar ────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Contexto operacional</p>
          <span className="text-xs text-muted-foreground">{entries.length} registros</span>
          {clientReceived.length > 0 && (
            <Badge className="text-[10px] bg-emerald-400/10 text-emerald-400 border-emerald-400/25">
              {clientReceived.length} briefing{clientReceived.length > 1 ? "s" : ""} recebido{clientReceived.length > 1 ? "s" : ""}
            </Badge>
          )}
          {clientPending.length > 0 && (
            <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-400/30">
              {clientPending.length} pendente{clientPending.length > 1 ? "s" : ""}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Importar briefing
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setBriefingType("essential")}>Briefing Essencial</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBriefingType("sitebolt")}>Briefing SiteBolt</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
                <Send className="h-3.5 w-3.5" /> Enviar ao cliente
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setLinkBriefingType("enterprise_structuring"); setLinkDialogOpen(true); }}>Estruturação Empresarial</DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setLinkBriefingType("ai_automation"); setLinkDialogOpen(true); }}>Automação e IA</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" /> Importar
          </Button>
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Novo
          </Button>
        </div>
      </div>

      {/* ── 1. Briefings recebidos do cliente ─────────── */}
      <HubSection icon={CheckCircle2} label="Briefings recebidos" color="#10B981"
        count={clientReceived.length + clientPending.length}
        hint="Briefings enviados ao cliente e seus status de preenchimento">
        {clientReceived.length === 0 && clientPending.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <Clock className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum briefing enviado ao cliente ainda.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Use "Enviar ao cliente" para gerar um link de briefing.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {clientPending.map((e) => (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10 shrink-0">
                  <Clock className="h-4 w-4 text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{e.title}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-400 border-amber-400/30">Em preenchimento</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Link enviado · aguardando resposta do cliente</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1 text-amber-400" onClick={() => openSheet(e, "briefing")}>
                  <Eye className="h-3 w-3" /> Ver
                </Button>
              </div>
            ))}
            {clientReceived.map((e) => {
              const kind = readBriefingKind(e.metadata);
              const color = kind ? (BRIEFING_COLORS[kind] ?? "#10B981") : "#10B981";
              const Icon = kind ? (BRIEFING_ICONS[kind] ?? FileText) : FileText;
              return (
                <button key={e.id} type="button" onClick={() => openSheet(e, "briefing")}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left group">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                    style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{e.title}</span>
                      <Badge className="text-[10px] px-1.5 py-0 h-4 bg-emerald-400/10 text-emerald-400 border-emerald-400/25">Recebido</Badge>
                      {e.metadata?.import_review_status === "reviewed" && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/25">Revisado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{getPreview(e)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={(ev) => { ev.stopPropagation(); const blob = new Blob([e.content], { type: "text/plain" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = e.title + ".txt"; a.click(); }}>
                      <Download className="h-3 w-3" />
                    </Button>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </HubSection>

      {/* ── 2. Briefings internos ─────────────────────── */}
      <HubSection icon={FileText} label="Briefings internos" color="#00FF88"
        count={internalBriefings.length}
        hint="Essencial, SiteBolt e briefings importados manualmente">
        {internalBriefings.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhum briefing interno.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Importe um briefing Essencial ou SiteBolt.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {internalBriefings.map((e) => {
              const kind = readBriefingKind(e.metadata);
              const color = kind ? (BRIEFING_COLORS[kind] ?? "#00FF88") : "#00FF88";
              const Icon = kind ? (BRIEFING_ICONS[kind] ?? FileText) : FileText;
              const reviewed = e.metadata?.import_review_status === "reviewed";
              return (
                <button key={e.id} type="button" onClick={() => openSheet(e, "briefing")}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left group">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg shrink-0"
                    style={{ background: `${color}15`, border: `1px solid ${color}25` }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{e.title}</span>
                      {kind && <span className="text-[10px] font-medium" style={{ color }}>{BRIEFING_LABELS[kind] ?? kind}</span>}
                      {reviewed && <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/25">Revisado</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{getPreview(e)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </HubSection>

      {/* ── 3. Contexto importado ─────────────────────── */}
      <HubSection icon={Upload} label="Contexto importado" color="#60A5FA"
        count={importedCtx.length}
        hint="Documentos, PDFs, markdown e planejamentos anteriores importados">
        {importedCtx.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <Upload className="h-6 w-6 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum documento externo importado.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Importe PDFs, markdown ou planejamentos anteriores.</p>
            <Button size="sm" variant="outline" className="mt-3 h-7 text-xs gap-1.5" onClick={() => setImportOpen(true)}>
              <Upload className="h-3 w-3" /> Importar agora
            </Button>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {importedCtx.map((e) => {
              const src = getImportSource(e.metadata);
              const srcLabel = src ? (IMPORT_SOURCE_LABELS[src] ?? src) : "Importado";
              return (
                <button key={e.id} type="button" onClick={() => openSheet(e, "entry")}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left group">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-400/10 border border-blue-400/25 shrink-0">
                    <FileText className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{e.title}</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-blue-400 border-blue-400/30">{srcLabel}</Badge>
                      <span className="text-[10px] text-muted-foreground/60">{getContextLabel(e.context_type)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-1">{getPreview(e)}</p>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </HubSection>

      {/* ── 4. Base de conhecimento ───────────────────── */}
      <HubSection icon={MessageSquare} label="Base de conhecimento" color="#8B5CF6"
        count={knowledge.length}
        hint="Dores, objetivos, diagnósticos, decisões e anotações">
        {knowledge.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm text-muted-foreground">Nenhum contexto na base de conhecimento.</p>
            <Button size="sm" className="mt-3 h-7 text-xs gap-1.5" onClick={() => setDialogOpen(true)}>
              <Plus className="h-3 w-3" /> Adicionar
            </Button>
          </div>
        ) : (
          <div>
            {KNOWLEDGE_TYPES.map(({ types, label, icon: Icon, color, hint }) => {
              const items = knowledge.filter((e) => types.includes(e.context_type as ContextType));
              if (items.length === 0) return null;
              return (
                <div key={label} className="border-b border-border/30 last:border-0">
                  <div className="flex items-center gap-2 px-4 py-2 bg-secondary/10">
                    <Icon className="h-3 w-3 shrink-0" style={{ color }} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
                    <span className="text-[10px] text-muted-foreground/60">{items.length}</span>
                  </div>
                  <div className="divide-y divide-border/20">
                    {items.map((e) => (
                      <EntryCard key={e.id} entry={e} color={color}
                        onClick={() => openSheet(e, "entry")}
                        onStar={() => toggleStar(e)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </HubSection>

      {/* ── 5. Alinhamentos ───────────────────────────── */}
      {alignments.length > 0 && (
        <HubSection icon={MessageSquare} label="Alinhamentos" color="#F59E0B"
          count={alignments.length}
          hint="Reuniões e transcrições" defaultOpen={false}>
          <div className="divide-y divide-border/30">
            {alignments.map((e) => (
              <EntryCard key={e.id} entry={e} color="#F59E0B"
                onClick={() => openSheet(e, "entry")}
                onStar={() => toggleStar(e)} />
            ))}
          </div>
        </HubSection>
      )}

      {/* ── Dialogs ───────────────────────────────────── */}
      <ContextEntryDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} mode="create" />
      {editEntry && (
        <ContextEntryDialog
          open={!!editEntry}
          onOpenChange={(o) => !o && setEditEntry(null)}
          onSubmit={handleEdit}
          mode="edit"
          initial={{
            context_type: editEntry.context_type as ContextFormData["context_type"],
            title: editEntry.title,
            content: editEntry.content,
            happened_at: editEntry.happened_at ?? "",
            source_label: editEntry.source_label ?? "",
            source_url: editEntry.source_url ?? "",
            tags: (editEntry.tags ?? []).join(", "),
            is_key_decision: editEntry.is_key_decision,
          }}
        />
      )}
      <ImportContextDialog open={importOpen} onOpenChange={setImportOpen} workspaceId={workspaceId} clientId={clientId} onImported={fetchEntries} />
      {briefingType && (
        <ImportBriefingDialog open={!!briefingType} onOpenChange={(o) => !o && setBriefingType(null)}
          workspaceId={workspaceId} clientId={clientId} briefingType={briefingType} onImported={fetchEntries} />
      )}
      {linkDialogOpen && (
        <GenerateBriefingLinkDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}
          workspaceId={workspaceId} clientId={clientId} clientName={clientName ?? "Cliente"}
          defaultBriefingType={linkBriefingType} />
      )}
      {entries
        .filter((e) => e.context_type === "briefing" && (e.metadata?.structured_signals || e.metadata?.import_review_status === "pending_review"))
        .map((e) => (
          <BriefingSignalReview key={e.id} entryId={e.id} metadata={e.metadata ?? {}} onUpdated={fetchEntries} />
        ))}
      {activeSheet && sheetMode === "briefing" && (
        <BriefingSheet entry={activeSheet} workspaceId={workspaceId} clientId={clientId}
          clientName={clientName} onClose={() => setActiveSheet(null)} />
      )}
      {activeSheet && sheetMode === "entry" && (
        <EntrySheet entry={activeSheet} onClose={() => setActiveSheet(null)}
          onEdit={(e) => setEditEntry(e)}
          onDelete={deleteEntry} />
      )}
    </div>
  );
}
