/**
 * NodeDrawers — todos os drawers específicos por tipo de node.
 * Cada um tem visual, campos, lógica e ações únicas.
 * Exporta: LandingPageDrawer, CRMDrawer, AutomacaoDrawer, ConteudoDrawer,
 *          TrafegoPagoDrawer, IAAgentDrawerV2, MetricaDrawerV2, ObjetivoDrawer,
 *          CaseDrawer, DecisaoDrawer, BeforeAfterDrawer, ConteudoSocialDrawer
 */
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, FolderKanban, Workflow, PenTool, Megaphone, Bot,
  BarChart3, Target, Trophy, Scale, Sparkles, Mail, Video,
  Globe, ExternalLink, Copy, Link2, CheckCircle2, Circle,
  Loader2, Plus, Trash2, RefreshCw, Check,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  NodeDrawerShell, NodeSection, NodeField, NodeAction, useSaveNode,
  type NodeDrawerProps,
} from "./NodeDrawerBase";

// ─── Helpers ─────────────────────────────────────────────────

function useNodeData<T extends Record<string, unknown>>(
  node: NodeDrawerProps["node"],
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const raw = (node.data as Record<string, unknown>) ?? {};
  const [vals, setVals] = useState<T>({ ...defaults, ...raw } as T);
  const patch = useCallback((p: Partial<T>) => setVals(v => ({ ...v, ...p })), []);
  return [vals, patch];
}

function FieldInput({ label, value, onChange, placeholder, hint, multiline, rows }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; multiline?: boolean; rows?: number;
}) {
  return (
    <NodeField label={label} hint={hint}>
      {multiline ? (
        <Textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          rows={rows ?? 3} className="text-sm bg-white/5 border-white/10 text-white/80 placeholder:text-white/25 resize-none focus-visible:ring-0 focus-visible:border-white/20" />
      ) : (
        <Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="h-8 text-sm bg-white/5 border-white/10 text-white/80 placeholder:text-white/25 focus-visible:ring-0 focus-visible:border-white/20" />
      )}
    </NodeField>
  );
}

function ChecklistField({ label, items, onChange, accent }: {
  label: string; items: string[]; onChange: (items: string[]) => void; accent: string;
}) {
  const [newItem, setNewItem] = useState("");
  const [done, setDone] = useState<Set<number>>(new Set());
  const toggleDone = (i: number) => setDone(prev => {
    const next = new Set(prev);
    next.has(i) ? next.delete(i) : next.add(i);
    return next;
  });
  return (
    <NodeField label={label}>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-2 group">
            <button type="button" onClick={() => toggleDone(i)}>
              {done.has(i)
                ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />
                : <Circle className="h-3.5 w-3.5 shrink-0 text-white/30" />}
            </button>
            <span className={cn("text-xs text-white/70 flex-1", done.has(i) && "line-through text-white/30")}>{item}</span>
            <button type="button" className="opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 transition-opacity"
              onClick={() => onChange(items.filter((_, j) => j !== i))}>
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2">
          <Input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="Adicionar item..."
            onKeyDown={e => { if (e.key === "Enter" && newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }}
            className="h-7 text-xs bg-white/5 border-white/8 text-white/70 placeholder:text-white/25 focus-visible:ring-0" />
          <Button size="sm" className="h-7 w-7 p-0 shrink-0" variant="ghost"
            onClick={() => { if (newItem.trim()) { onChange([...items, newItem.trim()]); setNewItem(""); } }}>
            <Plus className="h-3 w-3 text-white/40" />
          </Button>
        </div>
      </div>
    </NodeField>
  );
}

// ══════════════════════════════════════════════════════════════
// 1. LANDING PAGE
// ══════════════════════════════════════════════════════════════

export function LandingPageDrawer(props: NodeDrawerProps) {
  const ACCENT = "#818CF8";
  const [vals, patch] = useNodeData(props.node, {
    objective: "", audience: "", headline: "", subheadline: "",
    cta_text: "", cta_url: "", sections: [] as string[],
    stack: "Lovable", deploy_url: "", status_design: "pending",
    status_dev: "pending", status_copy: "pending",
  });
  const { title, setTitle, status, setStatus, saving, save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);
  const [prefilling, setPrefilling] = useState(false);

  const prefill = async () => {
    setPrefilling(true);
    try {
      const { data } = await supabase.functions.invoke("prefill-node", {
        body: { nodeId: props.node.id, workspaceId: props.workspaceId, clientId: props.clientId, kind: "landing_page" },
      });
      if (data?.sections) {
        const s = data.sections;
        if (s.overview?.objective) patch({ objective: s.overview.objective });
        if (s.copy?.headline)      patch({ headline: s.copy.headline });
        if (s.copy?.subheadline)   patch({ subheadline: s.copy.subheadline });
        if (s.copy?.cta_text)      patch({ cta_text: s.copy.cta_text });
      }
      toast({ title: "Preenchido pela IA" });
    } catch { toast({ title: "Falha no preenchimento", variant: "destructive" }); }
    setPrefilling(false);
  };

  const progressItems = [
    { label: "Design/layout", key: "status_design" as const },
    { label: "Desenvolvimento", key: "status_dev" as const },
    { label: "Copy", key: "status_copy" as const },
  ];

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Landing Page", subtitle: "Conversão e captura de leads", accent: ACCENT, icon: LayoutDashboard }}
      actions={<>
        <NodeAction label={prefilling ? "Gerando..." : "IA Preencher"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        {vals.deploy_url && <a href={vals.deploy_url as string} target="_blank" rel="noreferrer"><NodeAction label="Abrir LP" icon={ExternalLink} onClick={() => {}} /></a>}
        <NodeAction label="Copiar headline" icon={Copy} onClick={() => { navigator.clipboard.writeText(vals.headline as string); toast({ title: "Copiado!" }); }} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Estratégia" accent={ACCENT}>
        <FieldInput label="Objetivo da landing page" value={vals.objective as string} onChange={v => patch({ objective: v })} placeholder="Ex: Capturar leads para consultoria gratuita" multiline rows={2} />
        <FieldInput label="Público-alvo" value={vals.audience as string} onChange={v => patch({ audience: v })} placeholder="Ex: Empreendedores com faturamento de R$100k+ buscando escalar" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Copy" accent={ACCENT}>
        <FieldInput label="Headline principal" value={vals.headline as string} onChange={v => patch({ headline: v })} placeholder="A frase que prende em 3 segundos" />
        <FieldInput label="Subheadline" value={vals.subheadline as string} onChange={v => patch({ subheadline: v })} placeholder="Complemento que aprofunda a proposta" multiline rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Texto do CTA" value={vals.cta_text as string} onChange={v => patch({ cta_text: v })} placeholder="Ex: Quero minha consultoria" />
          <FieldInput label="URL do CTA" value={vals.cta_url as string} onChange={v => patch({ cta_url: v })} placeholder="https://..." />
        </div>
      </NodeSection>

      <NodeSection title="Estrutura de seções" accent={ACCENT}>
        <ChecklistField label="Seções da página" items={vals.sections as string[]} onChange={v => patch({ sections: v })} accent={ACCENT} />
      </NodeSection>

      <NodeSection title="Produção" accent={ACCENT}>
        <div className="grid grid-cols-3 gap-2">
          {progressItems.map(({ label, key }) => (
            <div key={key} className="rounded-lg bg-white/4 border border-white/6 p-3 text-center">
              <p className="text-[10px] text-white/40 mb-2">{label}</p>
              <Select value={vals[key] as string} onValueChange={v => patch({ [key]: v })}>
                <SelectTrigger className="h-6 text-[10px] bg-transparent border-white/10 focus:ring-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending" className="text-xs">Pendente</SelectItem>
                  <SelectItem value="in_progress" className="text-xs">Em progresso</SelectItem>
                  <SelectItem value="done" className="text-xs">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Stack técnica">
            <Select value={vals.stack as string} onValueChange={v => patch({ stack: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Lovable","WordPress","Webflow","Next.js","React","HTML/CSS","Outro"].map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <FieldInput label="URL de deploy" value={vals.deploy_url as string} onChange={v => patch({ deploy_url: v })} placeholder="https://..." />
        </div>
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 2. CRM / PIPELINE
// ══════════════════════════════════════════════════════════════

export function CRMDrawer(props: NodeDrawerProps) {
  const ACCENT = "#FBBF24";
  const [vals, patch] = useNodeData(props.node, {
    platform: "RD Station", crm_url: "",
    stages: ["Prospecção", "Qualificação", "Proposta", "Negociação", "Fechamento"] as string[],
    sla_per_stage: {} as Record<string, string>,
    automations: [] as string[],
    integrations: [] as string[],
    go_live: "", north_star: "",
  });
  const { title, setTitle, status, setStatus, saving, save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "CRM / Pipeline", subtitle: "Estrutura comercial e pipeline de vendas", accent: ACCENT, icon: FolderKanban }}
      actions={<>
        {vals.crm_url && <a href={vals.crm_url as string} target="_blank" rel="noreferrer"><NodeAction label="Abrir CRM" icon={ExternalLink} onClick={() => {}} accent={ACCENT} /></a>}
        <NodeAction label="Copiar link" icon={Copy} onClick={() => { navigator.clipboard.writeText(vals.crm_url as string); }} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Plataforma" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="CRM escolhido">
            <Select value={vals.platform as string} onValueChange={v => patch({ platform: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["RD Station","HubSpot","Pipedrive","Salesforce","Bitrix24","Notion","Planilha","Outro"].map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <FieldInput label="URL do CRM" value={vals.crm_url as string} onChange={v => patch({ crm_url: v })} placeholder="https://..." />
        </div>
        <FieldInput label="North Star Metric" value={vals.north_star as string} onChange={v => patch({ north_star: v })} placeholder="Ex: Taxa de conversão Lead → Cliente" />
      </NodeSection>

      <NodeSection title="Etapas do pipeline" accent={ACCENT}>
        <div className="space-y-2">
          {(vals.stages as string[]).map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                style={{ background: `${ACCENT}20`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>{i + 1}</div>
              <Input value={stage} onChange={e => {
                const next = [...(vals.stages as string[])];
                next[i] = e.target.value;
                patch({ stages: next });
              }} className="h-7 text-xs bg-white/5 border-white/8 text-white/70 focus-visible:ring-0 flex-1" />
              <Input value={(vals.sla_per_stage as Record<string, string>)[stage] ?? ""} onChange={e => patch({ sla_per_stage: { ...(vals.sla_per_stage as Record<string, string>), [stage]: e.target.value } })}
                placeholder="SLA (ex: 2d)" className="h-7 text-xs bg-white/5 border-white/8 text-white/40 focus-visible:ring-0 w-24" />
              <button type="button" onClick={() => patch({ stages: (vals.stages as string[]).filter((_, j) => j !== i) })} className="text-white/20 hover:text-red-400">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-6 text-[11px] text-white/30 hover:text-white gap-1.5 ml-8"
            onClick={() => patch({ stages: [...(vals.stages as string[]), "Nova etapa"] })}>
            <Plus className="h-3 w-3" /> Adicionar etapa
          </Button>
        </div>
      </NodeSection>

      <NodeSection title="Automações e integrações" accent={ACCENT}>
        <ChecklistField label="Automações configuradas" items={vals.automations as string[]} onChange={v => patch({ automations: v })} accent={ACCENT} />
        <ChecklistField label="Integrações ativas" items={vals.integrations as string[]} onChange={v => patch({ integrations: v })} accent={ACCENT} />
      </NodeSection>

      <NodeSection title="Go-live" accent={ACCENT}>
        <FieldInput label="Data prevista de go-live" value={vals.go_live as string} onChange={v => patch({ go_live: v })} placeholder="dd/mm/aaaa" />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 3. AUTOMAÇÃO
// ══════════════════════════════════════════════════════════════

export function AutomacaoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#FB923C";
  const [vals, patch] = useNodeData(props.node, {
    trigger: "", flow_steps: [] as string[], output: "",
    tool: "n8n", tool_url: "", fallback: "", roi_estimate: "",
    go_live: "", tested: false,
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Automação", subtitle: "Fluxo automatizado de processo", accent: ACCENT, icon: Workflow }}
      actions={<>
        {vals.tool_url && <a href={vals.tool_url as string} target="_blank" rel="noreferrer"><NodeAction label={`Abrir ${vals.tool}`} icon={ExternalLink} onClick={() => {}} accent={ACCENT} /></a>}
        <NodeAction label={vals.tested ? "Testado ✓" : "Marcar testado"} icon={Check} onClick={() => patch({ tested: !vals.tested })} accent={vals.tested ? "#10B981" : undefined} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Trigger" accent={ACCENT}>
        <FieldInput label="O que dispara a automação" value={vals.trigger as string} onChange={v => patch({ trigger: v })} placeholder="Ex: Lead preenche formulário no site" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Fluxo" accent={ACCENT}>
        <ChecklistField label="Passos do fluxo" items={vals.flow_steps as string[]} onChange={v => patch({ flow_steps: v })} accent={ACCENT} />
        <FieldInput label="Output esperado" value={vals.output as string} onChange={v => patch({ output: v })} placeholder="Ex: Lead cadastrado no CRM + email de boas-vindas enviado" multiline rows={2} />
        <FieldInput label="Fallback (se falhar)" value={vals.fallback as string} onChange={v => patch({ fallback: v })} placeholder="O que acontece se a automação falhar" />
      </NodeSection>

      <NodeSection title="Ferramentas e ROI" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Ferramenta principal">
            <Select value={vals.tool as string} onValueChange={v => patch({ tool: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["n8n","Make","Zapier","ActiveCampaign","HubSpot","Código próprio","Outro"].map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <FieldInput label="URL da automação" value={vals.tool_url as string} onChange={v => patch({ tool_url: v })} placeholder="https://..." />
        </div>
        <FieldInput label="ROI / impacto operacional" value={vals.roi_estimate as string} onChange={v => patch({ roi_estimate: v })} placeholder="Ex: Reduz 3h/semana de trabalho manual" />
        <FieldInput label="Data de go-live" value={vals.go_live as string} onChange={v => patch({ go_live: v })} placeholder="dd/mm/aaaa" />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 4. CONTEÚDO
// ══════════════════════════════════════════════════════════════

export function ConteudoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#F472B6";
  const [vals, patch] = useNodeData(props.node, {
    format: "Post carrossel", channel: "Instagram", objective: "",
    hook: "", body: "", cta: "", visual_brief: "",
    hashtags: "", publish_date: "", status_copy: "pending", status_design: "pending",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);
  const [prefilling, setPrefilling] = useState(false);

  const prefill = async () => {
    setPrefilling(true);
    try {
      const { data } = await supabase.functions.invoke("prefill-node", {
        body: { nodeId: props.node.id, workspaceId: props.workspaceId, clientId: props.clientId, kind: "conteudo" },
      });
      if (data?.sections?.copy) {
        const c = data.sections.copy;
        if (c.hook) patch({ hook: c.hook });
        if (c.cta)  patch({ cta: c.cta });
      }
      toast({ title: "Copy gerado pela IA" });
    } catch { toast({ title: "Falha", variant: "destructive" }); }
    setPrefilling(false);
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Conteúdo", subtitle: "Produção de conteúdo para distribuição", accent: ACCENT, icon: PenTool }}
      actions={<>
        <NodeAction label={prefilling ? "Gerando..." : "Gerar copy IA"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        <NodeAction label="Copiar copy" icon={Copy}
          onClick={() => { navigator.clipboard.writeText(`${vals.hook}\n\n${vals.body}\n\n${vals.cta}`); toast({ title: "Copiado!" }); }} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Briefing" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Formato">
            <Select value={vals.format as string} onValueChange={v => patch({ format: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Post carrossel","Reels/vídeo","Story","Thread","Blog post","Email","Newsletter","Podcast","Outro"].map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <NodeField label="Canal">
            <Select value={vals.channel as string} onValueChange={v => patch({ channel: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Instagram","LinkedIn","YouTube","TikTok","Twitter/X","Facebook","Email","Site","Outro"].map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
        </div>
        <FieldInput label="Objetivo do conteúdo" value={vals.objective as string} onChange={v => patch({ objective: v })} placeholder="Ex: Gerar autoridade + capturar leads" />
      </NodeSection>

      <NodeSection title="Copy" accent={ACCENT}>
        <FieldInput label="Hook (primeiros 3 segundos)" value={vals.hook as string} onChange={v => patch({ hook: v })} placeholder="O que para o scroll" multiline rows={2} />
        <FieldInput label="Corpo" value={vals.body as string} onChange={v => patch({ body: v })} placeholder="Desenvolvimento do conteúdo" multiline rows={4} />
        <FieldInput label="CTA" value={vals.cta as string} onChange={v => patch({ cta: v })} placeholder="Chamada para ação final" />
        <FieldInput label="Hashtags" value={vals.hashtags as string} onChange={v => patch({ hashtags: v })} placeholder="#aceleração #crescimento..." />
      </NodeSection>

      <NodeSection title="Produção" accent={ACCENT}>
        <FieldInput label="Briefing visual" value={vals.visual_brief as string} onChange={v => patch({ visual_brief: v })} placeholder="Cores, referências, mood, texto na arte" multiline rows={2} />
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-white/4 border border-white/6 p-3 text-center">
            <p className="text-[10px] text-white/40 mb-2">Copy</p>
            <Select value={vals.status_copy as string} onValueChange={v => patch({ status_copy: v })}>
              <SelectTrigger className="h-6 text-[10px] bg-transparent border-white/10 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending" className="text-xs">Pendente</SelectItem>
                <SelectItem value="in_progress" className="text-xs">Em progresso</SelectItem>
                <SelectItem value="done" className="text-xs">Pronto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-white/4 border border-white/6 p-3 text-center">
            <p className="text-[10px] text-white/40 mb-2">Design</p>
            <Select value={vals.status_design as string} onValueChange={v => patch({ status_design: v })}>
              <SelectTrigger className="h-6 text-[10px] bg-transparent border-white/10 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending" className="text-xs">Pendente</SelectItem>
                <SelectItem value="in_progress" className="text-xs">Em progresso</SelectItem>
                <SelectItem value="done" className="text-xs">Pronto</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg bg-white/4 border border-white/6 p-3 text-center">
            <p className="text-[10px] text-white/40 mb-2">Publicação</p>
            <Input value={vals.publish_date as string} onChange={e => patch({ publish_date: e.target.value })} placeholder="dd/mm"
              className="h-6 text-[10px] bg-transparent border-white/10 text-white/60 focus-visible:ring-0 text-center px-1" />
          </div>
        </div>
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 5. TRÁFEGO PAGO
// ══════════════════════════════════════════════════════════════

export function TrafegoPagoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#EF4444";
  const [vals, patch] = useNodeData(props.node, {
    channel: "Meta Ads", objective_campaign: "Conversão",
    audience: "", budget_monthly: "", cost_per_lead_target: "",
    landing_url: "", pixel_id: "", utm_campaign: "",
    kpis: [] as string[], dashboard_url: "", status_campaign: "draft",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Tráfego Pago", subtitle: "Campanha de mídia paga", accent: ACCENT, icon: Megaphone }}
      actions={<>
        {vals.dashboard_url && <a href={vals.dashboard_url as string} target="_blank" rel="noreferrer"><NodeAction label="Ver dashboard" icon={ExternalLink} onClick={() => {}} accent={ACCENT} /></a>}
        {vals.landing_url && <NodeAction label="Copiar URL" icon={Copy} onClick={() => { navigator.clipboard.writeText(vals.landing_url as string); }} />}
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Configuração" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Canal">
            <Select value={vals.channel as string} onValueChange={v => patch({ channel: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Meta Ads","Google Ads","TikTok Ads","LinkedIn Ads","YouTube Ads","Taboola","Outro"].map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <NodeField label="Objetivo">
            <Select value={vals.objective_campaign as string} onValueChange={v => patch({ objective_campaign: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Conversão","Geração de leads","Tráfego","Alcance","Engajamento","Vendas"].map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
        </div>
        <FieldInput label="Público-alvo" value={vals.audience as string} onChange={v => patch({ audience: v })} placeholder="Interesses, comportamento, idade, localização" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Budget e metas" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Budget mensal" value={vals.budget_monthly as string} onChange={v => patch({ budget_monthly: v })} placeholder="R$ 0,00" />
          <FieldInput label="Custo por lead alvo" value={vals.cost_per_lead_target as string} onChange={v => patch({ cost_per_lead_target: v })} placeholder="R$ 0,00" />
        </div>
        <ChecklistField label="KPIs a acompanhar" items={vals.kpis as string[]} onChange={v => patch({ kpis: v })} accent={ACCENT} />
      </NodeSection>

      <NodeSection title="Rastreamento e destino" accent={ACCENT}>
        <FieldInput label="URL da landing page" value={vals.landing_url as string} onChange={v => patch({ landing_url: v })} placeholder="https://..." />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Pixel ID" value={vals.pixel_id as string} onChange={v => patch({ pixel_id: v })} placeholder="Meta: 123456789" />
          <FieldInput label="UTM Campaign" value={vals.utm_campaign as string} onChange={v => patch({ utm_campaign: v })} placeholder="campanha-principal" />
        </div>
        <FieldInput label="Dashboard URL" value={vals.dashboard_url as string} onChange={v => patch({ dashboard_url: v })} placeholder="Link do ads manager" />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 6. AGENTE IA
// ══════════════════════════════════════════════════════════════

export function IAAgentDrawer(props: NodeDrawerProps) {
  const ACCENT = "#06B6D4";
  const [vals, patch] = useNodeData(props.node, {
    name: "", persona: "", base_prompt: "",
    tools: [] as string[], knowledge_base: "", escalation: "",
    platform: "WhatsApp", test_link: "", deployed: false,
    channel: "WhatsApp/Zapi",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);
  const [prefilling, setPrefilling] = useState(false);

  const prefill = async () => {
    setPrefilling(true);
    try {
      const { data } = await supabase.functions.invoke("prefill-node", {
        body: { nodeId: props.node.id, workspaceId: props.workspaceId, clientId: props.clientId, kind: "ia" },
      });
      if (data?.sections?.overview) {
        const o = data.sections.overview;
        if (o.prompt) patch({ base_prompt: o.prompt });
      }
      toast({ title: "Prompt gerado pela IA" });
    } catch { toast({ title: "Falha", variant: "destructive" }); }
    setPrefilling(false);
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Agente IA", subtitle: "Agente inteligente para o cliente", accent: ACCENT, icon: Bot }}
      actions={<>
        <NodeAction label={prefilling ? "Gerando..." : "Gerar prompt"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        {vals.test_link && <a href={vals.test_link as string} target="_blank" rel="noreferrer"><NodeAction label="Testar agente" icon={ExternalLink} onClick={() => {}} /></a>}
        <NodeAction label={vals.deployed ? "Online ✓" : "Marcar online"} icon={Check} onClick={() => patch({ deployed: !vals.deployed })} accent={vals.deployed ? "#10B981" : undefined} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Identidade do agente" accent={ACCENT}>
        <FieldInput label="Nome do agente" value={vals.name as string} onChange={v => patch({ name: v })} placeholder="Ex: Sofia – Assistente da [Empresa]" />
        <FieldInput label="Persona / comportamento" value={vals.persona as string} onChange={v => patch({ persona: v })} placeholder="Tom de voz, limitações, como deve se apresentar" multiline rows={2} />
        <NodeField label="Canal principal">
          <Select value={vals.channel as string} onValueChange={v => patch({ channel: v })}>
            <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["WhatsApp/Zapi","Telegram","Site/chat","Instagram DM","Email","Interno/Slack","Outro"].map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </NodeField>
      </NodeSection>

      <NodeSection title="Configuração" accent={ACCENT}>
        <FieldInput label="Prompt base do sistema" value={vals.base_prompt as string} onChange={v => patch({ base_prompt: v })} placeholder="System prompt completo do agente" multiline rows={5} />
        <FieldInput label="Base de conhecimento (URL ou descrição)" value={vals.knowledge_base as string} onChange={v => patch({ knowledge_base: v })} placeholder="Link da planilha, notion, PDFs..." multiline rows={2} />
      </NodeSection>

      <NodeSection title="Ferramentas e escalonamento" accent={ACCENT}>
        <ChecklistField label="Ferramentas habilitadas" items={vals.tools as string[]} onChange={v => patch({ tools: v })} accent={ACCENT} />
        <FieldInput label="Critério de escalação para humano" value={vals.escalation as string} onChange={v => patch({ escalation: v })} placeholder="Ex: Quando mencionar preço ou reclamação grave" multiline rows={2} />
        <FieldInput label="URL de teste" value={vals.test_link as string} onChange={v => patch({ test_link: v })} placeholder="https://..." />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 7. MÉTRICA
// ══════════════════════════════════════════════════════════════

export function MetricaDrawerV2(props: NodeDrawerProps) {
  const ACCENT = "#60A5FA";
  const [vals, patch] = useNodeData(props.node, {
    metric_name: "", formula: "", source: "", frequency: "Semanal",
    baseline: "", target: "", current_value: "", unit: "",
    dashboard_url: "", notes: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  const saveSnapshot = async () => {
    if (!vals.current_value) return;
    await supabase.from("metric_snapshots").insert({
      workspace_id: props.workspaceId, client_id: props.clientId,
      metric_name: vals.metric_name as string || props.node.title,
      value: parseFloat(vals.current_value as string),
      unit: vals.unit as string,
      notes: vals.notes as string,
      captured_at: new Date().toISOString(),
    });
    toast({ title: "Snapshot salvo" });
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Métrica", subtitle: "KPI e medição de resultado", accent: ACCENT, icon: BarChart3 }}
      actions={<>
        <NodeAction label="Salvar snapshot" icon={BarChart3} onClick={saveSnapshot} accent={ACCENT} />
        {vals.dashboard_url && <a href={vals.dashboard_url as string} target="_blank" rel="noreferrer"><NodeAction label="Dashboard" icon={ExternalLink} onClick={() => {}} /></a>}
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Definição" accent={ACCENT}>
        <FieldInput label="Nome da métrica" value={vals.metric_name as string} onChange={v => patch({ metric_name: v })} placeholder="Ex: Taxa de conversão Lead → Cliente" />
        <FieldInput label="Fórmula de cálculo" value={vals.formula as string} onChange={v => patch({ formula: v })} placeholder="Ex: (Clientes / Leads) × 100" />
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Fonte dos dados">
            <Select value={vals.source as string} onValueChange={v => patch({ source: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["CRM","Google Analytics","Meta Ads","Google Ads","Planilha","Dashboard próprio","Manual","Outro"].map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <NodeField label="Frequência">
            <Select value={vals.frequency as string} onValueChange={v => patch({ frequency: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Diária","Semanal","Quinzenal","Mensal","Trimestral"].map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
        </div>
      </NodeSection>

      <NodeSection title="Valores" accent={ACCENT}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { key: "baseline", label: "Baseline", hint: "Início" },
            { key: "target",   label: "Meta",     hint: "Objetivo" },
            { key: "current_value", label: "Atual", hint: "Agora" },
            { key: "unit",     label: "Unidade",   hint: "%, R$..." },
          ].map(({ key, label, hint }) => (
            <div key={key} className="rounded-lg bg-white/4 border border-white/6 p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">{label} <span className="text-white/20">{hint}</span></p>
              <Input value={vals[key] as string} onChange={e => patch({ [key]: e.target.value })}
                className="h-7 text-sm bg-transparent border-0 p-0 text-white font-semibold focus-visible:ring-0 tabular-nums" placeholder="—" />
            </div>
          ))}
        </div>
        <FieldInput label="URL do dashboard" value={vals.dashboard_url as string} onChange={v => patch({ dashboard_url: v })} placeholder="https://..." />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 8. OBJETIVO
// ══════════════════════════════════════════════════════════════

export function ObjetivoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#10B981";
  const [vals, patch] = useNodeData(props.node, {
    what: "", why: "", measure: "", deadline: "",
    milestones: [] as string[], risks: "", owner: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Objetivo", subtitle: "Meta estratégica e critérios de sucesso", accent: ACCENT, icon: Target }}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Objetivo SMART" accent={ACCENT}>
        <FieldInput label="O que (específico)" value={vals.what as string} onChange={v => patch({ what: v })} placeholder="O que exatamente precisa ser alcançado" multiline rows={2} />
        <FieldInput label="Por que (relevância)" value={vals.why as string} onChange={v => patch({ why: v })} placeholder="Por que isso é importante para o cliente" multiline rows={2} />
        <FieldInput label="Como medir (mensurável)" value={vals.measure as string} onChange={v => patch({ measure: v })} placeholder="Qual número/indicador confirma que foi alcançado" />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Prazo" value={vals.deadline as string} onChange={v => patch({ deadline: v })} placeholder="dd/mm/aaaa" />
          <FieldInput label="Responsável" value={vals.owner as string} onChange={v => patch({ owner: v })} placeholder="Quem responde por isso" />
        </div>
      </NodeSection>
      <NodeSection title="Marcos e riscos" accent={ACCENT}>
        <ChecklistField label="Marcos do caminho" items={vals.milestones as string[]} onChange={v => patch({ milestones: v })} accent={ACCENT} />
        <FieldInput label="Riscos e dependências" value={vals.risks as string} onChange={v => patch({ risks: v })} placeholder="O que pode impedir de alcançar" multiline rows={2} />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 9. CASE
// ══════════════════════════════════════════════════════════════

export function CaseDrawer(props: NodeDrawerProps) {
  const ACCENT = "#F59E0B";
  const [vals, patch] = useNodeData(props.node, {
    summary: "", context_before: "", solution: "", results: "",
    learnings: "", client_testimonial: "", publish_url: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);
  const [prefilling, setPrefilling] = useState(false);

  const prefill = async () => {
    setPrefilling(true);
    try {
      const { data } = await supabase.functions.invoke("prefill-node", {
        body: { nodeId: props.node.id, workspaceId: props.workspaceId, clientId: props.clientId, kind: "case" },
      });
      if (data?.sections?.overview) {
        const o = data.sections.overview;
        if (o.context) patch({ context_before: o.context });
        if (o.results) patch({ results: o.results });
      }
      toast({ title: "Case estruturado pela IA" });
    } catch { toast({ title: "Falha", variant: "destructive" }); }
    setPrefilling(false);
  };

  const exportCase = () => {
    const text = `# ${props.node.title}\n\n## Resumo\n${vals.summary}\n\n## Contexto inicial\n${vals.context_before}\n\n## Solução implementada\n${vals.solution}\n\n## Resultados\n${vals.results}\n\n## Aprendizados\n${vals.learnings}\n\n## Depoimento\n${vals.client_testimonial}`;
    const blob = new Blob([text], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `case-${props.node.title.toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Case", subtitle: "Narrativa de resultado para portfólio", accent: ACCENT, icon: Trophy }}
      actions={<>
        <NodeAction label={prefilling ? "Estruturando..." : "Estruturar com IA"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        <NodeAction label="Exportar Markdown" icon={Copy} onClick={exportCase} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Narrativa" accent={ACCENT}>
        <FieldInput label="Resumo executivo (1-2 frases)" value={vals.summary as string} onChange={v => patch({ summary: v })} placeholder="O que o cliente alcançou" multiline rows={2} />
        <FieldInput label="Contexto antes (o problema)" value={vals.context_before as string} onChange={v => patch({ context_before: v })} placeholder="Situação antes da intervenção" multiline rows={3} />
        <FieldInput label="Solução implementada" value={vals.solution as string} onChange={v => patch({ solution: v })} placeholder="O que foi feito e como" multiline rows={3} />
        <FieldInput label="Resultados obtidos" value={vals.results as string} onChange={v => patch({ results: v })} placeholder="Números, comparativos, evidências" multiline rows={3} />
      </NodeSection>
      <NodeSection title="Publicação" accent={ACCENT}>
        <FieldInput label="Aprendizados internos" value={vals.learnings as string} onChange={v => patch({ learnings: v })} placeholder="O que ficaria diferente se fosse hoje" multiline rows={2} />
        <FieldInput label="Depoimento do cliente" value={vals.client_testimonial as string} onChange={v => patch({ client_testimonial: v })} placeholder="Fala real do cliente se tiver" multiline rows={2} />
        <FieldInput label="URL de publicação" value={vals.publish_url as string} onChange={v => patch({ publish_url: v })} placeholder="Link onde o case foi publicado" />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 10. DECISÃO
// ══════════════════════════════════════════════════════════════

export function DecisaoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#A78BFA";
  const [vals, patch] = useNodeData(props.node, {
    context: "", options_evaluated: [] as string[], decision: "",
    owner: "", date: new Date().toISOString().split("T")[0],
    impact: "", reversible: "Sim",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Decisão", subtitle: "Registro de decisão estratégica", accent: ACCENT, icon: Scale }}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Contexto da decisão" accent={ACCENT}>
        <FieldInput label="Situação que motivou a decisão" value={vals.context as string} onChange={v => patch({ context: v })} placeholder="O que precisava ser resolvido" multiline rows={3} />
        <ChecklistField label="Opções avaliadas" items={vals.options_evaluated as string[]} onChange={v => patch({ options_evaluated: v })} accent={ACCENT} />
      </NodeSection>
      <NodeSection title="Decisão tomada" accent={ACCENT}>
        <FieldInput label="Decisão" value={vals.decision as string} onChange={v => patch({ decision: v })} placeholder="O que foi decidido" multiline rows={2} />
        <FieldInput label="Impacto esperado" value={vals.impact as string} onChange={v => patch({ impact: v })} placeholder="O que muda a partir dessa decisão" multiline rows={2} />
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="Responsável" value={vals.owner as string} onChange={v => patch({ owner: v })} placeholder="Quem decidiu" />
          <FieldInput label="Data" value={vals.date as string} onChange={v => patch({ date: v })} placeholder="aaaa-mm-dd" />
          <NodeField label="Reversível?">
            <Select value={vals.reversible as string} onValueChange={v => patch({ reversible: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Sim" className="text-xs">Sim</SelectItem>
                <SelectItem value="Difícil" className="text-xs">Difícil</SelectItem>
                <SelectItem value="Não" className="text-xs">Irreversível</SelectItem>
              </SelectContent>
            </Select>
          </NodeField>
        </div>
      </NodeSection>
    </NodeDrawerShell>
  );
}
