/**
 * AiManagementPage — dashboard de consumo e gerenciamento de IA.
 * Rota: /ops/ai
 *
 * Seções:
 *   1. Cards de resumo (custo total, requests, erro)
 *   2. Tabela de modelos + preços + capacidade estimada
 *   3. Consumo por cliente (tabela)
 *   4. Consumo por modelo (tabela)
 *   5. Últimos 30 logs
 */
import { useEffect, useState, useMemo } from "react";
import {
  Activity, DollarSign, TrendingUp, AlertCircle, Zap, Brain,
  Users, BarChart3, Clock, RefreshCw, Sparkles,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { GEMINI_MODELS, formatCostUSD, formatCostBRL, estimateClientCapacity, type GeminiModelPricing } from "@/lib/geminiPricing";
import { aggregateUsage, estimateMonthlyCost, type UsageLogEntry } from "@/lib/aiUsageCalc";
import { cn } from "@/lib/utils";

export default function AiManagementPage() {
  const [logs, setLogs] = useState<UsageLogEntry[]>([]);
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "all">("30d");

  const fetchData = async () => {
    setLoading(true);
    const sinceISO = period === "all"
      ? "1900-01-01"
      : new Date(Date.now() - (period === "7d" ? 7 : 30) * 86400000).toISOString();

    const [logRes, clientRes] = await Promise.all([
      supabase
        .from("ai_usage_log")
        .select("*")
        .gte("created_at", sinceISO)
        .order("created_at", { ascending: false })
        .limit(1000),
      supabase.from("clients").select("id, name").order("name"),
    ]);

    if (logRes.data) setLogs(logRes.data as unknown as UsageLogEntry[]);
    if (clientRes.data) setClients(clientRes.data as Array<{ id: string; name: string }>);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [period]);

  const agg = useMemo(() => aggregateUsage(logs), [logs]);
  const clientMap = useMemo(() => new Map(clients.map(c => [c.id, c.name])), [clients]);

  const daysInPeriod = period === "7d" ? 7 : period === "30d" ? 30 : 999;
  const monthlyEstimate = estimateMonthlyCost(agg.totalCostUsd, daysInPeriod);

  return (
    <>
      <AppHeader
        title="Gerenciador de IA"
        subtitle="Consumo, custo por cliente e modelos disponíveis"
      />
      <div className="p-5 space-y-5">
        {/* Filtros */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-border p-0.5">
            {(["7d", "30d", "all"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className={cn("text-xs px-3 py-1.5 rounded transition-colors",
                  period === p ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground")}>
                {p === "7d" ? "7 dias" : p === "30d" ? "30 dias" : "Tudo"}
              </button>
            ))}
          </div>
          <Button onClick={fetchData} variant="ghost" size="sm" className="h-8 gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Atualizar
          </Button>
          <div className="flex-1" />
          <Badge variant="outline" className="text-xs gap-1.5">
            <Sparkles className="h-3 w-3 text-primary" />
            Gemini API
          </Badge>
        </div>

        {/* Cards de resumo */}
        <div className="grid gap-3 md:grid-cols-4">
          <SummaryCard
            icon={Activity}
            label="Requests totais"
            value={agg.totalRequests.toLocaleString("pt-BR")}
            hint={`${period === "7d" ? "últimos 7 dias" : period === "30d" ? "últimos 30 dias" : "total"}`}
            color="#60A5FA"
          />
          <SummaryCard
            icon={DollarSign}
            label="Custo total"
            value={formatCostUSD(agg.totalCostUsd)}
            hint={formatCostBRL(agg.totalCostUsd)}
            color="#10B981"
          />
          <SummaryCard
            icon={TrendingUp}
            label="Estimativa mensal"
            value={formatCostUSD(monthlyEstimate)}
            hint={formatCostBRL(monthlyEstimate)}
            color="#F59E0B"
          />
          <SummaryCard
            icon={AlertCircle}
            label="Taxa de erro"
            value={`${(agg.errorRate * 100).toFixed(1)}%`}
            hint={agg.errorRate > 0.05 ? "⚠️ Acima de 5%" : "Dentro do esperado"}
            color={agg.errorRate > 0.05 ? "#EF4444" : "#94A3B8"}
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="models" className="w-full">
          <TabsList>
            <TabsTrigger value="models">
              <Brain className="h-3.5 w-3.5 mr-1.5" />
              Modelos e preços
            </TabsTrigger>
            <TabsTrigger value="clients">
              <Users className="h-3.5 w-3.5 mr-1.5" />
              Por cliente
            </TabsTrigger>
            <TabsTrigger value="features">
              <Zap className="h-3.5 w-3.5 mr-1.5" />
              Por feature
            </TabsTrigger>
            <TabsTrigger value="logs">
              <Clock className="h-3.5 w-3.5 mr-1.5" />
              Logs recentes
            </TabsTrigger>
          </TabsList>

          {/* Tab: Modelos */}
          <TabsContent value="models">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Modelos Gemini disponíveis — preços oficiais abril/2026</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Preços por 1 milhão de tokens. Capacidade estimada assumindo 50 requests/dia por cliente no free tier.
                </p>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Modelo</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead className="text-right">Input ($/1M)</TableHead>
                        <TableHead className="text-right">Output ($/1M)</TableHead>
                        <TableHead>Free Tier</TableHead>
                        <TableHead className="text-right">Capacidade<br/><span className="text-[9px] font-normal opacity-60">clientes/dia free</span></TableHead>
                        <TableHead>Melhor para</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {GEMINI_MODELS.filter(m => !m.deprecated).map((m) => (
                        <ModelRow key={m.id} model={m} usage={agg.byModel[m.id]} />
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-3 rounded-lg bg-amber-400/5 border border-amber-400/20 px-4 py-2.5">
                  <p className="text-[11px] text-amber-400 leading-relaxed flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>
                      <strong>Gemini 2.0 Flash foi deprecated em março/2026.</strong> Use 2.5 Flash como padrão —
                      é grátis no free tier, 250 requests/dia, qualidade ótima pra chat.
                      Modelos 3.x (Preview) só funcionam com billing ativado no Google Cloud.
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Por cliente */}
          <TabsContent value="clients">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Consumo por cliente</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Custo acumulado de IA por cliente no período selecionado.
                </p>
              </CardHeader>
              <CardContent>
                {Object.keys(agg.byClient).length === 0 ? (
                  <EmptyState message="Nenhum consumo registrado no período." />
                ) : (
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Cliente</TableHead>
                          <TableHead className="text-right">Requests</TableHead>
                          <TableHead className="text-right">Tokens</TableHead>
                          <TableHead className="text-right">Custo USD</TableHead>
                          <TableHead className="text-right">Custo BRL</TableHead>
                          <TableHead className="text-right">Média/request</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(agg.byClient)
                          .sort(([,a], [,b]) => b.costUsd - a.costUsd)
                          .map(([key, data]) => (
                            <TableRow key={key}>
                              <TableCell className="font-medium">
                                {data.clientId ? clientMap.get(data.clientId) ?? "(cliente removido)" : "(sem cliente)"}
                              </TableCell>
                              <TableCell className="text-right tabular-nums">{data.requests}</TableCell>
                              <TableCell className="text-right tabular-nums">{data.tokens.toLocaleString("pt-BR")}</TableCell>
                              <TableCell className="text-right tabular-nums font-semibold">{formatCostUSD(data.costUsd)}</TableCell>
                              <TableCell className="text-right tabular-nums text-muted-foreground">{formatCostBRL(data.costUsd)}</TableCell>
                              <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                                {formatCostUSD(data.costUsd / Math.max(data.requests, 1))}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Por feature */}
          <TabsContent value="features">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Consumo por feature</CardTitle>
              </CardHeader>
              <CardContent>
                {Object.keys(agg.byFeature).length === 0 ? (
                  <EmptyState message="Nenhum uso de feature registrado." />
                ) : (
                  <div className="rounded-lg border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Feature</TableHead>
                          <TableHead className="text-right">Requests</TableHead>
                          <TableHead className="text-right">Tokens</TableHead>
                          <TableHead className="text-right">Custo</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(agg.byFeature).sort(([,a], [,b]) => b.costUsd - a.costUsd).map(([feat, data]) => (
                          <TableRow key={feat}>
                            <TableCell className="font-medium">{feat}</TableCell>
                            <TableCell className="text-right tabular-nums">{data.requests}</TableCell>
                            <TableCell className="text-right tabular-nums">{data.tokens.toLocaleString("pt-BR")}</TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">{formatCostUSD(data.costUsd)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Logs */}
          <TabsContent value="logs">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Últimas 50 requisições</CardTitle>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <EmptyState message="Nenhuma requisição registrada ainda." />
                ) : (
                  <div className="rounded-lg border border-border max-h-[500px] overflow-y-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-36">Quando</TableHead>
                          <TableHead>Cliente</TableHead>
                          <TableHead>Feature</TableHead>
                          <TableHead>Modelo</TableHead>
                          <TableHead className="text-right">Tokens</TableHead>
                          <TableHead className="text-right">Custo</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logs.slice(0, 50).map((log) => (
                          <TableRow key={log.id}>
                            <TableCell className="text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleString("pt-BR", {
                                day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
                              })}
                            </TableCell>
                            <TableCell className="text-xs">
                              {log.client_id ? clientMap.get(log.client_id) ?? "—" : "—"}
                            </TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{log.feature}</Badge></TableCell>
                            <TableCell className="text-xs font-mono">{log.model_used}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {(log.input_tokens ?? 0) + (log.output_tokens ?? 0)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{formatCostUSD(log.cost_usd ?? 0)}</TableCell>
                            <TableCell>
                              {log.status === "success" ? (
                                <Badge className="text-[10px] bg-emerald-400/10 text-emerald-400 border-emerald-400/30">ok</Badge>
                              ) : (
                                <Badge className="text-[10px] bg-red-400/10 text-red-400 border-red-400/30">{log.status}</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, hint, color }: {
  icon: any; label: string; value: string; hint: string; color: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md" style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
            <Icon className="h-3.5 w-3.5" style={{ color }} />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</p>
        </div>
        <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}

function ModelRow({ model, usage }: { model: GeminiModelPricing; usage?: { requests: number; tokens: number; costUsd: number } }) {
  const tierColors: Record<string, string> = {
    pro: "#F59E0B", flash: "#60A5FA", lite: "#94A3B8", exp: "#A78BFA",
  };
  const capacity = estimateClientCapacity(model.id, 50);

  return (
    <TableRow>
      <TableCell className="font-medium">
        <div className="flex items-center gap-2">
          <span>{model.displayName}</span>
          {model.recommended && (
            <Badge className="text-[9px] h-4 px-1.5 bg-primary/15 text-primary border-primary/30">⭐ Recomendado</Badge>
          )}
        </div>
        {usage && (
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {usage.requests} requests · {formatCostUSD(usage.costUsd)}
          </p>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className="text-[10px] uppercase"
          style={{ borderColor: tierColors[model.tier], color: tierColors[model.tier] }}
        >
          {model.tier}
        </Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums text-xs">${model.inputPrice.toFixed(2)}</TableCell>
      <TableCell className="text-right tabular-nums text-xs">${model.outputPrice.toFixed(2)}</TableCell>
      <TableCell>
        {model.freeTier ? (
          <div className="text-[10px]">
            <span className="text-emerald-400 font-semibold">✓ Free</span>
            <span className="text-muted-foreground ml-1.5">{model.freeRpm} RPM · {model.freeRpd}/dia</span>
          </div>
        ) : (
          <span className="text-[10px] text-amber-400">Requer billing</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {capacity > 0 ? (
          <span className="text-sm font-semibold">{capacity}</span>
        ) : (
          <span className="text-[10px] text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground max-w-xs">
        {model.bestFor}
      </TableCell>
    </TableRow>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <BarChart3 className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
