/**
 * PromptLibraryDialog — biblioteca visual de prompts IA.
 *
 * Fluxo:
 *  1. Abre → busca essential_briefing do cliente atual automaticamente
 *  2. Lista prompts por categoria, com busca
 *  3. Seleciona prompt → mostra preview com variáveis já substituídas
 *  4. Pode editar variáveis antes de copiar
 *  5. Botão "Copiar prompt" → cola no ChatGPT/Claude/Custom GPT
 */
import { useEffect, useMemo, useState } from "react";
import {
  Wand2, Search, Copy, Sparkles, Clock, AlertCircle, Brain,
  ChevronRight, X, Loader2, Check, Bot, Info,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  PROMPT_LIBRARY, CATEGORY_META, renderPrompt, analyzePromptVariables,
  type PromptTemplate, type PromptCategory, type PromptVariables,
} from "@/lib/promptLibrary";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId?: string | null;
}

export default function PromptLibraryDialog({ open, onOpenChange, clientId }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<PromptCategory | "all">("all");
  const [selected, setSelected] = useState<PromptTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [vars, setVars] = useState<PromptVariables>({});
  const [copied, setCopied] = useState(false);

  // Fetch client context when dialog opens
  useEffect(() => {
    if (!open || !clientId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("clients")
        .select("name, company_name, segment, plan_name, metadata")
        .eq("id", clientId)
        .maybeSingle();
      if (cancelled) return;
      const eb = ((data?.metadata as Record<string, unknown> | null)?.essential_briefing as Record<string, string> | undefined) ?? {};
      setVars({
        client_name: data?.name as string | undefined,
        company_name: data?.company_name as string | undefined,
        segment: data?.segment as string | undefined,
        plan_name: data?.plan_name as string | undefined,
        positioning: eb.positioning,
        differential: eb.differential,
        icp: eb.icp,
        main_pains: eb.main_pains,
        goals_12m: eb.goals_12m,
        success_metric: eb.success_metric,
        revenue_range: eb.revenue_range,
        team_size: eb.team_size,
        maturity_digital: eb.maturity_digital,
        ai_readiness: eb.ai_readiness,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, clientId]);

  // Reset when dialog closes
  useEffect(() => {
    if (!open) {
      setSelected(null);
      setSearch("");
      setCategory("all");
      setCopied(false);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return PROMPT_LIBRARY.filter((p) => {
      if (category !== "all" && p.category !== category) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.category.includes(q)
      );
    });
  }, [search, category]);

  const byCategory = useMemo(() => {
    const map = new Map<PromptCategory, PromptTemplate[]>();
    filtered.forEach((p) => {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    });
    return map;
  }, [filtered]);

  const rendered = selected ? renderPrompt(selected, vars) : "";
  const analysis = selected ? analyzePromptVariables(selected, vars) : null;

  const handleCopy = () => {
    if (!rendered) return;
    navigator.clipboard.writeText(rendered);
    setCopied(true);
    toast({ title: "Prompt copiado", description: "Cole no ChatGPT/Claude/Custom GPT e rode." });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-full max-h-[90vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Wand2 className="h-4 w-4 text-primary" />
            </div>
            Biblioteca de Prompts IA
          </DialogTitle>
          <DialogDescription className="text-xs">
            {PROMPT_LIBRARY.length} prompts curados com variáveis do cliente atual já substituídas. Copie → cole no ChatGPT/Claude → entregável em minutos.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex overflow-hidden">
          {/* Left panel — list */}
          <div className="w-[360px] border-r border-border flex flex-col shrink-0">
            {/* Filters */}
            <div className="p-3 border-b border-border space-y-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar prompt..." className="pl-7 h-8 text-xs" />
              </div>
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => setCategory("all")}
                  className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                    category === "all" ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border hover:text-foreground")}>
                  Todos ({PROMPT_LIBRARY.length})
                </button>
                {Object.entries(CATEGORY_META).map(([key, meta]) => {
                  const count = PROMPT_LIBRARY.filter((p) => p.category === key).length;
                  if (count === 0) return null;
                  return (
                    <button key={key} type="button" onClick={() => setCategory(key as PromptCategory)}
                      className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                        category === key ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
                      style={category === key
                        ? { background: `${meta.color}15`, borderColor: `${meta.color}40`, color: meta.color }
                        : { background: "hsl(var(--secondary))", borderColor: "hsl(var(--border))" }
                      }>
                      {meta.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* List */}
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              {filtered.length === 0 ? (
                <div className="py-12 text-center text-xs text-muted-foreground">
                  Nenhum prompt encontrado.
                </div>
              ) : (
                <div className="p-2 space-y-3">
                  {Array.from(byCategory.entries()).map(([cat, prompts]) => (
                    <div key={cat}>
                      <p className="text-[10px] font-semibold uppercase tracking-widest px-2 mb-1"
                        style={{ color: CATEGORY_META[cat].color }}>
                        {CATEGORY_META[cat].label}
                      </p>
                      <div className="space-y-1">
                        {prompts.map((p) => (
                          <button key={p.id} type="button"
                            onClick={() => setSelected(p)}
                            className={cn(
                              "w-full text-left rounded-lg px-2 py-2 text-xs transition-colors",
                              selected?.id === p.id
                                ? "bg-primary/10 border border-primary/30"
                                : "hover:bg-secondary/50 border border-transparent"
                            )}>
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-foreground">{p.title}</p>
                                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{p.description}</p>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                                  <span className="text-[10px] text-muted-foreground tabular-nums">{p.timeSaved}</span>
                                </div>
                              </div>
                              <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5" />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right panel — preview */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!selected ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground p-8 text-center">
                <Wand2 className="h-10 w-10 opacity-30" />
                <div>
                  <p className="text-sm font-medium">Selecione um prompt</p>
                  <p className="text-xs mt-1">Variáveis do cliente já serão substituídas automaticamente</p>
                </div>
              </div>
            ) : loading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando contexto do cliente...
              </div>
            ) : (
              <>
                {/* Header of selected */}
                <div className="px-5 py-3 border-b border-border shrink-0">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{selected.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{selected.description}</p>
                    </div>
                    <button type="button" onClick={() => setSelected(null)}
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge className="text-[10px] gap-1" style={{ background: `${CATEGORY_META[selected.category].color}15`, color: CATEGORY_META[selected.category].color, borderColor: `${CATEGORY_META[selected.category].color}30` }}>
                      {CATEGORY_META[selected.category].label}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Clock className="h-2.5 w-2.5" /> {selected.timeSaved}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Bot className="h-2.5 w-2.5" /> {selected.recommendedModel}
                    </Badge>
                    {analysis && (
                      <Badge variant="outline" className={cn("text-[10px]",
                        analysis.completeness === 100 ? "text-emerald-400 border-emerald-400/30" :
                        analysis.completeness >= 70 ? "text-blue-400 border-blue-400/30" :
                        "text-amber-400 border-amber-400/30"
                      )}>
                        {analysis.completeness}% contexto
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Missing variables warning */}
                {analysis && analysis.missing.length > 0 && (
                  <div className="px-5 py-2 border-b border-amber-400/20 bg-amber-400/5 flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-amber-400 font-semibold">
                        {analysis.missing.length} variável{analysis.missing.length > 1 ? "eis" : ""} faltando
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        Complete o briefing essencial do cliente para enriquecer o prompt:
                        <span className="text-amber-400/80"> {analysis.missing.map((m) => m).join(", ")}</span>
                      </p>
                    </div>
                  </div>
                )}

                {/* Rendered preview */}
                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-semibold mb-2 flex items-center gap-1.5">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Prompt renderizado (variáveis substituídas)
                  </div>
                  <div className="rounded-xl border border-border bg-card/50 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
                    {rendered}
                  </div>

                  {/* Followups */}
                  {selected.followups && selected.followups.length > 0 && (
                    <div className="mt-5 rounded-xl border border-primary/15 bg-primary/5 p-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Info className="h-3 w-3 text-primary" />
                        <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
                          Follow-ups sugeridos depois de rodar
                        </p>
                      </div>
                      <ul className="space-y-1">
                        {selected.followups.map((f, i) => (
                          <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                            <span className="text-primary/60 shrink-0">→</span>{f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Bottom actions */}
                <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
                  <p className="text-[11px] text-muted-foreground flex-1">
                    {rendered.length.toLocaleString("pt-BR")} caracteres · pronto pra colar
                  </p>
                  <Button onClick={handleCopy} size="sm" className="h-8 text-xs gap-1.5 bg-primary">
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? "Copiado ✓" : "Copiar prompt"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
