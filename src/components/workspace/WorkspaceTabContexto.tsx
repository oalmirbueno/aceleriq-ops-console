import { useState, useEffect, useCallback } from "react";
import { Plus, Star, ExternalLink, Upload, FileText, FolderOpen, ChevronRight, ChevronDown, Eye, Building2 } from "lucide-react";
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
import { CONTEXT_TYPES, getContextLabel } from "./contextTypes";
import BriefingSignalReview from "./BriefingSignalReview";
import EnterpriseStructuringDialog from "./EnterpriseStructuringDialog";

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
}

/** Group entries by context_type into folder-like structure */
function groupByType(entries: ContextEntry[]): { type: string; label: string; entries: ContextEntry[] }[] {
  const map = new Map<string, ContextEntry[]>();

  // Preserve order from CONTEXT_TYPES
  for (const t of CONTEXT_TYPES) {
    map.set(t, []);
  }

  for (const entry of entries) {
    const key = entry.context_type;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(entry);
  }

  return Array.from(map.entries())
    .filter(([, items]) => items.length > 0)
    .map(([type, items]) => ({
      type,
      label: getContextLabel(type),
      entries: items,
    }));
}

export default function WorkspaceTabContexto({ workspaceId, clientId }: Props) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ContextEntry | null>(null);
  const [briefingType, setBriefingType] = useState<"essential" | "sitebolt" | null>(null);
  const [enterpriseOpen, setEnterpriseOpen] = useState(false);
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

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

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
        prev.map((e) => (e.id === entry.id ? { ...e, is_key_decision: !e.is_key_decision } : e))
      );
    }
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

  // markAsReviewed removed — status "reviewed" is now only set via BriefingSignalReview flow

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const groups = groupByType(entries);

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground font-medium">
            {entries.length} contexto(s) em {groups.length} pasta(s)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <FileText className="h-4 w-4 mr-1" /> Importar Briefing
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setBriefingType("essential")}>
                Briefing Essencial
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setBriefingType("sitebolt")}>
                Briefing SiteBolt
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => setEnterpriseOpen(true)}>
            <Building2 className="h-4 w-4 mr-1" /> Estruturação Empresarial
          </Button>
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo contexto
          </Button>
        </div>
      </div>

      {/* Folder view */}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          Nenhum contexto registrado neste workspace.
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map(({ type, label, entries: folderEntries }) => {
            const isOpen = openFolders.has(type);
            return (
              <Collapsible key={type} open={isOpen} onOpenChange={() => toggleFolder(type)}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg border border-border/50 bg-muted/20 hover:bg-muted/40 transition-colors text-left">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium text-foreground flex-1">{label}</span>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {folderEntries.length}
                    </Badge>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-1.5 pl-4 pt-1.5 border-l-2 border-primary/10 ml-4">
                    {folderEntries.map((entry) => {
                      const reviewStatus = (entry.metadata?.import_review_status as string) ?? null;
                      const isPending = reviewStatus === "pending_review";
                      const isExpanded = expandedContent.has(entry.id);
                      const isLong = entry.content.length > 300;

                      return (
                        <Card
                          key={entry.id}
                          className="cursor-pointer card-hover"
                          onClick={() => setEditEntry(entry)}
                        >
                          <CardContent className="p-3 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                {isPending && (
                                  <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0">
                                    Pendente revisão
                                  </Badge>
                                )}
                                {reviewStatus === "reviewed" && (
                                  <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shrink-0">
                                    Revisado
                                  </Badge>
                                )}
                                {entry.is_key_decision && (
                                  <Star
                                    className="h-3.5 w-3.5 text-warning fill-warning cursor-pointer shrink-0"
                                    onClick={(e) => { e.stopPropagation(); toggleKeyDecision(entry); }}
                                  />
                                )}
                                {!entry.is_key_decision && (
                                  <Star
                                    className="h-3.5 w-3.5 text-muted-foreground/30 cursor-pointer hover:text-warning/60 shrink-0"
                                    onClick={(e) => { e.stopPropagation(); toggleKeyDecision(entry); }}
                                  />
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {isPending && entry.context_type === "briefing" && entry.metadata?.structured_signals && (
                                  <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0">
                                    Revise os sinais abaixo ↓
                                  </Badge>
                                )}
                                {entry.source_url && (
                                  <a
                                    href={entry.source_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-muted-foreground hover:text-primary"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>

                            <p className="text-sm font-medium text-foreground">{entry.title}</p>

                            {/* Content: show full or truncated */}
                            <div>
                              <p className={`text-xs text-muted-foreground whitespace-pre-wrap ${!isExpanded && isLong ? "line-clamp-3" : ""}`}>
                                {entry.content}
                              </p>
                              {isLong && (
                                <button
                                  className="text-[10px] text-primary hover:underline mt-1 flex items-center gap-1"
                                  onClick={(e) => { e.stopPropagation(); toggleContentExpand(entry.id); }}
                                >
                                  <Eye className="h-3 w-3" />
                                  {isExpanded ? "Recolher" : "Ver conteúdo completo"}
                                </button>
                              )}
                            </div>

                            {/* Briefing signal review */}
                            {entry.context_type === "briefing" && entry.metadata?.structured_signals && (
                              <BriefingSignalReview
                                entryId={entry.id}
                                metadata={entry.metadata as Record<string, unknown>}
                                onUpdated={fetchEntries}
                              />
                            )}

                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
                              {entry.happened_at && (
                                <span>{new Date(entry.happened_at).toLocaleString("pt-BR")}</span>
                              )}
                              {entry.source_label && <span>· {entry.source_label}</span>}
                              {entry.tags && entry.tags.length > 0 && (
                                <span>· {entry.tags.join(", ")}</span>
                              )}
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
      )}

      {/* Create dialog */}
      <ContextEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreate}
        mode="create"
      />

      {/* Edit dialog */}
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

      {/* Import dialog */}
      <ImportContextDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        onImported={fetchEntries}
      />

      {/* Briefing import dialog */}
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

      {/* Enterprise structuring dialog */}
      <EnterpriseStructuringDialog
        open={enterpriseOpen}
        onOpenChange={setEnterpriseOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        onCreated={fetchEntries}
      />
    </div>
  );
}
