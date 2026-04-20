/**
 * LancamentoNodeDrawer
 *
 * Wrapper especializado pra nodes "lancamento". Mostra uma timeline visual
 * de pré-launch baseada na data do go-live (campo `scope.date` do prefill):
 *
 *   T-7 → T-3 → T-1 → D-Day → T+1
 *
 * Cada marco mostra os itens do checklist `prelaunch.items` distribuídos
 * por proximidade do go-live + indica o que já foi feito.
 */
import { useMemo } from "react";
import SpecializedNodeDrawer from "./SpecializedNodeDrawer";
import { getNodeBlueprint } from "./nodeBlueprints";
import { Badge } from "@/components/ui/badge";
import { Rocket, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import type { NodePrefillPayload } from "./nodePrefillTypes";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  onDelete?: (id: string) => Promise<void> | void;
  onGenerateTasks?: () => void;
  onGoLive?: () => void;
  onCreateSnapshot?: () => void;
}

interface ChecklistItem { id: string; text: string; done: boolean }

interface Milestone {
  id: string;
  label: string;
  daysOffset: number;
  hint: string;
  date: Date | null;
  items: ChecklistItem[];
}

const MILESTONE_TEMPLATE: Array<{ id: string; label: string; daysOffset: number; hint: string }> = [
  { id: "tm7",  label: "T-7",   daysOffset: -7, hint: "Setup técnico + criativos prontos" },
  { id: "tm3",  label: "T-3",   daysOffset: -3, hint: "QA final + tracking validado" },
  { id: "tm1",  label: "T-1",   daysOffset: -1, hint: "Comunicação aquecida + plano B" },
  { id: "d0",   label: "D-Day", daysOffset:  0, hint: "Go-live coordenado" },
  { id: "tp1",  label: "T+1",   daysOffset:  1, hint: "Monitoramento + retro inicial" },
];

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  // tenta ISO direto
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso;
  // tenta formato BR dd/mm/yyyy
  const m = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    const [, d, mo, y] = m;
    const yr = y.length === 2 ? 2000 + parseInt(y) : parseInt(y);
    const dt = new Date(yr, parseInt(mo) - 1, parseInt(d));
    if (!isNaN(dt.getTime())) return dt;
  }
  return null;
}

function offsetDate(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** Distribui os checklist items entre os 5 marcos por keywords simples */
function bucketize(items: ChecklistItem[]): Record<string, ChecklistItem[]> {
  const buckets: Record<string, ChecklistItem[]> = { tm7: [], tm3: [], tm1: [], d0: [], tp1: [] };
  const KW: Record<string, RegExp> = {
    tm7: /\b(setup|design|copy|criativ|integra|configur|aprovac|aprova[cç][aã]o)\b/i,
    tm3: /\b(qa|teste|tracking|backup|redirect|revisao|revis[aã]o|valida[cç][aã]o)\b/i,
    tm1: /\b(comunica[cç][aã]o|aquecimento|email|aviso|warm|plano b|rollback)\b/i,
    d0:  /\b(go.?live|publica|ativa[cç][aã]o|deploy|lan[cç]amento|abrir)\b/i,
    tp1: /\b(monitor|retro|p[oó]s|m[eé]trica|primeir[oa]s 24|alerta)\b/i,
  };
  for (const it of items) {
    let placed = false;
    for (const key of ["d0","tm1","tm3","tp1","tm7"]) {
      if (KW[key].test(it.text)) { buckets[key].push(it); placed = true; break; }
    }
    if (!placed) buckets.tm7.push(it); // fallback: cedo
  }
  return buckets;
}

export default function LancamentoNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, onDelete,
  onGenerateTasks, onGoLive, onCreateSnapshot,
}: Props) {
  const blueprint = getNodeBlueprint("lancamento");

  const prefill = useMemo<NodePrefillPayload | null>(() => {
    const meta = node.metadata as Record<string, unknown> | null;
    return (meta?.prefill as NodePrefillPayload | null) ?? null;
  }, [node.metadata]);

  const goLiveDate = useMemo(() => {
    const dateField = prefill?.sections?.scope?.fields?.date;
    const raw = typeof dateField?.value === "string" ? dateField.value : null;
    return parseDate(raw);
  }, [prefill]);

  const checklistItems: ChecklistItem[] = useMemo(() => {
    const f = prefill?.sections?.prelaunch?.fields?.items;
    if (!f || !Array.isArray(f.value)) return [];
    return (f.value as Array<{ id: string; text: string; done: boolean }>).filter((i) => i?.text);
  }, [prefill]);

  const milestones: Milestone[] = useMemo(() => {
    const buckets = bucketize(checklistItems);
    return MILESTONE_TEMPLATE.map((t) => ({
      ...t,
      date: goLiveDate ? offsetDate(goLiveDate, t.daysOffset) : null,
      items: buckets[t.id] ?? [],
    }));
  }, [checklistItems, goLiveDate]);

  const totalItems = checklistItems.length;
  const doneItems = checklistItems.filter((i) => i.done).length;
  const progressPct = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  if (!blueprint) return null;

  const handlers = {
    ...(onGenerateTasks  && { generate_tasks: onGenerateTasks }),
    ...(onGoLive         && { go_live: onGoLive }),
    ...(onCreateSnapshot && { create_snapshot: onCreateSnapshot }),
  };

  const extraSlot = (
    <div className="space-y-3">
      {/* ─── Header timeline ─── */}
      <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 p-3">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-md bg-pink-500/15 border border-pink-500/30 flex items-center justify-center">
              <Rocket className="h-3.5 w-3.5 text-pink-400" />
            </div>
            <div>
              <p className="text-xs font-semibold">Timeline de pré-launch</p>
              <p className="text-[10px] text-muted-foreground">
                {goLiveDate
                  ? `Go-live em ${fmtDate(goLiveDate)} — ${totalItems} itens (${progressPct}% prontos)`
                  : "Defina data do go-live em 'Detalhes' pra montar a timeline"}
              </p>
            </div>
          </div>
          {totalItems > 0 && (
            <div className="text-right shrink-0">
              <p className="text-base font-bold text-pink-400 tabular-nums leading-none">{progressPct}%</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">{doneItems}/{totalItems}</p>
            </div>
          )}
        </div>

        {/* Linha visual */}
        <div className="relative">
          <div className="absolute top-3 left-3 right-3 h-px bg-border" />
          <div className="relative grid grid-cols-5 gap-1">
            {milestones.map((m) => {
              const isDday = m.id === "d0";
              const itemsDone = m.items.filter((i) => i.done).length;
              const itemsTotal = m.items.length;
              const fullyDone = itemsTotal > 0 && itemsDone === itemsTotal;
              const allEmpty = itemsTotal === 0;
              return (
                <div key={m.id} className="flex flex-col items-center text-center">
                  <div className={cn(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center bg-background z-10 transition-colors",
                    isDday  ? "border-pink-500 bg-pink-500/20" :
                    fullyDone ? "border-emerald-500 bg-emerald-500/20" :
                    allEmpty ? "border-border" :
                    "border-amber-500 bg-amber-500/10",
                  )}>
                    {isDday ? <Rocket className="h-3 w-3 text-pink-400" /> :
                     fullyDone ? <CheckCircle2 className="h-3 w-3 text-emerald-400" /> :
                     allEmpty ? <Clock className="h-3 w-3 text-muted-foreground" /> :
                     <AlertTriangle className="h-3 w-3 text-amber-400" />}
                  </div>
                  <p className={cn(
                    "text-[10px] font-semibold mt-1.5",
                    isDday && "text-pink-400",
                  )}>{m.label}</p>
                  <p className="text-[9px] text-muted-foreground tabular-nums">{fmtDate(m.date)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Detalhes por marco ─── */}
      <div className="space-y-2">
        {milestones.map((m) => {
          if (m.items.length === 0) return null;
          const isDday = m.id === "d0";
          return (
            <div key={m.id} className={cn(
              "rounded-md border p-2.5",
              isDday ? "border-pink-500/40 bg-pink-500/5" : "border-border bg-card/40",
            )}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={cn(
                    "text-[9px]",
                    isDday && "border-pink-500/40 text-pink-400",
                  )}>{m.label} · {fmtDate(m.date)}</Badge>
                  <span className="text-[10px] text-muted-foreground">{m.hint}</span>
                </div>
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {m.items.filter((i) => i.done).length}/{m.items.length}
                </span>
              </div>
              <ul className="space-y-0.5">
                {m.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-1.5 text-[11px]">
                    {it.done ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-400 mt-0.5 shrink-0" />
                    ) : (
                      <div className="h-3 w-3 rounded-full border border-border mt-0.5 shrink-0" />
                    )}
                    <span className={cn(
                      "leading-snug",
                      it.done ? "line-through text-muted-foreground" : "text-foreground",
                    )}>{it.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <SpecializedNodeDrawer
      node={node}
      open={open}
      onOpenChange={onOpenChange}
      workspaceId={workspaceId}
      clientId={clientId}
      blueprintOverride={blueprint}
      quickActionHandlers={handlers}
      onDelete={onDelete}
      extraSlot={extraSlot}
    />
  );
}
