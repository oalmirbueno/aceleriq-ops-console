import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Star,
  ExternalLink,
  Upload,
  FileText,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Eye,
  Link2,
  Download,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ContextEntryDialog, { type ContextFormData } from "./ContextEntryDialog";
import ImportContextDialog from "./ImportContextDialog";
import ImportBriefingDialog from "./ImportBriefingDialog";
import { normalizeTags } from "@/lib/normalizeTags";
import { CONTEXT_TYPES, getContextLabel, type ContextType } from "./contextTypes";
import BriefingSignalReview from "./BriefingSignalReview";
import GenerateBriefingLinkDialog from "./GenerateBriefingLinkDialog";
import type { BriefingKind } from "@/lib/briefingToken";
import { cn } from "@/lib/utils";

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

type ContextSectionKey = "briefings" | "contextos" | "alinhamentos" | "rotas_conexoes";

interface ContextFolder {
  type: string;
  label: string;
  entries: ContextEntry[];
}

interface ContextSection {
  key: ContextSectionKey;
  label: string;
  description: string;
  folders: ContextFolder[];
}

const CONTEXT_SECTIONS: Array<{
  key: ContextSectionKey;
  label: string;
  description: string;
  types: ContextType[];
}> = [
  {
    key: "briefings",
    label: "Briefings",
    description: "Briefings importados, internos e recebidos por link do cliente.",
    types: ["briefing"],
  },
  {
    key: "contextos",
    label: "Contextos",
    description: "Base viva do trabalho: dores, objetivos, diagnósticos e anotações.",
    types: ["dor", "objetivo", "diagnostico", "anotacao"],
  },
  {
    key: "alinhamentos",
    label: "Alinhamentos",
    description: "Reuniões, transcrições e decisões registradas no workspace.",
    types: ["reuniao", "transcricao", "decisao"],
  },
  {
    key: "rotas_conexoes",
    label: "Rotas & Conexões",
    description: "Acessos, logins, dependências e conexões operacionais.",
    types: ["acesso"],
  },
];

const BRIEFING_KIND_LABELS: Record<string, string> = {
  essential: "Briefing Essencial",
  sitebolt: "Briefing SiteBolt",
  enterprise_structuring: "Estruturação Empresarial",
  ai_automation: "Automação e IA",
};

function groupEntriesBySection(entries: ContextEntry[]): ContextSection[] {
  return CONTEXT_SECTIONS.map((section) => ({
    key: section.key,
    label: section.label,
    description: section.description,
    folders: section.types
      .map((type) => ({
        type,
        label: getContextLabel(type),
        entries: entries.filter((entry) => entry.context_type === type),
      }))
      .filter((folder) => folder.entries.length > 0),
  })).filter((section) => section.folders.length > 0);
}

function readBriefingKind(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined;
  return (meta.briefing_kind as string) ?? (meta.briefing_type as string) ?? undefined;
}

function getBriefingLabel(meta: Record<string, unknown> | null, fallbackTitle: string): string {
  const kind = readBriefingKind(meta);
  return kind ? (BRIEFING_KIND_LABELS[kind] ?? fallbackTitle) : fallbackTitle;
}

function getBriefingOrigin(meta: Record<string, unknown> | null): string | null {
  const importSource = (meta?.import_source as string | undefined) ?? null;
  if (!importSource) return null;
  if (importSource === "client_form") return "Recebido por link";
  if (importSource === "native_form") return "Interno";
  return "Importado";
}

function stripBriefingMarkdown(content: string): string {
  return content
    .replace(/^##\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/_\((.+?)\)_/g, "($1)")
    .replace(/---/g, " ")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getBriefingPreview(entry: ContextEntry): string {
  const structuredSignals = entry.metadata?.structured_signals as Record<string, { summary?: string }> | undefined;
  if (structuredSignals) {
    const summaries = Object.values(structuredSignals)
      .map((signal) => signal?.summary?.trim())
      .filter(Boolean)
      .slice(0, 2) as string[];

    if (summaries.length > 0) {
      return summaries.join(" · ");
    }
  }

  return stripBriefingMarkdown(entry.content).slice(0, 240);
}

export default function WorkspaceTabContexto({ workspaceId, clientId, clientName }: Props) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ContextEntry | null>(null);
  const [briefingType, setBriefingType] = useState<"essential" | "sitebolt" | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkBriefingType, setLinkBriefingType] = useState<BriefingKind | undefined>(undefined);
  const [openSections, setOpenSections] = useState<Set<ContextSectionKey>>(
    new Set(CONTEXT_SECTIONS.map((section) => section.key))
  );
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set(CONTEXT_TYPES));
  const [expandedContent, setExpandedContent] = useState<Set<string>>(new Set());

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("context_entries")
      .select("id, context_type, title, content, source_label, source_url, happened_at, is_key_decision, tags, metadata, created_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar contextos", description: error.message, variant: "destructive" });
    }

    setEntries((data as ContextEntry[]) ?? []);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleCreate = async (form: ContextFormData) => {
    const row = {
      workspace_id: workspaceId,
      client_id: clientId,
      context_type: form.context_type,
      title: form.title.trim(),
      content: form.content.trim(),
      happened_at: form.happened_at || null,
      source_label: form.source_label.trim() || null,
      source_url: form.source_url.trim() || null,
      tags: normalizeTags(form.tags),
      is_key_decision: form.is_key_decision,
    };

    const { error } = await supabase.from("context_entries").insert(row);
    if (error) {
      toast({ title: "Erro ao criar contexto", description: error.message, variant: "destructive" });
      throw error;
    }

    if (form.is_key_decision || form.context_type === "decisao") {
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "context_added",
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

    const { error } = await supabase
      .from("context_entries")
      .update({
        context_type: form.context_type,
        title: form.title.trim(),
        content: form.content.trim(),
        happened_at: form.happened_at || null,
        source_label: form.source_label.trim() || null,
        source_url: form.source_url.trim() || null,
        tags: normalizeTags(form.tags),
        is_key_decision: form.is_key_decision,
      })
      .eq("id", editEntry.id);

    if (error) {
      toast({ title: "Erro ao editar contexto", description: error.message, variant: "destructive" });
      throw error;
    }

    toast({ title: "Contexto atualizado" });
    setEditEntry(null);
    await fetchEntries();
  };

  const toggleKeyDecision = async (entry: ContextEntry) => {
    const { error } = await supabase
      .from("context_entries")
      .update({ is_key_decision: !entry.is_key_decision })
      .eq("id", entry.id);

    if (!error) {
      setEntries((prev) =>
        prev.map((current) => current.id === entry.id ? { ...current, is_key_decision: !current.is_key_decision } : current)
      );
    }
  };

  const toggleSection = (key: ContextSectionKey) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const toggleFolder = (type: string) => {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const toggleContentExpand = (id: string) => {
    setExpandedContent((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDownloadBriefingPDF = (entry: ContextEntry) => {
    const title = getBriefingLabel(entry.metadata, entry.title);
    const content = entry.content?.trim() || "Conteúdo indisponível.";
    const w = window.open("", "_blank");
    if (!w) return;

    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
      <style>
        body{font-family:'Segoe UI',system-ui,sans-serif;padding:40px;max-width:860px;margin:0 auto;color:#1a1a1a}
        h1{font-size:24px;border-bottom:2px solid #22c55e;padding-bottom:12px;margin-bottom:24px}
        h2{font-size:16px;color:#15803d;margin-top:28px;margin-bottom:8px}
        p,strong{font-size:13px;line-height:1.7}
        strong{display:block;margin-top:12px;color:#1f2937}
        hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
        .meta{font-size:11px;color:#6b7280;margin-bottom:20px}
        em{color:#6b7280}
      </style></head><body>
      <h1>${title}</h1>
      <p class="meta">${clientName ? `${clientName} · ` : ""}${new Date(entry.created_at).toLocaleDateString("pt-BR")}</p>
      ${content
        .replace(/## (.+)/g, "<h2>$1</h2>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/_\((.+?)\)_/g, "<em>($1)</em>")
        .replace(/---/g, "<hr>")
        .replace(/\n/g, "<br>")}
    </body></html>`);
    w.document.close();
    w.print();
  };

  const handleDeleteEntry = async (entry: ContextEntry) => {
    if (!window.confirm(`Tem certeza que deseja apagar "${entry.title}"? Essa ação não pode ser desfeita.`)) return;

    const { error } = await supabase.from("context_entries").delete().eq("id", entry.id);
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Contexto apagado" });
    await fetchEntries();
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );

  const sections = groupEntriesBySection(entries);
  const briefingCount = entries.filter((e) => e.context_type === "briefing").length;
  const keyDecisions = entries.filter((e) => e.is_key_decision);

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header + actions ─────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <FolderOpen className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold text-foreground">Contexto operacional</p>
          <span className="text-xs text-muted-foreground">
            {entries.length} registros · {briefingCount} briefings
          </span>
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
                <Link2 className="h-3.5 w-3.5" /> Enviar ao cliente
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
            <Plus className="h-3.5 w-3.5" /> Novo contexto
          </Button>
        </div>
      </div>

      {/* ── Key decisions highlight ───────────────────── */}
      {keyDecisions.length > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <Star className="h-3.5 w-3.5 text-amber-400" />
            <p className="text-xs font-semibold text-amber-400">Decisões-chave ({keyDecisions.length})</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {keyDecisions.slice(0, 5).map((e) => (
              <button key={e.id} type="button" onClick={() => setEditEntry(e)}
                className="text-xs px-2.5 py-1 rounded-full border border-amber-400/25 bg-amber-400/10 text-foreground hover:bg-amber-400/20 transition-colors">
                {e.title}
              </button>
            ))}
            {keyDecisions.length > 5 && (
              <span className="text-xs text-amber-400/70">+{keyDecisions.length - 5} mais</span>
            )}
          </div>
        </div>
      )}

      {/* ── Sections ──────────────────────────────────── */}
      {sections.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <FolderOpen className="h-8 w-8 mb-3 opacity-30" />
          <p className="text-sm">Nenhum contexto registrado.</p>
          <p className="text-xs mt-1">Adicione briefings, objetivos, decisões e diagnósticos.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => {
            const sOpen = openSections.has(section.key);
            const count = section.folders.reduce((t, f) => t + f.entries.length, 0);
            return (
              <Collapsible key={section.key} open={sOpen} onOpenChange={() => toggleSection(section.key)}>
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/20 transition-colors">
                      {sOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">{section.label}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{count}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{section.description}</p>
                      </div>
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="border-t border-border/50">
                      {section.folders.map((folder, fi) => {
                        const fOpen = openFolders.has(folder.type);
                        return (
                          <Collapsible key={folder.type} open={fOpen} onOpenChange={() => toggleFolder(folder.type)}>
                            <CollapsibleTrigger asChild>
                              <button className={cn(
                                "w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-secondary/10 transition-colors text-xs",
                                fi > 0 && "border-t border-border/30"
                              )}>
                                {fOpen ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />}
                                <span className="font-medium text-foreground/80">{folder.label}</span>
                                <span className="text-muted-foreground/60">{folder.entries.length}</span>
                              </button>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="px-3 pb-2 space-y-1.5">
                                {folder.entries.map((entry) => {
                                  const isExp = expandedContent.has(entry.id);
                                  const isBriefing = entry.context_type === "briefing";
                                  const preview = isBriefing ? getBriefingPreview(entry) : null;
                                  return (
                                    <div key={entry.id}
                                      className="rounded-lg border border-border/60 bg-background/50 px-3 py-2.5 group">
                                      <div className="flex items-start gap-2">
                                        <div className={cn(
                                          "h-1.5 w-1.5 rounded-full mt-1.5 shrink-0",
                                          entry.is_key_decision ? "bg-amber-400" : "bg-primary/40"
                                        )} />
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-semibold text-foreground">{entry.title}</span>
                                            {entry.is_key_decision && (
                                              <span className="text-[10px] text-amber-400 font-medium">Decisão-chave</span>
                                            )}
                                            {isBriefing && (
                                              <span className="text-[10px] text-muted-foreground">
                                                {getBriefingLabel(entry.metadata, entry.title)}
                                              </span>
                                            )}
                                          </div>
                                          {(preview ?? entry.content) && (
                                            <p className={cn("text-xs text-muted-foreground mt-0.5 leading-relaxed", !isExp && "line-clamp-2")}>
                                              {preview ?? entry.content}
                                            </p>
                                          )}
                                          {entry.tags && entry.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1.5">
                                              {entry.tags.map((tag) => (
                                                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-secondary/60 text-muted-foreground">{tag}</span>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                          {(entry.content?.length ?? 0) > 160 && (
                                            <button type="button" onClick={() => toggleContentExpand(entry.id)} className="p-1 rounded hover:bg-secondary transition-colors">
                                              <Eye className="h-3 w-3 text-muted-foreground" />
                                            </button>
                                          )}
                                          {isBriefing && (
                                            <button type="button" onClick={() => handleDownloadBriefingPDF(entry)} className="p-1 rounded hover:bg-secondary transition-colors" title="Exportar PDF">
                                              <Download className="h-3 w-3 text-muted-foreground" />
                                            </button>
                                          )}
                                          {entry.source_url && (
                                            <a href={entry.source_url} target="_blank" rel="noreferrer" className="p-1 rounded hover:bg-secondary transition-colors">
                                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                            </a>
                                          )}
                                          <button type="button" onClick={() => toggleKeyDecision(entry)} className="p-1 rounded hover:bg-secondary transition-colors" title="Marcar como decisão-chave">
                                            <Star className={cn("h-3 w-3", entry.is_key_decision ? "text-amber-400 fill-amber-400" : "text-muted-foreground")} />
                                          </button>
                                          <button type="button" onClick={() => setEditEntry(entry)} className="p-1 rounded hover:bg-secondary transition-colors">
                                            <Eye className="h-3 w-3 text-muted-foreground" />
                                          </button>
                                          <button type="button" onClick={() => handleDeleteEntry(entry)} className="p-1 rounded hover:bg-destructive/10 transition-colors">
                                            <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}

      {/* ── Dialogs ───────────────────────────────────── */}
      <ContextEntryDialog open={dialogOpen} onOpenChange={setDialogOpen} onSubmit={handleCreate} mode="create" />
      {editEntry && (
        <ContextEntryDialog
          open={!!editEntry}
          onOpenChange={(open) => !open && setEditEntry(null)}
          onSubmit={handleEdit}
          mode="edit"
          initial={{
            context_type: editEntry.context_type as ContextType,
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
        <ImportBriefingDialog open={!!briefingType} onOpenChange={(open) => !open && setBriefingType(null)} workspaceId={workspaceId} clientId={clientId} briefingType={briefingType} onImported={fetchEntries} />
      )}
      {linkDialogOpen && (
        <GenerateBriefingLinkDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} workspaceId={workspaceId} clientId={clientId} clientName={clientName ?? "Cliente"} defaultBriefingType={linkBriefingType} />
      )}
      {entries.some((e) => e.context_type === "briefing" && (e.metadata?.structured_signals || e.metadata?.import_review_status === "pending_review")) && (
        <div className="space-y-3">
          {entries
            .filter((e) => e.context_type === "briefing" && e.metadata && (e.metadata.structured_signals || e.metadata.import_review_status === "pending_review"))
            .map((entry) => (
              <BriefingSignalReview key={entry.id} entryId={entry.id} metadata={entry.metadata ?? {}} onUpdated={fetchEntries} />
            ))}
        </div>
      )}
    </div>
  );
}
