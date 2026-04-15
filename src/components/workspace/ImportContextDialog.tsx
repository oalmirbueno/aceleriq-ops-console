import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CONTEXT_TYPES = [
  "briefing", "dor", "objetivo", "reuniao", "transcricao",
  "decisao", "acesso", "anotacao", "diagnostico",
] as const;

type ContextType = (typeof CONTEXT_TYPES)[number];

type ImportMode = "single" | "multi" | "briefing";

interface ParsedBlock {
  context_type: ContextType;
  title: string;
  content: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  onImported: () => void;
}

const LABEL_TO_TYPE: Record<string, ContextType> = {
  briefing: "briefing",
  dor: "dor",
  objetivo: "objetivo",
  reuniao: "reuniao",
  "reunião": "reuniao",
  transcricao: "transcricao",
  "transcrição": "transcricao",
  decisao: "decisao",
  "decisão": "decisao",
  acesso: "acesso",
  anotacao: "anotacao",
  "anotação": "anotacao",
  diagnostico: "diagnostico",
  "diagnóstico": "diagnostico",
};

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function parseMultiBlocks(raw: string): ParsedBlock[] {
  const lines = raw.split("\n");
  const blocks: ParsedBlock[] = [];
  let currentType: ContextType | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentType && currentLines.length > 0) {
      const content = currentLines.join("\n").trim();
      if (content) {
        const title = content.split("\n")[0].slice(0, 80) || currentType;
        blocks.push({ context_type: currentType, title, content });
      }
    }
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.match(/^(\w[\wçãõéêíóúàâôûü]*)\s*:\s*$/i);
    if (match) {
      const normalized = normalize(match[1]);
      const mapped = LABEL_TO_TYPE[normalized];
      if (mapped) {
        flush();
        currentType = mapped;
        continue;
      }
    }
    // Also match "label: content on same line"
    const inlineMatch = line.match(/^(\w[\wçãõéêíóúàâôûü]*)\s*:\s*(.+)$/i);
    if (inlineMatch && !currentType) {
      const normalized = normalize(inlineMatch[1]);
      const mapped = LABEL_TO_TYPE[normalized];
      if (mapped) {
        flush();
        currentType = mapped;
        currentLines.push(inlineMatch[2]);
        continue;
      }
    }
    currentLines.push(line);
  }
  flush();

  return blocks;
}

function deriveTitle(raw: string): string {
  const firstLine = raw.trim().split("\n")[0]?.trim() || "";
  return firstLine.slice(0, 80) || "Contexto importado";
}

export default function ImportContextDialog({ open, onOpenChange, workspaceId, clientId, onImported }: Props) {
  const [mode, setMode] = useState<ImportMode>("single");
  const [singleType, setSingleType] = useState<ContextType>("anotacao");
  const [rawText, setRawText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [happenedAt, setHappenedAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<ParsedBlock[] | null>(null);

  const reset = () => {
    setRawText("");
    setSourceLabel("");
    setSourceUrl("");
    setHappenedAt("");
    setPreview(null);
    setMode("single");
    setSingleType("anotacao");
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const trimmed = rawText.trim();

  const handlePreviewMulti = () => {
    const blocks = parseMultiBlocks(trimmed);
    setPreview(blocks);
  };

  const insertEntries = async (entries: Array<{ context_type: ContextType; title: string; content: string }>) => {
    const rows = entries.map((e) => ({
      workspace_id: workspaceId,
      client_id: clientId,
      context_type: e.context_type,
      title: e.title,
      content: e.content,
      source_label: sourceLabel.trim() || null,
      source_url: sourceUrl.trim() || null,
      happened_at: happenedAt || null,
      is_key_decision: e.context_type === "decisao",
      tags: null,
    }));

    const { error } = await supabase.from("context_entries").insert(rows);
    if (error) {
      toast({ title: "Erro ao importar", description: error.message, variant: "destructive" });
      throw error;
    }

    // Timeline for important entries
    const important = rows.filter((r) => r.is_key_decision || r.context_type === "decisao");
    if (important.length > 0) {
      await supabase.from("timeline_events").insert(
        important.map((r) => ({
          workspace_id: workspaceId,
          client_id: clientId,
          event_type: "context_added",
          title: `Contexto importado: ${r.title}`,
          description: `Tipo: ${r.context_type} · Importação`,
          happened_at: r.happened_at || new Date().toISOString(),
        }))
      );
    }
  };

  const handleImport = async () => {
    if (!trimmed) return;
    setSaving(true);
    try {
      if (mode === "single") {
        await insertEntries([{ context_type: singleType, title: deriveTitle(trimmed), content: trimmed }]);
        toast({ title: "1 contexto importado" });
      } else if (mode === "briefing") {
        await insertEntries([{ context_type: "briefing", title: deriveTitle(trimmed), content: trimmed }]);
        toast({ title: "Briefing importado" });
      } else {
        const blocks = preview ?? parseMultiBlocks(trimmed);
        if (blocks.length === 0) {
          toast({ title: "Nenhum bloco reconhecido", description: "Use marcadores como 'briefing:', 'dor:', 'objetivo:' no início das linhas.", variant: "destructive" });
          setSaving(false);
          return;
        }
        await insertEntries(blocks);
        toast({ title: `${blocks.length} contextos importados` });
      }
      onImported();
      handleOpenChange(false);
    } catch {
      // error already toasted
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Contexto</DialogTitle>
          <DialogDescription>Cole texto bruto para criar registros de contexto automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode */}
          <div className="space-y-1.5">
            <Label>Modo de importação</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v as ImportMode); setPreview(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">1 contexto único</SelectItem>
                <SelectItem value="multi">Quebrar em múltiplos blocos</SelectItem>
                <SelectItem value="briefing">Importar como briefing</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type for single mode */}
          {mode === "single" && (
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={singleType} onValueChange={(v) => setSingleType(v as ContextType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTEXT_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Raw text */}
          <div className="space-y-1.5">
            <Label>Texto bruto *</Label>
            <Textarea
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setPreview(null); }}
              placeholder={mode === "multi"
                ? "briefing:\nConteúdo do briefing...\n\ndor:\nDescrição da dor...\n\nobjetivo:\nObjetivo principal..."
                : "Cole o texto aqui..."}
              rows={8}
            />
          </div>

          {/* Optional fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="Ex: Reunião Kick-off" />
            </div>
            <div className="space-y-1.5">
              <Label>Link</Label>
              <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Data do evento</Label>
            <Input type="datetime-local" value={happenedAt} onChange={(e) => setHappenedAt(e.target.value)} />
          </div>

          {/* Multi preview */}
          {mode === "multi" && !preview && trimmed && (
            <Button variant="outline" size="sm" onClick={handlePreviewMulti} className="w-full">
              Pré-visualizar blocos
            </Button>
          )}

          {mode === "multi" && preview && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground font-medium">
                {preview.length === 0
                  ? "Nenhum bloco reconhecido. Use marcadores como 'briefing:', 'dor:', 'objetivo:' no início das linhas."
                  : `${preview.length} bloco(s) reconhecido(s):`}
              </p>
              {preview.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="capitalize text-[10px]">{b.context_type}</Badge>
                  <span className="text-xs text-foreground truncate">{b.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={saving || !trimmed || (mode === "multi" && preview !== null && preview.length === 0)}
          >
            {saving ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
