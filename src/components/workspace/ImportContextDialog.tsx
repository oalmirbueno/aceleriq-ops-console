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
import { Upload, X, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

import { CONTEXT_TYPES, type ContextType, getContextLabel } from "./contextTypes";

interface ParsedEntry {
  context_type: ContextType;
  title: string;
  content: string;
  source_label?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  onImported: () => void;
}

const LABEL_TO_TYPE: Record<string, ContextType> = {
  briefing: "briefing", dor: "dor", objetivo: "objetivo",
  reuniao: "reuniao", "reunião": "reuniao",
  transcricao: "transcricao", "transcrição": "transcricao",
  decisao: "decisao", "decisão": "decisao",
  acesso: "acesso", anotacao: "anotacao", "anotação": "anotacao",
  diagnostico: "diagnostico", "diagnóstico": "diagnostico",
};

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function detectType(heading: string): ContextType {
  const n = normalize(heading);
  for (const [key, type] of Object.entries(LABEL_TO_TYPE)) {
    if (n === normalize(key) || n.startsWith(normalize(key))) return type;
  }
  return "anotacao";
}

/** Smart parser: tries markdown headings first, then label: blocks, then single entry */
function smartParse(raw: string, fallbackType: ContextType): ParsedEntry[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Try markdown headings
  const mdSections = parseByHeadings(trimmed);
  if (mdSections.length > 1) return mdSections;

  // Try label: blocks
  const labelBlocks = parseByLabels(trimmed);
  if (labelBlocks.length > 0) return labelBlocks;

  // Fallback: single entry
  const firstLine = trimmed.split("\n")[0]?.trim() || "";
  return [{
    context_type: fallbackType,
    title: firstLine.slice(0, 80) || "Contexto importado",
    content: trimmed,
  }];
}

function parseByHeadings(raw: string): ParsedEntry[] {
  const lines = raw.split("\n");
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (m) {
      if (current) sections.push(current);
      current = { heading: m[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  return sections
    .map((s) => {
      const content = s.lines.join("\n").trim();
      if (!content) return null;
      return { context_type: detectType(s.heading), title: s.heading.slice(0, 80), content };
    })
    .filter(Boolean) as ParsedEntry[];
}

function parseByLabels(raw: string): ParsedEntry[] {
  const lines = raw.split("\n");
  const blocks: ParsedEntry[] = [];
  let currentType: ContextType | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    if (currentType && currentLines.length > 0) {
      const content = currentLines.join("\n").trim();
      if (content) {
        blocks.push({
          context_type: currentType,
          title: content.split("\n")[0].slice(0, 80) || currentType,
          content,
        });
      }
    }
    currentLines = [];
  };

  for (const line of lines) {
    const m = line.match(/^(\w[\wçãõéêíóúàâôûü]*)\s*:\s*(.*)$/i);
    if (m) {
      const mapped = LABEL_TO_TYPE[normalize(m[1])];
      if (mapped) {
        flush();
        currentType = mapped;
        if (m[2]?.trim()) currentLines.push(m[2]);
        continue;
      }
    }
    currentLines.push(line);
  }
  flush();
  return blocks;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    const text = tc.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    if (text.trim()) pages.push(text.trim());
  }
  return pages.join("\n\n");
}

async function readFile(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || file.type === "application/pdf") return extractTextFromPdf(file);
  return file.text();
}

const ACCEPTED = ".pdf,.md,.txt,.csv,.json,.xml,.html,.log,.yaml,.yml,.toml";

function isAccepted(file: File): boolean {
  const ext = "." + (file.name.split(".").pop()?.toLowerCase() ?? "");
  if (ACCEPTED.split(",").includes(ext)) return true;
  if (file.type.startsWith("text/")) return true;
  return false;
}

export default function ImportContextDialog({ open, onOpenChange, workspaceId, clientId, onImported }: Props) {
  const [contextType, setContextType] = useState<ContextType>("anotacao");
  const [rawText, setRawText] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [happenedAt, setHappenedAt] = useState("");
  const [saving, setSaving] = useState(false);

  // Files
  const [files, setFiles] = useState<{ name: string; text: string; error?: string }[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Preview
  const [previewed, setPreviewed] = useState<ParsedEntry[] | null>(null);

  const reset = () => {
    setRawText(""); setSourceLabel(""); setSourceUrl(""); setHappenedAt("");
    setContextType("anotacao"); setFiles([]); setFilesLoading(false);
    setDragOver(false); setPreviewed(null);
  };

  const handleOpenChange = (v: boolean) => { if (!v) reset(); onOpenChange(v); };

  const trimmed = rawText.trim();
  const hasText = !!trimmed;
  const validFiles = files.filter((f) => f.text.trim() && !f.error);
  const hasFiles = validFiles.length > 0;
  const hasContent = hasText || hasFiles;

  // --- File handling ---
  const processFiles = useCallback(async (incoming: File[]) => {
    const valid = incoming.filter(isAccepted).slice(0, 20);
    if (valid.length === 0) {
      toast({ title: "Nenhum arquivo suportado", description: "PDF, MD, TXT, CSV, JSON, XML, HTML, YAML, LOG.", variant: "destructive" });
      return;
    }
    setFilesLoading(true);
    const results: typeof files = [];
    for (const f of valid) {
      try {
        const text = await readFile(f);
        results.push({ name: f.name, text: text.trim() ? text : "", error: text.trim() ? undefined : "Sem texto" });
      } catch (err: any) {
        results.push({ name: f.name, text: "", error: err?.message || "Erro" });
      }
    }
    setFiles((prev) => [...prev, ...results].slice(0, 20));
    setFilesLoading(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files) processFiles(Array.from(e.dataTransfer.files)); }, [processFiles]);
  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(true); }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragOver(false); }, []);
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, idx) => idx !== i));

  // --- Preview ---
  const buildEntries = (): ParsedEntry[] => {
    const entries: ParsedEntry[] = [];

    // From text
    if (hasText) {
      entries.push(...smartParse(trimmed, contextType));
    }

    // From files — each file = 1 entry
    for (const f of validFiles) {
      entries.push({
        context_type: contextType,
        title: f.name.replace(/\.[^.]+$/, "").replace(/[_-]/g, " ").slice(0, 80) || "Arquivo importado",
        content: f.text,
        source_label: f.name,
      });
    }

    return entries;
  };

  const handlePreview = () => setPreviewed(buildEntries());

  // --- Import ---
  const insertEntries = async (entries: ParsedEntry[]) => {
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
    if (error) { toast({ title: "Erro ao importar", description: error.message, variant: "destructive" }); throw error; }

    const important = rows.filter((r) => r.context_type === "decisao");
    if (important.length > 0) {
      await supabase.from("timeline_events").insert(
        important.map((r) => ({
          workspace_id: workspaceId, client_id: clientId,
          event_type: "context_added",
          title: `Contexto importado: ${r.title}`,
          description: `Tipo: ${r.context_type} · Importação`,
          happened_at: r.happened_at || new Date().toISOString(),
        }))
      );
    }
  };

  const handleImport = async () => {
    if (!hasContent) return;
    setSaving(true);
    try {
      const entries = previewed ?? buildEntries();
      if (entries.length === 0) {
        toast({ title: "Nenhum conteúdo para importar", variant: "destructive" });
        setSaving(false);
        return;
      }
      await insertEntries(entries);
      toast({ title: `${entries.length} contexto(s) importado(s)` });
      onImported();
      handleOpenChange(false);
    } catch { /* toasted */ } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Contexto</DialogTitle>
          <DialogDescription>Cole texto, arraste arquivos ou ambos. O parser detecta blocos automaticamente.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropzone */}
          <div>
            <input ref={fileRef} type="file" multiple accept={ACCEPTED} className="hidden" onChange={(e) => { if (e.target.files) processFiles(Array.from(e.target.files)); e.target.value = ""; }} />
            <div
              onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
              onClick={() => fileRef.current?.click()}
              className={`flex flex-col items-center gap-1.5 rounded-lg border-2 border-dashed p-5 cursor-pointer transition-colors ${
                dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              {filesLoading
                ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                : <Upload className="h-6 w-6 text-muted-foreground" />}
              <p className="text-xs text-muted-foreground">
                {filesLoading ? "Lendo..." : "Arraste arquivos ou clique · PDF, MD, TXT e mais · até 20"}
              </p>
            </div>

            {files.length > 0 && (
              <div className="mt-2 max-h-28 overflow-y-auto space-y-1 rounded-md border border-border p-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="truncate text-foreground">{f.name}</span>
                      {f.error
                        ? <Badge variant="destructive" className="text-[9px] shrink-0">{f.error}</Badge>
                        : <span className="text-muted-foreground shrink-0">{f.text.length}c</span>}
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); removeFile(i); }} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Text area — always visible */}
          <div className="space-y-1.5">
            <Label>Texto {hasFiles ? "(opcional)" : "*"}</Label>
            <Textarea
              value={rawText}
              onChange={(e) => { setRawText(e.target.value); setPreviewed(null); }}
              placeholder={"Cole texto aqui.\nDetecta automaticamente blocos por heading (## título) ou labels (briefing:, dor:, objetivo:)"}
              rows={6}
            />
          </div>

          {/* Type fallback + optional fields in compact grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo padrão</Label>
              <Select value={contextType} onValueChange={(v) => { setContextType(v as ContextType); setPreviewed(null); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONTEXT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{getContextLabel(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Data do evento</Label>
              <Input type="datetime-local" value={happenedAt} onChange={(e) => setHappenedAt(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Input value={sourceLabel} onChange={(e) => setSourceLabel(e.target.value)} placeholder="Ex: Kick-off" />
            </div>
            <div className="space-y-1.5">
              <Label>Link</Label>
              <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
            </div>
          </div>

          {/* Preview */}
          {hasContent && !previewed && (
            <Button variant="outline" size="sm" onClick={handlePreview} className="w-full">
              Pré-visualizar ({hasText ? "texto" : ""}{hasText && hasFiles ? " + " : ""}{hasFiles ? `${validFiles.length} arquivo(s)` : ""})
            </Button>
          )}

          {previewed && (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-xs text-muted-foreground font-medium">
                {previewed.length === 0
                  ? "Nenhum conteúdo detectado."
                  : `${previewed.length} contexto(s) a criar:`}
              </p>
              {previewed.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{getContextLabel(b.context_type)}</Badge>
                  <span className="text-xs text-foreground truncate">{b.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleImport} disabled={saving || !hasContent || filesLoading}>
            {saving ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
