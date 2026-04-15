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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const sections = groupEntriesBySection(entries);
  const briefingCount = entries.filter((entry) => entry.context_type === "briefing").length;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">
            {entries.length} registro(s) · {briefingCount} briefing(s) · {sections.length} área(s)
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <FileText className="h-4 w-4 mr-1" /> Importar briefing
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setBriefingType("essential")}>Briefing Essencial</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBriefingType("sitebolt")}>Briefing SiteBolt</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <Link2 className="h-4 w-4 mr-1" /> Enviar briefing ao cliente
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { setLinkBriefingType("enterprise_structuring"); setLinkDialogOpen(true); }}>
                Estruturação Empresarial
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setLinkBriefingType("ai_automation"); setLinkDialogOpen(true); }}>
                Automação e IA
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar contexto
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo contexto
          </Button>
        </div>
      </div>

      {sections.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          Nenhum contexto registrado neste workspace.
        </p>
      ) : (
        <div className="space-y-3">
          {sections.map((section) => {
            const sectionOpen = openSections.has(section.key);
            const sectionCount = section.folders.reduce((total, folder) => total + folder.entries.length, 0);

            return (
              <Collapsible key={section.key} open={sectionOpen} onOpenChange={() => toggleSection(section.key)}>
                <div className="rounded-xl border border-border/60 bg-card/40">
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-start gap-3 px-4 py-3 text-left">
                      {sectionOpen ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-foreground">{section.label}</span>
                          <Badge variant="outline" className="text-[10px]">{sectionCount}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{section.description}</p>
                      </div>
                    </button>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <div className="px-3 pb-3 space-y-2">
                      {section.folders.map((folder) => {
                        const folderOpen = openFolders.has(folder.type);

                        return (
                          <Collapsible key={folder.type} open={folderOpen} onOpenChange={() => toggleFolder(folder.type)}>
                            <CollapsibleTrigger asChild>
                              <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors text-left">
                                {folderOpen ? (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                                ) : (
                                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                                )}
                                <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                                <span className="text-sm font-medium text-foreground flex-1">{folder.label}</span>
                                <Badge variant="outline" className="text-[10px] shrink-0">{folder.entries.length}</Badge>
                              </button>
                            </CollapsibleTrigger>

                            <CollapsibleContent>
                              <div className="space-y-2 pl-4 pt-2 border-l-2 border-border ml-4">
                                {folder.entries.map((entry) => {
                                  const isBriefing = entry.context_type === "briefing";
                                  const reviewStatus = (entry.metadata?.import_review_status as string | undefined) ?? null;
                                  const isPending = reviewStatus === "pending_review";
                                  const isExpanded = expandedContent.has(entry.id);
                                  const isLong = entry.content.length > 300;
                                  const briefingLabel = getBriefingLabel(entry.metadata, entry.title);
                                  const briefingOrigin = getBriefingOrigin(entry.metadata);
                                  const briefingPreview = getBriefingPreview(entry);

                                  return (
                                    <Card
                                      key={entry.id}
                                      className="card-hover"
                                      onClick={() => isBriefing ? toggleContentExpand(entry.id) : setEditEntry(entry)}
                                    >
                                      <CardContent className="p-3 space-y-2">
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                                            {isPending && <Badge variant="outline" className="text-[9px] shrink-0">Pendente revisão</Badge>}
                                            {reviewStatus === "reviewed" && <Badge variant="secondary" className="text-[9px] shrink-0">Revisado</Badge>}
                                            {isBriefing && <Badge variant="outline" className="text-[9px] shrink-0">{briefingLabel}</Badge>}
                                            {isBriefing && briefingOrigin && <Badge variant="outline" className="text-[9px] shrink-0">{briefingOrigin}</Badge>}
                                            {entry.is_key_decision ? (
                                              <Star
                                                className="h-3.5 w-3.5 text-warning fill-warning cursor-pointer shrink-0"
                                                onClick={(e) => { e.stopPropagation(); toggleKeyDecision(entry); }}
                                              />
                                            ) : (
                                              <Star
                                                className="h-3.5 w-3.5 text-muted-foreground/30 cursor-pointer hover:text-warning/60 shrink-0"
                                                onClick={(e) => { e.stopPropagation(); toggleKeyDecision(entry); }}
                                              />
                                            )}
                                          </div>

                                          <div className="flex items-center gap-1.5 shrink-0">
                                            {isPending && isBriefing && entry.metadata?.structured_signals && (
                                              <Badge variant="outline" className="text-[9px] shrink-0">
                                                Revise os sinais
                                              </Badge>
                                            )}
                                            {isBriefing && entry.content.trim().length > 0 && (
                                              <button
                                                title="Baixar PDF completo"
                                                className="text-muted-foreground hover:text-primary p-1 rounded"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDownloadBriefingPDF(entry);
                                                }}
                                              >
                                                <Download className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                            <button
                                              title="Apagar"
                                              className="text-muted-foreground/40 hover:text-destructive p-1 rounded"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteEntry(entry);
                                              }}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" />
                                            </button>
                                            {entry.source_url && (
                                              <a
                                                href={entry.source_url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-muted-foreground hover:text-primary p-1 rounded"
                                              >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                              </a>
                                            )}
                                          </div>
                                        </div>

                                        <div className="space-y-1">
                                          <p className="text-sm font-medium text-foreground">{entry.title}</p>
                                          {isBriefing ? (
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                              {briefingPreview || "Briefing salvo sem resumo disponível."}
                                            </p>
                                          ) : (
                                            <p className={`text-xs text-muted-foreground whitespace-pre-wrap ${!isExpanded && isLong ? "line-clamp-3" : ""}`}>
                                              {entry.content}
                                            </p>
                                          )}
                                        </div>

                                        {!isBriefing && isLong && (
                                          <button
                                            className="text-[10px] text-primary hover:underline flex items-center gap-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleContentExpand(entry.id);
                                            }}
                                          >
                                            <Eye className="h-3 w-3" />
                                            {isExpanded ? "Recolher" : "Ver conteúdo completo"}
                                          </button>
                                        )}

                                        {isBriefing && (
                                          <button
                                            className="text-[10px] text-primary hover:underline flex items-center gap-1"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              toggleContentExpand(entry.id);
                                            }}
                                          >
                                            <Eye className="h-3 w-3" />
                                            {isExpanded ? "Ocultar briefing completo" : "Ver briefing completo"}
                                          </button>
                                        )}

                                        {isBriefing && isExpanded && (
                                          <div className="rounded-md border border-border/60 bg-muted/10 p-3">
                                            <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-sans leading-relaxed">
                                              {entry.content || "Conteúdo indisponível."}
                                            </pre>
                                          </div>
                                        )}

                                        {isBriefing && entry.metadata?.structured_signals && (
                                          <BriefingSignalReview
                                            entryId={entry.id}
                                            metadata={entry.metadata as Record<string, unknown>}
                                            onUpdated={fetchEntries}
                                          />
                                        )}

                                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                                          {entry.happened_at && <span>{new Date(entry.happened_at).toLocaleString("pt-BR")}</span>}
                                          {entry.source_label && <span>· {entry.source_label}</span>}
                                          {entry.tags && entry.tags.length > 0 && <span>· {entry.tags.join(", ")}</span>}
                                        </div>
                                      </CardContent>
                                    </Card>
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

      <ContextEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
        mode="create"
      />

      {editEntry && (
        <ContextEntryDialog
          open={!!editEntry}
          onOpenChange={(open) => { if (!open) setEditEntry(null); }}
          onSubmit={handleEdit}
          mode="edit"
          initial={{
            context_type: editEntry.context_type as ContextFormData["context_type"],
            title: editEntry.title,
            content: editEntry.content,
            happened_at: editEntry.happened_at ?? "",
            source_label: editEntry.source_label ?? "",
            source_url: editEntry.source_url ?? "",
            tags: editEntry.tags?.join(", ") ?? "",
            is_key_decision: editEntry.is_key_decision,
          }}
        />
      )}

      <ImportContextDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        onImported={fetchEntries}
      />

      {briefingType && (
        <ImportBriefingDialog
          open={!!briefingType}
          onOpenChange={(v) => { if (!v) setBriefingType(null); }}
          workspaceId={workspaceId}
          clientId={clientId}
          briefingType={briefingType}
          onImported={fetchEntries}
        />
      )}

      <GenerateBriefingLinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName ?? "Cliente"}
        defaultBriefingType={linkBriefingType}
      />
    </div>
  );
}
