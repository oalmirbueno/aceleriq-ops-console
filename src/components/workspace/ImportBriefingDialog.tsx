import { useState, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, Trash2, FileText, Brain, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { BriefingType } from "./aceleraConstants";

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

/* ─── Dossier block labels for display ─── */

const BLOCK_LABELS: Record<string, string> = {
  identity: "Identidade e Posicionamento",
  offer: "Oferta, ICP e Persona",
  commercial: "Estrutura Comercial",
  operational: "Estrutura Operacional",
  digital: "Estrutura Digital",
  access: "Processos e Acessos",
  diagnostic: "Diagnóstico Estrutural",
  decisions: "Decisões, Lacunas e Prioridades",
};

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

interface PreviewEntry {
  title: string;
  content: string;
  dossierBlock?: string;
  included: boolean;
}

export default function ImportBriefingDialog({ open, onOpenChange, workspaceId, clientId, briefingType, onImported }: Props) {
  const label = BRIEFING_LABELS[briefingType];
  const fileRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parsingStatus, setParsingStatus] = useState("");
  const [preview, setPreview] = useState<PreviewEntry[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [usedAI, setUsedAI] = useState(false);

  const reset = () => {
    setFileName(null);
    setParsing(false);
    setParsingStatus("");
    setPreview(null);
    setSaving(false);
    setDragOver(false);
    setUsedAI(false);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  /** Call edge function for intelligent parsing */
  const parseWithAI = async (text: string): Promise<PreviewEntry[] | null> => {
    try {
      const { data, error } = await supabase.functions.invoke("parse-briefing", {
        body: { text, briefing_type: briefingType },
      });

      if (error) {
        console.warn("AI parse failed:", error);
        return null;
      }

      if (data?.error) {
        console.warn("AI parse error:", data.error);
        if (data.error.includes("429") || data.error.includes("Limite")) {
          toast({ title: "IA temporariamente indisponível", description: "Usando parser local como alternativa.", variant: "default" });
        }
        return null;
      }

      const sections = data?.sections;
      if (!Array.isArray(sections) || sections.length === 0) return null;

      return sections.map((s: any) => ({
        title: s.title || "Seção",
        content: s.content || "",
        dossierBlock: s.dossier_block || undefined,
        included: true,
      }));
    } catch (err) {
      console.warn("AI parse exception:", err);
      return null;
    }
  };

  /** Simple local fallback parser */
  const parseLocally = (text: string): PreviewEntry[] => {
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 10);
    if (paragraphs.length < 2) {
      return [{ title: "Briefing completo", content: text.trim(), included: true }];
    }
    return paragraphs.slice(0, 15).map((p) => {
      const firstLine = p.split("\n")[0].trim().replace(/[:\-–—]+$/, "").trim();
      return {
        title: firstLine.slice(0, 80) || "Seção",
        content: p.trim(),
        included: true,
      };
    });
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
    setUsedAI(false);

    try {
      setParsingStatus("Extraindo texto do arquivo...");
      const text = await readFileAsText(file);
      if (!text.trim()) {
        toast({ title: "Arquivo sem conteúdo legível", description: "Verifique se o PDF contém texto (não apenas imagens).", variant: "destructive" });
        setParsing(false);
        setParsingStatus("");
        return;
      }

      // Try AI parsing first
      setParsingStatus("Analisando conteúdo com IA...");
      const aiResult = await parseWithAI(text);

      if (aiResult && aiResult.length > 0) {
        setPreview(aiResult);
        setUsedAI(true);
      } else {
        // Fallback to local
        setParsingStatus("Organizando conteúdo...");
        setPreview(parseLocally(text));
        setUsedAI(false);
      }
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err?.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setParsing(false);
      setParsingStatus("");
    }
  }, [briefingType]);

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
        description: `${toImport.length} item(ns) extraído(s) e organizado(s) do ${label} via PDF`,
        happened_at: new Date().toISOString(),
      });

      toast({ title: `${label} importado`, description: `${toImport.length} seção(ões) organizada(s) e salva(s)` });
      onImported();
      handleOpenChange(false);
    } catch {
      /* toasted */
    } finally {
      setSaving(false);
    }
  };

  const includedCount = preview?.filter((e) => e.included).length ?? 0;

  // Group preview by dossier block for organized display
  const groupedPreview = preview
    ? Object.entries(
        preview.reduce<Record<string, { entries: (PreviewEntry & { idx: number })[] }>>((acc, entry, idx) => {
          const key = entry.dossierBlock || "_unclassified";
          if (!acc[key]) acc[key] = { entries: [] };
          acc[key].entries.push({ ...entry, idx });
          return acc;
        }, {})
      ).sort(([a], [b]) => {
        if (a === "_unclassified") return 1;
        if (b === "_unclassified") return -1;
        return 0;
      })
    : [];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Importar {label}</DialogTitle>
          <DialogDescription>
            Envie o PDF preenchido. A IA analisa, organiza e mapeia cada informação para o bloco correto do Dossiê.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Upload zone */}
          {!preview && !parsing && (
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
                  <p className="text-xs text-muted-foreground mt-1">PDF, TXT ou MD · A IA interpreta e organiza automaticamente</p>
                </div>
              </div>
            </>
          )}

          {/* Parsing state */}
          {parsing && (
            <div className="flex flex-col items-center gap-3 py-10">
              <div className="relative">
                <Brain className="h-8 w-8 text-primary animate-pulse" />
                <Loader2 className="h-4 w-4 text-primary animate-spin absolute -bottom-1 -right-1" />
              </div>
              <div className="text-center">
                <p className="text-sm text-foreground font-medium">{parsingStatus || "Processando..."}</p>
                <p className="text-xs text-muted-foreground mt-1">Lendo, interpretando e organizando o briefing</p>
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground truncate">{fileName}</span>
                  {usedAI && (
                    <Badge variant="outline" className="text-[9px] bg-primary/10 text-primary border-primary/20 shrink-0">
                      <Brain className="h-2.5 w-2.5 mr-0.5" /> Organizado por IA
                    </Badge>
                  )}
                  {!usedAI && (
                    <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20 shrink-0">
                      <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Parser local
                    </Badge>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => { setPreview(null); setFileName(null); }}
                >
                  Trocar arquivo
                </Button>
              </div>

              <p className="text-xs text-muted-foreground font-medium">
                {preview.length} seção(ões) detectada(s) · {includedCount} selecionada(s)
              </p>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                {groupedPreview.map(([blockKey, { entries }]) => (
                  <div key={blockKey} className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider px-1">
                      {BLOCK_LABELS[blockKey] || "Sem classificação"}
                    </p>
                    {entries.map((entry) => (
                      <div
                        key={entry.idx}
                        className={`flex items-start gap-2 rounded-md border p-3 transition-opacity ${
                          entry.included ? "border-border" : "border-border/30 opacity-40"
                        }`}
                      >
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium text-foreground">{entry.title}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground line-clamp-3">{entry.content}</p>
                        </div>
                        <button
                          onClick={() => toggleEntry(entry.idx)}
                          className="shrink-0 text-muted-foreground hover:text-destructive mt-0.5"
                          title={entry.included ? "Remover" : "Incluir de volta"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={saving || parsing}>
            Cancelar
          </Button>
          {preview && (
            <Button onClick={handleImport} disabled={saving || includedCount === 0}>
              {saving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando...</> : `Importar ${includedCount} seção(ões)`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
