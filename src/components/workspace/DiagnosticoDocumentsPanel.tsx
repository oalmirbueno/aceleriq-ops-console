/**
 * DiagnosticoDocumentsPanel
 *
 * Painel injetado como extraSlot no DiagnosticoNodeDrawer.
 * Lista TODOS os documentos do Contexto que sustentam diagnóstico
 * (diagnostico, dor, decisao) — com download, abrir link e marcar como
 * revisado. O estado "revisado" é persistido em canvas_nodes.metadata.diagnostico_review.
 *
 * Não substitui as sections do blueprint — complementa, mostrando a base
 * factual real ao lado da análise estrutural.
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ExternalLink, Download, AlertCircle, RefreshCw, Star } from "lucide-react";
import { getContextLabel } from "./contextTypes";
import { toast } from "@/hooks/use-toast";

interface DocEntry {
  id: string;
  title: string;
  content: string | null;
  context_type: string;
  source_url: string | null;
  source_label: string | null;
  happened_at: string | null;
  is_key_decision: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Attachment { name?: string; url?: string; mime?: string; size?: number }

interface Props {
  nodeId: string;
  clientId: string;
}

const RELEVANT_TYPES = ["diagnostico", "dor", "decisao"] as const;

export default function DiagnosticoDocumentsPanel({ nodeId, clientId }: Props) {
  const [docs, setDocs] = useState<DocEntry[] | null>(null);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [docsRes, nodeRes] = await Promise.all([
      supabase.from("context_entries")
        .select("id, title, content, context_type, source_url, source_label, happened_at, is_key_decision, metadata, created_at")
        .eq("client_id", clientId)
        .in("context_type", RELEVANT_TYPES as unknown as string[])
        .order("is_key_decision", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("canvas_nodes").select("metadata").eq("id", nodeId).maybeSingle(),
    ]);
    if (!docsRes.error && docsRes.data) setDocs(docsRes.data as DocEntry[]);
    const review = (nodeRes.data?.metadata as Record<string, unknown> | null)?.diagnostico_review as Record<string, boolean> | undefined;
    setReviewed(review ?? {});
    setLoading(false);
  }, [clientId, nodeId]);

  useEffect(() => { load(); }, [load]);

  const persistReviewed = useCallback(async (next: Record<string, boolean>) => {
    setReviewed(next);
    const { data: cur } = await supabase.from("canvas_nodes").select("metadata").eq("id", nodeId).maybeSingle();
    const meta = (cur?.metadata as Record<string, unknown> | null) ?? {};
    await supabase.from("canvas_nodes").update({
      metadata: { ...meta, diagnostico_review: next },
    }).eq("id", nodeId);
  }, [nodeId]);

  const toggleReviewed = (id: string, v: boolean) => persistReviewed({ ...reviewed, [id]: v });

  const stats = useMemo(() => {
    const total = docs?.length ?? 0;
    const done = docs?.filter((d) => reviewed[d.id]).length ?? 0;
    return { total, done, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  }, [docs, reviewed]);

  const downloadAttachment = (att: Attachment) => {
    if (!att.url) return;
    const a = document.createElement("a");
    a.href = att.url;
    a.download = att.name ?? "documento";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const downloadAsText = (doc: DocEntry) => {
    const blob = new Blob(
      [`# ${doc.title}\n\nTipo: ${getContextLabel(doc.context_type)}\nFonte: ${doc.source_label ?? "—"}\n\n${doc.content ?? ""}`],
      { type: "text/markdown" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ title: "Documento baixado", description: doc.title });
  };

  return (
    <div className="rounded-lg border border-border bg-background/40 p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-primary" />
            Documentos do Contexto
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Base factual auto-puxada — diagnósticos, dores e decisões registradas pelo cliente.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Badge variant="outline" className="text-[10px]">
            {stats.done}/{stats.total} revisados ({stats.pct}%)
          </Badge>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={load} title="Recarregar">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {loading && (
        <div className="space-y-1.5">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      )}

      {!loading && (!docs || docs.length === 0) && (
        <div className="rounded-md border border-dashed border-border px-3 py-4 text-center">
          <AlertCircle className="h-4 w-4 text-muted-foreground mx-auto mb-1.5" />
          <p className="text-[11px] text-muted-foreground">
            Nenhum documento de diagnóstico no Contexto ainda.
          </p>
          <p className="text-[10px] text-muted-foreground/70 mt-0.5">
            Adicione na aba Contexto entradas do tipo diagnóstico, dor ou decisão.
          </p>
        </div>
      )}

      {!loading && docs && docs.length > 0 && (
        <ScrollArea className="max-h-72 pr-2">
          <ul className="space-y-1.5">
            {docs.map((d) => {
              const isReviewed = !!reviewed[d.id];
              const atts = ((d.metadata?.attachments as Attachment[] | undefined) ?? []).filter((a) => a?.url);
              return (
                <li
                  key={d.id}
                  className={`rounded-md border px-2.5 py-2 transition-colors ${
                    isReviewed ? "border-primary/30 bg-primary/5" : "border-border bg-muted/5"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={isReviewed}
                      onCheckedChange={(v) => toggleReviewed(d.id, !!v)}
                      className="mt-0.5 shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-xs font-medium leading-tight ${isReviewed ? "text-foreground/80" : "text-foreground"}`}>
                          {d.title}
                        </span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                          {getContextLabel(d.context_type)}
                        </Badge>
                        {d.is_key_decision && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-primary/40 text-primary">
                            <Star className="h-2 w-2 mr-0.5 fill-current" /> chave
                          </Badge>
                        )}
                      </div>
                      {d.content && (
                        <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">
                          {d.content}
                        </p>
                      )}
                      <div className="flex items-center gap-1 flex-wrap pt-0.5">
                        {d.source_url && (
                          <Button asChild size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-1">
                            <a href={d.source_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-2.5 w-2.5" /> Abrir fonte
                            </a>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-1"
                          onClick={() => downloadAsText(d)}>
                          <Download className="h-2.5 w-2.5" /> Baixar .md
                        </Button>
                        {atts.map((a, i) => (
                          <Button key={i} size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] gap-1"
                            onClick={() => downloadAttachment(a)}>
                            <Download className="h-2.5 w-2.5" /> {a.name ?? `anexo ${i + 1}`}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}