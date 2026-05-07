import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import CanvasStudio from "@/components/workspace/CanvasStudio";
import { supabase } from "@/integrations/supabase/client";
import { materializePortalTimelineCanvas } from "@/lib/portalTimelineCanvas";

/**
 * Canvas de UM projeto do Portal.
 *
 * Rota: /ops/projects/:portalProjectId
 *
 * Resolve workspace + client lendo o project_group correspondente e
 * monta um CanvasStudio escopado a esse projeto. Garante que o usuário
 * sempre vê a esteira de um único projeto, nunca dois lado a lado.
 */
export default function ProjectCanvasPage() {
  const { portalProjectId } = useParams<{ portalProjectId: string }>();
  const navigate = useNavigate();
  const [resolved, setResolved] = useState<{
    workspaceId: string;
    clientId: string;
    clientName: string;
    projectTitle: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!portalProjectId) return;
    let cancelled = false;
    (async () => {
      setError(null);
      // 1) Tenta achar o project_group desse portal_project_id.
      const { data: groups, error: gErr } = await supabase
        .from("canvas_nodes")
        .select("workspace_id, client_id, title, data")
        .is("deleted_at", null).is("archived_at", null)
        .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)")
        .contains("data", { kind: "project_group", portal_project_id: portalProjectId })
        .order("created_at", { ascending: true })
        .limit(1);
      if (cancelled) return;
      if (gErr) {
        setError(gErr.message);
        return;
      }
      const group = groups?.[0];
      if (group) {
        const { data: client } = await supabase
          .from("clients")
          .select("id, name")
          .eq("id", group.client_id)
          .maybeSingle();
        setResolved({
          workspaceId: group.workspace_id as string,
          clientId: (group.client_id as string) ?? client?.id ?? "",
          clientName: client?.name ?? "Cliente",
          projectTitle: (group.title as string) ?? "Projeto",
        });
        return;
      }
      // 2) Fallback: workspace linkado pelo portal_project_id.
      const { data: ws } = await supabase
        .from("workspaces")
        .select("id, name, clients(id, name)")
        .eq("portal_project_id", portalProjectId)
        .is("deleted_at", null)
        .or("sync_status.is.null,sync_status.not.in.(deleted_from_portal,archived_legacy,archived_test_data,deleted,archived)")
        .maybeSingle();
      if (cancelled) return;
      if (ws) {
        const c = (ws as any).clients;
        setResolved({
          workspaceId: ws.id as string,
          clientId: c?.id ?? "",
          clientName: c?.name ?? (ws as any).name ?? "Cliente",
          projectTitle: (ws as any).name ?? "Projeto",
        });
        return;
      }
      setError("Projeto do Portal não encontrado neste workspace. Rode Sync portal e tente de novo.");
    })();
    return () => { cancelled = true; };
  }, [portalProjectId]);

  // Auto-pull silencioso: ao abrir o projeto, puxa milestones+tasks do Portal
  // sem o usuário precisar apertar nada. Realtime + usePortalAutoSync mantêm
  // tudo atualizado depois.
  useEffect(() => {
    if (!resolved?.workspaceId || !portalProjectId) return;
    (async () => {
      // backfill-from-portal removido do auto-open (WORKER_RESOURCE_LIMIT).
      await supabase.functions.invoke("pull-portal-tasks", {
        body: { workspaceId: resolved.workspaceId, portalProjectId },
      }).catch(() => null);
      await materializePortalTimelineCanvas({
        workspaceId: resolved.workspaceId,
        clientId: resolved.clientId,
        clientName: resolved.clientName,
        portalProjectId,
      }).catch(() => null);
    })();
  }, [resolved?.workspaceId, resolved?.clientId, resolved?.clientName, portalProjectId]);

  const title = useMemo(() => resolved?.projectTitle ?? "Projeto", [resolved]);

  if (!portalProjectId) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">portalProjectId ausente</div>;
  }
  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 text-center px-6">
        <p className="text-sm text-destructive">{error}</p>
        <button onClick={() => navigate("/ops/workspaces")} className="text-xs text-primary underline">
          Voltar para workspaces
        </button>
      </div>
    );
  }
  if (!resolved) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Abrindo projeto…
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <CanvasStudio
        workspaceId={resolved.workspaceId}
        clientId={resolved.clientId}
        clientName={`${resolved.clientName} · ${title}`}
        portalProjectId={portalProjectId}
        fullscreen
        onToggleFullscreen={() => navigate(`/ops/workspaces/${resolved.workspaceId}`)}
        onTimelineRefresh={() => {}}
      />
    </div>
  );
}
