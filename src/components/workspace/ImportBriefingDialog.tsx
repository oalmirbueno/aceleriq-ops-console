import { useState, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, FileText, RotateCcw, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { BriefingType } from "./aceleraConstants";
import { extractStructuredSignals } from "./briefingSignals";

/* ─── PDF text extraction ─── */

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

/* ─── Types ─── */

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

export default function ImportBriefingDialog({ open, onOpenChange, workspaceId, clientId, briefingType, onImported }: Props) {
  const label = BRIEFING_LABELS[briefingType];
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const reset = () => {
    setFileName(null);
    setParsing(false);
    setExtractedText(null);
    setSaving(false);
    setDragOver(false);
    setShowPreview(false);
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
    setExtractedText(null);

    try {
      const text = await readFileAsText(file);
      if (!text.trim()) {
        toast({ title: "Arquivo sem conteúdo legível", description: "Verifique se o PDF contém texto (não apenas imagens).", variant: "destructive" });
        setParsing(false);
        return;
      }
      setExtractedText(text.trim());
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

  const handleImport = async () => {
    if (!extractedText) return;

    setSaving(true);
    try {
      // Extract structured signals deterministically
      const signalsData = extractStructuredSignals(extractedText);

      const metadata: Record<string, unknown> = {
        briefing_kind: briefingType as BriefingType,
        import_source: `briefing_${briefingType}_pdf`,
        generated_from: "briefing_import",
        parser_mode: "local_rules",
        import_review_status: "pending_review",
        source_file_name: fileName ?? undefined,
        ...signalsData,
      };

      const row = {
        workspace_id: workspaceId,
        client_id: clientId,
        context_type: "briefing",
        title: `${label}`,
        content: extractedText,
        source_label: fileName ?? label,
        is_key_decision: false,
        tags: ["briefing", briefingType],
        metadata,
      };

      const { error } = await supabase.from("context_entries").insert(row);
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
        description: `Documento completo importado de ${fileName} · Status: pendente de revisão`,
        happened_at: new Date().toISOString(),
      });

      toast({ title: `${label} importado`, description: "Documento completo salvo na pasta de briefings" });
      onImported();
      handleOpenChange(false);
    } catch {
      /* toasted */
    } finally {
      setSaving(false);
    }
  };

  const charCount = extractedText?.length ?? 0;
  const wordCount = extractedText?.split(/\s+/).filter(Boolean).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {label}</DialogTitle>
          <DialogDescription>
            Envie o PDF preenchido. O documento será salvo completo, sem fragmentação, na pasta de {label}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload zone */}
          {!extractedText && !parsing && (
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
                className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-10 cursor-pointer transition-colors ${
                  dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
                }`}
              >
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="text-sm text-foreground font-medium">Arraste o PDF ou clique para enviar</p>
                  <p className="text-xs text-muted-foreground mt-1">PDF, TXT ou MD · O documento será salvo íntegro</p>
                </div>
              </div>
            </>
          )}

          {/* Parsing state */}
          {parsing && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-foreground font-medium">Extraindo texto do arquivo...</p>
            </div>
          )}

          {/* Ready to import */}
          {extractedText && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">{fileName}</span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => { setExtractedText(null); setFileName(null); setShowPreview(false); }}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Trocar
                </Button>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-4 text-xs text-muted-foreground border rounded-md p-3 bg-muted/20">
                <span>{wordCount.toLocaleString("pt-BR")} palavras</span>
                <span>{charCount.toLocaleString("pt-BR")} caracteres</span>
                <Badge variant="outline" className="text-[9px]">{label}</Badge>
                <Badge variant="outline" className="text-[9px] bg-muted/10 text-muted-foreground border-border">
                  Pendente de revisão
                </Badge>
              </div>

              {/* Preview toggle */}
              <Button
                variant="outline"
                size="sm"
                className="text-xs w-full"
                onClick={() => setShowPreview(!showPreview)}
              >
                <Eye className="h-3.5 w-3.5 mr-1" />
                {showPreview ? "Ocultar preview" : "Ver conteúdo extraído"}
              </Button>

              {showPreview && (
                <div className="max-h-[35vh] overflow-y-auto rounded-md border p-3 bg-muted/10">
                  <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                    {extractedText}
                  </pre>
                </div>
              )}

              <p className="text-[11px] text-muted-foreground">
                O documento será salvo completo como um único registro na pasta <strong className="text-foreground">{label}</strong>.
                Após importar, você pode revisar e marcar como revisado na aba Contexto.
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving || parsing}>
            Cancelar
          </Button>
          {extractedText && (
            <Button onClick={handleImport} disabled={saving}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando...</> : `Importar ${label}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
