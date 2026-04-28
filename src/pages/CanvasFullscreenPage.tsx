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
      <button
        type="button"
        onClick={() => navigate(-1)}
        title="Voltar"
        className="group absolute top-3 left-3 z-50 inline-flex items-center gap-2 h-9 rounded-md border border-primary/30 bg-background/80 px-3 text-xs font-mono uppercase tracking-wider text-primary backdrop-blur-md transition-all hover:border-primary/60 hover:bg-primary/10 hover:shadow-[0_0_18px_-4px_hsl(var(--primary)/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
        Voltar
      </button>
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
