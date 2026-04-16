import { useState, useEffect, useCallback } from "react";
import { Plus, Layers, AlertTriangle } from "lucide-react";
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

export default function WorkspaceTabProducao({ workspaceId, clientId, planName }: Props) {
  const [fronts, setFronts] = useState<OperationalFront[]>([]);
  const [taskSummaries, setTaskSummaries] = useState<Map<string, TaskSummary>>(new Map());
  const [loading, setLoading] = useState(true);
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
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova Frente
        </Button>
      </div>

      {/* List */}
      {fronts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <Layers className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhuma frente operacional</p>
          <p className="text-xs text-muted-foreground">Crie frentes para acompanhar a execução por unidade de trabalho.</p>
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

                  {/* Progress bar */}
                  {pct !== null && (
                    <div className="flex items-center gap-2">
                      <Progress value={pct} className="h-1.5 flex-1" />
                      <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
                    </div>
                  )}

                  {/* Blocked banner */}
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
