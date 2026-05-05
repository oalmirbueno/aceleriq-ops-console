import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import CanvasStudio from "@/components/workspace/CanvasStudio";
import { supabase } from "@/integrations/supabase/client";

export default function CanvasFullscreenPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workspaceId = searchParams.get("workspaceId");
  const clientId = searchParams.get("clientId");
  const clientName = searchParams.get("clientName") || "Canvas Ops";
  const queryProjectId = searchParams.get("portalProjectId");
  const [redirecting, setRedirecting] = useState(true);

  if (!workspaceId || !clientId) {
    navigate("/ops/canvas", { replace: true });
    return null;
  }

  // Cada projeto tem seu próprio canvas. Se o workspace tem 1 projeto do
  // Portal, redireciona pra /ops/projects/:portalProjectId. Se tem mais de um,
  // mostra a lista pra escolher. Se não tem nenhum, abre o canvas legado pra
  // permitir vincular.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (queryProjectId) {
        navigate(`/ops/projects/${queryProjectId}`, { replace: true });
        return;
      }
      const { data: groups } = await supabase
        .from("canvas_nodes")
        .select("data")
        .eq("workspace_id", workspaceId)
        .contains("data", { kind: "project_group" });
      if (cancelled) return;
      const projectIds = Array.from(new Set(
        (groups ?? [])
          .map((g) => (g.data as Record<string, unknown> | null)?.portal_project_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ));
      if (projectIds.length === 1) {
        navigate(`/ops/projects/${projectIds[0]}`, { replace: true });
        return;
      }
      setRedirecting(false);
    })();
    return () => { cancelled = true; };
  }, [workspaceId, queryProjectId, navigate]);

  if (redirecting) {
    return (
      <div className="flex h-screen items-center justify-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Abrindo projeto…
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-background">
      <CanvasStudio
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName}
        fullscreen
        onToggleFullscreen={() => navigate(`/ops/workspaces/${workspaceId}`)}
        onTimelineRefresh={() => {}}
      />
    </div>
  );
}
