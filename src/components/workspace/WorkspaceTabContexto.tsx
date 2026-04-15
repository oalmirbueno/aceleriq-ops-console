import { useState, useEffect, useCallback } from "react";
import { Plus, Star, ExternalLink, Filter, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import ContextEntryDialog, { type ContextFormData } from "./ContextEntryDialog";
import ImportContextDialog from "./ImportContextDialog";
import ImportBriefingDialog from "./ImportBriefingDialog";
import { normalizeTags } from "@/lib/normalizeTags";

import { CONTEXT_TYPES, getContextLabel } from "./contextTypes";

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
  created_at: string;
}

interface Props {
  workspaceId: string;
  clientId: string;
}

export default function WorkspaceTabContexto({ workspaceId, clientId }: Props) {
  const [entries, setEntries] = useState<ContextEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ContextEntry | null>(null);
  const [briefingType, setBriefingType] = useState<"essential" | "sitebolt" | null>(null);

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("context_entries")
      .select("id, context_type, title, content, source_label, source_url, happened_at, is_key_decision, tags, created_at")
      .eq("workspace_id", workspaceId)
      .order("happened_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      q = q.eq("context_type", filter);
    }

    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar contextos", description: error.message, variant: "destructive" });
    }
    setEntries((data as ContextEntry[]) ?? []);
    setLoading(false);
  }, [workspaceId, filter]);

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

    // Register timeline for key decisions or decisao type
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

  const openEdit = (entry: ContextEntry) => {
    setEditEntry(entry);
  };

  // Empty states
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {CONTEXT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{getContextLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importar
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Novo contexto
          </Button>
        </div>
      </div>

      {/* List */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground py-12 text-center">
          {filter !== "all"
            ? `Nenhum contexto do tipo "${filter}" encontrado.`
            : "Nenhum contexto registrado neste workspace."}
        </p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Card
              key={entry.id}
              className="cursor-pointer card-hover"
              onClick={() => openEdit(entry)}
            >
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px]">{getContextLabel(entry.context_type)}</Badge>
                    {entry.is_key_decision && (
                      <Star
                        className="h-3.5 w-3.5 text-warning fill-warning cursor-pointer"
                        onClick={(e) => { e.stopPropagation(); toggleKeyDecision(entry); }}
                      />
                    )}
                    {!entry.is_key_decision && (
                      <Star
                        className="h-3.5 w-3.5 text-muted-foreground/30 cursor-pointer hover:text-warning/60"
                        onClick={(e) => { e.stopPropagation(); toggleKeyDecision(entry); }}
                      />
                    )}
                  </div>
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

                <p className="text-sm font-medium text-foreground">{entry.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{entry.content}</p>

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
          ))}
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
    </div>
  );
}
