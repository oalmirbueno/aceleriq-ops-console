import { useState, useEffect, useCallback } from "react";
import {
  FileText, Building2, Target, ShoppingCart, Settings, Globe, Key,
  Search, Scale, ClipboardList, Lightbulb, Loader2, ChevronDown, ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import ContractBlock from "./ContractBlock";
import ScopeBadge from "./ScopeBadge";
import { getBriefingLabel, BRIEFING_DEFINITIONS, type BriefingType, type ScopeClassification } from "./aceleraConstants";
import { getContextLabel } from "./contextTypes";
import { getDossierSignalsByBlock, type SignalBlockKey, SIGNAL_LABELS } from "./briefingSignals";

interface Props {
  workspaceId: string;
  clientId: string;
  planName?: string | null;
  clientMetadata?: Record<string, unknown> | null;
  workspaceMetadata?: Record<string, unknown> | null;
}

interface ContextEntry {
  id: string;
  context_type: string;
  title: string;
  content: string;
  is_key_decision: boolean;
  metadata: Record<string, unknown> | null;
  tags: string[];
}

interface TaskSummary {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
}

function readBriefingKind(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined;
  return (meta.briefing_kind as string) ?? (meta.briefing_type as string) ?? undefined;
}

function readImportSource(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined;
  if (meta.import_source) return meta.import_source as string;
  if (meta.imported === true) return "legacy_import";
  return undefined;
}

function readDossierBlock(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.dossier_block as string) ?? undefined;
}

function readScopeClassification(meta: Record<string, unknown> | null): ScopeClassification | undefined {
  const val = meta?.scope_classification as string | undefined;
  if (!val) return undefined;
  return val as ScopeClassification;
}

const DOSSIE_BLOCKS = [
  { key: "identity", label: "Identidade e Posicionamento", icon: Building2, contextTypes: ["briefing"], description: "Quem é o cliente, proposta de valor, posicionamento de mercado.", focusAreas: ["branding", "strategy"] },
  { key: "offer", label: "Oferta, ICP e Persona", icon: Target, contextTypes: ["briefing", "objetivo"], description: "O que vende, para quem, perfil do cliente ideal.", focusAreas: ["commercial", "marketing"] },
  { key: "commercial", label: "Estrutura Comercial", icon: ShoppingCart, contextTypes: ["objetivo", "decisao"], description: "Funil de vendas, processo comercial, metas de aquisição.", focusAreas: ["commercial"] },
  { key: "operational", label: "Estrutura Operacional", icon: Settings, contextTypes: ["anotacao", "decisao"], description: "Fluxo de entrega, processos, equipe, responsabilidades.", focusAreas: ["systems", "strategy"] },
  { key: "digital", label: "Estrutura Digital", icon: Globe, contextTypes: ["acesso", "anotacao"], description: "Presença digital, canais, ferramentas, métricas.", focusAreas: ["marketing", "website", "seo"] },
  { key: "access", label: "Processos e Acessos", icon: Key, contextTypes: ["acesso"], description: "Acessos coletados, pendências, dependências técnicas.", focusAreas: ["systems", "security"] },
  { key: "diagnostic", label: "Diagnóstico Estrutural", icon: Search, contextTypes: ["diagnostico", "dor"], description: "Gargalos, dores, lacunas operacionais identificadas.", focusAreas: ["strategy", "systems", "ai"] },
  { key: "decisions", label: "Decisões, Lacunas e Prioridades", icon: Scale, contextTypes: ["decisao", "dor", "objetivo"], description: "Decisões estratégicas, prioridades e gaps a resolver.", focusAreas: ["strategy", "legal"] },
] as const;

export default function WorkspaceTabDossie({ workspaceId, clientId, planName, clientMetadata, workspaceMetadata }: Props) {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskSummary>({ total: 0, done: 0, in_progress: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const focusAreas = (clientMetadata?.focus_areas as string[] | undefined) ?? [];
  const hasFilter = focusAreas.length > 0 && !showAll;

  const visibleBlocks = hasFilter
    ? DOSSIE_BLOCKS.filter((b) => b.focusAreas.some((fa) => focusAreas.includes(fa)))
    : DOSSIE_BLOCKS;

  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set(DOSSIE_BLOCKS.map((b) => b.key)));

  const toggleBlock = (key: string) => {
    setExpandedBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [ctxRes, taskRes] = await Promise.all([
      supabase
        .from("context_entries")
        .select("id, context_type, title, content, is_key_decision, metadata, tags")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, status")
        .eq("workspace_id", workspaceId),
    ]);

    setContexts((ctxRes.data as ContextEntry[] | null) ?? []);

    const tasks = taskRes.data ?? [];
    setTaskSummary({
      total: tasks.length,
      done: tasks.filter((t: any) => t.status === "done").length,
      in_progress: tasks.filter((t: any) => t.status === "in_progress").length,
      blocked: tasks.filter((t: any) => t.status === "blocked").length,
    });

    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const briefings = contexts.filter((c) => c.context_type === "briefing");
  const briefingKinds = briefings.map((c) => readBriefingKind(c.metadata)).filter(Boolean) as string[];

  const allDossierSignals = new Map<string, { key: string; label: string; summary: string }[]>();
  for (const b of briefings) {
    const bSignals = getDossierSignalsByBlock(b.metadata);
    for (const [block, items] of bSignals) {
      if (!allDossierSignals.has(block)) allDossierSignals.set(block, []);
      allDossierSignals.get(block)!.push(...items);
    }
  }

  const reviewedBriefingIds = new Set(
    briefings
      .filter((b) => {
        const meta = b.metadata;
        if (!meta || meta.import_review_status !== "reviewed") return false;
        const signals = meta.structured_signals as Record<string, unknown> | undefined;
        return signals && Object.keys(signals).length > 0;
      })
      .map((b) => b.id)
  );

  const getBlockContexts = (blockKey: string, contextTypes: readonly string[]) => {
    const exclude = (c: ContextEntry) => reviewedBriefingIds.has(c.id);
    const byDossierBlock = contexts.filter((c) => !exclude(c) && readDossierBlock(c.metadata) === blockKey);
    if (byDossierBlock.length > 0) return byDossierBlock;
    return contexts.filter((c) => !exclude(c) && contextTypes.includes(c.context_type));
  };

  // Count total signals across all blocks
  const totalSignals = Array.from(allDossierSignals.values()).reduce((acc, items) => acc + items.length, 0);
  const filledBlocks = visibleBlocks.filter((b) => (allDossierSignals.get(b.key)?.length ?? 0) > 0 || getBlockContexts(b.key, b.contextTypes).length > 0).length;
  const hiddenCount = DOSSIE_BLOCKS.length - visibleBlocks.length;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Dossiê overview */}
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <FileText className="h-4 w-4 text-primary" />
          <span className="font-medium text-foreground">Dossiê Operacional</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{filledBlocks}/{visibleBlocks.length} blocos preenchidos</span>
          <span>{totalSignals} sinais estruturados</span>
          <span>{briefings.length} briefing(s)</span>
        </div>
        {filledBlocks > 0 && (
          <Progress value={(filledBlocks / visibleBlocks.length) * 100} className="h-1.5 w-32" />
        )}
        {hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="text-xs text-primary hover:underline"
          >
            {showAll ? "Mostrar apenas foco" : `+${hiddenCount} blocos ocultos (fora do foco)`}
          </button>
        )}
      </div>

      {/* Contract */}
      <ContractBlock
        clientMetadata={clientMetadata}
        workspaceMetadata={workspaceMetadata}
        planName={planName}
      />

      {/* Briefings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Briefings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.values(BRIEFING_DEFINITIONS) as Array<{ key: BriefingType; label: string; description: string; importable: boolean }>).map((def) => {
            const exists = briefingKinds.includes(def.key);
            const matchingBriefing = briefings.find((b) => readBriefingKind(b.metadata) === def.key);
            const importSource = matchingBriefing ? readImportSource(matchingBriefing.metadata) : undefined;
            const reviewStatus = matchingBriefing?.metadata?.import_review_status as string | undefined;

            return (
              <div key={def.key} className="flex items-center justify-between gap-4 py-2 border-b border-border/30 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{def.label}</span>
                    {exists && (
                      <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        Preenchido
                      </Badge>
                    )}
                    {importSource && (
                      <Badge variant="outline" className="text-[11px] bg-blue-500/10 text-blue-400 border-blue-500/20">
                        Importado
                      </Badge>
                    )}
                    {reviewStatus === "reviewed" && (
                      <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                        Revisado
                      </Badge>
                    )}
                    {reviewStatus === "pending_review" && (
                      <Badge variant="outline" className="text-[11px] bg-amber-500/10 text-amber-400 border-amber-500/20">
                        Pendente revisão
                      </Badge>
                    )}
                    {def.importable && !exists && (
                      <Badge variant="outline" className="text-[11px] text-muted-foreground">Importável</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{def.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Dossiê blocks */}
      {DOSSIE_BLOCKS.map((block) => {
        const blockContexts = getBlockContexts(block.key, block.contextTypes);
        const blockSignals = allDossierSignals.get(block.key) ?? [];
        const Icon = block.icon;
        const isExpanded = expandedBlocks.has(block.key);
        const hasContent = blockSignals.length > 0 || blockContexts.length > 0;

        return (
          <Card key={block.key} className={hasContent ? "" : "opacity-60"}>
            <CardHeader
              className="pb-3 cursor-pointer select-none hover:bg-muted/5 transition-colors"
              onClick={() => toggleBlock(block.key)}
            >
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <Icon className="h-4 w-4 text-primary" />
                {block.label}
                {blockSignals.length > 0 && (
                  <Badge variant="outline" className="text-[11px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {blockSignals.length} sinal(is)
                  </Badge>
                )}
                {blockContexts.length > 0 && (
                  <span className="text-xs text-muted-foreground font-normal ml-auto">
                    {blockContexts.length} entrada(s)
                  </span>
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1 ml-10">{block.description}</p>
            </CardHeader>

            {isExpanded && (
              <CardContent className="pt-0">
                {/* Structured signals */}
                {blockSignals.length > 0 && (
                  <div className="space-y-3 mb-4">
                    {blockSignals.map((sig, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <span className="text-emerald-400 mt-1 shrink-0 text-sm">✦</span>
                        <div className="min-w-0 flex-1">
                          <span className="text-sm font-medium text-foreground">{sig.label}</span>
                          <p className="text-sm text-muted-foreground leading-relaxed mt-0.5">{sig.summary}</p>
                        </div>
                      </div>
                    ))}
                    {blockContexts.length > 0 && <Separator className="my-3" />}
                  </div>
                )}

                {/* Context entries */}
                {!hasContent ? (
                  <p className="text-sm text-muted-foreground">Nenhuma informação registrada neste bloco.</p>
                ) : blockContexts.length > 0 && (
                  <div className="space-y-3">
                    {blockContexts.slice(0, 8).map((ctx) => {
                      const scope = readScopeClassification(ctx.metadata);
                      return (
                        <div key={ctx.id} className="flex items-start gap-3">
                          <span className="text-primary/40 mt-1.5 shrink-0">•</span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <Badge variant="outline" className="text-[11px] px-2 py-0.5">{getContextLabel(ctx.context_type)}</Badge>
                              <span className="text-sm font-medium text-foreground">{ctx.title}</span>
                              {ctx.is_key_decision && <Badge className="text-[11px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border-amber-500/25">Decisão-chave</Badge>}
                              {scope && <ScopeBadge scope={scope} className="text-[11px] px-1.5 py-0.5" />}
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2">{ctx.content}</p>
                          </div>
                        </div>
                      );
                    })}
                    {blockContexts.length > 8 && (
                      <p className="text-xs text-muted-foreground ml-6">+{blockContexts.length - 8} itens adicionais</p>
                    )}
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        );
      })}

      {/* Task summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            Plano Operacional Ativo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {taskSummary.total === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma task criada neste workspace.</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-6 text-sm">
                <span className="text-foreground font-medium">{taskSummary.total} tasks</span>
                <span className="text-emerald-400">{taskSummary.done} concluídas</span>
                <span className="text-blue-400">{taskSummary.in_progress} em progresso</span>
                {taskSummary.blocked > 0 && <span className="text-red-400">{taskSummary.blocked} bloqueadas</span>}
              </div>
              <Progress value={taskSummary.total > 0 ? (taskSummary.done / taskSummary.total) * 100 : 0} className="h-2" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Opportunities */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-400" />
            Oportunidades Futuras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Nenhuma oportunidade mapeada fora do escopo atual.</p>
        </CardContent>
      </Card>
    </div>
  );
}
