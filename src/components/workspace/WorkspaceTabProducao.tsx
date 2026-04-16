import { useState, useEffect, useCallback } from "react";
import { Sparkles, Layers, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import FrontDetailDialog from "./FrontDetailDialog";
import {
  getBucketLabel, getExecutionLabel, getExecutionColor, getBucketColor,
} from "./frontConstants";
import { getScopeLabel, getScopeColor, type ScopeClassification } from "./aceleraConstants";
import { getPriorityLabel, getPriorityColor } from "./taskConstants";
import {
  extractReviewedSignals, buildOperationalFronts, deriveTasksFromFronts,
  type OperationalFront as EngineFront, type ReviewedSignal,
} from "./operationalPlanEngine";

interface DBFront {
  id: string;
  workspace_id: string;
  client_id: string;
  front_key: string | null;
  name: string;
  objective: string | null;
  expected_outcome: string | null;
  scope_classification: string | null;
  priority: string;
  bucket_status: string;
  execution_status: string;
  owner_id: string | null;
  blocked_reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

interface TaskSummary { total: number; done: number; }

interface Props {
  workspaceId: string;
  clientId: string;
  planName?: string | null;
}

export default function WorkspaceTabProducao({ workspaceId, clientId, planName }: Props) {
  const [fronts, setFronts] = useState<DBFront[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<Map<string, TaskSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedFront, setSelectedFront] = useState<DBFront | null>(null);
  const [bucketFilter, setBucketFilter] = useState<string>("all");

  const fetchFronts = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("operational_fronts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (bucketFilter !== "all") q = q.eq("bucket_status", bucketFilter);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar frentes", description: error.message, variant: "destructive" });
    const list = (data ?? []) as DBFront[];
    setFronts(list);

    // Task summaries for progress
    if (list.length > 0) {
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, status, metadata")
        .eq("workspace_id", workspaceId);

      const map = new Map<string, TaskSummary>();
      for (const f of list) map.set(f.id, { total: 0, done: 0 });
      for (const t of (tasks ?? [])) {
        const meta = (t as Record<string, unknown>).metadata as Record<string, unknown> | null;
        const lid = meta?.operational_front_id as string | undefined;
        if (lid && map.has(lid)) {
          const s = map.get(lid)!;
          s.total++;
          if ((t as Record<string, unknown>).status === "done") s.done++;
        }
      }
      setTaskSummaries(map);
    }
    setLoading(false);
  }, [workspaceId, bucketFilter]);

  useEffect(() => { fetchFronts(); }, [fetchFronts]);

  /* ─── Auto-generate fronts from Dossiê + reviewed signals ─── */
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      // 1. Load reviewed briefings
      const { data: briefings } = await supabase
        .from("context_entries")
        .select("id, metadata")
        .eq("workspace_id", workspaceId)
        .eq("context_type", "briefing");

      const reviewed = (briefings ?? []).filter(
        (b) => (b.metadata as Record<string, unknown>)?.import_review_status === "reviewed"
      );

      if (reviewed.length === 0) {
        toast({ title: "Sem base suficiente", description: "É necessário pelo menos um briefing revisado para gerar frentes.", variant: "destructive" });
        setGenerating(false);
        return;
      }

      const signals = extractReviewedSignals(
        reviewed.map((b) => ({ id: b.id, metadata: b.metadata as Record<string, unknown> }))
      );
      const { fronts: activeFronts, retained } = buildOperationalFronts(signals, planName ?? null);

      // 2. Check which front_keys already exist to avoid duplicates
      const { data: existing } = await supabase
        .from("operational_fronts")
        .select("front_key")
        .eq("workspace_id", workspaceId);
      const existingKeys = new Set((existing ?? []).map((e: { front_key: string | null }) => e.front_key).filter(Boolean));

      // 3. Build payloads — merge active + retained
      const allDerived = [...activeFronts, ...retained];
      const newFronts = allDerived.filter((f) => !existingKeys.has(f.key));

      if (newFronts.length === 0) {
        toast({ title: "Frentes já geradas", description: "Todas as frentes derivadas já existem neste workspace." });
        setGenerating(false);
        return;
      }

      // 4. Also derive tasks for active fronts to link them
      const derivedTasks = deriveTasksFromFronts(
        newFronts.filter((f) => !f.retained),
        signals
      );

      // 5. Insert fronts
      const frontPayloads = newFronts.map((f) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        front_key: f.key,
        name: f.name,
        objective: f.objective,
        expected_outcome: null,
        priority: f.priority,
        bucket_status: f.retained ? (f.scopeClassification === "conditional" ? "conditional" : "future") : "active",
        execution_status: "not_started",
        scope_classification: f.scopeClassification,
        metadata: {
          generation_mode: "auto_from_dossie",
          plan_name: planName,
          dossier_blocks: f.dossierBlocks,
          signal_keys: f.signals,
          retained_reason: f.retainedReason ?? null,
        },
      }));

      const { data: insertedFronts, error: insertErr } = await supabase
        .from("operational_fronts")
        .insert(frontPayloads)
        .select("id, front_key");

      if (insertErr) {
        toast({ title: "Erro ao gerar frentes", description: insertErr.message, variant: "destructive" });
        setGenerating(false);
        return;
      }

      // 6. Insert derived tasks linked to their fronts
      if (derivedTasks.length > 0 && insertedFronts) {
        const frontIdMap = new Map<string, string>();
        for (const f of insertedFronts) {
          if (f.front_key) frontIdMap.set(f.front_key, f.id);
        }

        const taskPayloads = derivedTasks
          .filter((t) => frontIdMap.has(t.frontKey))
          .map((t) => ({
            workspace_id: workspaceId,
            client_id: clientId,
            title: t.title,
            description: t.description,
            status: "todo",
            priority: t.priority,
            stage: t.stage,
            source_type: "operational_plan",
            metadata: {
              generation_mode: "operational_wizard",
              operational_front_id: frontIdMap.get(t.frontKey),
              front_key: t.frontKey,
              front_name: t.frontName,
              dossier_block: t.dossierBlock,
              signal_keys: t.signalKeys,
              signal_sources: t.signalSources,
              scope_classification: t.scopeClassification,
              operational_reason: t.operationalReason,
              plan_name: planName,
            },
          }));

        if (taskPayloads.length > 0) {
          await supabase.from("tasks").insert(taskPayloads);
        }
      }

      // 7. Timeline
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "fronts_generated",
        title: `${newFronts.length} frente(s) gerada(s) do Dossiê`,
        description: `${newFronts.filter((f) => !f.retained).length} ativa(s), ${newFronts.filter((f) => f.retained).length} retida(s). ${derivedTasks.length} task(s) derivada(s).`,
        happened_at: new Date().toISOString(),
      });

      toast({
        title: `${newFronts.length} frentes geradas`,
        description: `${derivedTasks.length} tasks criadas e vinculadas automaticamente.`,
      });
      fetchFronts();
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando frentes...</p>;
  }

  const hasNoFronts = fronts.length === 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <Select value={bucketFilter} onValueChange={setBucketFilter}>
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="Bucket" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativas</SelectItem>
              <SelectItem value="conditional">Condicionais</SelectItem>
              <SelectItem value="future">Futuro</SelectItem>
              <SelectItem value="out_of_scope">Fora do Escopo</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Gerando...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> {hasNoFronts ? "Gerar Frentes do Dossiê" : "Atualizar Frentes"}</>
            )}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {hasNoFronts ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <Sparkles className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Produção não iniciada</p>
          <p className="text-xs text-muted-foreground mb-4 text-center max-w-sm">
            Gere as frentes operacionais automaticamente a partir do Dossiê e dos briefings revisados. 
            Tasks serão criadas e vinculadas a cada frente.
          </p>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating ? (
              <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Gerando...</>
            ) : (
              <><Sparkles className="h-4 w-4 mr-1" /> Gerar Frentes do Dossiê</>
            )}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {fronts.map((f) => {
            const summary = taskSummaries.get(f.id);
            const pct = summary && summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : null;
            const scopeClass = (f.scope_classification ?? "in_plan") as ScopeClassification;

            return (
              <Card
                key={f.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setSelectedFront(f)}
              >
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">{f.name}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getBucketColor(f.bucket_status)}`}>
                          {getBucketLabel(f.bucket_status)}
                        </Badge>
                        <span className={`text-[10px] font-medium ${getExecutionColor(f.execution_status)}`}>
                          {getExecutionLabel(f.execution_status)}
                        </span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getScopeColor(scopeClass)}`}>
                          {getScopeLabel(scopeClass)}
                        </Badge>
                      </div>
                      {f.objective && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{f.objective}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[10px] ${getPriorityColor(f.priority)}`}>
                        {getPriorityLabel(f.priority)}
                      </span>
                    </div>
                  </div>

                  {/* Progress */}
                  {pct !== null && (
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  )}

                  {/* Blocked */}
                  {f.execution_status === "blocked" && f.blocked_reason && (
                    <div className="flex items-center gap-1.5 text-[10px] text-red-400">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="truncate">{f.blocked_reason}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <FrontDetailDialog
        front={selectedFront}
        open={!!selectedFront}
        onOpenChange={(v) => { if (!v) setSelectedFront(null); }}
        onUpdated={() => { fetchFronts(); setSelectedFront(null); }}
        workspaceId={workspaceId}
        clientId={clientId}
      />
    </div>
  );
}
