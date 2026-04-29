/**
 * ClientEssentialBriefing — briefing perene do cliente (não do workspace).
 *
 * Mora em clients.metadata.essential_briefing.
 * Conteúdo estável: identidade, ICP, posicionamento, diferencial.
 * Todos os workspaces do cliente usam esse briefing como CONTEXTO BASE.
 *
 * Usado em: ClientsPage (edit dialog), ClientVaultPage, CreateClientDialog.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Building2, Target, Sparkles, Loader2, Save, FileText,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { syncBriefingUpdatedForClient } from "./syncToPortalEvents";

interface EssentialBriefing {
  positioning: string;
  differential: string;
  icp: string;
  main_pains: string;
  goals_12m: string;
  success_metric: string;
  revenue_range: string;
  team_size: string;
  maturity_digital: string;
  ai_readiness: string;
  updated_at?: string;
}

const DEFAULT: EssentialBriefing = {
  positioning: "", differential: "", icp: "", main_pains: "",
  goals_12m: "", success_metric: "", revenue_range: "",
  team_size: "", maturity_digital: "media", ai_readiness: "media",
};

const REVENUE_RANGES = [
  "Até R$ 20k/mês", "R$ 20k-50k/mês", "R$ 50k-200k/mês",
  "R$ 200k-500k/mês", "R$ 500k-1M/mês", "R$ 1M-5M/mês", "R$ 5M+/mês",
];

const TEAM_SIZES = [
  "Solo (1 pessoa)", "2-5 pessoas", "6-15 pessoas",
  "16-50 pessoas", "51-200 pessoas", "200+",
];

const MATURITY_LEVELS = [
  { k: "baixa",  l: "Baixa — começando do zero" },
  { k: "media",  l: "Média — tem presença mas sem método" },
  { k: "alta",   l: "Alta — já opera digitalmente bem" },
];

const AI_READINESS = [
  { k: "baixa",  l: "Baixa — nunca usou IA no negócio" },
  { k: "media",  l: "Média — usa ChatGPT pessoal mas sem estrutura" },
  { k: "alta",   l: "Alta — já tem algum agente ou automação com IA" },
];

interface Props {
  clientId: string;
  /** Pass clients.metadata from parent to avoid extra fetch */
  initialMetadata?: Record<string, unknown> | null;
  onSaved?: () => void;
}

export default function ClientEssentialBriefing({ clientId, initialMetadata, onSaved }: Props) {
  const [data, setData] = useState<EssentialBriefing>(DEFAULT);
  const [loading, setLoading] = useState(!initialMetadata);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    if (initialMetadata) {
      const eb = (initialMetadata?.essential_briefing as EssentialBriefing | undefined) ?? DEFAULT;
      setData({ ...DEFAULT, ...eb });
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: row } = await supabase.from("clients")
      .select("metadata").eq("id", clientId).single();
    const eb = ((row?.metadata as Record<string, unknown> | null)?.essential_briefing as EssentialBriefing | undefined) ?? DEFAULT;
    setData({ ...DEFAULT, ...eb });
    setLoading(false);
  }, [clientId, initialMetadata]);

  useEffect(() => { load(); }, [load]);

  const patch = (p: Partial<EssentialBriefing>) => {
    setData((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      // Read current metadata, merge essential_briefing, write back
      const { data: row } = await supabase.from("clients").select("metadata").eq("id", clientId).single();
      const currentMeta = (row?.metadata as Record<string, unknown> | null) ?? {};
      const updatedEb: EssentialBriefing = { ...data, updated_at: new Date().toISOString() };
      const nextMeta = { ...currentMeta, essential_briefing: updatedEb };
      const { error } = await supabase.from("clients")
        .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error) throw error;
      syncBriefingUpdatedForClient(clientId);
      toast({ title: "Briefing salvo", description: "Todos os workspaces deste cliente usam este contexto." });
      setDirty(false);
      onSaved?.();
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally { setSaving(false); }
  };

  const completeness = useCallback(() => {
    const fields: Array<keyof EssentialBriefing> = [
      "positioning", "differential", "icp", "main_pains",
      "goals_12m", "success_metric", "revenue_range", "team_size",
    ];
    const filled = fields.filter((f) => (data[f] ?? "").toString().trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
  }, [data]);

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );

  const pct = completeness();

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 px-5 py-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Briefing Essencial do cliente</p>
              <p className="text-[11px] text-muted-foreground">
                Base de contexto perene. Usado por todos os workspaces deste cliente.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className={cn("text-sm font-bold tabular-nums",
                pct === 100 ? "text-emerald-400" : pct > 50 ? "text-primary" : "text-amber-400"
              )}>{pct}%</p>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider">completo</p>
            </div>
            {data.updated_at && (
              <Badge variant="outline" className="text-[10px]">
                {new Date(data.updated_at).toLocaleDateString("pt-BR")}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Identidade e posicionamento */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Building2 className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Identidade e posicionamento</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Posicionamento atual do cliente</label>
            <Textarea value={data.positioning} onChange={e => patch({ positioning: e.target.value })}
              placeholder="Como o cliente se posiciona hoje no mercado"
              rows={2} className="text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Diferencial real</label>
            <Textarea value={data.differential} onChange={e => patch({ differential: e.target.value })}
              placeholder="O que ele entrega que concorrente não entrega"
              rows={2} className="text-sm resize-none" />
          </div>
        </div>
      </div>

      {/* ICP e mercado */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Cliente ideal e dores do mercado</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">ICP (perfil do cliente ideal dele)</label>
            <Textarea value={data.icp} onChange={e => patch({ icp: e.target.value })}
              placeholder="Perfil, dores, momento de compra, objeções, canais onde está"
              rows={3} className="text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Principais dores que ele resolve</label>
            <Textarea value={data.main_pains} onChange={e => patch({ main_pains: e.target.value })}
              placeholder="3-5 dores concretas que o produto dele resolve"
              rows={3} className="text-sm resize-none" />
          </div>
        </div>
      </div>

      {/* Objetivos */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Objetivos e métrica de sucesso</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Objetivo para os próximos 12 meses</label>
            <Textarea value={data.goals_12m} onChange={e => patch({ goals_12m: e.target.value })}
              placeholder="Ex: Dobrar faturamento / Estruturar time / Ser referência no nicho"
              rows={2} className="text-sm resize-none" />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Métrica principal de sucesso</label>
            <Input value={data.success_metric} onChange={e => patch({ success_metric: e.target.value })}
              placeholder="Ex: R$ X/mês · Y clientes/mês · Z% conversão" className="h-8 text-sm" />
          </div>
        </div>
      </div>

      {/* Perfil empresarial e maturidade */}
      <div className="rounded-xl border border-border bg-card px-5 py-4 space-y-3">
        <div className="flex items-center gap-2 mb-1">
          <FileText className="h-3.5 w-3.5 text-primary" />
          <p className="text-sm font-semibold text-foreground">Perfil e maturidade</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Faixa de faturamento</label>
            <Select value={data.revenue_range} onValueChange={v => patch({ revenue_range: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                {REVENUE_RANGES.map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Tamanho do time</label>
            <Select value={data.team_size} onValueChange={v => patch({ team_size: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
              <SelectContent>
                {TEAM_SIZES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Maturidade digital</label>
            <Select value={data.maturity_digital} onValueChange={v => patch({ maturity_digital: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MATURITY_LEVELS.map(m => <SelectItem key={m.k} value={m.k} className="text-xs">{m.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">Prontidão para IA</label>
            <Select value={data.ai_readiness} onValueChange={v => patch({ ai_readiness: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AI_READINESS.map(a => <SelectItem key={a.k} value={a.k} className="text-xs">{a.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Save */}
      <div className="sticky bottom-0 flex items-center justify-end gap-2 rounded-lg bg-card/95 border border-border px-4 py-2 backdrop-blur-sm">
        {dirty && (
          <span className="flex items-center gap-1.5 text-xs text-amber-400 mr-auto">
            <AlertCircle className="h-3 w-3" />
            Alterações não salvas
          </span>
        )}
        {!dirty && data.updated_at && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-auto">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            Salvo · {new Date(data.updated_at).toLocaleDateString("pt-BR")}
          </span>
        )}
        <Button onClick={save} disabled={saving || !dirty} size="sm" className="h-8 text-xs gap-1.5">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Salvar briefing
        </Button>
      </div>
    </div>
  );
}
