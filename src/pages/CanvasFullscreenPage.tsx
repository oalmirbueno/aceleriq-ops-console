import { useNavigate, useSearchParams } from "react-router-dom";
import CanvasStudio from "@/components/workspace/CanvasStudio";

export default function CanvasFullscreenPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const workspaceId = searchParams.get("workspaceId");
  const clientId = searchParams.get("clientId");
  const clientName = searchParams.get("clientName") || "Canvas Ops";

  if (!workspaceId || !clientId) {
    navigate("/ops/canvas", { replace: true });
    return null;
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
