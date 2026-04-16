import { useState, useEffect, useCallback, useMemo } from "react";
import {
  FileText, Clock, ListChecks, Layers, BarChart3,
  CheckCircle2, AlertTriangle, ArrowRight, TrendingUp,
  DollarSign, CalendarClock, Plus, X,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { getStagePremiumLabel } from "./aceleraConstants";
import { getBucketLabel, getBucketColor, getExecutionLabel, getExecutionColor } from "./frontConstants";

interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  happened_at: string;
}

interface WorkspaceTabResumoProps {
  clientName: string;
  companyName: string | null;
  workspaceName: string;
  status: string;
  currentStage: string;
  ownerName: string | null;
  planName: string | null;
  segment: string | null;
  createdAt: string;
  focusAreas: string[] | null;
  clientId: string;
  clientMetadata: Record<string, unknown> | null;
  summary: string | null;
  recentEvents: TimelineEvent[];
  workspaceId: string;
}

const PLAN_PRICING: Record<string, { label: string; monthly: number; extras: string[] }> = {
  starter: { label: "Starter", monthly: 1497, extras: [] },
  growth: { label: "Growth", monthly: 2997, extras: ["Automações básicas", "Suporte prioritário"] },
  enterprise: { label: "Enterprise", monthly: 5997, extras: ["Automações avançadas", "Suporte dedicado", "Consultoria estratégica", "IA personalizada"] },
};

interface FrontSummary {
  total: number;
  active: number;
  conditional: number;
  out_of_scope: number;
}

interface TaskStats {
  total: number;
  done: number;
  in_progress: number;
  blocked: number;
  todo: number;
}

export default function WorkspaceTabResumo({
  clientName, companyName, workspaceName, status, currentStage, ownerName, planName, segment, createdAt, focusAreas, clientId, clientMetadata, summary, recentEvents, workspaceId,
}: WorkspaceTabResumoProps) {
  const [taskStats, setTaskStats] = useState<TaskStats>({ total: 0, done: 0, in_progress: 0, blocked: 0, todo: 0 });
  const [frontSummary, setFrontSummary] = useState<FrontSummary>({ total: 0, active: 0, conditional: 0, out_of_scope: 0 });
  const [briefingCount, setBriefingCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [customExtras, setCustomExtras] = useState<string[]>((clientMetadata?.custom_extras as string[] | undefined) ?? []);
  const [newExtra, setNewExtra] = useState("");
  const [savingExtras, setSavingExtras] = useState(false);

  const fetchStats = useCallback(async () => {
    const [taskRes, frontRes, briefRes] = await Promise.all([
      supabase.from("tasks").select("id, status").eq("workspace_id", workspaceId),
      supabase.from("operational_fronts").select("id, bucket_status").eq("workspace_id", workspaceId),
      supabase.from("context_entries").select("id, metadata").eq("workspace_id", workspaceId).eq("context_type", "briefing"),
    ]);

    const tasks = taskRes.data ?? [];
    setTaskStats({
      total: tasks.length,
      done: tasks.filter((t: any) => t.status === "done").length,
      in_progress: tasks.filter((t: any) => t.status === "in_progress").length,
      blocked: tasks.filter((t: any) => t.status === "blocked").length,
      todo: tasks.filter((t: any) => t.status === "todo" || t.status === "backlog").length,
    });

    const fronts = frontRes.data ?? [];
    setFrontSummary({
      total: fronts.length,
      active: fronts.filter((f: any) => f.bucket_status === "active").length,
      conditional: fronts.filter((f: any) => f.bucket_status === "conditional").length,
      out_of_scope: fronts.filter((f: any) => f.bucket_status === "out_of_scope").length,
    });

    const briefs = briefRes.data ?? [];
    setBriefingCount(briefs.length);
    setReviewedCount(briefs.filter((b: any) => (b.metadata as Record<string, unknown>)?.import_review_status === "reviewed").length);
  }, [workspaceId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  const taskPct = taskStats.total > 0 ? Math.round((taskStats.done / taskStats.total) * 100) : 0;

  const planInfo = PLAN_PRICING[planName ?? ""] ?? null;

  const renewalDate = useMemo(() => {
    if (!createdAt) return null;
    const start = new Date(createdAt);
    const now = new Date();
    // Next renewal = nearest future month anniversary
    const renewal = new Date(start);
    while (renewal <= now) renewal.setMonth(renewal.getMonth() + 1);
    return renewal;
  }, [createdAt]);

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero info */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Empresa</p>
              <h2 className="text-xl font-bold text-foreground">{companyName || clientName}</h2>
              {companyName && companyName !== clientName && (
                <p className="text-sm text-muted-foreground mt-0.5">Cliente: <span className="text-foreground font-medium">{clientName}</span></p>
              )}
              <p className="text-sm text-muted-foreground mt-1">Workspace: <span className="text-foreground font-medium">{workspaceName}</span></p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-xs px-3 py-1 capitalize">{status}</Badge>
              <Badge variant="outline" className="text-xs px-3 py-1 bg-primary/10 text-primary border-primary/20">
                {getStagePremiumLabel(currentStage)}
              </Badge>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Contextual info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Responsável</p>
              <p className="text-foreground font-medium">{ownerName || "Não definido"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Plano</p>
              <p className="text-foreground font-medium capitalize">{planInfo?.label ?? planName ?? "Não definido"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Segmento</p>
              <p className="text-foreground font-medium">{segment || "Não definido"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Início</p>
              <p className="text-foreground font-medium">
                {new Date(createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
              </p>
            </div>
          </div>

          {/* Plan value & renewal */}
          {planInfo && (
            <>
              <Separator className="my-4" />
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div className="flex items-start gap-2.5">
                  <DollarSign className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Valor Mensal</p>
                    <p className="text-lg font-bold text-foreground">
                      R$ {planInfo.monthly.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CalendarClock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Próxima Renovação</p>
                    <p className="text-foreground font-medium">
                      {renewalDate?.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" }) ?? "—"}
                    </p>
                  </div>
                </div>
                {planInfo.extras.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1.5">Adicionais Inclusos</p>
                    <div className="flex flex-wrap gap-1.5">
                      {planInfo.extras.map((extra) => (
                        <Badge key={extra} variant="secondary" className="text-xs">{extra}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Focus areas */}
          {focusAreas && focusAreas.length > 0 && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-2">Áreas de Foco</p>
                <div className="flex flex-wrap gap-2">
                  {focusAreas.map((area) => (
                    <Badge key={area} variant="secondary" className="text-xs capitalize">{area.replace(/_/g, " ")}</Badge>
                  ))}
                </div>
              </div>
            </>
          )}

          {summary && (
            <>
              <Separator className="my-4" />
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Resumo Executivo</p>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{summary}</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Stats grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Tasks */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Tasks</span>
            </div>
            {taskStats.total === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma task criada.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-foreground">{taskPct}%</span>
                  <span className="text-xs text-muted-foreground">concluído</span>
                </div>
                <Progress value={taskPct} className="h-2" />
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-muted-foreground">{taskStats.done} concluídas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-blue-400" />
                    <span className="text-muted-foreground">{taskStats.in_progress} em andamento</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-violet-400" />
                    <span className="text-muted-foreground">{taskStats.todo} pendentes</span>
                  </div>
                  {taskStats.blocked > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-red-400" />
                      <span className="text-muted-foreground">{taskStats.blocked} bloqueadas</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fronts */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Layers className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Frentes Operacionais</span>
            </div>
            {frontSummary.total === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma frente criada.</p>
            ) : (
              <div className="space-y-3">
                <span className="text-2xl font-bold text-foreground">{frontSummary.total}</span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-muted-foreground">{frontSummary.active} ativas</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-muted-foreground">{frontSummary.conditional} condicionais</span>
                  </div>
                  {frontSummary.out_of_scope > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                      <span className="text-muted-foreground">{frontSummary.out_of_scope} fora do plano</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Briefings / Base */}
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Base de Contexto</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Briefings</span>
                <span className="text-foreground font-medium">{briefingCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Revisados</span>
                <span className="text-emerald-400 font-medium">{reviewedCount}</span>
              </div>
              {briefingCount > 0 && reviewedCount < briefingCount && (
                <div className="flex items-center gap-1.5 text-amber-400 mt-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{briefingCount - reviewedCount} pendente(s) de revisão</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent events */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Atividade Recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum evento registrado.</p>
          ) : (
            <div className="space-y-3">
              {recentEvents.slice(0, 8).map((ev) => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/50" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{ev.title}</p>
                    {ev.description && (
                      <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">{ev.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(ev.happened_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={muted ? "text-muted-foreground" : "text-foreground"}>{value}</span>
    </div>
  );
}
