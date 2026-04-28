/**
 * ImportLeadsDialog — importa leads que o portal empurrou pro Ops.
 *
 * Lê da tabela local `pending_leads` (alimentada via webhook do portal).
 * Não depende de chamar o portal — tudo é local no Ops.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Users, CheckCircle2, Loader2, RefreshCw, AlertCircle, Target,
  Sparkles, Mail, Phone, X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getICPLevelColor, getICPLevelLabel } from "@/lib/icpFitScore";
import { PROJECT_TYPE_OPTIONS, type ProjectType } from "@/lib/projectTypes";
import ProjectTypeBadge from "./ProjectTypeBadge";
import { cn } from "@/lib/utils";

interface PendingLead {
  id: string;
  token: string;
  portal_submission_id: string | null;
  lead_name: string;
  lead_email: string | null;
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
  const [leads, setLeads] = useState<PendingLead[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState(true);
  const [selectedType, setSelectedType] = useState<ProjectType>("ai_first");

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("pending_leads")
      .select("*")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false });
    if (!error && data) setLeads(data as PendingLead[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) fetchLeads();
    else { setSelected(new Set()); }
  }, [open, fetchLeads]);

  // Realtime — novos leads aparecem automaticamente
  useEffect(() => {
    if (!open) return;
    const channel = supabase
      .channel("pending-leads-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pending_leads" },
        () => fetchLeads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [open, fetchLeads]);

  const filtered = leads.filter((s) => {
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
    const toImport = leads.filter((s) => selected.has(s.id));
    let imported = 0;
    const errors: string[] = [];

    for (const lead of toImport) {
      try {
        const essentialBriefing = {
          positioning: lead.positioning ?? "",
          differential: lead.differential ?? "",
          icp: lead.icp ?? "",
          main_pains: lead.main_pains ?? "",
          goals_12m: lead.goals_12m ?? "",
          success_metric: lead.success_metric ?? "",
          revenue_range: lead.revenue_range ?? "",
          team_size: lead.team_size ?? "",
          maturity_digital: lead.maturity_digital ?? "media",
          ai_readiness: lead.ai_readiness ?? "media",
          updated_at: new Date().toISOString(),
        };

        const { data: client, error: cErr } = await supabase
          .from("clients")
          .insert({
            name: lead.lead_name,
            company_name: lead.lead_company,
            status: "onboarding",
            plan_name: lead.recommended_plan ?? "starter",
            project_type: selectedType,
            metadata: {
              essential_briefing: essentialBriefing,
              lead_email: lead.lead_email,
              lead_whatsapp: lead.lead_whatsapp,
              source_portal_token: lead.token,
              portal_submission_id: lead.portal_submission_id,
              icp_fit_on_entry: lead.icp_fit_score,
            },
          })
          .select("id")
          .single();

        if (cErr) throw new Error(cErr.message);
        if (!client) throw new Error("Cliente não retornado");

        if (createWorkspace) {
          const { data: ws } = await supabase.from("workspaces").insert({
            client_id: client.id,
            name: `${lead.lead_name} — Workspace`,
            status: "setup",
            current_stage: "entrada",
            project_type: selectedType,
            metadata: {
              portal_sync: {
                auto_created: true,
                source: "lead_import",
                imported_at: new Date().toISOString(),
              },
            },
          }).select("id").single();

          // Cria timeline event de boas-vindas
          if (ws) {
            await supabase.from("timeline_events").insert({
              workspace_id: ws.id,
              client_id: client.id,
              event_type: "workspace_created",
              title: "Workspace criado via importação de lead",
              happened_at: new Date().toISOString(),
              metadata: { source: "lead_import", portal_token: lead.token },
            });
          }
        }

        // Marca lead como importado (não some, fica registrado)
        await supabase.from("pending_leads")
          .update({ status: "imported", imported_at: new Date().toISOString() })
          .eq("id", lead.id);

        imported++;
      } catch (err) {
        errors.push(`${lead.lead_name}: ${err instanceof Error ? err.message : "erro"}`);
      }
    }

    setImporting(false);
    if (imported > 0) {
      toast({
        title: `${imported} lead${imported > 1 ? "s" : ""} importado${imported > 1 ? "s" : ""}`,
        description: createWorkspace ? "Clientes + workspaces criados." : "Clientes criados.",
      });
      onImported?.();
      onOpenChange(false);
    }
    if (errors.length > 0) {
      toast({ title: `${errors.length} erro${errors.length > 1 ? "s" : ""}`, description: errors.slice(0, 3).join(" · "), variant: "destructive" });
    }
  };

  const handleDiscard = async (leadId: string) => {
    if (!window.confirm("Descartar este lead? Ele não aparecerá mais aqui.")) return;
    await supabase.from("pending_leads")
      .update({ status: "discarded", imported_at: new Date().toISOString() })
      .eq("id", leadId);
    fetchLeads();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 border border-primary/30">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            Leads pendentes
          </DialogTitle>
          <DialogDescription className="text-xs">
            Leads enviados pelo portal que ainda não foram importados como clientes. Atualização em tempo real.
          </DialogDescription>
        </DialogHeader>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-border shrink-0 flex items-center gap-2 bg-secondary/20 flex-wrap">
          <Input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, empresa ou email..." className="h-8 text-xs max-w-sm" />
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Importar como:</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as ProjectType)}
              className="h-8 text-xs rounded-md border border-border bg-background px-2"
            >
              {PROJECT_TYPE_OPTIONS.map((opt) => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox checked={createWorkspace} onCheckedChange={(v) => setCreateWorkspace(v === true)} />
            Criar workspace
          </label>
          <Button onClick={fetchLeads} size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" disabled={loading}>
            <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} /> Atualizar
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Carregando leads...
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                {leads.length === 0 ? "Nenhum lead pendente." : "Nenhum resultado para a busca."}
              </p>
              <p className="text-[11px] text-muted-foreground/60 mt-1">
                Quando alguém responder o quiz no portal, aparece aqui automaticamente.
              </p>
            </div>
          ) : (
            <>
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
                {filtered.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} selected={selected.has(lead.id)}
                    onToggle={() => toggleSelect(lead.id)}
                    onDiscard={() => handleDiscard(lead.id)} />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center gap-2 shrink-0">
          <p className="text-[11px] text-muted-foreground">
            {selected.size > 0
              ? `${selected.size} lead${selected.size > 1 ? "s" : ""} serão importados${createWorkspace ? " + workspaces" : ""}`
              : "Selecione leads para importar"}
          </p>
          <div className="flex-1" />
          <Button onClick={() => onOpenChange(false)} variant="ghost" size="sm" className="h-8 text-xs">Cancelar</Button>
          <Button onClick={handleImport} disabled={selected.size === 0 || importing} size="sm" className="h-8 text-xs gap-1.5">
            {importing ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Importar {selected.size > 0 ? `${selected.size} ` : ""}lead{selected.size !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LeadCard({ lead, selected, onToggle, onDiscard }: {
  lead: PendingLead;
  selected: boolean;
  onToggle: () => void;
  onDiscard: () => void;
}) {
  const score = lead.icp_fit_score ?? 0;
  const level = score >= 80 ? "ideal" : score >= 60 ? "good" : score >= 40 ? "moderate" : "red_flag";
  const scoreColor = getICPLevelColor(level as any);
  const scoreLabel = getICPLevelLabel(level as any);
  const planLabel = {
    starter: "Fundação", growth: "Aceleração", enterprise: "Escala IA-First",
  }[lead.recommended_plan ?? "starter"] ?? lead.recommended_plan;

  return (
    <div onClick={onToggle}
      className={cn("rounded-lg border p-3 cursor-pointer transition-colors group",
        selected ? "border-primary/50 bg-primary/5" : "border-border hover:bg-secondary/30")}>
      <div className="flex items-start gap-3">
        <Checkbox checked={selected} onCheckedChange={onToggle} onClick={(e) => e.stopPropagation()} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {lead.lead_name}
                {lead.lead_company && <span className="text-xs text-muted-foreground ml-1.5">· {lead.lead_company}</span>}
              </p>
              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                {lead.lead_email && <span className="flex items-center gap-1"><Mail className="h-2.5 w-2.5" />{lead.lead_email}</span>}
                {lead.lead_whatsapp && (
                  <a href={`https://wa.me/${lead.lead_whatsapp.replace(/\D/g,"")}`} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 hover:text-primary">
                    <Phone className="h-2.5 w-2.5" />{lead.lead_whatsapp}
                  </a>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right shrink-0">
                <div className="flex items-center gap-1 justify-end">
                  <Target className="h-3 w-3" style={{ color: scoreColor }} />
                  <span className="text-sm font-bold tabular-nums" style={{ color: scoreColor }}>{score}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">{scoreLabel}</p>
              </div>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); onDiscard(); }}
                className="h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                title="Descartar lead">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap mt-2">
            {lead.recommended_plan && (
              <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
                <Sparkles className="h-2.5 w-2.5" /> Sugestão: {planLabel}
              </Badge>
            )}
            {lead.revenue_range && <Badge variant="outline" className="text-[10px]">{lead.revenue_range}</Badge>}
            {lead.team_size && <Badge variant="outline" className="text-[10px]">{lead.team_size}</Badge>}
            <Badge variant="outline" className="text-[10px] text-muted-foreground/60">
              {new Date(lead.submitted_at).toLocaleDateString("pt-BR")}
            </Badge>
          </div>
          {(lead.positioning || lead.icp) && (
            <p className="text-[11px] text-muted-foreground mt-2 line-clamp-2 leading-snug">
              {lead.positioning && <span><strong className="text-foreground/70">Posicionamento:</strong> {lead.positioning}</span>}
              {lead.icp && <span className="ml-2"><strong className="text-foreground/70">ICP:</strong> {lead.icp}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
