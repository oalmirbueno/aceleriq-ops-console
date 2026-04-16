import { useState, useEffect, useCallback } from "react";
import { Plus, Layers, AlertTriangle, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CreateFrontDialog, { type FrontFormData } from "./CreateFrontDialog";
import FrontDetailDialog from "./FrontDetailDialog";
import {
  getBucketLabel, getExecutionLabel, getExecutionColor, getBucketColor,
  type BucketStatus, type ExecutionStatus,
} from "./frontConstants";
import { getScopeLabel, getScopeColor, type ScopeClassification } from "./aceleraConstants";
import { getPriorityLabel, getPriorityColor } from "./taskConstants";
import {
  buildOperationalPlan,
  scopeToBucket,
  type OperationalFront as EngineFront,
  type DerivedTask,
} from "./operationalPlanEngine";

interface OperationalFront {
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

interface TaskSummary {
  frontId: string;
  total: number;
  done: number;
}

interface Props {
  workspaceId: string;
  clientId: string;
  planName?: string | null;
}

/* ─── Bucket filter labels with operational clarity ─── */
const BUCKET_FILTER_OPTIONS = [
  { value: "all", label: "Todas as frentes" },
  { value: "active", label: "Ativas — em execução" },
  { value: "conditional", label: "Condicionais — aguardando confirmação" },
  { value: "future", label: "Futuras — postergadas" },
  { value: "out_of_scope", label: "Fora do Plano" },
];

export default function WorkspaceTabProducao({ workspaceId, clientId, planName }: Props) {
  const [fronts, setFronts] = useState<OperationalFront[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<Map<string, TaskSummary>>(new Map());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedFront, setSelectedFront] = useState<OperationalFront | null>(null);
  const [bucketFilter, setBucketFilter] = useState<string>("all");

  const fetchFronts = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("operational_fronts")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (bucketFilter !== "all") {
      q = q.eq("bucket_status", bucketFilter);
    }

    const { data, error } = await q;
    if (error) {
      toast({ title: "Erro ao carregar frentes", description: error.message, variant: "destructive" });
    }
    setFronts((data ?? []) as OperationalFront[]);

    // Fetch task summaries for progress
    if (data && data.length > 0) {
      const frontIds = data.map((f: OperationalFront) => f.id);
      const { data: tasks } = await supabase
        .from("tasks")
        .select("id, status, metadata")
        .eq("workspace_id", workspaceId);

      const summaryMap = new Map<string, TaskSummary>();
      for (const fid of frontIds) {
        summaryMap.set(fid, { frontId: fid, total: 0, done: 0 });
      }
      for (const t of (tasks ?? [])) {
        const meta = (t as Record<string, unknown>).metadata as Record<string, unknown> | null;
        const linkedId = meta?.operational_front_id as string | undefined;
        if (linkedId && summaryMap.has(linkedId)) {
          const s = summaryMap.get(linkedId)!;
          s.total++;
          if ((t as Record<string, unknown>).status === "done") s.done++;
        }
      }
      setTaskSummaries(summaryMap);
    }

    setLoading(false);
  }, [workspaceId, bucketFilter]);

  useEffect(() => { fetchFronts(); }, [fetchFronts]);

  /* ─── Auto-generate from Dossiê ─── */
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      // 1. Fetch reviewed briefings
      const { data: briefings } = await supabase
        .from("context_entries")
        .select("id, metadata")
        .eq("workspace_id", workspaceId)
        .eq("context_type", "briefing");

      const reviewed = (briefings ?? []).filter(
        (b) => (b.metadata as Record<string, unknown>)?.import_review_status === "reviewed"
      );

      if (reviewed.length === 0) {
        toast({ title: "Nenhum briefing revisado", description: "Revise ao menos um briefing antes de gerar frentes.", variant: "destructive" });
        return;
      }

      // 2. Build operational plan from engine
      const plan = buildOperationalPlan(
        reviewed.map((b) => ({ id: b.id, metadata: b.metadata as Record<string, unknown> })),
        planName ?? null
      );

      const allEngineFronts = [...plan.fronts, ...plan.retained];
      if (allEngineFronts.length === 0) {
        toast({ title: "Nenhuma frente derivada", description: "Os sinais revisados não geraram frentes operacionais." });
        return;
      }

      // 3. Fetch existing front_keys for deduplication
      const { data: existing } = await supabase
        .from("operational_fronts")
        .select("front_key, bucket_status")
        .eq("workspace_id", workspaceId);

      const existingKeys = new Map<string, string>();
      for (const e of (existing ?? [])) {
        if (e.front_key) existingKeys.set(e.front_key, e.bucket_status);
      }

      // 4. Filter new fronts only (preserve existing bucket on rerun)
      const newFronts = allEngineFronts.filter((f) => !existingKeys.has(f.key));

      if (newFronts.length === 0) {
        toast({ title: "Frentes já existentes", description: "Todas as frentes derivadas já foram criadas anteriormente." });
        return;
      }

      // 5. Insert new fronts with correct bucket mapping
      const frontsToInsert = newFronts.map((f) => ({
        workspace_id: workspaceId,
        client_id: clientId,
        name: f.name,
        objective: f.objective,
        front_key: f.key,
        priority: f.priority,
        bucket_status: scopeToBucket(f.scopeClassification),
        scope_classification: f.scopeClassification,
        execution_status: "not_started",
        metadata: {
          plan_name: planName,
          generation_mode: "dossie_auto",
          signals: f.signals,
          dossier_blocks: f.dossierBlocks,
          stage: f.stage,
          retained: f.retained,
          retained_reason: f.retainedReason ?? null,
        },
      }));

      const { data: inserted, error: insertError } = await supabase
        .from("operational_fronts")
        .insert(frontsToInsert)
        .select("id, front_key");

      if (insertError) {
        toast({ title: "Erro ao criar frentes", description: insertError.message, variant: "destructive" });
        return;
      }

      // 6. Derive and insert tasks for active fronts
      const activeFronts = newFronts.filter((f) => scopeToBucket(f.scopeClassification) === "active");
      if (activeFronts.length > 0 && inserted) {
        const frontIdMap = new Map<string, string>();
        for (const row of inserted) {
          if (row.front_key) frontIdMap.set(row.front_key, row.id);
        }

        const derivedTasks = plan.tasks.filter((t) =>
          activeFronts.some((f) => f.key === t.frontKey)
        );

        if (derivedTasks.length > 0) {
          const tasksToInsert = derivedTasks.map((t) => ({
            workspace_id: workspaceId,
            client_id: clientId,
            title: t.title,
            description: t.description,
            status: "todo",
            priority: t.priority,
            stage: t.stage,
            source_type: "context",
            metadata: {
              generation_mode: "operational_wizard",
              operational_front_id: frontIdMap.get(t.frontKey) ?? null,
              front_key: t.frontKey,
              front_name: t.frontName,
              dossier_block: t.dossierBlock,
              signal_keys: t.signalKeys,
              signal_sources: t.signalSources,
              scope_classification: t.scopeClassification,
              operational_reason: t.operationalReason,
              action_plan: t.actionPlan,
            },
          }));

          await supabase.from("tasks").insert(tasksToInsert);
        }
      }

      // 7. Timeline event
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "fronts_generated",
        title: `${newFronts.length} frente(s) gerada(s) do Dossiê`,
        description: `Ativas: ${newFronts.filter((f) => scopeToBucket(f.scopeClassification) === "active").length}, Condicionais: ${newFronts.filter((f) => scopeToBucket(f.scopeClassification) === "conditional").length}, Fora do plano: ${newFronts.filter((f) => scopeToBucket(f.scopeClassification) === "out_of_scope").length}`,
        happened_at: new Date().toISOString(),
      });

      toast({ title: `${newFronts.length} frente(s) criada(s)` });
      fetchFronts();
    } finally {
      setGenerating(false);
    }
  }, [workspaceId, clientId, planName, fetchFronts]);

  const handleCreate = async (form: FrontFormData) => {
    const payload = {
      workspace_id: workspaceId,
      client_id: clientId,
      name: form.name,
      objective: form.objective || null,
      expected_outcome: form.expected_outcome || null,
      priority: form.priority,
      bucket_status: form.bucket_status,
      scope_classification: form.scope_classification || "in_plan",
      front_key: form.front_key || null,
      execution_status: "not_started",
      metadata: form.metadata ?? { plan_name: planName },
    };

    const { error } = await supabase.from("operational_fronts").insert(payload);
    if (error) {
      toast({ title: "Erro ao criar frente", description: error.message, variant: "destructive" });
      throw error;
    }

    await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: "front_created",
      title: `Frente criada: ${form.name}`,
      description: form.objective || null,
      happened_at: new Date().toISOString(),
    });

    toast({ title: "Frente operacional criada" });
    fetchFronts();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando frentes...</p>;
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Layers className="h-5 w-5 text-muted-foreground" />
          <Select value={bucketFilter} onValueChange={setBucketFilter}>
            <SelectTrigger className="h-9 w-[240px] text-sm">
              <SelectValue placeholder="Filtrar por status" />
            </SelectTrigger>
            <SelectContent>
              {BUCKET_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
            Gerar do Dossiê
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> Nova Frente
          </Button>
        </div>
      </div>

      {/* List */}
      {fronts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
          <Layers className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-base font-medium text-foreground mb-1">Nenhuma frente operacional</p>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            Clique em "Gerar do Dossiê" para criar frentes automaticamente a partir dos briefings revisados, ou adicione manualmente.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
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
                <CardContent className="p-4 space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-base font-medium truncate">{f.name}</span>
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${getBucketColor(f.bucket_status)}`}>
                          {getBucketLabel(f.bucket_status)}
                        </Badge>
                        <span className={`text-xs font-medium ${getExecutionColor(f.execution_status)}`}>
                          {getExecutionLabel(f.execution_status)}
                        </span>
                        <Badge variant="outline" className={`text-xs px-2 py-0.5 ${getScopeColor(scopeClass)}`}>
                          {getScopeLabel(scopeClass)}
                        </Badge>
                      </div>
                      {f.objective && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{f.objective}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-medium ${getPriorityColor(f.priority)}`}>
                        {getPriorityLabel(f.priority)}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {pct !== null && (
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </div>
                  )}

                  {/* Blocked banner */}
                  {f.execution_status === "blocked" && f.blocked_reason && (
                    <div className="flex items-center gap-2 text-xs text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="truncate">{f.blocked_reason}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateFrontDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
      />
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
