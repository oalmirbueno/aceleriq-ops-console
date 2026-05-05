import WorkspaceProjectsLauncher from "./WorkspaceProjectsLauncher";

interface Props {
  workspaceId: string;
  clientId: string;
  clientName: string;
  onTimelineRefresh?: () => Promise<void> | void;
  initialStatusFilter?: string | null;
}

export default function WorkspaceTabCanvas(props: Props) {
  return (
    <div className="animate-fade-in">
      <WorkspaceProjectsLauncher workspaceId={props.workspaceId} clientName={props.clientName} />
    </div>
  );
}
