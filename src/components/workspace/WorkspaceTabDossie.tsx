import { useState, useEffect, useCallback } from "react";
import { FileText, Building2, Target, ShoppingCart, Settings, Globe, Key, Search, Scale, ClipboardList, Lightbulb, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import ContractBlock from "./ContractBlock";
import ScopeBadge from "./ScopeBadge";
import { getBriefingLabel, BRIEFING_DEFINITIONS, type BriefingType } from "./aceleraConstants";
import { getContextLabel } from "./contextTypes";

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

  // Find briefings by metadata.briefing_type
  const briefings = contexts.filter((c) => c.context_type === "briefing");
  const importedBriefings = briefings.filter((c) => (c.metadata as any)?.imported === true);
  const briefingTypes = briefings.map((c) => (c.metadata as any)?.briefing_type).filter(Boolean) as string[];

  const getBlockContexts = (contextTypes: readonly string[]) =>
    contexts.filter((c) => contextTypes.includes(c.context_type));

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Contract block */}
      <ContractBlock
        clientMetadata={clientMetadata}
        workspaceMetadata={workspaceMetadata}
        planName={planName}
      />

      {/* Briefings section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            Briefings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.values(BRIEFING_DEFINITIONS) as Array<{ key: BriefingType; label: string; description: string; importable: boolean }>).map((def) => {
            const exists = briefingTypes.includes(def.key);
            const isImported = importedBriefings.some((b) => (b.metadata as any)?.briefing_type === def.key);

            return (
              <div key={def.key} className="flex items-center justify-between gap-3 py-1.5 border-b border-border/30 last:border-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-foreground">{def.label}</span>
                    {exists && <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Preenchido</Badge>}
                    {isImported && <Badge variant="outline" className="text-[10px] bg-blue-500/10 text-blue-400 border-blue-500/20">Importado</Badge>}
                    {def.importable && !exists && <Badge variant="outline" className="text-[10px] text-muted-foreground">Importável</Badge>}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{def.description}</p>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Dossiê blocks */}
      {DOSSIE_BLOCKS.map((block) => {
        const blockContexts = getBlockContexts(block.contextTypes);
        const Icon = block.icon;
        return (
          <Card key={block.key}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Icon className="h-4 w-4 text-muted-foreground" />
                {block.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {blockContexts.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhuma informação registrada neste bloco.</p>
              ) : (
                <div className="space-y-2">
                  {blockContexts.slice(0, 5).map((ctx) => (
                    <div key={ctx.id} className="flex items-start gap-2 text-xs">
                      <span className="text-primary/40 mt-0.5">•</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0">{getContextLabel(ctx.context_type)}</Badge>
                          <span className="text-foreground/80 truncate">{ctx.title}</span>
                          {ctx.is_key_decision && <Badge className="text-[9px] px-1 py-0 bg-amber-500/15 text-amber-400 border-amber-500/25">Decisão-chave</Badge>}
                        </div>
                        <p className="text-muted-foreground line-clamp-1 mt-0.5">{ctx.content}</p>
                      </div>
                    </div>
                  ))}
                  {blockContexts.length > 5 && (
                    <p className="text-[10px] text-muted-foreground">+{blockContexts.length - 5} itens adicionais</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Active operational plan */}
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

      {/* Future opportunities */}
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
