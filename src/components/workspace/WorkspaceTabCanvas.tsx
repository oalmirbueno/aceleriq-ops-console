import { useNavigate } from "react-router-dom";
import CanvasStudio from "./CanvasStudio";

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  onTimelineRefresh?: () => Promise<void> | void;
  initialStatusFilter?: string | null;
}

export default function WorkspaceTabCanvas(props: Props) {
  const navigate = useNavigate();

  const openFullscreen = () => {
    const params = new URLSearchParams({
      workspaceId: props.workspaceId,
      clientId: props.clientId,
      clientName: props.clientName,
    });
    navigate(`/ops/canvas/open?${params.toString()}`);
  };

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={openFullscreen} className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/15">
          Abrir canvas completo ↗
        </button>
      </div>
      <CanvasStudio {...props} fullscreen={false} onToggleFullscreen={openFullscreen} />
    </div>
  );
}
