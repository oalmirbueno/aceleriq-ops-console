import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import CanvasStudio from "./CanvasStudio";
import WorkspaceProjectsLauncher from "./WorkspaceProjectsLauncher";
import { supabase } from "@/integrations/supabase/client";

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
    if (!props.portalProjectId) return;
    let cancelled = false;
    const materializeMilestonesFromTimeline = async () => {
      const now = new Date().toISOString();
      const { data: existingProject } = await supabase
        .from("canvas_nodes")
        .select("id, data")
        .eq("workspace_id", props.workspaceId)
        .contains("data", { kind: "project_group", portal_project_id: props.portalProjectId })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      let projectNodeId = existingProject?.id ?? null;
      if (!projectNodeId) {
        const { data: createdProject } = await supabase.from("canvas_nodes").insert({
          workspace_id: props.workspaceId,
          client_id: props.clientId,
          node_type: "front",
          title: props.clientName,
          status: "active",
          pos_x: 80,
          pos_y: 190,
          data: { kind: "project_group", from_portal: true, portal_project_id: props.portalProjectId, stage: "producao", fallback_source: "timeline_events" },
        }).select("id").single();
        projectNodeId = createdProject?.id ?? null;
      }
      const { data: events } = await supabase
        .from("timeline_events")
        .select("title, description, happened_at, payload")
        .eq("workspace_id", props.workspaceId)
        .eq("payload->>kind", "portal_milestone")
        .order("happened_at", { ascending: true });
      if (cancelled) return;
      for (const [index, event] of ((events ?? []) as Array<{ title: string; description: string | null; payload: Record<string, unknown> | null }>).entries()) {
        const portalMilestoneId = typeof event.payload?.portal_milestone_id === "string" ? event.payload.portal_milestone_id : null;
        if (!portalMilestoneId) continue;
        const title = event.title.replace(/^\[Portal milestone\]\s*/i, "") || `Milestone ${index + 1}`;
        const { data: existingMilestone } = await supabase
          .from("canvas_nodes")
          .select("id, data")
          .eq("workspace_id", props.workspaceId)
          .contains("data", { kind: "milestone_group", portal_milestone_id: portalMilestoneId })
          .limit(1)
          .maybeSingle();
        const data = { ...((existingMilestone?.data as Record<string, unknown>) ?? {}), kind: "milestone_group", from_portal: true, portal_project_id: props.portalProjectId, portal_milestone_id: portalMilestoneId, milestone_key: portalMilestoneId, portal_position: index, portal_status: event.payload?.status ?? "active", stage: "producao", fallback_source: "timeline_events" };
        if (existingMilestone?.id) {
          await supabase.from("canvas_nodes").update({ parent_node_id: projectNodeId, title, description: event.description, updated_at: now, data }).eq("id", existingMilestone.id);
        } else {
          await supabase.from("canvas_nodes").insert({ workspace_id: props.workspaceId, client_id: props.clientId, parent_node_id: projectNodeId, node_type: "front", title, description: event.description, status: "active", pos_x: 112 + index * 360, pos_y: 350, data });
        }
      }
    };
    supabase.functions.invoke("backfill-from-portal", {
      body: { source: "workspace_canvas", workspaceId: props.workspaceId, portalProjectId: props.portalProjectId },
    }).catch(() => null).finally(() => { void materializeMilestonesFromTimeline(); });
    return () => { cancelled = true; };
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
