/**
 * SyncLogsPage — auditoria de sincronização Portal ⇄ Ops.
 *
 * Mostra cada evento (created/updated/deleted), direção, status HTTP do
 * Portal, mensagem e o body cru de payload/response. Filtros por evento,
 * status, direção, workspace e portal_task_id. Polling automático a cada
 * 5s (toggle on/off) — útil pra acompanhar smoke tests e debugar realtime.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDownToLine, ArrowUpFromLine, RefreshCw, Loader2, Pause, Play, Filter, Copy, Check } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type AuditEntry = {
  id: string;
  created_at: string;
  direction: "portal_to_ops" | "ops_to_portal" | "internal" | string;
  event: string;
  status: "ok" | "skipped" | "error" | string;
  workspace_id: string | null;
  client_id: string | null;
  node_id: string | null;
  portal_project_id: string | null;
  portal_task_id: string | null;
  portal_milestone_id: string | null;
  http_status: number | null;
  message: string | null;
  payload: unknown;
  response: unknown;
  duration_ms: number | null;
  source: string | null;
};

const EVENT_OPTIONS = [
  { value: "all", label: "Todos eventos" },
  { value: "node_created", label: "node_created" },
  { value: "node_updated", label: "node_updated" },
  { value: "node_deleted", label: "node_deleted" },
  { value: "task_upsert", label: "task_upsert" },
  { value: "task_deleted", label: "task_deleted" },
  { value: "project_progress", label: "project_progress" },
  { value: "pull_portal_tasks", label: "pull_portal_tasks" },
  { value: "smoke_test_cycle", label: "smoke_test_cycle" },
];

const STATUS_OPTIONS = [
  { value: "all", label: "Todos status" },
  { value: "ok", label: "OK" },
  { value: "error", label: "Erro" },
  { value: "skipped", label: "Skipped" },
];

const DIRECTION_OPTIONS = [
  { value: "all", label: "Ambas direções" },
  { value: "ops_to_portal", label: "Ops → Portal" },
  { value: "portal_to_ops", label: "Portal → Ops" },
  { value: "internal", label: "Internas" },
];

function statusBadge(status: string, http: number | null) {
  const variant: "default" | "destructive" | "secondary" | "outline" =
    status === "error" ? "destructive" : status === "skipped" ? "secondary" : "default";
  const label = http ? `${status.toUpperCase()} · ${http}` : status.toUpperCase();
  return <Badge variant={variant} className="font-mono text-[10px]">{label}</Badge>;
}

function directionIcon(direction: string) {
  if (direction === "ops_to_portal") return <ArrowUpFromLine className="h-3.5 w-3.5 text-primary" />;
  if (direction === "portal_to_ops") return <ArrowDownToLine className="h-3.5 w-3.5 text-blue-400" />;
  return <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleTimeString()}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

function JsonBlock({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    if (data == null) return "—";
    try { return JSON.stringify(data, null, 2); } catch { return String(data); }
  }, [data]);
  if (data == null) return <p className="text-xs text-muted-foreground italic">vazio</p>;
  return (
    <div className="relative">
      <button
        onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
        className="absolute top-1.5 right-1.5 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
        title="Copiar JSON"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </button>
      <pre className="max-h-72 overflow-auto rounded bg-secondary/40 p-2 pr-8 font-mono text-[11px] text-foreground/90 whitespace-pre-wrap break-all">{text}</pre>
    </div>
  );
}

export default function SyncLogsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [event, setEvent] = useState<string>(params.get("event") ?? "all");
  const [status, setStatus] = useState<string>(params.get("status") ?? "all");
  const [direction, setDirection] = useState<string>(params.get("direction") ?? "all");
  const [workspaceId, setWorkspaceId] = useState<string>(params.get("workspaceId") ?? "");
  const [portalTaskId, setPortalTaskId] = useState<string>(params.get("portalTaskId") ?? "");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const syncParams = useCallback(() => {
    const next = new URLSearchParams();
    if (event !== "all") next.set("event", event);
    if (status !== "all") next.set("status", status);
    if (direction !== "all") next.set("direction", direction);
    if (workspaceId) next.set("workspaceId", workspaceId);
    if (portalTaskId) next.set("portalTaskId", portalTaskId);
    setParams(next, { replace: true });
  }, [event, status, direction, workspaceId, portalTaskId, setParams]);

  const fetchLogs = useCallback(async () => {
    setError(null);
    const body: Record<string, unknown> = { limit: 200 };
    if (event !== "all") body.event = event;
    if (status !== "all") body.status = status;
    if (direction !== "all") body.direction = direction;
    if (workspaceId.trim()) body.workspaceId = workspaceId.trim();
    if (portalTaskId.trim()) body.portalTaskId = portalTaskId.trim();
    const { data, error: invErr } = await supabase.functions.invoke("list-sync-audit", { body });
    if (invErr) {
      setError(invErr.message);
      setLoading(false);
      return;
    }
    const r = data as { entries?: AuditEntry[]; error?: string };
    if (r?.error) setError(r.error);
    setEntries(Array.isArray(r?.entries) ? r.entries : []);
    setLoading(false);
  }, [event, status, direction, workspaceId, portalTaskId]);

  useEffect(() => { syncParams(); }, [syncParams]);
  useEffect(() => { setLoading(true); fetchLogs(); }, [fetchLogs]);
  useEffect(() => {
    if (!autoRefresh) return;
    const t = window.setInterval(() => { fetchLogs(); }, 5000);
    return () => window.clearInterval(t);
  }, [autoRefresh, fetchLogs]);

  const counts = useMemo(() => {
    const ok = entries.filter((e) => e.status === "ok").length;
    const err = entries.filter((e) => e.status === "error").length;
    const skip = entries.filter((e) => e.status === "skipped").length;
    return { ok, err, skip, total: entries.length };
  }, [entries]);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sync-audit-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${entries.length} eventos exportados`);
  };

  return (
    <>
      <AppHeader
        title="Logs de sincronização"
        subtitle="Auditoria de cada evento Portal ⇄ Ops com status HTTP, payload e resposta"
      />
      <div className="flex-1 overflow-auto p-6 space-y-4">
        {/* Filtros */}
        <div className="rounded-lg border border-border bg-card/50 p-3 flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Direção</label>
            <Select value={direction} onValueChange={setDirection}>
              <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{DIRECTION_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Evento</label>
            <Select value={event} onValueChange={setEvent}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{EVENT_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUS_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Workspace ID</label>
            <Input value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} placeholder="uuid…" className="h-8 w-[260px] font-mono text-xs" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Portal task ID</label>
            <Input value={portalTaskId} onChange={(e) => setPortalTaskId(e.target.value)} placeholder="uuid…" className="h-8 w-[260px] font-mono text-xs" />
          </div>
          <div className="ml-auto flex items-end gap-2">
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setEvent("all"); setStatus("all"); setDirection("all"); setWorkspaceId(""); setPortalTaskId(""); }}>
              <Filter className="h-3.5 w-3.5 mr-1" />Limpar
            </Button>
            <Button size="sm" variant={autoRefresh ? "default" : "outline"} className="h-8 text-xs" onClick={() => setAutoRefresh((a) => !a)}>
              {autoRefresh ? <Pause className="h-3.5 w-3.5 mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              {autoRefresh ? "Auto 5s" : "Pausado"}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setLoading(true); fetchLogs(); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" />Atualizar
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={exportJson} disabled={entries.length === 0}>
              Exportar
            </Button>
          </div>
        </div>

        {/* Resumo */}
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>Total: <span className="text-foreground font-medium">{counts.total}</span></span>
          <span>·</span>
          <span className="text-primary">OK: {counts.ok}</span>
          <span>·</span>
          <span className="text-destructive">Erros: {counts.err}</span>
          <span>·</span>
          <span>Skipped: {counts.skip}</span>
          {error && (<><span>·</span><span className="text-destructive">{error}</span></>)}
        </div>

        {/* Lista */}
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="grid grid-cols-[110px_30px_1fr_120px_120px_80px] gap-2 px-3 py-2 border-b border-border bg-secondary/30 text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
            <span>Hora</span>
            <span></span>
            <span>Evento · mensagem</span>
            <span>Status</span>
            <span>Workspace</span>
            <span className="text-right">Duração</span>
          </div>
          {loading && entries.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhum evento com esses filtros.</div>
          ) : (
            entries.map((e) => {
              const expanded = expandedId === e.id;
              return (
                <div key={e.id} className="border-b border-border last:border-b-0">
                  <button
                    onClick={() => setExpandedId(expanded ? null : e.id)}
                    className={`w-full grid grid-cols-[110px_30px_1fr_120px_120px_80px] gap-2 px-3 py-2 text-left text-xs hover:bg-secondary/30 transition-colors ${expanded ? "bg-secondary/40" : ""}`}
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">{formatTime(e.created_at)}</span>
                    <span className="flex items-center justify-center">{directionIcon(e.direction)}</span>
                    <span className="truncate">
                      <span className="font-mono text-foreground">{e.event}</span>
                      {e.message && <span className="text-muted-foreground"> · {e.message}</span>}
                    </span>
                    <span>{statusBadge(e.status, e.http_status)}</span>
                    <span className="font-mono text-[10px] text-muted-foreground truncate">
                      {e.workspace_id ? e.workspace_id.slice(0, 8) : "—"}
                    </span>
                    <span className="text-right text-muted-foreground">{e.duration_ms != null ? `${e.duration_ms}ms` : "—"}</span>
                  </button>
                  {expanded && (
                    <div className="grid grid-cols-2 gap-3 px-3 py-3 bg-background/60 border-t border-border">
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Metadados</div>
                        <div className="grid grid-cols-[110px_1fr] gap-x-2 gap-y-1 text-[11px] font-mono">
                          <span className="text-muted-foreground">direction</span><span>{e.direction}</span>
                          <span className="text-muted-foreground">source</span><span>{e.source ?? "—"}</span>
                          <span className="text-muted-foreground">http</span><span>{e.http_status ?? "—"}</span>
                          <span className="text-muted-foreground">workspace</span><span className="break-all">{e.workspace_id ?? "—"}</span>
                          <span className="text-muted-foreground">node</span><span className="break-all">{e.node_id ?? "—"}</span>
                          <span className="text-muted-foreground">portal_task</span><span className="break-all">{e.portal_task_id ?? "—"}</span>
                          <span className="text-muted-foreground">portal_milestone</span><span className="break-all">{e.portal_milestone_id ?? "—"}</span>
                          <span className="text-muted-foreground">portal_project</span><span className="break-all">{e.portal_project_id ?? "—"}</span>
                        </div>
                        {e.workspace_id && (
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={(ev) => { ev.stopPropagation(); navigate(`/ops/workspaces/${e.workspace_id}`); }}>
                            Abrir workspace
                          </Button>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Payload enviado</div>
                        <JsonBlock data={e.payload} />
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">Resposta do Portal</div>
                        <JsonBlock data={e.response} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}