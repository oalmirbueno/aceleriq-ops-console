import { useState, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, FileUp, Upload, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CONTEXT_TYPES = [
  "briefing", "dor", "objetivo", "reuniao", "transcricao",
  "decisao", "acesso", "anotacao", "diagnostico",
] as const;

type ContextType = (typeof CONTEXT_TYPES)[number];

type ImportMode = "single" | "multi" | "briefing" | "markdown" | "files";

interface ParsedBlock {
  context_type: ContextType;
  title: string;
  content: string;
}

interface ProcessedFile {
  name: string;
  text: string;
  error?: string;
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
      if (mapped) { flush(); currentType = mapped; continue; }
    }
    const inlineMatch = line.match(/^(\w[\wçãõéêíóúàâôûü]*)\s*:\s*(.+)$/i);
    if (inlineMatch && !currentType) {
      const normalized = normalize(inlineMatch[1]);
      const mapped = LABEL_TO_TYPE[normalized];
      if (mapped) { flush(); currentType = mapped; currentLines.push(inlineMatch[2]); continue; }
    }
    currentLines.push(line);
  }
  flush();
  return blocks;
}

function parseMarkdownSections(raw: string): ParsedBlock[] {
  const lines = raw.split("\n");
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      if (current) sections.push(current);
      current = { heading: headingMatch[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else {
      current = { heading: "Contexto importado", lines: [line] };
    }
  }
  if (current) sections.push(current);

  return sections
    .map((s) => {
      const content = s.lines.join("\n").trim();
      if (!content) return null;
      const normalizedHeading = normalize(s.heading);
      let contextType: ContextType = "anotacao";
      for (const [key, type] of Object.entries(LABEL_TO_TYPE)) {
        if (normalizedHeading === normalize(key) || normalizedHeading.startsWith(normalize(key))) {
          contextType = type;
          break;
        }
      }
      return { context_type: contextType, title: s.heading.slice(0, 80), content };
    })
    .filter(Boolean) as ParsedBlock[];
}

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => ("str" in item ? item.str : ""))
      .join(" ");
    if (pageText.trim()) pages.push(pageText.trim());
  }

  return pages.join("\n\n");
}

async function extractTextFromFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || file.type === "application/pdf") {
    return extractTextFromPdf(file);
  }
  // Text-based files
  return file.text();
}

const ACCEPTED_EXTENSIONS = [".pdf", ".md", ".txt", ".csv", ".json", ".xml", ".html", ".log", ".yaml", ".yml", ".toml"];
const ACCEPTED_TYPES = ["application/pdf", "text/plain", "text/markdown", "text/csv", "text/html", "application/json", "text/xml", "application/xml"];

function isAcceptedFile(file: File): boolean {
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  if (ACCEPTED_EXTENSIONS.includes(ext)) return true;
  if (ACCEPTED_TYPES.includes(file.type)) return true;
  if (file.type.startsWith("text/")) return true;
  return false;
}

function deriveTitle(raw: string): string {
  const firstLine = raw.trim().split("\n")[0]?.trim() || "";
  return firstLine.slice(0, 80) || "Contexto importado";
}

function fileNameToTitle(name: string): string {
  return name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").slice(0, 80) || "Contexto importado";
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

  // File mode state
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRawText("");
    setSourceLabel("");
    setSourceUrl("");
    setHappenedAt("");
    setPreview(null);
    setMode("single");
    setSingleType("anotacao");
    setProcessedFiles([]);
    setFilesLoading(false);
    setDragOver(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const trimmed = rawText.trim();

  const handlePreview = () => {
    if (mode === "multi") setPreview(parseMultiBlocks(trimmed));
    else if (mode === "markdown") setPreview(parseMarkdownSections(trimmed));
  };

  // --- File processing ---
  const processFiles = useCallback(async (files: File[]) => {
    const validFiles = files.filter(isAcceptedFile).slice(0, 20);
    if (validFiles.length === 0) {
      toast({ title: "Nenhum arquivo suportado", description: "Aceitos: PDF, Markdown, TXT, CSV, JSON, XML, HTML, YAML, LOG.", variant: "destructive" });
      return;
    }
    if (files.length > 20) {
      toast({ title: "Limite de arquivos", description: "Máximo 20 arquivos por importação. Apenas os primeiros 20 serão processados." });
    }

    setFilesLoading(true);
    const results: ProcessedFile[] = [];

    for (const file of validFiles) {
      try {
        const text = await extractTextFromFile(file);
        if (!text.trim()) {
          results.push({ name: file.name, text: "", error: "Sem texto extraível" });
        } else {
          results.push({ name: file.name, text });
        }
      } catch (err: any) {
        results.push({ name: file.name, text: "", error: err?.message || "Erro ao ler" });
      }
    }

    setProcessedFiles((prev) => {
      const merged = [...prev, ...results];
      return merged.slice(0, 20);
    });
    setFilesLoading(false);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      processFiles(Array.from(e.target.files));
      e.target.value = "";
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const removeFile = (index: number) => {
    setProcessedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Insert ---
  const insertEntries = async (entries: Array<{ context_type: ContextType; title: string; content: string; source_label?: string }>) => {
    const rows = entries.map((e) => ({
      workspace_id: workspaceId,
      client_id: clientId,
      context_type: e.context_type,
      title: e.title,
      content: e.content,
      source_label: e.source_label || sourceLabel.trim() || null,
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
    setSaving(true);
    try {
      if (mode === "files") {
        const valid = processedFiles.filter((f) => f.text.trim() && !f.error);
        if (valid.length === 0) {
          toast({ title: "Nenhum arquivo com conteúdo", variant: "destructive" });
          setSaving(false);
          return;
        }
        await insertEntries(valid.map((f) => ({
          context_type: singleType,
          title: fileNameToTitle(f.name),
          content: f.text,
          source_label: f.name,
        })));
        toast({ title: `${valid.length} contexto(s) importado(s)` });
      } else if (mode === "single") {
        if (!trimmed) { setSaving(false); return; }
        await insertEntries([{ context_type: singleType, title: deriveTitle(trimmed), content: trimmed }]);
        toast({ title: "1 contexto importado" });
      } else if (mode === "briefing") {
        if (!trimmed) { setSaving(false); return; }
        await insertEntries([{ context_type: "briefing", title: deriveTitle(trimmed), content: trimmed }]);
        toast({ title: "Briefing importado" });
      } else if (mode === "markdown") {
        if (!trimmed) { setSaving(false); return; }
        const blocks = preview ?? parseMarkdownSections(trimmed);
        if (blocks.length === 0) {
          toast({ title: "Nenhuma seção encontrada", description: "Use cabeçalhos markdown (## Título).", variant: "destructive" });
          setSaving(false);
          return;
        }
        await insertEntries(blocks);
        toast({ title: `${blocks.length} contextos importados` });
      } else {
        if (!trimmed) { setSaving(false); return; }
        const blocks = preview ?? parseMultiBlocks(trimmed);
        if (blocks.length === 0) {
          toast({ title: "Nenhum bloco reconhecido", description: "Use marcadores como 'briefing:', 'dor:'.", variant: "destructive" });
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

  const showTextarea = mode !== "files";
  const showPreviewButton = (mode === "multi" || mode === "markdown") && !preview && trimmed;
  const hasPreviewWithNoBlocks = preview !== null && preview.length === 0;
  const validFilesCount = processedFiles.filter((f) => f.text.trim() && !f.error).length;

  const canImport = mode === "files"
    ? validFilesCount > 0 && !filesLoading
    : !!trimmed && !hasPreviewWithNoBlocks;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Contexto</DialogTitle>
          <DialogDescription>Importe texto, markdown, documentos ou arraste arquivos para criar contextos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode */}
          <div className="space-y-1.5">
            <Label>Modo de importação</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v as ImportMode); setPreview(null); setRawText(""); setProcessedFiles([]); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">1 contexto único</SelectItem>
                <SelectItem value="multi">Quebrar em múltiplos blocos</SelectItem>
                <SelectItem value="briefing">Importar como briefing</SelectItem>
                <SelectItem value="markdown">
                  <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Importar Markdown</span>
                </SelectItem>
                <SelectItem value="files">
                  <span className="flex items-center gap-1.5"><FileUp className="h-3.5 w-3.5" /> Importar arquivos</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type for single/files mode */}
          {(mode === "single" || mode === "files") && (
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

          {/* File dropzone */}
          {mode === "files" && (
            <div className="space-y-3">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.md,.txt,.csv,.json,.xml,.html,.log,.yaml,.yml,.toml"
                className="hidden"
                onChange={handleFileInput}
              />
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                  dragOver
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                {filesLoading ? (
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                ) : (
                  <Upload className="h-8 w-8 text-muted-foreground" />
                )}
                <p className="text-sm text-muted-foreground text-center">
                  {filesLoading
                    ? "Lendo arquivos..."
                    : "Arraste arquivos aqui ou clique para selecionar"}
                </p>
                <p className="text-[10px] text-muted-foreground/60">
                  PDF, Markdown, TXT, CSV, JSON, XML, HTML · até 20 arquivos
                </p>
              </div>

              {/* File list */}
              {processedFiles.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{processedFiles.length} arquivo(s) · {validFilesCount} válido(s)</Label>
                  <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                    {processedFiles.map((f, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate text-foreground">{f.name}</span>
                          {f.error ? (
                            <Badge variant="destructive" className="text-[9px] shrink-0">{f.error}</Badge>
                          ) : (
                            <span className="text-muted-foreground shrink-0">{f.text.length} chars</span>
                          )}
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-muted-foreground hover:text-destructive shrink-0">
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Raw text / textarea for non-file modes */}
          {showTextarea && (
            <div className="space-y-1.5">
              <Label>{mode === "markdown" ? "Markdown *" : "Texto bruto *"}</Label>
              <Textarea
                value={rawText}
                onChange={(e) => { setRawText(e.target.value); setPreview(null); }}
                placeholder={
                  mode === "multi"
                    ? "briefing:\nConteúdo do briefing...\n\ndor:\nDescrição da dor..."
                    : mode === "markdown"
                    ? "## Briefing\nConteúdo do briefing...\n\n## Dor\nDescrição da dor..."
                    : "Cole o texto aqui..."
                }
                rows={8}
              />
            </div>
          )}

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

          {/* Preview button */}
          {showPreviewButton && (
            <Button variant="outline" size="sm" onClick={handlePreview} className="w-full">
              Pré-visualizar blocos
            </Button>
          )}

          {/* Preview results */}
          {(mode === "multi" || mode === "markdown") && preview && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground font-medium">
                {preview.length === 0
                  ? mode === "markdown"
                    ? "Nenhuma seção encontrada. Use cabeçalhos markdown (## Título)."
                    : "Nenhum bloco reconhecido. Use marcadores como 'briefing:', 'dor:'."
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
          <Button onClick={handleImport} disabled={saving || !canImport}>
            {saving ? "Importando..." : mode === "files" ? `Importar ${validFilesCount} arquivo(s)` : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
