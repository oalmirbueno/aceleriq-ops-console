/**
 * MilestonesTab — lista visual de milestones do workspace.
 * Cidadão de primeira classe: cada milestone é uma frente/missão.
 * Lê apenas canvas_nodes Portal-bound (filtro server-side já aplicado pelo
 * CanvasStudio loader). Aqui só faz leitura derivada via milestoneModel.
 */
import { useEffect, useMemo, useState } from "react";
import { Target, ArrowRight, ExternalLink, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import { supabase } from "@/integrations/supabase/client";
import {
  listMilestones,
  listTasksByMilestone,
  listProjects,
  milestoneProgress,
  type RawNodeRow,
  type DerivedMilestone,
} from "@/lib/milestoneModel";

interface Props {
  workspaceId: string;
  portalProjectId?: string | null;
  onOpenInCanvas?: (milestoneId: string) => void;
}

export default function MilestonesTab({ workspaceId, portalProjectId, onOpenInCanvas }: Props) {
  const [nodes, setNodes] = useState<RawNodeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("canvas_nodes")
        .select("id, node_type, title, status, description, parent_node_id, archived_at, deleted_at, sync_status, data, updated_at, created_at")
        .eq("workspace_id", workspaceId)
        .is("deleted_at", null)
        .is("archived_at", null)
        .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)")
        .limit(500);
      if (alive) {
        setNodes((data ?? []) as RawNodeRow[]);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [workspaceId]);

  const projects = useMemo(() => listProjects(nodes), [nodes]);
  const milestones = useMemo(() => {
    const all = listMilestones(nodes);
    if (!portalProjectId) return all;
    return all.filter((m) => m.portalProjectId === portalProjectId || projects.find((p) => p.id === m.projectId)?.portalProjectId === portalProjectId);
  }, [nodes, portalProjectId, projects]);

  if (loading) return <LoadingState />;

  if (milestones.length === 0) {
    return (
      <EmptyState
        icon={Target}
        title="Nenhum milestone neste workspace"
        description="Crie um milestone no Portal ou no Canvas para começar a organizar tarefas por frente de execução."
      />
    );
  }

  return (
    <div className="space-y-3">
      {milestones.map((m) => {
        const tasks = listTasksByMilestone(nodes, m);
        const progress = milestoneProgress(tasks);
        const project = projects.find((p) => p.id === m.projectId);
        return (
          <MilestoneCard
            key={m.id}
            milestone={m}
            projectTitle={project?.title ?? null}
            taskCount={progress.total}
            doneCount={progress.done}
            pct={progress.pct}
            onOpenInCanvas={onOpenInCanvas}
          />
        );
      })}
    </div>
  );
}

function MilestoneCard({
  milestone, projectTitle, taskCount, doneCount, pct, onOpenInCanvas,
}: {
  milestone: DerivedMilestone;
  projectTitle: string | null;
  taskCount: number;
  doneCount: number;
  pct: number;
  onOpenInCanvas?: (id: string) => void;
}) {
  const isDone = pct === 100 && taskCount > 0;
  return (
    <Card className="p-4 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <Target className="h-3.5 w-3.5 text-primary shrink-0" />
            <h3 className="text-sm font-semibold text-foreground truncate">{milestone.title}</h3>
            {isDone && (
              <Badge className="text-[10px] h-4 px-1.5 bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" /> Concluído
              </Badge>
            )}
            {milestone.portalMilestoneId && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">Portal</Badge>
            )}
          </div>
          {projectTitle && (
            <p className="text-[11px] text-muted-foreground mb-3">{projectTitle}</p>
          )}
          <div className="flex items-center gap-3">
            <div className="flex-1 max-w-md">
              <Progress value={pct} className="h-1" />
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground shrink-0">
              {doneCount}/{taskCount} {taskCount === 1 ? "task" : "tasks"} · {pct}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenInCanvas && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1"
              onClick={() => onOpenInCanvas(milestone.id)}
            >
              <ArrowRight className="h-3 w-3" />
              Canvas
            </Button>
          )}
          {milestone.portalMilestoneId && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px] gap-1"
              onClick={() => window.open(`https://portal.aceleriq.online/milestones/${milestone.portalMilestoneId}`, "_blank")}
              title="Abrir no Portal"
            >
              <ExternalLink className="h-3 w-3" />
              Portal
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
