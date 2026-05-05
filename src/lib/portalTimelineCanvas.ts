import { supabase } from "@/integrations/supabase/client";

type JsonRecord = Record<string, unknown>;

interface TimelineEventRow {
  id: string;
  title: string;
  description: string | null;
  happened_at: string | null;
  payload: JsonRecord | null;
}

interface CanvasNodeRow {
  id: string;
  node_type: string | null;
  title: string;
  status: string | null;
  pos_x: number | null;
  pos_y: number | null;
  parent_node_id: string | null;
  client_id: string | null;
  linked_entity_id?: string | null;
  data: JsonRecord | null;
}

export interface PortalTimelineMaterializeArgs {
  workspaceId: string;
  clientId: string;
  clientName: string;
  portalProjectId?: string | null;
}

export interface PortalTimelineMaterializeResult {
  projects: number;
  milestones: number;
  tasks: number;
  createdTasks: number;
  updatedTasks: number;
}

const TASK_PREFIX = /^\[Portal task\]\s*/i;
const MILESTONE_PREFIX = /^\[Portal milestone\]\s*/i;

function firstString(...values: unknown[]) {
  for (const value of values) {
    const str = typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
    if (str) return str;
  }
  return "";
}

function normalizeTitle(value: unknown) {
  return firstString(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function portalStatusToOps(status: unknown) {
  const s = String(status ?? "").toLowerCase();
  if (["done", "completed", "concluido", "concluida", "concluída", "finalizada"].includes(s)) return "done";
  if (["doing", "active", "in_progress", "in-progress", "andamento"].includes(s)) return "active";
  if (["blocked", "bloqueado", "bloqueada"].includes(s)) return "blocked";
  if (["review", "revisao", "em-revisao"].includes(s)) return "in_review";
  return "draft";
}

function inferNodeKind(title: string, description?: string | null) {
  const text = normalizeTitle(`${title} ${description ?? ""}`);
  if (/case|print|documentar|evidencia|prova/.test(text)) return "case";
  if (/landing|pagina de links|pagina/.test(text)) return "landing_page";
  if (/shopify|e commerce|ecommerce|site/.test(text)) return "site";
  if (/n8n|automacao|fluxo|integrar|resposta/.test(text)) return "automacao";
  if (/metrica|monitor/.test(text)) return "metrica";
  if (/acesso|credencial|hostinger/.test(text)) return "acessos";
  return "checklist";
}

function scoreMilestone(milestoneTitle: string, taskTitle: string, taskDescription?: string | null) {
  const milestone = normalizeTitle(milestoneTitle);
  const text = normalizeTitle(`${taskTitle} ${taskDescription ?? ""}`);
  let score = 0;

  const milestoneTokens = new Set(milestone.split(" ").filter((t) => t.length >= 4));
  for (const token of text.split(" ")) if (milestoneTokens.has(token)) score += 2;

  if (/base|digital|estrutur/.test(milestone)) {
    if (/landing|e commerce|ecommerce|shopify|pagina|links|acesso|credencial|hostinger|base tecnica/.test(text)) score += 8;
  }
  if (/automacao|atendimento|n8n|configur/.test(milestone)) {
    if (/n8n|automacao|atendimento|fluxo|nodes|integrar|resposta|base real|estoque|loja|fallback/.test(text)) score += 8;
  }
  if (/homolog|entrega|operacional/.test(milestone)) {
    if (/testar|cenario|homolog|aprovar|entrega|documentar|print|evidencia|case|final/.test(text)) score += 8;
  }
  return score;
}

function pickMilestone(milestones: CanvasNodeRow[], task: TimelineEventRow, taskIndex: number, taskTotal: number) {
  if (milestones.length === 0) return null;
  const title = task.title.replace(TASK_PREFIX, "");
  let best = milestones[0];
  let bestScore = -1;
  for (const milestone of milestones) {
    const score = scoreMilestone(milestone.title, title, task.description);
    if (score > bestScore) {
      best = milestone;
      bestScore = score;
    }
  }
  if (bestScore > 0) return best;
  const fallbackIndex = Math.min(milestones.length - 1, Math.floor((taskIndex / Math.max(taskTotal, 1)) * milestones.length));
  return milestones[fallbackIndex] ?? milestones[0];
}

function isTaskLikeNode(node: CanvasNodeRow) {
  const type = String(node.node_type ?? "").toLowerCase();
  const kind = String(node.data?.kind ?? "").toLowerCase();
  return !["client", "ai_orb", "chat_node"].includes(type) && !["project_group", "milestone_group", "chat_node"].includes(kind);
}

export async function materializePortalTimelineCanvas({
  workspaceId,
  clientId,
  clientName,
  portalProjectId,
}: PortalTimelineMaterializeArgs): Promise<PortalTimelineMaterializeResult> {
  const now = new Date().toISOString();
  const { data: existingNodes } = await supabase
    .from("canvas_nodes")
    .select("id, node_type, title, status, pos_x, pos_y, parent_node_id, client_id, linked_entity_id, data")
    .eq("workspace_id", workspaceId);

  const nodes = (existingNodes ?? []) as CanvasNodeRow[];
  const clientNode = nodes.find((node) => node.node_type === "client" && (node.client_id === clientId || node.linked_entity_id === clientId));
  const baseX = Number(clientNode?.pos_x ?? 80);
  const baseY = Number(clientNode?.pos_y ?? 0);

  const projectNode = nodes.find((node) => {
    const data = node.data ?? {};
    return data.kind === "project_group" && (!portalProjectId || data.portal_project_id === portalProjectId);
  });
  let projectNodeId = projectNode?.id ?? null;
  if (!projectNodeId && portalProjectId) {
    const { data: createdProject } = await supabase.from("canvas_nodes").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      parent_node_id: clientNode?.id ?? null,
      node_type: "front",
      title: clientName,
      status: "active",
      pos_x: baseX,
      pos_y: baseY + 190,
      data: { kind: "project_group", from_portal: true, portal_project_id: portalProjectId, stage: "producao", fallback_source: "timeline_events" },
    }).select("id").single();
    projectNodeId = createdProject?.id ?? null;
  }

  const [{ data: milestoneEvents }, { data: taskEvents }] = await Promise.all([
    supabase
      .from("timeline_events")
      .select("id, title, description, happened_at, payload")
      .eq("workspace_id", workspaceId)
      .eq("payload->>kind", "portal_milestone")
      .order("happened_at", { ascending: true }),
    supabase
      .from("timeline_events")
      .select("id, title, description, happened_at, payload")
      .eq("workspace_id", workspaceId)
      .eq("payload->>kind", "portal_task")
      .order("happened_at", { ascending: true }),
  ]);

  const milestones: CanvasNodeRow[] = [];
  for (const [index, event] of ((milestoneEvents ?? []) as TimelineEventRow[]).entries()) {
    const portalMilestoneId = firstString(event.payload?.portal_milestone_id, event.payload?.milestone_id, event.payload?.id);
    if (!portalMilestoneId) continue;
    const title = event.title.replace(MILESTONE_PREFIX, "") || `Milestone ${index + 1}`;
    const existing = nodes.find((node) => node.data?.kind === "milestone_group" && (
      node.data.portal_milestone_id === portalMilestoneId || normalizeTitle(node.title) === normalizeTitle(title)
    ));
    const data = {
      ...(existing?.data ?? {}),
      kind: "milestone_group",
      from_portal: true,
      portal_project_id: portalProjectId,
      portal_milestone_id: portalMilestoneId,
      milestone_key: portalMilestoneId,
      portal_position: index,
      portal_status: event.payload?.status ?? "active",
      stage: "producao",
      fallback_source: "timeline_events",
    };
    if (existing) {
      await supabase.from("canvas_nodes").update({ parent_node_id: existing.parent_node_id ?? projectNodeId, data, updated_at: now }).eq("id", existing.id);
      milestones.push({ ...existing, parent_node_id: existing.parent_node_id ?? projectNodeId, data });
    } else {
      const { data: created } = await supabase.from("canvas_nodes").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        parent_node_id: projectNodeId,
        node_type: "front",
        title,
        description: event.description,
        status: portalStatusToOps(event.payload?.status ?? "active") === "draft" ? "active" : portalStatusToOps(event.payload?.status ?? "active"),
        pos_x: baseX + 32 + index * 360,
        pos_y: baseY + 350,
        data,
      }).select("id, node_type, title, status, pos_x, pos_y, parent_node_id, client_id, data").single();
      if (created) milestones.push(created as CanvasNodeRow);
    }
  }

  const sortedMilestones = milestones.sort((a, b) => Number(a.data?.portal_position ?? 9999) - Number(b.data?.portal_position ?? 9999));
  const currentTaskNodes = nodes.filter(isTaskLikeNode);
  const byPortalTaskId = new Map<string, CanvasNodeRow>();
  const byTitle = new Map<string, CanvasNodeRow>();
  for (const node of currentTaskNodes) {
    const portalTaskId = firstString(node.data?.portal_task_id);
    if (portalTaskId) byPortalTaskId.set(portalTaskId, node);
    const key = normalizeTitle(node.title);
    if (key && !byTitle.has(key)) byTitle.set(key, node);
  }

  let createdTasks = 0;
  let updatedTasks = 0;
  const perMilestoneCount = new Map<string, number>();
  const tasks = (taskEvents ?? []) as TimelineEventRow[];
  for (const [index, event] of tasks.entries()) {
    const portalTaskId = firstString(event.payload?.portal_task_id, event.payload?.task_id, event.payload?.id);
    if (!portalTaskId) continue;
    const title = event.title.replace(TASK_PREFIX, "") || "Tarefa do Portal";
    const milestone = pickMilestone(sortedMilestones, event, index, tasks.length);
    const milestoneData = milestone?.data ?? {};
    const existing = byPortalTaskId.get(portalTaskId) ?? byTitle.get(normalizeTitle(title));
    const status = portalStatusToOps(event.payload?.status);
    const data = {
      ...(existing?.data ?? {}),
      kind: existing?.data?.kind ?? inferNodeKind(title, event.description),
      from_portal: true,
      portal_task_id: portalTaskId,
      portal_project_id: portalProjectId,
      portal_milestone_id: milestoneData.portal_milestone_id,
      milestone_key: milestoneData.milestone_key ?? milestoneData.portal_milestone_id,
      milestone_title: milestone?.title,
      portal_status: event.payload?.status ?? "todo",
      portal_position: index,
      priority: event.payload?.priority,
      stage: existing?.data?.stage ?? "producao",
      fallback_source: "timeline_events",
    };
    if (existing) {
      await supabase.from("canvas_nodes").update({
        parent_node_id: milestone?.id ?? existing.parent_node_id ?? projectNodeId,
        status,
        data,
        updated_at: now,
      }).eq("id", existing.id);
      updatedTasks++;
      continue;
    }
    const countKey = milestone?.id ?? "project";
    const count = perMilestoneCount.get(countKey) ?? 0;
    perMilestoneCount.set(countKey, count + 1);
    await supabase.from("canvas_nodes").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      parent_node_id: milestone?.id ?? projectNodeId,
      node_type: "task",
      title,
      description: event.description,
      status,
      pos_x: Number(milestone?.pos_x ?? baseX) + 42,
      pos_y: Number(milestone?.pos_y ?? baseY + 350) + 150 + count * 136,
      data,
    });
    createdTasks++;
  }

  return { projects: projectNodeId ? 1 : 0, milestones: sortedMilestones.length, tasks: tasks.length, createdTasks, updatedTasks };
}