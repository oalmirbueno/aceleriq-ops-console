/**
 * WorkspaceTabDossie — hub de conhecimento do cliente.
 * 8 blocos organizados em grid, visual limpo e funcional.
 */
import { useState, useEffect, useCallback } from "react";
import {
  FileText, Building2, Target, ShoppingCart, Settings, Globe, Key,
  Search, Scale, ClipboardList, Lightbulb, Loader2, ChevronDown, ChevronRight,
  CheckCircle2, Circle, AlertCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import ContractBlock from "./ContractBlock";
import ScopeBadge from "./ScopeBadge";
import { getBriefingLabel, BRIEFING_DEFINITIONS, type BriefingType, type ScopeClassification } from "./aceleraConstants";
import { getContextLabel } from "./contextTypes";
import { getDossierSignalsByBlock } from "./briefingSignals";
import { cn } from "@/lib/utils";

interface Props {
  workspaceId: string; clientId: string;
  planName?: string | null;
  clientMetadata?: Record<string, unknown> | null;
  workspaceMetadata?: Record<string, unknown> | null;
}

interface ContextEntry {
  id: string; context_type: string; title: string; content: string;
  is_key_decision: boolean; metadata: Record<string, unknown> | null; tags: string[];
}

interface TaskSummary { total: number; done: number; in_progress: number; blocked: number; }

const BLOCKS = [
  { key: "identity",    label: "Identidade",          icon: Building2,    color: "#60A5FA", contextTypes: ["briefing"],                     hint: "Posicionamento, diferencial, proposta de valor" },
  { key: "offer",       label: "Oferta e ICP",         icon: Target,       color: "#EC4899", contextTypes: ["briefing", "objetivo"],         hint: "O que vende, para quem, perfil ideal" },
  { key: "commercial",  label: "Estrutura Comercial",  icon: ShoppingCart, color: "#F59E0B", contextTypes: ["objetivo", "decisao"],          hint: "Funil, metas de aquisição, processo comercial" },
  { key: "operational", label: "Operação",             icon: Settings,     color: "#10B981", contextTypes: ["anotacao", "decisao"],          hint: "Fluxo de entrega, equipe, responsabilidades" },
  { key: "digital",     label: "Estrutura Digital",    icon: Globe,        color: "#8B5CF6", contextTypes: ["acesso", "anotacao"],           hint: "Canais, ferramentas, métricas, presença digital" },
  { key: "access",      label: "Acessos",              icon: Key,          color: "#F97316", contextTypes: ["acesso"],                       hint: "Credenciais coletadas, pendências técnicas" },
  { key: "diagnostic",  label: "Diagnóstico",          icon: Search,       color: "#14B8A6", contextTypes: ["diagnostico", "dor"],           hint: "Gargalos, dores e lacunas identificadas" },
  { key: "decisions",   label: "Decisões e Prioridades",icon: Scale,       color: "#A78BFA", contextTypes: ["decisao", "dor", "objetivo"],   hint: "Estratégia, gaps críticos e próximos passos" },
] as const;

function readBriefingKind(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.briefing_kind as string) ?? (meta?.briefing_type as string) ?? undefined;
}
function readImportSource(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.import_source as string) ?? (meta?.imported === true ? "legacy_import" : undefined);
}
function readDossierBlock(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.dossier_block as string) ?? undefined;
}
function readScopeClassification(meta: Record<string, unknown> | null): ScopeClassification | undefined {
  return (meta?.scope_classification as ScopeClassification) ?? undefined;
}

export default function WorkspaceTabDossie({ workspaceId, clientId, planName, clientMetadata, workspaceMetadata }: Props) {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskSummary>({ total: 0, done: 0, in_progress: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(BLOCKS.map((b) => b.key)));

  const toggle = (key: string) => setExpanded((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [ctxRes, taskRes] = await Promise.all([
      supabase.from("context_entries").select("id,context_type,title,content,is_key_decision,metadata,tags").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
      supabase.from("tasks").select("id,status").eq("workspace_id", workspaceId),
    ]);
    setContexts((ctxRes.data as ContextEntry[] | null) ?? []);
    const t = taskRes.data ?? [];
    setTaskSummary({ total: t.length, done: t.filter((x: any) => x.status === "done").length, in_progress: t.filter((x: any) => x.status === "in_progress").length, blocked: t.filter((x: any) => x.status === "blocked").length });
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const briefings = contexts.filter((c) => c.context_type === "briefing");
  const briefingKinds = briefings.map((c) => readBriefingKind(c.metadata)).filter(Boolean) as string[];

  const allSignals = new Map<string, { key: string; label: string; summary: string }[]>();
  for (const b of briefings) {
    const bSigs = getDossierSignalsByBlock(b.metadata);
    for (const [block, items] of bSigs) {
      if (!allSignals.has(block)) allSignals.set(block, []);
      allSignals.get(block)!.push(...items);
    }
  }

  const reviewedIds = new Set(briefings.filter((b) => {
    const m = b.metadata;
    return m?.import_review_status === "reviewed" && m?.structured_signals && Object.keys(m.structured_signals as object).length > 0;
  }).map((b) => b.id));

  const getBlockCtx = (key: string, types: readonly string[]) => {
    const byBlock = contexts.filter((c) => !reviewedIds.has(c.id) && readDossierBlock(c.metadata) === key);
    return byBlock.length > 0 ? byBlock : contexts.filter((c) => !reviewedIds.has(c.id) && types.includes(c.context_type));
  };

  const totalSigs = Array.from(allSignals.values()).reduce((s, v) => s + v.length, 0);
  const filledBlocks = BLOCKS.filter((b) => (allSignals.get(b.key)?.length ?? 0) > 0 || getBlockCtx(b.key, b.contextTypes).length > 0).length;
  const completeness = Math.round((filledBlocks / BLOCKS.length) * 100);

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Overview bar */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-3">
          <div className="flex items-center gap-3">
            <FileText className="h-4 w-4 text-primary" />
            <p className="text-sm font-semibold text-foreground">Dossiê Operacional</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className={cn("font-semibold", completeness === 100 ? "text-emerald-400" : completeness > 50 ? "text-primary" : "text-amber-400")}>{completeness}%</span>
            <span>{filledBlocks}/{BLOCKS.length} blocos</span>
            <span>{totalSigs} sinais</span>
            <span>{briefings.length} briefings</span>
          </div>
        </div>
        <Progress value={completeness} className="h-1" />

        {/* Block pills */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {BLOCKS.map((b) => {
            const has = (allSignals.get(b.key)?.length ?? 0) > 0 || getBlockCtx(b.key, b.contextTypes).length > 0;
            return (
              <button key={b.key} type="button" onClick={() => toggle(b.key)}
                className={cn("flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-colors",
                  has ? "border-border bg-secondary/50 text-foreground" : "border-dashed border-border/50 text-muted-foreground/50")}>
                {has ? <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" /> : <Circle className="h-2.5 w-2.5" />}
                {b.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contract */}
      <ContractBlock clientMetadata={clientMetadata} workspaceMetadata={workspaceMetadata} planName={planName} />

      {/* Briefing status */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Briefings</p>
          <span className="ml-auto text-xs text-muted-foreground">{briefings.length} registrado{briefings.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="divide-y divide-border/50">
          {(Object.values(BRIEFING_DEFINITIONS) as Array<{ key: BriefingType; label: string; description: string; importable: boolean }>).map((def) => {
            const match = briefings.find((b) => readBriefingKind(b.metadata) === def.key);
            const exists = !!match;
            const reviewed = match?.metadata?.import_review_status === "reviewed";
            const imported = match ? !!readImportSource(match.metadata) : false;
            return (
              <div key={def.key} className="flex items-center gap-3 px-5 py-3">
                <div className={cn("h-2 w-2 rounded-full shrink-0", exists ? reviewed ? "bg-emerald-400" : "bg-primary" : "bg-border")} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{def.label}</span>
                    {exists && !reviewed && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Pendente revisão</Badge>}
                    {reviewed && <Badge className="text-[10px] px-1.5 py-0 bg-emerald-400/10 text-emerald-400 border-emerald-400/25">Revisado</Badge>}
                    {imported && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Importado</Badge>}
                    {!exists && def.importable && <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground/50 border-dashed">Disponível</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{def.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Blocks */}
      <div className="grid gap-3 lg:grid-cols-2">
        {BLOCKS.map((block) => {
          const blockCtx = getBlockCtx(block.key, block.contextTypes);
          const sigs = allSignals.get(block.key) ?? [];
          const Icon = block.icon;
          const isExp = expanded.has(block.key);
          const has = sigs.length > 0 || blockCtx.length > 0;
          const count = sigs.length + blockCtx.length;

          return (
            <div key={block.key} className={cn("rounded-xl border bg-card overflow-hidden transition-opacity", !has && "opacity-50")}>
              <button type="button" onClick={() => toggle(block.key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-secondary/20 transition-colors">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
                  style={{ background: `${block.color}15`, border: `1px solid ${block.color}30` }}>
                  <Icon className="h-3.5 w-3.5" style={{ color: block.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{block.label}</p>
                    {count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: `${block.color}15`, color: block.color }}>{count}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">{block.hint}</p>
                </div>
                {isExp ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
              </button>

              {isExp && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-2">
                  {!has ? (
                    <p className="text-xs text-muted-foreground italic">Nenhuma informação neste bloco ainda.</p>
                  ) : (
                    <>
                      {sigs.map((sig, i) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-lg p-2.5"
                          style={{ background: `${block.color}08`, border: `0.5px solid ${block.color}20` }}>
                          <span className="text-xs font-bold mt-0.5 shrink-0" style={{ color: block.color }}>✦</span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-foreground">{sig.label}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{sig.summary}</p>
                          </div>
                        </div>
                      ))}
                      {blockCtx.slice(0, 6).map((ctx) => {
                        const scope = readScopeClassification(ctx.metadata);
                        return (
                          <div key={ctx.id} className="flex items-start gap-2.5 rounded-lg bg-secondary/30 p-2.5">
                            <div className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: block.color }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-secondary border border-border">{getContextLabel(ctx.context_type)}</span>
                                <span className="text-xs font-medium text-foreground">{ctx.title}</span>
                                {ctx.is_key_decision && <span className="text-[10px] text-amber-400 font-medium">Decisão-chave</span>}
                                {scope && <ScopeBadge scope={scope} className="text-[10px]" />}
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{ctx.content}</p>
                            </div>
                          </div>
                        );
                      })}
                      {blockCtx.length > 6 && <p className="text-[10px] text-muted-foreground pl-4">+{blockCtx.length - 6} entradas adicionais</p>}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Task summary */}
      <div className="rounded-xl border border-border bg-card px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardList className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Plano operacional ativo</p>
          {taskSummary.total > 0 && (
            <span className="ml-auto text-xs font-semibold text-primary tabular-nums">
              {taskSummary.total > 0 ? Math.round((taskSummary.done / taskSummary.total) * 100) : 0}%
            </span>
          )}
        </div>
        {taskSummary.total === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma task criada neste workspace.</p>
        ) : (
          <>
            <Progress value={taskSummary.total > 0 ? (taskSummary.done / taskSummary.total) * 100 : 0} className="h-1 mb-3" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              {[
                { label: "Total",       value: taskSummary.total,       color: "text-foreground" },
                { label: "Concluídas",  value: taskSummary.done,        color: "text-emerald-400" },
                { label: "Em andamento",value: taskSummary.in_progress, color: "text-primary" },
                { label: "Bloqueadas",  value: taskSummary.blocked,     color: "text-amber-400" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg bg-secondary/30 py-2">
                  <p className={cn("text-lg font-bold tabular-nums", s.color)}>{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
