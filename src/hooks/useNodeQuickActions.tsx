/**
 * useNodeQuickActions
 *
 * Centraliza a implementação dos quickActions genéricos dos drawers especializados:
 *  - generate_tasks  → abre TaskPlanningWizard com o workspace/cliente do node
 *  - export_pdf      → exporta o prefill como PDF formatado (jspdf)
 *  - create_snapshot → abre CreateMetricSnapshotDialog vinculado ao cliente
 *
 * Devolve:
 *  - `handlers`: map para passar pra `quickActionHandlers` do SpecializedNodeDrawer
 *  - `dialogs`: JSX que o wrapper renderiza no fim do return (modais montados)
 *
 * O caller pode mesclar handlers extras (ex: kickoff já tem schedule_meeting).
 */
import { useCallback, useState } from "react";
import { toast } from "@/hooks/use-toast";
import { useCanvasNodeMetadata } from "@/hooks/useCanvasNodeMetadata";
import { exportNodePdf } from "@/lib/nodePdfExport";
import TaskPlanningWizard from "@/components/workspace/TaskPlanningWizard";
import CreateMetricSnapshotDialog from "@/components/workspace/CreateMetricSnapshotDialog";
import { getNodeBlueprint } from "@/components/workspace/nodeBlueprints";
import { getProjectTypeMeta, type ProjectNodeKind } from "@/components/workspace/canvasProjectTypes";
import type { CanvasNodeRecord } from "@/components/workspace/CanvasNodeDrawer";
import type { QuickActionId } from "@/components/workspace/nodeBlueprints";

interface Args {
  node: CanvasNodeRecord;
  open: boolean;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  /** Callback após gerar tasks ou criar snapshot — pra parent atualizar listas. */
  onChanged?: () => void | Promise<void>;
}

/** Aproxima cor Tailwind do typeMeta para tupla RGB pro header do PDF.  */
function accentForKind(kind: ProjectNodeKind): [number, number, number] {
  const map: Partial<Record<ProjectNodeKind, [number, number, number]>> = {
    briefing: [251, 191, 36],
    reuniao: [251, 191, 36],
    objetivo: [251, 191, 36],
    documento: [56, 189, 248],
    site: [167, 139, 250],
    landing_page: [139, 92, 246],
    conteudo: [167, 139, 250],
    asset: [52, 211, 153],
    lancamento: [236, 72, 153],
    trafego: [236, 72, 153],
    metrica: [251, 146, 60],
    funil: [129, 140, 248],
  };
  return map[kind] ?? [20, 184, 90];
}

export function useNodeQuickActions({
  node, open, workspaceId, clientId, clientName, onChanged,
}: Args) {
  const [taskWizardOpen, setTaskWizardOpen] = useState(false);
  const [snapshotDialogOpen, setSnapshotDialogOpen] = useState(false);
  const { prefill } = useCanvasNodeMetadata({ nodeId: node.id, open });

  const kind = (node.node_type as ProjectNodeKind) ?? "documento";
  const blueprint = getNodeBlueprint(kind, { title: node.title });
  const typeMeta = getProjectTypeMeta(kind);

  const generateTasks = useCallback(() => {
    setTaskWizardOpen(true);
  }, []);

  const exportPdf = useCallback(() => {
    if (!blueprint) {
      toast({ title: "Sem blueprint", description: "Esse tipo não tem estrutura para exportar.", variant: "destructive" });
      return;
    }
    try {
      exportNodePdf({
        blueprint,
        prefill,
        nodeTitle: node.title || "Node",
        clientName,
        typeLabel: typeMeta?.label,
        accent: accentForKind(kind),
      });
      toast({ title: "PDF gerado", description: "Download iniciado." });
    } catch (e) {
      console.error("exportPdf", e);
      toast({
        title: "Falha ao gerar PDF",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  }, [blueprint, prefill, node.title, clientName, typeMeta, kind]);

  const createSnapshot = useCallback(() => {
    setSnapshotDialogOpen(true);
  }, []);

  const handlers: Partial<Record<QuickActionId, () => void | Promise<void>>> = {
    generate_tasks: generateTasks,
    export_pdf: exportPdf,
    create_snapshot: createSnapshot,
  };

  const dialogs = (
    <>
      <TaskPlanningWizard
        open={taskWizardOpen}
        onOpenChange={setTaskWizardOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        planName={node.title}
        onGenerated={() => {
          setTaskWizardOpen(false);
          onChanged?.();
        }}
      />
      <CreateMetricSnapshotDialog
        open={snapshotDialogOpen}
        onOpenChange={setSnapshotDialogOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        onCreated={() => {
          setSnapshotDialogOpen(false);
          onChanged?.();
        }}
      />
    </>
  );

  return { handlers, dialogs };
}
