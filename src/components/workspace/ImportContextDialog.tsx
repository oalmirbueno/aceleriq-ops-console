import { useState, useRef } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, FileUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const CONTEXT_TYPES = [
  "briefing", "dor", "objetivo", "reuniao", "transcricao",
  "decisao", "acesso", "anotacao", "diagnostico",
] as const;

type ContextType = (typeof CONTEXT_TYPES)[number];

type ImportMode = "single" | "multi" | "briefing" | "markdown" | "pdf";

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

/** Parse markdown into sections by headings (## or #) */
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
      // Content before first heading — create a default section
      current = { heading: "Contexto importado", lines: [line] };
    }
  }
  if (current) sections.push(current);

  // Try to map heading to context_type, fallback to anotacao
  return sections
    .map((s) => {
      const content = s.lines.join("\n").trim();
      if (!content) return null;

      // Try to match heading to a known type
      const normalizedHeading = normalize(s.heading);
      let contextType: ContextType = "anotacao";
      for (const [key, type] of Object.entries(LABEL_TO_TYPE)) {
        if (normalizedHeading === normalize(key) || normalizedHeading.startsWith(normalize(key))) {
          contextType = type;
          break;
        }
      }

      return {
        context_type: contextType,
        title: s.heading.slice(0, 80),
        content,
      };
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
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRawText("");
    setSourceLabel("");
    setSourceUrl("");
    setHappenedAt("");
    setPreview(null);
    setMode("single");
    setSingleType("anotacao");
    setPdfFileName(null);
    setPdfLoading(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const trimmed = rawText.trim();

  const handlePreview = () => {
    if (mode === "multi") {
      setPreview(parseMultiBlocks(trimmed));
    } else if (mode === "markdown") {
      setPreview(parseMarkdownSections(trimmed));
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Arquivo inválido", description: "Selecione um arquivo PDF.", variant: "destructive" });
      return;
    }
    setPdfLoading(true);
    setPdfFileName(file.name);
    try {
      const text = await extractTextFromPdf(file);
      if (!text.trim()) {
        toast({ title: "PDF sem texto", description: "Não foi possível extrair texto deste PDF. Pode ser um PDF escaneado/imagem.", variant: "destructive" });
        setPdfFileName(null);
      } else {
        setRawText(text);
        setSourceLabel(file.name);
        toast({ title: "PDF lido com sucesso", description: `${text.length} caracteres extraídos.` });
      }
    } catch (err: any) {
      toast({ title: "Erro ao ler PDF", description: err?.message || "Erro desconhecido", variant: "destructive" });
      setPdfFileName(null);
    } finally {
      setPdfLoading(false);
    }
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
      if (mode === "single" || mode === "pdf") {
        const type = mode === "pdf" ? singleType : singleType;
        await insertEntries([{ context_type: type, title: deriveTitle(trimmed), content: trimmed }]);
        toast({ title: "1 contexto importado" });
      } else if (mode === "briefing") {
        await insertEntries([{ context_type: "briefing", title: deriveTitle(trimmed), content: trimmed }]);
        toast({ title: "Briefing importado" });
      } else if (mode === "markdown") {
        const blocks = preview ?? parseMarkdownSections(trimmed);
        if (blocks.length === 0) {
          toast({ title: "Nenhuma seção encontrada", description: "Use cabeçalhos markdown (## Título) para separar seções.", variant: "destructive" });
          setSaving(false);
          return;
        }
        await insertEntries(blocks);
        toast({ title: `${blocks.length} contextos importados` });
      } else {
        // multi
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

  const showTextarea = mode !== "pdf" || rawText;
  const showPreviewButton = (mode === "multi" || mode === "markdown") && !preview && trimmed;
  const hasPreviewWithNoBlocks = preview !== null && preview.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar Contexto</DialogTitle>
          <DialogDescription>Importe texto, markdown ou PDF para criar registros de contexto.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode */}
          <div className="space-y-1.5">
            <Label>Modo de importação</Label>
            <Select value={mode} onValueChange={(v) => { setMode(v as ImportMode); setPreview(null); setRawText(""); setPdfFileName(null); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">1 contexto único</SelectItem>
                <SelectItem value="multi">Quebrar em múltiplos blocos</SelectItem>
                <SelectItem value="briefing">Importar como briefing</SelectItem>
                <SelectItem value="markdown">
                  <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Importar Markdown</span>
                </SelectItem>
                <SelectItem value="pdf">
                  <span className="flex items-center gap-1.5"><FileUp className="h-3.5 w-3.5" /> Importar PDF</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Type for single/pdf mode */}
          {(mode === "single" || mode === "pdf") && (
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

          {/* PDF upload */}
          {mode === "pdf" && (
            <div className="space-y-1.5">
              <Label>Arquivo PDF</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handlePdfUpload}
              />
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => fileInputRef.current?.click()}
                disabled={pdfLoading}
              >
                <FileUp className="h-4 w-4" />
                {pdfLoading ? "Lendo PDF..." : pdfFileName ? pdfFileName : "Selecionar PDF"}
              </Button>
              {pdfFileName && rawText && (
                <p className="text-xs text-muted-foreground">{rawText.length} caracteres extraídos</p>
              )}
            </div>
          )}

          {/* Raw text / extracted text */}
          {showTextarea && (
            <div className="space-y-1.5">
              <Label>{mode === "pdf" ? "Texto extraído" : mode === "markdown" ? "Markdown *" : "Texto bruto *"}</Label>
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
                readOnly={mode === "pdf"}
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
                    ? "Nenhuma seção encontrada. Use cabeçalhos markdown (## Título) para separar seções."
                    : "Nenhum bloco reconhecido. Use marcadores como 'briefing:', 'dor:', 'objetivo:' no início das linhas."
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
            disabled={saving || !trimmed || hasPreviewWithNoBlocks || pdfLoading}
          >
            {saving ? "Importando..." : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
