/**
 * smoke-test-cycle — roda um ciclo completo de validação Portal ⇄ Ops.
 *
 * Passos:
 *   1. Resolve workspace + escolhe uma task linkada ao portal (ou usa a passada)
 *   2. Mede `before`: done/total do milestone do node + project_progress atual
 *   3. Simula evento do Portal chamando `receive-portal-sync` com
 *      event=task_progress, type=task, status=done (mesmo payload que o
 *      trigger automático do banco do Portal envia)
 *   4. Mede `after`: done/total do milestone do node + recomputa project_progress
 *   5. Dispara `sync-to-portal` com event=project_progress pra atualizar o
 *      project_progress geral no Portal
 *   6. Retorna relatório completo (before/after/diff/portalAck)
 *
 * Body opcional: { workspaceId?, nodeId?, restore?: boolean }
 *   - restore=true: ao final, devolve a task ao status anterior (não recomendado
 *     em produção). Default false.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b, null, 2), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const COMPLETED = new Set(["done", "completed", "concluido", "concluída", "concluida"]);

type NodeRow = {
  id: string;
  title: string | null;
  status: string | null;
  parent_node_id: string | null;
  workspace_id: string;
  client_id: string | null;
  data: Record<string, unknown> | null;
};

function kindOf(n: NodeRow) {
  return String((n.data ?? {}).kind ?? "").toLowerCase();
}
function isTaskish(n: NodeRow) {
  const t = (n as any).node_type ?? "";
  const k = kindOf(n);
  return !["client", "ai_orb", "chat_node"].includes(t) && !["project_group", "milestone_group", "chat_node"].includes(k);
}

async function snapshotMilestone(db: any, workspaceId: string, milestoneNodeId: string) {
  const { data: msNode } = await db
    .from("canvas_nodes")
    .select("id, title, data, parent_node_id, node_type, workspace_id, client_id, status")
    .eq("id", milestoneNodeId)
    .single();
  if (!msNode) return null;
  const md = (msNode.data ?? {}) as Record<string, unknown>;
  const mPid = md.portal_milestone_id as string | undefined;
  const mKey = md.milestone_key as string | undefined;
  const mProj = md.portal_project_id as string | undefined;

  const { data: all } = await db
    .from("canvas_nodes")
    .select("id, node_type, title, status, parent_node_id, data")
    .eq("workspace_id", workspaceId);
  const tasks = ((all ?? []) as NodeRow[]).filter((n) => {
    if (!isTaskish(n)) return false;
    if (n.parent_node_id === msNode.id) return true;
    const d = (n.data ?? {}) as Record<string, unknown>;
    if (mPid && d.portal_milestone_id === mPid) return true;
    if (mKey && mProj && d.milestone_key === mKey && d.portal_project_id === mProj) return true;
    return false;
  });
  const done = tasks.filter((t) => COMPLETED.has((t.status ?? "").toLowerCase())).length;
  return {
    milestone_node_id: msNode.id,
    milestone_title: msNode.title,
    portal_milestone_id: mPid ?? null,
    portal_project_id: mProj ?? null,
    total: tasks.length,
    done,
    pct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
  };
}

async function snapshotProject(db: any, workspaceId: string, portalProjectId: string | null) {
  if (!portalProjectId) return null;
  const { data: all } = await db
    .from("canvas_nodes")
    .select("id, node_type, title, status, parent_node_id, data")
    .eq("workspace_id", workspaceId);
  const nodes = (all ?? []) as NodeRow[];
  const tasks = nodes.filter((n) => {
    if (!isTaskish(n)) return false;
    const d = (n.data ?? {}) as Record<string, unknown>;
    return d.portal_project_id === portalProjectId;
  });
  const done = tasks.filter((t) => COMPLETED.has((t.status ?? "").toLowerCase())).length;
  return {
    portal_project_id: portalProjectId,
    total: tasks.length,
    done,
    pct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PORTAL_SECRET = Deno.env.get("PORTAL_WEBHOOK_SECRET") ?? "";

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const steps: Array<{ step: string; ok: boolean; detail?: unknown }> = [];

  try {
    const body = (await req.json().catch(() => ({}))) as {
      workspaceId?: string;
      nodeId?: string;
      restore?: boolean;
    };

    // 1) escolhe node alvo
    let target: NodeRow | null = null;
    if (body.nodeId) {
      const { data } = await db.from("canvas_nodes").select("*").eq("id", body.nodeId).maybeSingle();
      target = (data as NodeRow) ?? null;
    } else if (body.workspaceId) {
      const { data } = await db
        .from("canvas_nodes")
        .select("*")
        .eq("workspace_id", body.workspaceId);
      const candidates = ((data ?? []) as NodeRow[]).filter((n) => {
        const d = (n.data ?? {}) as Record<string, unknown>;
        return isTaskish(n) && typeof d.portal_task_id === "string" && !COMPLETED.has((n.status ?? "").toLowerCase());
      });
      target = candidates[0] ?? null;
    }
    if (!target) {
      return json({ ok: false, error: "Nenhuma task linkada ao portal disponível pra smoke test. Passe nodeId explicitamente ou rode Sync portal antes." }, 400);
    }
    const tdata = (target.data ?? {}) as Record<string, unknown>;
    const portalTaskId = tdata.portal_task_id as string | undefined;
    const portalProjectId = (tdata.portal_project_id as string | undefined) ?? null;
    const portalMilestoneId = (tdata.portal_milestone_id as string | undefined) ?? null;
    const milestoneKey = (tdata.milestone_key as string | undefined) ?? null;
    const milestoneTitle = (tdata.milestone_title as string | undefined) ?? null;
    const previousStatus = target.status ?? "draft";
    steps.push({ step: "pick_target", ok: true, detail: { nodeId: target.id, title: target.title, portalTaskId, portalProjectId, portalMilestoneId, previousStatus } });

    // 2) snapshot BEFORE
    const milestoneNodeId = target.parent_node_id;
    const before = {
      milestone: milestoneNodeId ? await snapshotMilestone(db, target.workspace_id, milestoneNodeId) : null,
      project: await snapshotProject(db, target.workspace_id, portalProjectId),
    };
    steps.push({ step: "snapshot_before", ok: true, detail: before });

    // 3) simula evento do Portal: chama receive-portal-sync internamente
    //    com payload equivalente ao trigger automático (task → done).
    const nowIso = new Date().toISOString();
    const portalPayload = {
      event: "task_progress",
      type: "tasks",
      source: "portal_smoke_test",
      data: {
        id: portalTaskId,
        title: target.title,
        status: "done",
        project_id: portalProjectId,
        milestone_id: portalMilestoneId,
        milestone_title: milestoneTitle,
        milestone_key: milestoneKey,
        updated_at: nowIso,
      },
      context: {},
    };
    const recvUrl = `${SUPABASE_URL}/functions/v1/receive-portal-sync`;
    const recvRes = await fetch(recvUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-webhook-secret": PORTAL_SECRET,
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify(portalPayload),
    });
    const recvText = await recvRes.text();
    let recvBody: unknown;
    try { recvBody = JSON.parse(recvText); } catch { recvBody = recvText.slice(0, 300); }
    steps.push({ step: "portal_to_ops", ok: recvRes.ok, detail: { status: recvRes.status, body: recvBody } });
    if (!recvRes.ok) {
      return json({ ok: false, steps, error: "receive-portal-sync rejected smoke event" }, 502);
    }

    // pequena espera pra realtime/triggers propagarem
    await new Promise((r) => setTimeout(r, 800));

    // 4) snapshot AFTER
    const after = {
      milestone: milestoneNodeId ? await snapshotMilestone(db, target.workspace_id, milestoneNodeId) : null,
      project: await snapshotProject(db, target.workspace_id, portalProjectId),
    };
    steps.push({ step: "snapshot_after", ok: true, detail: after });

    const milestoneOk =
      !!(before.milestone && after.milestone) &&
      after.milestone!.total === before.milestone!.total &&
      after.milestone!.done === before.milestone!.done + 1;
    steps.push({
      step: "verify_milestone",
      ok: milestoneOk,
      detail: {
        expected: before.milestone ? `done ${before.milestone.done}→${before.milestone.done + 1} / total ${before.milestone.total}` : "n/a",
        actual: after.milestone ? `done ${after.milestone.done} / total ${after.milestone.total}` : "n/a",
      },
    });

    // 5) push project_progress de volta ao Portal
    let portalAck: unknown = null;
    if (after.project && portalProjectId) {
      const stpUrl = `${SUPABASE_URL}/functions/v1/sync-to-portal`;
      const ws = await db.from("workspaces").select("id, client_id").eq("id", target.workspace_id).maybeSingle();
      const stpRes = await fetch(stpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({
          event: "project_progress",
          workspaceId: target.workspace_id,
          clientId: (ws as any)?.data?.client_id ?? target.client_id,
          progress: after.project.pct,
          progress_version: Math.floor(Date.now() / 1000),
          calculated_at: new Date().toISOString(),
          portalProjectId,
          message: `[smoke] Progresso recalculado: ${after.project.pct}% (${after.project.done}/${after.project.total})`,
        }),
      });
      const stpText = await stpRes.text();
      try { portalAck = JSON.parse(stpText); } catch { portalAck = stpText.slice(0, 300); }
      steps.push({ step: "ops_to_portal_progress", ok: stpRes.ok, detail: { status: stpRes.status, body: portalAck } });
    } else {
      steps.push({ step: "ops_to_portal_progress", ok: false, detail: "sem portal_project_id no node" });
    }

    // 6) restore opcional
    if (body.restore) {
      await db.from("canvas_nodes").update({ status: previousStatus, updated_at: new Date().toISOString() }).eq("id", target.id);
      steps.push({ step: "restore_status", ok: true, detail: { restoredTo: previousStatus } });
    }

    const allOk = steps.every((s) => s.ok);
    return json({
      ok: allOk,
      summary: {
        node: { id: target.id, title: target.title },
        portalTaskId,
        portalProjectId,
        milestone_done_before: before.milestone?.done ?? null,
        milestone_done_after: after.milestone?.done ?? null,
        milestone_total: after.milestone?.total ?? null,
        project_pct_before: before.project?.pct ?? null,
        project_pct_after: after.project?.pct ?? null,
        portal_progress_pushed: !!portalAck,
      },
      steps,
    });
  } catch (err) {
    return json({ ok: false, error: err instanceof Error ? err.message : String(err), steps }, 500);
  }
});