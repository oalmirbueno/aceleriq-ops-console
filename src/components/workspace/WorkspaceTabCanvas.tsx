import { useNavigate } from "react-router-dom";
import CanvasStudio from "./CanvasStudio";
import WorkspaceProjectsLauncher from "./WorkspaceProjectsLauncher";
import { featureFlags } from "@/config/featureFlags";
import { useEffect } from "react";
import { materializePortalTimelineCanvas } from "@/lib/portalTimelineCanvas";

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  portalClientId?: string | null;
  portalProjectId?: string | null;
  onTimelineRefresh?: () => Promise<void> | void;
  initialStatusFilter?: string | null;
}

export default function WorkspaceTabCanvas(props: Props) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!featureFlags.enableCanvasAutoMaterialize) return;
    if (!props.portalProjectId) return;
    void materializePortalTimelineCanvas({
      workspaceId: props.workspaceId, clientId: props.clientId,
      clientName: props.clientName, portalProjectId: props.portalProjectId,
    });
  }, [props.workspaceId, props.portalProjectId, props.clientId, props.clientName]);

  if (props.portalProjectId) {
    return (
      <div className="animate-fade-in">
        <CanvasStudio
          workspaceId={props.workspaceId}
          clientId={props.clientId}
          clientName={props.clientName}
          portalProjectId={props.portalProjectId}
          fullscreen={false}
          onToggleFullscreen={() => navigate(`/ops/projects/${props.portalProjectId}`)}
          onTimelineRefresh={props.onTimelineRefresh}
          initialStatusFilter={props.initialStatusFilter}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <WorkspaceProjectsLauncher
        workspaceId={props.workspaceId}
        clientName={props.clientName}
        portalClientId={props.portalClientId}
        portalProjectId={props.portalProjectId}
      />
    </div>
  );
}
