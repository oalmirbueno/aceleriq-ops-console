import { useState, useRef, useCallback } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, Trash2, FileText, RotateCcw, CheckCircle2, Edit2 } from "lucide-react";
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

/* ─── Dossier block config ─── */

const DOSSIER_BLOCKS = [
  { key: "identity", label: "Identidade e Posicionamento" },
  { key: "offer", label: "Oferta, ICP e Persona" },
  { key: "commercial", label: "Estrutura Comercial" },
  { key: "operational", label: "Estrutura Operacional" },
  { key: "digital", label: "Estrutura Digital" },
  { key: "access", label: "Processos e Acessos" },
  { key: "diagnostic", label: "Diagnóstico Estrutural" },
  { key: "decisions", label: "Decisões, Lacunas e Prioridades" },
] as const;

const BLOCK_LABELS: Record<string, string> = Object.fromEntries(
  DOSSIER_BLOCKS.map((b) => [b.key, b.label])
);

/* ─── Dossier hint keywords for local parser ─── */

const DOSSIER_HINTS: { block: string; keywords: RegExp }[] = [
  { block: "identity", keywords: /\b(empresa|nome|razão social|cnpj|segmento|história|marca|identidade|posicionamento|branding|logo|visual)\b/i },
  { block: "offer", keywords: /\b(produto|serviço|oferta|icp|persona|público[- ]?alvo|proposta de valor|diferencial|nicho)\b/i },
  { block: "commercial", keywords: /\b(preço|ticket|concorr|faturamento|vendas|comercial|orçamento|receita|margem|comissão)\b/i },
  { block: "operational", keywords: /\b(equipe|processo|ferramenta|gestão|prazo|fluxo|operacion|time|colaborador|interno)\b/i },
  { block: "digital", keywords: /\b(site|website|rede social|instagram|facebook|linkedin|tráfego|seo|google|integra|plataforma digital|landing|funil)\b/i },
  { block: "access", keywords: /\b(acesso|login|credencial|senha|domínio|hospedagem|servidor|painel|admin)\b/i },
  { block: "diagnostic", keywords: /\b(dor|problema|gargalo|desafio|diagnóstico|dificuldade|obstáculo|fraqueza|limitação)\b/i },
  { block: "decisions", keywords: /\b(objetivo|meta|decisão|prioridade|expectativa|resultado|kpi|indicador|plano|estratégia)\b/i },
];

function inferDossierBlock(title: string, content: string): string | undefined {
  const text = `${title} ${content}`.toLowerCase();
  let bestMatch: { block: string; count: number } | null = null;

  for (const hint of DOSSIER_HINTS) {
    const matches = text.match(hint.keywords);
    const count = matches ? matches.length : 0;
    if (count > 0 && (!bestMatch || count > bestMatch.count)) {
      bestMatch = { block: hint.block, count };
    }
  }

  return bestMatch?.block;
}

/* ─── Local parser (primary path) ─── */

function parseLocally(text: string): PreviewEntry[] {
  // Try structured patterns: numbered sections, markdown headings, or key:value
  const structuredPattern = /(?:^|\n)(?:#{1,3}\s+|(?:\d{1,2})[.)]\s*|(?:[A-Z][a-zÀ-ú]+(?:\s[a-zÀ-ú]+)*)\s*[:–—]\s*)/;
  const hasStructure = structuredPattern.test(text);

  let sections: { title: string; content: string }[] = [];

  if (hasStructure) {
    // Split by headings or numbered items
    const splitPattern = /(?:^|\n)(#{1,3}\s+.+|(?:\d{1,2})[.)]\s*.+)/g;
    const parts = text.split(splitPattern).filter((p) => p.trim());

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      const isHeading = /^(?:#{1,3}\s+|(?:\d{1,2})[.)]\s*)/.test(part);

      if (isHeading) {
        const title = part.replace(/^#{1,3}\s+/, "").replace(/^\d{1,2}[.)]\s*/, "").trim();
        const body = parts[i + 1]?.trim() || "";
        if (title && (body || title.length > 20)) {
          sections.push({ title: title.slice(0, 80), content: body || title });
          i++; // skip body part
        }
      }
    }

    // Fallback: try key:value pattern
    if (sections.length < 2) {
      const kvPattern = /(?:^|\n)([A-ZÀ-Ú][a-zà-ú\s]+(?:[a-zà-ú]+))[\s]*[:–—]\s*(.+(?:\n(?![A-ZÀ-Ú][a-zà-ú\s]+[:–—]).+)*)/g;
      let match;
      const kvSections: { title: string; content: string }[] = [];
      while ((match = kvPattern.exec(text)) !== null) {
        kvSections.push({ title: match[1].trim().slice(0, 80), content: match[2].trim() });
      }
      if (kvSections.length >= 2) sections = kvSections;
    }
  }

  // Final fallback: split by double newlines
  if (sections.length < 2) {
    const paragraphs = text.split(/\n{2,}/).filter((p) => p.trim().length > 15);
    if (paragraphs.length < 2) {
      sections = [{ title: "Briefing completo", content: text.trim() }];
    } else {
      sections = paragraphs.slice(0, 20).map((p) => {
        const firstLine = p.split("\n")[0].trim().replace(/[:\-–—]+$/, "").trim();
        return { title: firstLine.slice(0, 80) || "Seção", content: p.trim() };
      });
    }
  }

  return sections.map((s) => ({
    title: s.title,
    content: s.content,
    dossierBlock: inferDossierBlock(s.title, s.content),
    included: true,
    parserMode: "local_rules" as const,
  }));
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

interface PreviewEntry {
  title: string;
  content: string;
  dossierBlock?: string;
  included: boolean;
  parserMode: "local_rules" | "ai_assist";
  editing?: boolean;
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

  const reset = () => {
    setFileName(null);
    setParsing(false);
    setParsingStatus("");
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
      setParsingStatus("Extraindo texto do arquivo...");
      const text = await readFileAsText(file);
      if (!text.trim()) {
        toast({ title: "Arquivo sem conteúdo legível", description: "Verifique se o PDF contém texto (não apenas imagens).", variant: "destructive" });
        setParsing(false);
        setParsingStatus("");
        return;
      }

      // Primary path: local deterministic parser
      setParsingStatus("Organizando conteúdo...");
      const result = parseLocally(text);
      setPreview(result);
    } catch (err: any) {
      toast({ title: "Erro ao ler arquivo", description: err?.message || "Erro desconhecido", variant: "destructive" });
    } finally {
      setParsing(false);
      setParsingStatus("");
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

  const updateEntryTitle = (i: number, title: string) => {
    setPreview((prev) => prev?.map((e, idx) => idx === i ? { ...e, title } : e) ?? null);
  };

  const updateEntryBlock = (i: number, block: string) => {
    setPreview((prev) => prev?.map((e, idx) => idx === i ? { ...e, dossierBlock: block === "_none" ? undefined : block } : e) ?? null);
  };

  const toggleEditing = (i: number) => {
    setPreview((prev) => prev?.map((e, idx) => idx === i ? { ...e, editing: !e.editing } : e) ?? null);
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
          parser_mode: e.parserMode,
          import_review_status: "pending_review",
          source_file_name: fileName ?? undefined,
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
        description: `${toImport.length} seção(ões) importada(s) via parser local · Status: pendente de revisão`,
        happened_at: new Date().toISOString(),
      });

      toast({ title: `${label} importado`, description: `${toImport.length} seção(ões) salva(s) como pendente de revisão` });
      onImported();
      handleOpenChange(false);
    } catch {
      /* toasted */
    } finally {
      setSaving(false);
    }
  };

  const includedCount = preview?.filter((e) => e.included).length ?? 0;

  // Group preview by dossier block
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
            Envie o PDF preenchido. O sistema extrai e organiza as seções automaticamente. Revise antes de salvar.
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
                  <p className="text-xs text-muted-foreground mt-1">PDF, TXT ou MD · Extração e organização automática</p>
                </div>
              </div>
            </>
          )}

          {/* Parsing state */}
          {parsing && (
            <div className="flex flex-col items-center gap-3 py-10">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
              <div className="text-center">
                <p className="text-sm text-foreground font-medium">{parsingStatus || "Processando..."}</p>
                <p className="text-xs text-muted-foreground mt-1">Lendo e organizando o briefing</p>
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
                  <Badge variant="outline" className="text-[9px] shrink-0">
                    Parser local
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs shrink-0"
                  onClick={() => { setPreview(null); setFileName(null); }}
                >
                  <RotateCcw className="h-3 w-3 mr-1" /> Trocar arquivo
                </Button>
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground font-medium">
                  {preview.length} seção(ões) · {includedCount} selecionada(s)
                </p>
                <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                  Pendente de revisão
                </Badge>
              </div>

              <div className="space-y-3 max-h-[45vh] overflow-y-auto pr-1">
                {groupedPreview.map(([blockKey, { entries }]) => (
                  <div key={blockKey} className="space-y-1.5">
                    <p className="text-[10px] font-semibold text-primary/70 uppercase tracking-wider px-1">
                      {BLOCK_LABELS[blockKey] || "Sem classificação"}
                    </p>
                    {entries.map((entry) => (
                      <div
                        key={entry.idx}
                        className={`rounded-md border p-3 transition-opacity ${
                          entry.included ? "border-border" : "border-border/30 opacity-40"
                        }`}
                      >
                        {/* Edit mode */}
                        {entry.editing ? (
                          <div className="space-y-2">
                            <Input
                              value={entry.title}
                              onChange={(e) => updateEntryTitle(entry.idx, e.target.value)}
                              className="h-7 text-xs"
                              placeholder="Título da seção"
                            />
                            <Select
                              value={entry.dossierBlock || "_none"}
                              onValueChange={(v) => updateEntryBlock(entry.idx, v)}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="_none">Sem bloco</SelectItem>
                                {DOSSIER_BLOCKS.map((b) => (
                                  <SelectItem key={b.key} value={b.key}>{b.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => toggleEditing(entry.idx)}>
                              <CheckCircle2 className="h-3 w-3 mr-1" /> OK
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-medium text-foreground">{entry.title}</span>
                                {entry.dossierBlock && (
                                  <Badge variant="outline" className="text-[9px] px-1 py-0">
                                    {BLOCK_LABELS[entry.dossierBlock]}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground line-clamp-3">{entry.content}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                onClick={() => toggleEditing(entry.idx)}
                                className="text-muted-foreground hover:text-primary mt-0.5 p-0.5"
                                title="Editar título e bloco"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => toggleEntry(entry.idx)}
                                className="text-muted-foreground hover:text-destructive mt-0.5 p-0.5"
                                title={entry.included ? "Remover" : "Incluir de volta"}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
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
