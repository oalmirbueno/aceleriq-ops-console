import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import CanvasStudio from "@/components/workspace/CanvasStudio";
import { Button } from "@/components/ui/button";

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
      {/* Botão voltar — sempre visível, sobreposto ao canvas */}
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="absolute top-3 left-3 z-50 h-9 gap-1.5 shadow-md border border-border/60"
        onClick={() => navigate(-1)}
        title="Voltar"
      >
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Button>
      <CanvasStudio
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName}
        fullscreen
        onToggleFullscreen={() => navigate(-1)}
        onTimelineRefresh={() => {}}
      />
    </div>
  );
}
