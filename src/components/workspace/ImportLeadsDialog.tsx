/**
 * ImportLeadsDialog — importa leads do portal (quiz submissions) como clientes no Ops.
 *
 * Fluxo:
 *  1. Abre dialog → busca submissions do portal via portal-proxy
 *  2. Lista leads com ICP Score, plano recomendado, dados do briefing
 *  3. Usuário seleciona quais importar
 *  4. Para cada selecionado:
 *     - Cria cliente no Ops com essential_briefing populado
 *     - Marca submission como processed no portal
 *     - (Opcional) cria workspace inicial
 */
import { useState, useEffect, useCallback } from "react";
import {
  Users, CheckCircle2, Loader2, RefreshCw, AlertCircle, Target,
  Sparkles, Mail, Phone, Building, FileText, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getICPLevelColor, getICPLevelLabel } from "@/lib/icpFitScore";
import { cn } from "@/lib/utils";

interface PortalSubmission {
  id: string;
  token: string;
  lead_name: string;
  lead_email: string;
  lead_whatsapp: string | null;
  lead_company: string | null;
  positioning: string | null;
  differential: string | null;
  icp: string | null;
  main_pains: string | null;
  goals_12m: string | null;
  success_metric: string | null;
  revenue_range: string | null;
  team_size: string | null;
  maturity_digital: string | null;
  ai_readiness: string | null;
  icp_fit_score: number | null;
  recommended_plan: string | null;
  submitted_at: string;
  status: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}

export default function ImportLeadsDialog({ open, onOpenChange, onImported }: Props) {
  const [submissions, setSubmissions] = useState<PortalSubmission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState(true);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("portal-proxy", {
        body: { path: "ops-quiz-list" },
      });
      if (fnError) throw new Error(fnError.message);
      if (data?.error) {
        setError(data.hint ?? data.error);
        return;
      }
      setSubmissions((data?.submissions ?? []) as PortalSubmission[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchSubmissions();
    else { setSelected(new Set()); setError(null); }
  }, [open, fetchSubmissions]);

  const filtered = submissions.filter((s) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.lead_name ?? "").toLowerCase().includes(q) ||
      (s.lead_company ?? "").toLowerCase().includes(q) ||
      (s.lead_email ?? "").toLowerCase().includes(q)
    );
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((s) => s.id)));
  };

  const handleImport = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    const toImport = submissions.filter((s) => selected.has(s.id));
    let imported = 0;
    const errors: string[] = [];

    for (const sub of toImport) {
      try {
        // 1. Criar cliente no Ops com essential_briefing populado
        const essentialBriefing = {
          positioning: sub.positioning ?? "",
          differential: sub.differential ?? "",
          icp: sub.icp ?? "",
          main_pains: sub.main_pains ?? "",
          goals_12m: sub.goals_12m ?? "",
          success_metric: sub.success_metric ?? "",
          revenue_range: sub.revenue_range ?? "",
          team_size: sub.team_size ?? "",
          maturity_digital: sub.maturity_digital ?? "media",
          ai_readiness: sub.ai_readiness ?? "media",
          updated_at: new Date().toISOString(),
        };

        const { data: client, error: cErr } = await supabase
          .from("clients")
          .insert({
            name: sub.lead_name,
            company_name: sub.lead_company,
            status: "onboarding",
            plan_name: sub.recommended_plan ?? "starter",
            metadata: {
              essential_briefing: essentialBriefing,
              lead_email: sub.lead_email,
              lead_whatsapp: sub.lead_whatsapp,
              source_portal_token: sub.token,
              icp_fit_on_entry: sub.icp_fit_score,
            },
          })
          .select("id")
          .single();

        if (cErr) throw new Error(cErr.message);
        if (!client) throw new Error("Cliente não retornado após insert");

        // 2. Opcional: criar workspace inicial
        if (createWorkspace) {
          await supabase.from("workspaces").insert({
            client_id: client.id,
            name: `${sub.lead_name} — Workspace`,
            status: "setup",
            current_stage: "entrada",
          });
        }

        // 3. Marcar submission como processed no portal
        try {
          await supabase.functions.invoke("portal-proxy", {
            body: { path: "ops-quiz-mark-processed", body: { submission_id: sub.id } },
          });
        } catch { /* best effort */ }

        imported++;
      } catch (err) {
        errors.push(`${sub.lead_name}: ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    setImporting(false);
    if (imported > 0) {
      toast({
        title: `${imported} lead${imported > 1 ? "s" : ""} importado${imported > 1 ? "s" : ""}`,
        description: createWorkspace ? "Workspaces também foram criados." : "Clientes criados com essential_briefing populado.",
      });
      onImported?.();
      onOpenChange(false);
    }
    if (errors.length > 0) {
      toast({
        title: `${errors.length} erro${errors.length > 1 ? "s" : ""}`,
        description: errors.slice(0, 3).join(" · "),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            Importar leads do portal
          </DialogTitle>
          <DialogDescription className="text-xs">
            Leads que responderam o quiz público no aceleriq.online. Importar = criar cliente + preencher essential_briefing + (opcional) criar workspace.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-5 py-2 border-b border-border shrink-0 flex items-center gap-2 bg-secondary/20">
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa ou email..." className="h-8 text-xs max-w-sm" />
          <div className="flex-1" />
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={createWorkspace} onCheckedChange={(v) => setCreateWorkspace(v === true)} />
            Criar workspace ao importar
          </label>
          <Button onClick={fetchSubmissions} size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" disabled={loading}>
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Atualizar
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Buscando submissions do portal...
            </div>
          ) : error ? (
            <div className="px-5 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-amber-400">Não consegui acessar o portal</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {submissions.length === 0 ? "Nenhum lead pendente de importação." : "Nenhum resultado para a busca."}
              </p>
              {submissions.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60 mt-1">
                  Envie o link do quiz a leads para receber submissions aqui.
                </p>
              )}
            </div>
          ) : (
            <>
              {/* Select all */}
              <div className="px-5 py-2 border-b border-border/40 flex items-center gap-2 bg-secondary/10 sticky top-0 z-10">
                <Checkbox
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onCheckedChange={toggleAll}
                />
                <span className="text-[11px] text-muted-foreground">
                  {selected.size} de {filtered.length} selecionado{selected.size !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="p-3 space-y-2">
                {filtered.map((sub) => (
                  <LeadCard
                    key={sub.id}
                    sub={sub}
                    selected={selected.has(sub.id)}
                    onToggle={() => toggleSelect(sub.id)}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
          <p className="text-[11px] text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} lead${selected.size > 1 ? "s" : ""} serão importados como clientes${createWorkspace ? " + workspaces" : ""}`
              : "Selecione leads para importar"}
          </p>
          <div className="flex-1" />
          <Button onClick={() => onOpenChange(false)} variant="ghost" size="sm" className="h-8 text-xs">
            Cancelar
          </Button>
          <Button onClick={handleImport} disabled={selected.size === 0 || importing} size="sm"
            className="h-8 text-xs gap-1.5">
            {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Importar {selected.size > 0 ? `${selected.size} ` : ""}lead{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Lead card ──

function LeadCard({ sub, selected, onToggle }: {
  sub: PortalSubmission;
  selected: boolean;
  onToggle: () => void;
}) {
  const score = sub.icp_fit_score ?? 0;
  const level = score >= 80 ? "ideal" : score >= 60 ? "good" : score >= 40 ? "moderate" : "red_flag";
  const scoreColor = getICPLevelColor(level as any);
  const scoreLabel = getICPLevelLabel(level as any);

  const planLabel = {
    starter: "Fundação",
    growth: "Aceleração",
    enterprise: "Escala IA-First",
  }[sub.recommended_plan ?? "starter"] ?? sub.recommended_plan;

  return (
    <div
      onClick={onToggle}
      className={cn(
        "rounded-lg border p-3 cursor-pointer transition-colors",
        selected
          ? "border-primary/50 bg-primary/5"
          : "border-border hover:bg-secondary/30"
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {sub.lead_name}
                {sub.lead_company && (
                  <span className="text-xs text-muted-foreground ml-1.5">· {sub.lead_company}</span>
                )}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                {sub.lead_email && <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{sub.lead_email}</span>}
                {sub.lead_whatsapp && <span className="flex items-center gap-1"><Phone className="h-2.5 w-2.5" />{sub.lead_whatsapp}</span>}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="flex items-center gap-1 justify-end">
                <Target className="h-3 w-3" style={{ color: scoreColor }} />
                <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor }}>{score}</span>
              </div>
              <p className="text-[10px] text-muted-foreground">{scoreLabel}</p>
            </div>
          </div>

          {/* Meta badges */}
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {sub.recommended_plan && (
              <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                <Sparkles className="h-2.5 w-2.5" /> Sugestão: {planLabel}
              </Badge>
            )}
            {sub.revenue_range && (
              <Badge variant="outline" className="text-[10px]">
                {sub.revenue_range}
              </Badge>
            )}
            {sub.team_size && (
              <Badge variant="outline" className="text-[10px]">
                {sub.team_size}
              </Badge>
            )}
            <Badge variant="outline" className="text-[10px] text-muted-foreground/60">
              {new Date(sub.submitted_at).toLocaleDateString("pt-BR")}
            </Badge>
          </div>

          {/* Preview do positioning/icp */}
          {(sub.positioning || sub.icp) && (
            <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 leading-snug">
              {sub.positioning && <span><strong className="text-foreground/70">Posicionamento:</strong> {sub.positioning}</span>}
              {sub.icp && <span className="ml-2"><strong className="text-foreground/70">ICP:</strong> {sub.icp}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
