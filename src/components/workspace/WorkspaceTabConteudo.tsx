import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Filter,
  PenTool, ExternalLink, RefreshCw, Layers,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import ProjectNodeDrawer from "./ProjectNodeDrawer";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface Props {
  workspaceId: string;
  clientId: string;
  onTimelineRefresh?: () => Promise<void> | void;
}

interface ConteudoNode extends CanvasNodeRecord {
  parent_node_id?: string | null;
}

const PT_MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const PT_WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function addMonths(d: Date, n: number) { return new Date(d.getFullYear(), d.getMonth() + n, 1); }
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Try to extract a publish date from node data (multiple fallback fields). */
function extractPublishDate(data: Record<string, unknown> | null | undefined): Date | null {
  if (!data) return null;
  const candidates = [
    data.publish_at, data.publishAt, data.publish_date, data.publishDate,
    data.scheduled_at, data.date, data.publicacao, data.data_publicacao,
  ];
  for (const raw of candidates) {
    if (typeof raw !== "string" || !raw.trim()) continue;
    // Try ISO first
    const d = new Date(raw);
    if (!isNaN(d.getTime())) return d;
    // Try dd/mm/yyyy
    const m = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) {
      const [, dd, mm, yy] = m;
      const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
      const dt = new Date(year, Number(mm) - 1, Number(dd));
      if (!isNaN(dt.getTime())) return dt;
    }
  }
  return null;
}

function strField(data: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!data) return "";
  for (const k of keys) {
    const v = data[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

const channelColor = (channel: string): string => {
  const k = channel.toLowerCase();
  if (k.includes("instagram") || k.includes("ig")) return "border-pink-500/40 bg-pink-500/10 text-pink-200";
  if (k.includes("tiktok")) return "border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200";
  if (k.includes("youtube") || k.includes("yt")) return "border-red-500/40 bg-red-500/10 text-red-200";
  if (k.includes("linkedin") || k.includes("in")) return "border-sky-500/40 bg-sky-500/10 text-sky-200";
  if (k.includes("email") || k.includes("e-mail") || k.includes("newsletter")) return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  if (k.includes("blog") || k.includes("artigo")) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (k.includes("x") || k.includes("twitter") || k.includes("thread")) return "border-zinc-400/40 bg-zinc-400/10 text-zinc-200";
  if (k.includes("podcast")) return "border-violet-500/40 bg-violet-500/10 text-violet-200";
  return "border-border bg-muted/20 text-muted-foreground";
};

export default function WorkspaceTabConteudo({ workspaceId, clientId, onTimelineRefresh }: Props) {
  const [nodes, setNodes] = useState<ConteudoNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<Date>(startOfMonth(new Date()));
  const [selectedNode, setSelectedNode] = useState<ConteudoNode | null>(null);
  const [view, setView] = useState<"month" | "list" | "kanban">("month");

  const [channelFilter, setChannelFilter] = useState<Set<string>>(new Set());
  const [pillarFilter, setPillarFilter] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("canvas_nodes")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at");

    if (!error && data) {
      const filtered = (data as ConteudoNode[]).filter((n) => {
        const d = (n.data ?? {}) as Record<string, unknown>;
        return d.kind === "conteudo";
      });
      setNodes(filtered);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [workspaceId]);

  // Derive distinct channels and pillars
  const allChannels = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      const ch = strField(n.data, "primary_channel", "channel");
      if (ch) set.add(ch);
    });
    return Array.from(set).sort();
  }, [nodes]);

  const allPillars = useMemo(() => {
    const set = new Set<string>();
    nodes.forEach((n) => {
      const p = strField(n.data, "pillar", "campaign");
      if (p) set.add(p);
    });
    return Array.from(set).sort();
  }, [nodes]);

  // Apply filters
  const visibleNodes = useMemo(() => {
    return nodes.filter((n) => {
      const ch = strField(n.data, "primary_channel", "channel");
      const p = strField(n.data, "pillar", "campaign");
      if (channelFilter.size > 0 && !channelFilter.has(ch)) return false;
      if (pillarFilter.size > 0 && !pillarFilter.has(p)) return false;
      return true;
    });
  }, [nodes, channelFilter, pillarFilter]);

  // Group nodes by date for the month view
  const monthData = useMemo(() => {
    const start = startOfMonth(cursor);
    const startWeekday = start.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: Array<{ date: Date | null; nodes: ConteudoNode[] }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null, nodes: [] });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), d);
      const dayNodes = visibleNodes.filter((n) => {
        const dt = extractPublishDate(n.data as Record<string, unknown>);
        return dt && isSameDay(dt, date);
      });
      cells.push({ date, nodes: dayNodes });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, nodes: [] });

    const undated = visibleNodes.filter((n) => !extractPublishDate(n.data as Record<string, unknown>));
    return { cells, undated };
  }, [cursor, visibleNodes]);

  // Counts
  const totalScheduled = visibleNodes.filter((n) => extractPublishDate(n.data as Record<string, unknown>)).length;

  if (loading) return <LoadingState />;

  if (nodes.length === 0) {
    return (
      <EmptyState
        icon={PenTool}
        title="Sem peças de conteúdo ainda"
        description="Crie nodes do tipo 'Conteúdo' no Canvas e eles aparecerão automaticamente aqui no calendário editorial."
      />
    );
  }

  const monthLabel = `${PT_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const toggleSet = (set: Set<string>, value: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value); else next.add(value);
    setter(next);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header: navigation + filters + view toggle */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, -1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-[180px] text-center">
            <div className="text-base font-semibold capitalize">{monthLabel}</div>
            <div className="text-xs text-muted-foreground">
              {totalScheduled} agendado{totalScheduled === 1 ? "" : "s"} · {visibleNodes.length} total
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Hoje
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <FilterPopover
            label="Canal"
            options={allChannels}
            selected={channelFilter}
            onToggle={(v) => toggleSet(channelFilter, v, setChannelFilter)}
            onClear={() => setChannelFilter(new Set())}
          />
          <FilterPopover
            label="Pilar"
            options={allPillars}
            selected={pillarFilter}
            onToggle={(v) => toggleSet(pillarFilter, v, setPillarFilter)}
            onClear={() => setPillarFilter(new Set())}
          />
          <Button variant="ghost" size="icon" onClick={fetchData} title="Recarregar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
        <TabsList>
          <TabsTrigger value="month"><CalendarIcon className="h-3.5 w-3.5 mr-1.5" />Mês</TabsTrigger>
          <TabsTrigger value="list"><Filter className="h-3.5 w-3.5 mr-1.5" />Lista</TabsTrigger>
          <TabsTrigger value="kanban"><Layers className="h-3.5 w-3.5 mr-1.5" />Pilar</TabsTrigger>
        </TabsList>

        <TabsContent value="month">
          {/* Month grid */}
          <Card className="overflow-hidden">
            <div className="grid grid-cols-7 border-b border-border bg-muted/20">
              {PT_WEEKDAYS.map((w) => (
                <div key={w} className="px-2 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground text-center">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {monthData.cells.map((cell, idx) => {
                const today = cell.date && isSameDay(cell.date, new Date());
                return (
                  <div
                    key={idx}
                    className={`min-h-[120px] border-r border-b border-border p-1.5 ${cell.date ? "" : "bg-muted/10"}`}
                  >
                    {cell.date && (
                      <>
                        <div className={`text-[11px] mb-1 px-1 ${today ? "font-bold text-primary" : "text-muted-foreground"}`}>
                          {cell.date.getDate()}
                        </div>
                        <div className="space-y-1">
                          {cell.nodes.slice(0, 3).map((n) => (
                            <CalendarChip key={n.id} node={n} onClick={() => setSelectedNode(n)} />
                          ))}
                          {cell.nodes.length > 3 && (
                            <div className="text-[10px] text-muted-foreground px-1">
                              +{cell.nodes.length - 3} mais
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          {monthData.undated.length > 0 && (
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Sem data definida</div>
                <Badge variant="outline">{monthData.undated.length}</Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {monthData.undated.map((n) => (
                  <ContentRowCard key={n.id} node={n} onClick={() => setSelectedNode(n)} />
                ))}
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="list">
          <Card className="p-0 overflow-hidden">
            <ScrollArea className="max-h-[640px]">
              <div className="divide-y divide-border">
                {visibleNodes
                  .slice()
                  .sort((a, b) => {
                    const da = extractPublishDate(a.data as Record<string, unknown>);
                    const db_ = extractPublishDate(b.data as Record<string, unknown>);
                    if (!da && !db_) return 0;
                    if (!da) return 1;
                    if (!db_) return -1;
                    return da.getTime() - db_.getTime();
                  })
                  .map((n) => (
                    <ContentListRow key={n.id} node={n} onClick={() => setSelectedNode(n)} />
                  ))}
              </div>
            </ScrollArea>
          </Card>
        </TabsContent>

        <TabsContent value="kanban">
          <KanbanByPillar nodes={visibleNodes} onSelect={setSelectedNode} />
        </TabsContent>
      </Tabs>

      {selectedNode && (
        <ProjectNodeDrawer
          open={true}
          onOpenChange={(o) => { if (!o) setSelectedNode(null); }}
          node={selectedNode as never}
          workspaceId={workspaceId}
          clientFolders={
            selectedNode.parent_node_id
              ? [{ id: selectedNode.parent_node_id, name: "Cliente", linkedClientId: clientId }]
              : [{ id: "__virtual__", name: "Cliente", linkedClientId: clientId }]
          }
          onDelete={async (id: string) => {
            await supabase.from("canvas_nodes").delete().eq("id", id);
            await fetchData();
            setSelectedNode(null);
          }}
          onUpdated={async () => {
            await fetchData();
            await onTimelineRefresh?.();
          }}
        />
      )}
    </div>
  );
}

/* ─── Subcomponents ─── */

function CalendarChip({ node, onClick }: { node: ConteudoNode; onClick: () => void }) {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const channel = strField(data, "primary_channel", "channel") || "—";
  const format = strField(data, "format");
  return (
    <button
      onClick={onClick}
      className={`w-full text-left text-[10.5px] leading-tight px-1.5 py-1 rounded border ${channelColor(channel)} truncate hover:brightness-110 transition`}
      title={`${node.title}${format ? ` · ${format}` : ""}`}
    >
      <div className="font-medium truncate">{node.title}</div>
      <div className="opacity-70 truncate">{channel}{format ? ` · ${format}` : ""}</div>
    </button>
  );
}

function ContentRowCard({ node, onClick }: { node: ConteudoNode; onClick: () => void }) {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const channel = strField(data, "primary_channel", "channel");
  const pillar = strField(data, "pillar", "campaign");
  return (
    <button
      onClick={onClick}
      className="text-left p-2.5 rounded border border-border bg-card hover:bg-muted/30 transition"
    >
      <div className="text-sm font-medium truncate">{node.title}</div>
      <div className="flex flex-wrap gap-1 mt-1.5">
        {channel && <Badge variant="outline" className={`text-[10px] ${channelColor(channel)}`}>{channel}</Badge>}
        {pillar && <Badge variant="outline" className="text-[10px]">{pillar}</Badge>}
      </div>
    </button>
  );
}

function ContentListRow({ node, onClick }: { node: ConteudoNode; onClick: () => void }) {
  const data = (node.data ?? {}) as Record<string, unknown>;
  const channel = strField(data, "primary_channel", "channel");
  const pillar = strField(data, "pillar", "campaign");
  const format = strField(data, "format");
  const dt = extractPublishDate(data);
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition"
    >
      <div className="w-20 text-xs text-muted-foreground shrink-0">
        {dt ? dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) : "—"}
      </div>
      <PenTool className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{node.title}</div>
        <div className="flex flex-wrap gap-1.5 mt-0.5 text-[11px] text-muted-foreground">
          {channel && <span>{channel}</span>}
          {format && <span>· {format}</span>}
          {pillar && <span>· {pillar}</span>}
        </div>
      </div>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
    </button>
  );
}

function KanbanByPillar({ nodes, onSelect }: { nodes: ConteudoNode[]; onSelect: (n: ConteudoNode) => void }) {
  const groups = useMemo(() => {
    const map = new Map<string, ConteudoNode[]>();
    nodes.forEach((n) => {
      const p = strField(n.data, "pillar", "campaign") || "Sem pilar";
      if (!map.has(p)) map.set(p, []);
      map.get(p)!.push(n);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [nodes]);

  if (groups.length === 0) {
    return <EmptyState icon={Layers} title="Sem itens visíveis" description="Ajuste os filtros para ver peças agrupadas por pilar." />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {groups.map(([pillar, items]) => (
        <Card key={pillar} className="p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold truncate">{pillar}</div>
            <Badge variant="outline">{items.length}</Badge>
          </div>
          <div className="space-y-1.5">
            {items.map((n) => <ContentRowCard key={n.id} node={n} onClick={() => onSelect(n)} />)}
          </div>
        </Card>
      ))}
    </div>
  );
}

function FilterPopover({
  label, options, selected, onToggle, onClear,
}: {
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Filter className="h-3.5 w-3.5" />
          {label}
          {selected.size > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{selected.size}</Badge>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="end">
        {options.length === 0 ? (
          <div className="text-xs text-muted-foreground px-2 py-3 text-center">Nenhuma opção disponível</div>
        ) : (
          <>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {options.map((opt) => (
                <label key={opt} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer">
                  <Checkbox checked={selected.has(opt)} onCheckedChange={() => onToggle(opt)} />
                  <span className="text-sm truncate">{opt}</span>
                </label>
              ))}
            </div>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" className="w-full mt-1" onClick={onClear}>
                Limpar
              </Button>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
