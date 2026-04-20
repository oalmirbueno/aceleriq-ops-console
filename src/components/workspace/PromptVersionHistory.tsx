/**
 * PromptVersionHistory
 *
 * Histórico visual de versões do system prompt do Agente IA.
 *
 * Persistência:
 *   canvas_nodes.metadata.prompt_versions: PromptVersion[]
 *   - Append-only (não deleta versões antigas — auditoria)
 *   - Ordenado do mais recente pro mais antigo na UI
 *
 * Funcionalidades:
 *   - Lista cronológica com label, autor inferido (auto/edited), tamanho e timestamp
 *   - Selecionar 2 versões → renderiza diff char-by-char (LCS) com chunks add/del/eq
 *   - "Salvar versão" snapshota o prompt atual (sem trocar nada)
 *   - "Reverter" copia conteúdo da versão escolhida pra o prompt atual
 *     (e salva uma nova versão marcada como "revert from <id>" pra rastreio)
 *   - Auto-snapshot quando origin muda de auto → edited (controlado pelo wrapper)
 *
 * Uso:
 *   <PromptVersionHistory
 *      nodeId={node.id}
 *      currentPrompt={value}
 *      onRevert={(text) => updateField("agent_core","system_prompt", { value: text, origin: "edited" })}
 *   />
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  GitCommit, History, RotateCcw, Save, ChevronDown, ChevronUp, Diff as DiffIcon, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

export interface PromptVersion {
  id: string;            // uuid local
  content: string;       // texto do prompt
  created_at: string;    // ISO
  origin: "auto" | "edited" | "revert" | "manual";
  label?: string;        // ex: "Revertido de v3", "Auto-snapshot pré-edição"
  reverted_from?: string; // id da versão de origem (quando origin=revert)
  size: number;          // chars (cache pra UI)
}

interface Props {
  nodeId: string;
  /** Conteúdo atual do prompt (refletido no editor — fonte da verdade fora) */
  currentPrompt: string;
  /** Callback quando o usuário reverte: aplica o texto no editor real */
  onRevert: (text: string) => void;
  /** Desabilita ações enquanto carregando/salvando do parent */
  disabled?: boolean;
}

export default function PromptVersionHistory({
  nodeId, currentPrompt, onRevert, disabled,
}: Props) {
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [selectedA, setSelectedA] = useState<string | null>(null); // antes
  const [selectedB, setSelectedB] = useState<string | null>(null); // depois
  const [diffOpen, setDiffOpen] = useState(false);

  // ── Load versions on mount / nodeId change ─────────────────────────────
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from("canvas_nodes")
        .select("metadata")
        .eq("id", nodeId)
        .maybeSingle();
      if (!alive) return;
      if (error) {
        console.error("PromptVersionHistory load:", error);
        setVersions([]);
      } else {
        const list = (data?.metadata as Record<string, unknown> | null)?.prompt_versions;
        setVersions(Array.isArray(list) ? (list as PromptVersion[]) : []);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [nodeId]);

  // ── Persist helper: write back full array preserving rest of metadata ─
  const persist = useCallback(async (next: PromptVersion[]) => {
    setSaving(true);
    try {
      const { data: cur } = await supabase
        .from("canvas_nodes").select("metadata").eq("id", nodeId).maybeSingle();
      const newMeta = {
        ...((cur?.metadata as Record<string, unknown> | null) ?? {}),
        prompt_versions: next,
      };
      const { error } = await supabase
        .from("canvas_nodes")
        .update({ metadata: newMeta, updated_at: new Date().toISOString() })
        .eq("id", nodeId);
      if (error) throw error;
      setVersions(next);
    } catch (e) {
      console.error("persist versions", e);
      toast({
        title: "Falha ao salvar versão",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [nodeId]);

  // ── Snapshot atual ─────────────────────────────────────────────────────
  const handleSnapshot = useCallback(async (origin: PromptVersion["origin"] = "manual", label?: string, revertedFrom?: string) => {
    const text = currentPrompt?.trim() ?? "";
    if (!text) {
      toast({ title: "Prompt vazio", description: "Escreva o prompt antes de salvar versão.", variant: "destructive" });
      return;
    }
    // Não duplica se idêntico à última
    if (versions[0]?.content === text) {
      toast({ title: "Sem mudança", description: "O prompt está idêntico à última versão." });
      return;
    }
    const v: PromptVersion = {
      id: crypto.randomUUID(),
      content: text,
      created_at: new Date().toISOString(),
      origin,
      label,
      reverted_from: revertedFrom,
      size: text.length,
    };
    await persist([v, ...versions]);
    toast({ title: "Versão salva", description: label ?? `${text.length} caracteres versionados.` });
  }, [currentPrompt, versions, persist]);

  // ── Reverter ───────────────────────────────────────────────────────────
  const handleRevert = useCallback(async (target: PromptVersion) => {
    onRevert(target.content);
    // Snapshot da versão revertida (origin=revert) — auditoria
    const v: PromptVersion = {
      id: crypto.randomUUID(),
      content: target.content,
      created_at: new Date().toISOString(),
      origin: "revert",
      label: `Revertido para versão de ${formatRelative(target.created_at)}`,
      reverted_from: target.id,
      size: target.content.length,
    };
    await persist([v, ...versions]);
    toast({
      title: "Prompt revertido",
      description: `Versão de ${formatRelative(target.created_at)} aplicada.`,
    });
  }, [onRevert, versions, persist]);

  const versionA = useMemo(() => versions.find((v) => v.id === selectedA), [versions, selectedA]);
  const versionB = useMemo(() => versions.find((v) => v.id === selectedB), [versions, selectedB]);

  // Toggle seleção pra diff (max 2 versões)
  const toggleSelect = (id: string) => {
    if (selectedA === id) { setSelectedA(null); return; }
    if (selectedB === id) { setSelectedB(null); return; }
    if (!selectedA) { setSelectedA(id); return; }
    if (!selectedB) { setSelectedB(id); return; }
    // Já tem 2 → substitui o B (mantém A como ancora)
    setSelectedB(id);
  };

  return (
    <div className="rounded-md border border-border bg-muted/10 mt-2">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/20 transition-colors rounded-md"
      >
        <div className="flex items-center gap-2 text-[11px] text-foreground/80">
          <History className="h-3.5 w-3.5 text-primary" />
          <span className="font-semibold">Versões do prompt</span>
          <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border">
            {loading ? "…" : versions.length}
          </Badge>
          {selectedA && selectedB && (
            <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-primary/40 text-primary bg-primary/10">
              <DiffIcon className="h-2.5 w-2.5 mr-0.5" />
              2 selecionadas
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); handleSnapshot("manual", "Snapshot manual"); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                handleSnapshot("manual", "Snapshot manual");
              }
            }}
            className={cn(
              "h-6 px-2 inline-flex items-center gap-1 text-[10px] rounded border border-border bg-background hover:bg-muted transition-colors",
              (saving || disabled) && "opacity-50 pointer-events-none",
            )}
          >
            <Save className="h-3 w-3" />
            Salvar versão
          </span>
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/60 pt-2">
          {selectedA && selectedB && (
            <div className="flex items-center justify-between gap-2 rounded-md bg-primary/5 border border-primary/20 px-2 py-1.5">
              <div className="text-[10px] text-foreground/80">
                Comparando {labelOf(versionA)} ↔ {labelOf(versionB)}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="default" className="h-6 text-[10px] px-2 gap-1"
                  onClick={() => setDiffOpen(true)}>
                  <DiffIcon className="h-3 w-3" /> Ver diff
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6"
                  onClick={() => { setSelectedA(null); setSelectedB(null); }}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {loading && (
            <p className="text-[10px] text-muted-foreground italic">Carregando histórico…</p>
          )}

          {!loading && versions.length === 0 && (
            <p className="text-[10px] text-muted-foreground italic">
              Nenhuma versão salva ainda. Clique em &quot;Salvar versão&quot; pra começar o histórico.
            </p>
          )}

          {!loading && versions.length > 0 && (
            <ol className="space-y-1.5">
              {versions.map((v, idx) => {
                const isSelectedA = selectedA === v.id;
                const isSelectedB = selectedB === v.id;
                const isSelected = isSelectedA || isSelectedB;
                const isCurrent = currentPrompt?.trim() === v.content.trim();
                return (
                  <li
                    key={v.id}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 transition-colors",
                      isSelected
                        ? "border-primary/50 bg-primary/5"
                        : "border-border bg-background hover:bg-muted/30",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleSelect(v.id)}
                        className="flex items-start gap-2 min-w-0 flex-1 text-left"
                      >
                        <GitCommit className={cn(
                          "h-3.5 w-3.5 shrink-0 mt-0.5",
                          isSelected ? "text-primary" : "text-muted-foreground",
                        )} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono text-foreground/90">
                              v{versions.length - idx}
                            </span>
                            <OriginBadge origin={v.origin} />
                            {isCurrent && (
                              <Badge variant="outline" className="h-4 text-[8px] px-1 border-primary/40 text-primary bg-primary/10">
                                atual
                              </Badge>
                            )}
                            {isSelectedA && (
                              <Badge variant="outline" className="h-4 text-[8px] px-1 border-foreground/30 text-foreground/80">
                                A
                              </Badge>
                            )}
                            {isSelectedB && (
                              <Badge variant="outline" className="h-4 text-[8px] px-1 border-foreground/30 text-foreground/80">
                                B
                              </Badge>
                            )}
                          </div>
                          <div className="text-[9px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                            <span>{formatRelative(v.created_at)}</span>
                            <span>·</span>
                            <span className="font-mono">{v.size.toLocaleString("pt-BR")} chars</span>
                          </div>
                          {v.label && (
                            <p className="text-[10px] text-foreground/70 mt-0.5 italic truncate">
                              {v.label}
                            </p>
                          )}
                          <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 font-mono leading-snug">
                            {v.content.slice(0, 160)}{v.content.length > 160 ? "…" : ""}
                          </p>
                        </div>
                      </button>
                      <TooltipProvider delayDuration={150}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="icon" variant="ghost"
                              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
                              onClick={() => handleRevert(v)}
                              disabled={isCurrent || saving || disabled}
                            >
                              <RotateCcw className="h-3 w-3" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="text-[10px]">
                            {isCurrent ? "Esta já é a versão atual" : "Reverter prompt para esta versão"}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      )}

      {diffOpen && versionA && versionB && (
        <DiffModal
          a={versionA}
          b={versionB}
          onClose={() => setDiffOpen(false)}
          onRevertToA={() => { handleRevert(versionA); setDiffOpen(false); }}
          onRevertToB={() => { handleRevert(versionB); setDiffOpen(false); }}
        />
      )}
    </div>
  );
}

// ─── Origin badge ──────────────────────────────────────────────────────────
function OriginBadge({ origin }: { origin: PromptVersion["origin"] }) {
  const map = {
    auto:    { label: "IA",      cls: "border-primary/40 text-primary bg-primary/10" },
    edited:  { label: "Editado", cls: "border-border text-foreground/80 bg-muted/30" },
    revert:  { label: "Revert",  cls: "border-foreground/30 text-foreground/80 bg-foreground/5" },
    manual:  { label: "Manual",  cls: "border-border text-muted-foreground bg-muted/10" },
  } as const;
  const m = map[origin];
  return (
    <Badge variant="outline" className={cn("h-4 text-[8px] px-1", m.cls)}>
      {m.label}
    </Badge>
  );
}

// ─── Diff modal ────────────────────────────────────────────────────────────
function DiffModal({
  a, b, onClose, onRevertToA, onRevertToB,
}: {
  a: PromptVersion; b: PromptVersion;
  onClose: () => void;
  onRevertToA: () => void;
  onRevertToB: () => void;
}) {
  const chunks = useMemo(() => diffWords(a.content, b.content), [a.content, b.content]);
  const stats = useMemo(() => {
    let added = 0, removed = 0;
    for (const c of chunks) {
      if (c.kind === "add") added += c.value.length;
      if (c.kind === "del") removed += c.value.length;
    }
    return { added, removed };
  }, [chunks]);

  return (
    <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}>
      <div
        className="w-full max-w-3xl max-h-[85vh] bg-card border border-border rounded-lg shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <DiffIcon className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Diff de versões</h3>
            <Badge variant="outline" className="text-[9px] border-destructive/40 text-destructive bg-destructive/5">
              −{stats.removed}
            </Badge>
            <Badge variant="outline" className="text-[9px] border-primary/40 text-primary bg-primary/10">
              +{stats.added}
            </Badge>
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="px-4 py-2 border-b border-border bg-muted/20 grid grid-cols-2 gap-3 text-[10px]">
          <div>
            <div className="text-muted-foreground">A — {formatRelative(a.created_at)}</div>
            <div className="font-mono text-foreground/80">{a.size.toLocaleString("pt-BR")} chars · {a.origin}</div>
          </div>
          <div>
            <div className="text-muted-foreground">B — {formatRelative(b.created_at)}</div>
            <div className="font-mono text-foreground/80">{b.size.toLocaleString("pt-BR")} chars · {b.origin}</div>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-4 py-3">
          <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-words">
            {chunks.map((c, i) => (
              <span
                key={i}
                className={cn(
                  c.kind === "add" && "bg-primary/15 text-primary border-b border-primary/30",
                  c.kind === "del" && "bg-destructive/10 text-destructive line-through decoration-destructive/40",
                  c.kind === "eq"  && "text-foreground/85",
                )}
              >
                {c.value}
              </span>
            ))}
          </pre>
        </div>

        <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-border bg-muted/10">
          <p className="text-[10px] text-muted-foreground">
            Reverter aplica o conteúdo no editor e cria nova entrada no histórico.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onRevertToA}>
              <RotateCcw className="h-3 w-3" /> Usar A
            </Button>
            <Button size="sm" variant="default" className="h-7 text-[11px] gap-1" onClick={onRevertToB}>
              <RotateCcw className="h-3 w-3" /> Usar B
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function labelOf(v: PromptVersion | undefined): string {
  if (!v) return "—";
  return formatRelative(v.created_at);
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `há ${d}d`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

/**
 * Diff word-level baseado em LCS (longest common subsequence).
 * Tokeniza por espaços/quebras preservando os separadores pra reconstruir o texto.
 * Bom equilíbrio: granular sem virar diff de char (ruído visual).
 */
type DiffChunk = { kind: "eq" | "add" | "del"; value: string };

function diffWords(a: string, b: string): DiffChunk[] {
  const tokA = tokenize(a);
  const tokB = tokenize(b);
  const n = tokA.length, m = tokB.length;

  // LCS DP table — usa Uint16/32 dependendo do tamanho (cap defensivo)
  if (n === 0) return tokB.length ? [{ kind: "add", value: tokB.join("") }] : [];
  if (m === 0) return [{ kind: "del", value: tokA.join("") }];

  // Limite defensivo — diff de prompts gigantes (>100k tokens) cai pra diff de bloco
  if (n * m > 1_500_000) {
    return [
      { kind: "del", value: a },
      { kind: "add", value: b },
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (tokA[i - 1] === tokB[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
      else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const out: DiffChunk[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (tokA[i - 1] === tokB[j - 1]) {
      pushChunk(out, "eq", tokA[i - 1]);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      pushChunk(out, "del", tokA[i - 1]);
      i--;
    } else {
      pushChunk(out, "add", tokB[j - 1]);
      j--;
    }
  }
  while (i > 0) { pushChunk(out, "del", tokA[i - 1]); i--; }
  while (j > 0) { pushChunk(out, "add", tokB[j - 1]); j--; }

  return out.reverse();
}

function pushChunk(arr: DiffChunk[], kind: DiffChunk["kind"], value: string) {
  const last = arr[arr.length - 1];
  if (last && last.kind === kind) last.value = value + last.value; // backtrack vai do fim pro início, então prepend
  else arr.push({ kind, value });
}

function tokenize(s: string): string[] {
  // Mantém separadores como tokens próprios pra preservar formatação
  return s.match(/(\s+|[^\s]+)/g) ?? [];
}