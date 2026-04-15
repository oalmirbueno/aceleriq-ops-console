import { useState, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Trash2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { BriefingType } from "./aceleraConstants";

/* ─── PDF text extraction (reuses same approach as ImportContextDialog) ─── */

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

async function readFileAsText(file: File): Promise<string> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf" || file.type === "application/pdf") return extractTextFromPdf(file);
  return file.text();
}

/* ─── Smart parser: splits briefing content into labeled sections ─── */

interface ParsedSection {
  title: string;
  content: string;
  dossierBlock?: string;
}

/** Maps common briefing field labels to dossier blocks — only explicit, safe mappings */
const DOSSIER_HINTS: Record<string, string> = {
  // Essential
  "empresa": "identity", "visão geral": "identity", "sobre a empresa": "identity",
  "segmento": "identity", "nome da empresa": "identity", "ramo": "identity",
  "produto": "offer", "serviço": "offer", "serviços": "offer", "o que vende": "offer",
  "público": "offer", "icp": "offer", "persona": "offer", "cliente ideal": "offer",
  "objetivo": "decisions", "meta": "decisions", "metas": "decisions",
  "dor": "diagnostic", "problema": "diagnostic", "desafio": "diagnostic", "dores": "diagnostic",
  "digital": "digital", "presença digital": "digital", "redes sociais": "digital", "site": "digital",
  "concorrente": "commercial", "concorrentes": "commercial",
  "orçamento": "commercial", "investimento": "commercial",
  "acesso": "access", "acessos": "access", "login": "access", "credenciais": "access",
  // SiteBolt
  "tipo de site": "digital", "páginas": "digital", "referência": "digital",
  "identidade visual": "identity", "marca": "identity", "logo": "identity", "cores": "identity",
  "conteúdo": "digital", "domínio": "access", "hospedagem": "access",
  "integração": "digital", "integrações": "digital",
  "seo": "digital", "prazo": "operational",
};

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function guessDossierBlock(title: string): string | undefined {
  const n = normalize(title);
  for (const [key, block] of Object.entries(DOSSIER_HINTS)) {
    if (n.includes(normalize(key))) return block;
  }
  return undefined;
}

/**
 * Parse extracted text into sections.
 * Tries multiple strategies:
 * 1. Numbered sections (1. Label / 1) Label)
 * 2. Markdown headings (## Label)
 * 3. Label: value pairs
 * 4. Double-newline separated paragraphs
 */
function parseBriefingText(raw: string): ParsedSection[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  // Strategy 1: numbered sections "1. Label" or "1) Label"
  const numberedRegex = /(?:^|\n)\s*\d+[\.\)]\s*(.+)/g;
  const numberedMatches = [...trimmed.matchAll(numberedRegex)];
  if (numberedMatches.length >= 3) {
    return splitBySeparators(trimmed, numberedRegex);
  }

  // Strategy 2: markdown headings
  const headingRegex = /(?:^|\n)#{1,3}\s+(.+)/g;
  const headingMatches = [...trimmed.matchAll(headingRegex)];
  if (headingMatches.length >= 2) {
    return splitBySeparators(trimmed, headingRegex);
  }

  // Strategy 3: "Label:" pattern on its own line or with content
  const labelRegex = /(?:^|\n)([A-ZÀ-ÖØ-öø-ÿ][\wÀ-ÖØ-öø-ÿ\s/,]{2,60})\s*:\s*/g;
  const labelMatches = [...trimmed.matchAll(labelRegex)];
  if (labelMatches.length >= 3) {
    return splitBySeparators(trimmed, labelRegex);
  }

  // Strategy 4: paragraph blocks (double newline)
  const paragraphs = trimmed.split(/\n{2,}/).filter((p) => p.trim());
  if (paragraphs.length >= 2) {
    return paragraphs.map((p) => {
      const firstLine = p.split("\n")[0].trim();
      const title = firstLine.slice(0, 80).replace(/[:\-–—]+$/, "").trim() || "Seção";
      return {
        title,
        content: p.trim(),
        dossierBlock: guessDossierBlock(title),
      };
    });
  }

  // Fallback: single block
  return [{
    title: trimmed.split("\n")[0].slice(0, 80) || "Briefing completo",
    content: trimmed,
  }];
}

function splitBySeparators(text: string, regex: RegExp): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const matches = [...text.matchAll(new RegExp(regex.source, "gm"))];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const label = (match[1] || "").trim();
    const start = (match.index ?? 0) + match[0].length;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? text.length) : text.length;
    const content = text.slice(start, end).trim();

    if (content) {
      sections.push({
        title: label.slice(0, 80) || "Seção",
        content,
        dossierBlock: guessDossierBlock(label),
      });
    }
  }
  return sections;
}

/* ─── Component ─── */

const BRIEFING_LABELS: Record<"essential" | "sitebolt", string> = {
  essential: "Briefing Essencial",
  sitebolt: "Briefing SiteBolt",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  briefingType: "essential" | "sitebolt";
  onImported: () => void;
}

interface PreviewEntry extends ParsedSection {
  included: boolean;
}

export default function ImportBriefingDialog({ open, onOpenChange, workspaceId, clientId, briefingType, onImported }: Props) {
  const label = BRIEFING_LABELS[briefingType];
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const reset = () => {
    setFileName(null);
    setRawText("");
    setParsing(false);
    setPreview(null);
    setSaving(false);
    setDragOver(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const processFile = useCallback(async (file: File) => {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const allowed = ["pdf", "txt", "md"];
    if (!allowed.includes(ext) && !file.type.startsWith("text/") && file.type !== "application/pdf") {
      toast({ title: "Formato não suportado", description: "Envie PDF, TXT ou MD.", variant: "destructive" });
      return;
    }

    setFileName(file.name);
    setParsing(true);
    setPreview(null);

    try {
      const text = await readFileAsText(file);
      if (!text.trim()) {
        toast({ title: "Arquivo sem conteúdo legível", description: "Verifique se o PDF contém texto (não apenas imagens).", variant: "destructive" });
        setParsing(false);
        return;
      }

      setRawText(text);
      const sections = parseBriefingText(text);
      setPreview(sections.map((s) => ({ ...s, included: true })));
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err?.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setParsing(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  const toggleEntry = (i: number) => {
    setPreview((prev) => prev?.map((e, idx) => idx === i ? { ...e, included: !e.included } : e) ?? null);
  };

  const handleImport = async () => {
    const toImport = preview?.filter((e) => e.included) ?? [];
    if (toImport.length === 0) {
      toast({ title: "Nenhum item selecionado", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const rows = toImport.map((e) => {
        const metadata: Record<string, unknown> = {
          briefing_kind: briefingType as BriefingType,
          import_source: `briefing_${briefingType}_pdf`,
          generated_from: "briefing_import",
        };
        if (e.dossierBlock) {
          metadata.dossier_block = e.dossierBlock;
        }
        return {
          workspace_id: workspaceId,
          client_id: clientId,
          context_type: "briefing",
          title: `[${label}] ${e.title}`,
          content: e.content,
          source_label: fileName ?? label,
          is_key_decision: false,
          tags: ["briefing", briefingType],
          metadata,
        };
      });

      const { error } = await supabase.from("context_entries").insert(rows);
      if (error) {
        toast({ title: "Erro ao importar briefing", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }

      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "context_added",
        title: `${label} importado`,
        description: `${toImport.length} item(ns) importado(s) do ${label} via PDF`,
        happened_at: new Date().toISOString(),
      });

      toast({ title: `${label} importado`, description: `${toImport.length} item(ns) criado(s)` });
      onImported();
      handleOpenChange(false);
    } catch {
      /* toasted */
    } finally {
      setSaving(false);
    }
  };

  const includedCount = preview?.filter((e) => e.included).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {label}</DialogTitle>
          <DialogDescription>
            Envie o PDF já preenchido do briefing. O sistema extrai e organiza automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload zone */}
          {!preview && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) processFile(file);
                  e.target.value = "";
                }}
              />
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
                onClick={() => fileRef.current?.click()}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                {parsing ? (
                  <>
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Lendo {fileName}...</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground font-medium">Arraste o PDF ou clique para enviar</p>
                    <p className="text-xs text-muted-foreground">PDF, TXT ou MD</p>
                  </>
                )}
              </div>
            </>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{fileName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => { setPreview(null); setFileName(null); setRawText(""); }}
                >
                  Trocar arquivo
                </Button>
              </div>

              <p className="text-xs text-muted-foreground font-medium">
                {preview.length} seção(ões) detectada(s) · {includedCount} selecionada(s)
              </p>

              <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                {preview.map((entry, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-2 rounded-md border p-3 transition-opacity ${
                      entry.included ? "border-border" : "border-border/30 opacity-40"
                    }`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground">{entry.title}</span>
                        {entry.dossierBlock && (
                          <Badge variant="outline" className="text-[9px]">→ {entry.dossierBlock}</Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground line-clamp-3">{entry.content}</p>
                    </div>
                    <button
                      onClick={() => toggleEntry(i)}
                      className="shrink-0 text-muted-foreground hover:text-destructive mt-0.5"
                      title={entry.included ? "Remover" : "Incluir de volta"}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          {preview && (
            <Button onClick={handleImport} disabled={saving || includedCount === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando...</> : `Importar ${includedCount} item(ns)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
