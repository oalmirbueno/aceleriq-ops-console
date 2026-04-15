import { useState, useEffect, useCallback } from "react";
import { FileText, Building2, Target, ShoppingCart, Settings, Globe, Key, Search, Scale, ClipboardList, Lightbulb, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import ContractBlock from "./ContractBlock";
import ScopeBadge from "./ScopeBadge";
import { getBriefingLabel, BRIEFING_DEFINITIONS, type BriefingType, type ScopeClassification } from "./aceleraConstants";
import { getContextLabel } from "./contextTypes";
import { getDossierSignalsByBlock, type SignalBlockKey, SIGNAL_LABELS } from "./briefingSignals";
import { ENTERPRISE_SIGNAL_LABELS } from "./enterpriseStructuringBlocks";

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
}

/** Read briefing_kind from metadata, with legacy fallback to briefing_type */
function readBriefingKind(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined;
  return (meta.briefing_kind as string) ?? (meta.briefing_type as string) ?? undefined;
}

/** Read import_source from metadata, with legacy fallback to imported boolean */
function readImportSource(meta: Record<string, unknown> | null): string | undefined {
  if (!meta) return undefined;
  if (meta.import_source) return meta.import_source as string;
  if (meta.imported === true) return "legacy_import";
  return undefined;
}

/** Read dossier_block from metadata */
function readDossierBlock(meta: Record<string, unknown> | null): string | undefined {
  return (meta?.dossier_block as string) ?? undefined;
}

/** Read scope_classification from metadata */
function readScopeClassification(meta: Record<string, unknown> | null): ScopeClassification | undefined {
  const val = meta?.scope_classification as string | undefined;
  if (!val) return undefined;
  return val as ScopeClassification;
}

const DOSSIE_BLOCKS = [
  { key: "identity", label: "Identidade e Posicionamento", icon: Building2, contextTypes: ["briefing"] },
  { key: "offer", label: "Oferta, ICP e Persona", icon: Target, contextTypes: ["briefing", "objetivo"] },
  { key: "commercial", label: "Estrutura Comercial", icon: ShoppingCart, contextTypes: ["objetivo", "decisao"] },
  { key: "operational", label: "Estrutura Operacional", icon: Settings, contextTypes: ["anotacao", "decisao"] },
  { key: "digital", label: "Estrutura Digital", icon: Globe, contextTypes: ["acesso", "anotacao"] },
  { key: "access", label: "Processos e Acessos", icon: Key, contextTypes: ["acesso"] },
  { key: "diagnostic", label: "Diagnóstico Estrutural", icon: Search, contextTypes: ["diagnostico", "dor"] },
  { key: "decisions", label: "Decisões, Lacunas e Prioridades", icon: Scale, contextTypes: ["decisao", "dor", "objetivo"] },
] as const;

export default function WorkspaceTabDossie({ workspaceId, clientId, planName, clientMetadata, workspaceMetadata }: Props) {
  const [contexts, setContexts] = useState<ContextEntry[]>([]);
  const [taskSummary, setTaskSummary] = useState<TaskSummary>({ total: 0, done: 0, in_progress: 0 });
  const [loading, setLoading] = useState(true);

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

  // Briefings — use official briefing_kind with legacy fallback
  const briefings = contexts.filter((c) => c.context_type === "briefing");
  const briefingKinds = briefings.map((c) => readBriefingKind(c.metadata)).filter(Boolean) as string[];

  // Collect dossier signals from reviewed briefings
  const allDossierSignals = new Map<string, { key: string; label: string; summary: string }[]>();
  for (const b of briefings) {
    const bSignals = getDossierSignalsByBlock(b.metadata);
    for (const [block, items] of bSignals) {
      if (!allDossierSignals.has(block)) allDossierSignals.set(block, []);
      allDossierSignals.get(block)!.push(...items);
    }
  }

  /** IDs of reviewed briefings with valid structured signals — these should NOT appear via fallback */
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

  /** Get contexts for a dossier block: prefer dossier_block metadata, fallback to context_type.
   *  Excludes reviewed briefings with valid signals to avoid raw-text pollution. */
  const getBlockContexts = (blockKey: string, contextTypes: readonly string[]) => {
    const exclude = (c: ContextEntry) => reviewedBriefingIds.has(c.id);
    const byDossierBlock = contexts.filter((c) => !exclude(c) && readDossierBlock(c.metadata) === blockKey);
    if (byDossierBlock.length > 0) return byDossierBlock;
    return contexts.filter((c) => !exclude(c) && contextTypes.includes(c.context_type));
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* 1. Contrato Operacional */}
      <ContractBlock
        clientMetadata={clientMetadata}
        workspaceMetadata={workspaceMetadata}
        planName={planName}
      />

      {/* Briefings summary — compact secondary section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Briefings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.values(BRIEFING_DEFINITIONS) as Array<{ key: BriefingType; label: string; description: string; importable: boolean }>).map((def) => {
            const exists = briefingKinds.includes(def.key);
            const matchingBriefing = briefings.find((b) => readBriefingKind(b.metadata) === def.key);
            const importSource = matchingBriefing ? readImportSource(matchingBriefing.metadata) : undefined;

            return (
              <div key={def.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{def.label}</span>
                    {exists && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Preenchido</Badge>}
                    {importSource && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">Importado</Badge>}
                    {def.importable && !exists && <Badge variant="outline" className="text-[10px] text-muted-foreground">Importável</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{def.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* 2–9. Dossiê blocks */}
      {DOSSIE_BLOCKS.map((block) => {
      const blockContexts = getBlockContexts(block.key, block.contextTypes);
        const blockSignals = allDossierSignals.get(block.key) ?? [];
        const Icon = block.icon;
        return (
          <Card key={block.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {block.label}
                {blockSignals.length > 0 && (
                  <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {blockSignals.length} sinal(is)
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Structured signals from reviewed briefings */}
              {blockSignals.length > 0 && (
                <div className="space-y-1.5 mb-3 pb-3 border-b border-border/30">
                  {blockSignals.map((sig, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs">
                      <span className="text-emerald-400 mt-0.5 shrink-0">✦</span>
                      <div className="min-w-0">
                        <span className="font-medium text-foreground">{sig.label}</span>
                        <p className="text-muted-foreground line-clamp-2 mt-0.5">{sig.summary}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {blockContexts.length === 0 && blockSignals.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma informação registrada neste bloco.</p>
              ) : (
                <div className="space-y-2">
                  {blockContexts.slice(0, 5).map((ctx) => {
                    const scope = readScopeClassification(ctx.metadata);
                    return (
                      <div key={ctx.id} className="flex items-start gap-2 text-xs">
                        <span className="text-primary/40 mt-0.5">•</span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <Badge variant="outline" className="text-[9px] px-1.5 py-0">{getContextLabel(ctx.context_type)}</Badge>
                            <span className="text-foreground/80 truncate">{ctx.title}</span>
                            {ctx.is_key_decision && <Badge className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-400 border-amber-500/25">Decisão-chave</Badge>}
                            {scope && <ScopeBadge scope={scope} className="text-[9px] px-1 py-0" />}
                            {ctx.metadata?.import_review_status === "pending_review" && (
                              <Badge variant="outline" className="text-[9px] px-1 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">Pendente revisão</Badge>
                            )}
                          </div>
                          <p className="text-muted-foreground line-clamp-1 mt-0.5">{ctx.content}</p>
                        </div>
                      </div>
                    );
                  })}
                  {blockContexts.length > 5 && (
                    <p className="text-[10px] text-muted-foreground">+{blockContexts.length - 5} itens adicionais</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* 10. Plano Operacional Ativo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            Plano Operacional Ativo
          </CardTitle>
        </CardHeader>
        <CardContent>
          {taskSummary.total === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma task criada neste workspace.</p>
          ) : (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-foreground">{taskSummary.total} tasks</span>
              <span className="text-emerald-400">{taskSummary.done} concluídas</span>
              <span className="text-blue-400">{taskSummary.in_progress} em progresso</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 11. Oportunidades Futuras */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
            Oportunidades Futuras
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">Nenhuma oportunidade mapeada fora do escopo atual.</p>
        </CardContent>
      </Card>
    </div>
  );
}
