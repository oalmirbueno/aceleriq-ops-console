import { memo, useMemo } from "react";
import { AlertTriangle, CheckCircle2, GitBranch, ListTodo } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ACELERA_STAGES, type AceleraStageKey } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import { isCanvasNodeBlocked, readCanvasOperationalMeta } from "./canvasOperationalMeta";

interface CanvasEdgeLike { source_node_id: string; target_node_id: string }

function kindOf(node: CanvasNodeRecord) {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return (data.kind as string | undefined) ?? node.node_type;
}

function stageOf(node: CanvasNodeRecord): AceleraStageKey {
  const data = (node.data ?? {}) as Record<string, unknown>;
  return ((data.stage ?? data.acelera_stage) as AceleraStageKey | undefined) ?? "producao";
}

function CanvasOperationalSummary({ nodes, edges }: { nodes: CanvasNodeRecord[]; edges: CanvasEdgeLike[] }) {
  const summary = useMemo(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const blocked = nodes.filter((node) => isCanvasNodeBlocked(node.status, readCanvasOperationalMeta(node.data as Record<string, unknown> | null)));
    const pendingApprovals = nodes.filter((node) => readCanvasOperationalMeta(node.data as Record<string, unknown> | null).approvalStatus === "pending");
    const rejected = nodes.filter((node) => readCanvasOperationalMeta(node.data as Record<string, unknown> | null).approvalStatus === "rejected");
    const carga = ACELERA_STAGES.map((stage) => ({ stage: stage.short, total: nodes.filter((node) => stageOf(node) === stage.key).length })).sort((a, b) => b.total - a.total)[0];
    const hasContextWithoutEngine = nodes.some((node) => kindOf(node) === "contexto_ops" && !edges.some((edge) => edge.source_node_id === node.id && kindOf(byId.get(edge.target_node_id) ?? node) === "engine"));
    const outputsWithoutDecision = nodes.filter((node) => kindOf(node) === "resultado" && !edges.some((edge) => edge.source_node_id === node.id && kindOf(byId.get(edge.target_node_id) ?? node) === "decisao"));
    const recommendations = [
      blocked.filter((node) => stageOf(node) === "producao").length > 0 ? "Desbloquear produção antes de abrir novas frentes." : null,
      outputsWithoutDecision.length > 0 ? "Levar outputs sem decisão para aprovação/revisão." : null,
      hasContextWithoutEngine ? "Conectar contexto operacional a uma engine." : null,
      rejected.length > 0 ? "Revisar decisões reprovadas." : null,
      pendingApprovals.length > 0 ? "Resolver aprovações pendentes." : null,
    ].filter(Boolean).slice(0, 3) as string[];
    return { blocked, pendingApprovals, outputsWithoutDecision, recommendations, carga };
  }, [nodes, edges]);

  return (
    <div className="w-[286px] rounded-lg border border-border/70 bg-card/72 p-2.5 shadow-xl shadow-background/30 backdrop-blur-xl">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Resumo operacional</span>
        <Badge variant="outline" className="border-border/60 text-[9px]">{summary.carga?.stage ?? "Sem carga"}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-1.5 text-center">
        <div className="rounded-md bg-background/35 p-1.5"><AlertTriangle className="mx-auto h-3 w-3 text-destructive" /><p className="mt-1 text-sm font-semibold">{summary.blocked.length}</p><p className="text-[9px] text-muted-foreground">Bloq.</p></div>
        <div className="rounded-md bg-background/35 p-1.5"><CheckCircle2 className="mx-auto h-3 w-3 text-muted-foreground" /><p className="mt-1 text-sm font-semibold">{summary.pendingApprovals.length}</p><p className="text-[9px] text-muted-foreground">Aprov.</p></div>
        <div className="rounded-md bg-background/35 p-1.5"><GitBranch className="mx-auto h-3 w-3 text-muted-foreground" /><p className="mt-1 text-sm font-semibold">{summary.outputsWithoutDecision.length}</p><p className="text-[9px] text-muted-foreground">Sem dec.</p></div>
      </div>
      <div className="mt-2 space-y-1.5">
        {(summary.recommendations.length ? summary.recommendations : ["Sem gargalo crítico detectado."]).map((item) => (
          <p key={item} className="flex gap-1.5 text-[10px] leading-snug text-muted-foreground"><ListTodo className="mt-0.5 h-2.5 w-2.5 shrink-0" />{item}</p>
        ))}
      </div>
    </div>
  );
}

export default memo(CanvasOperationalSummary);