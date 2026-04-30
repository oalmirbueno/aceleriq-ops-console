/**
 * NodeDrawers — drawers específicos POR TIPO DE NODE.
 *
 * PREMISSA FUNDAMENTAL:
 * O Aceleriq CONSTRÓI, PRODUZ e IMPLEMENTA para o cliente.
 * Cada drawer é um PROCESSO DE CRIAÇÃO, não de uso de ferramenta pronta.
 *
 * Fluxo padrão em cada drawer:
 *   1. Briefing / Diagnóstico — o que o cliente tem hoje, o que precisa
 *   2. Arquitetura / Design   — o que será construído, estrutura
 *   3. Produção / Build       — execução, stack, responsáveis
 *   4. IA-first layer         — como o entregável prepara / integra IA
 *   5. Go-live / Entrega      — implantação, validação, handoff
 */
import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, FolderKanban, Workflow, PenTool, Megaphone, Bot,
  BarChart3, Target, Trophy, Scale, Sparkles, ExternalLink, Copy,
  Link2, CheckCircle2, Circle, Loader2, Plus, Trash2, Check,
  Hammer, Brain, Rocket, FileSearch,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  NodeDrawerShell, NodeSection, NodeField, NodeAction, useSaveNode,
  type NodeDrawerProps,
} from "./NodeDrawerBase";

/**
 * mergeAiSections — flatten genérico do payload do prefill-node.
 * Pega todas as section.field e mescla apenas os campos que JÁ existem
 * no estado local do drawer (vals). Evita poluir vals com campos desconhecidos.
 */
function mergeAiSections(
  sections: Record<string, unknown> | null | undefined,
  vals: Record<string, unknown>,
): Record<string, unknown> {
  if (!sections) return {};
  const flat: Record<string, unknown> = {};
  for (const sectionVal of Object.values(sections)) {
    if (sectionVal && typeof sectionVal === "object") {
      for (const [k, v] of Object.entries(sectionVal as Record<string, unknown>)) {
        if (k in vals && (typeof v === "string" || Array.isArray(v))) flat[k] = v;
      }
    }
  }
  return flat;
}

// ─── Helpers ─────────────────────────────────────────────────

function useNodeData<T extends Record<string, unknown>>(
  node: NodeDrawerProps["node"], defaults: T,
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

function BuildPhasePill({ label, status, onChange, accent }: {
  label: string; status: string; onChange: (v: string) => void; accent: string;
}) {
  const STATUSES = [
    { k: "pending",     l: "A fazer",     color: "#6B7280" },
    { k: "in_progress", l: "Construindo", color: accent },
    { k: "review",      l: "Em revisão",  color: "#60A5FA" },
    { k: "done",        l: "Entregue",    color: "#10B981" },
  ];
  const current = STATUSES.find(s => s.k === status) ?? STATUSES[0];
  return (
    <div className="rounded-lg bg-white/4 border border-white/6 p-3">
      <p className="text-[10px] text-white/40 uppercase tracking-wider mb-2">{label}</p>
      <Select value={status} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-[11px] bg-transparent border-white/10 focus:ring-0" style={{ color: current.color }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map(s => <SelectItem key={s.k} value={s.k} className="text-xs">{s.l}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function AIFirstSection({ accent, vals, patch }: {
  accent: string;
  vals: { ai_integration: string; ai_data_points: string };
  patch: (p: Partial<{ ai_integration: string; ai_data_points: string }>) => void;
}) {
  return (
    <NodeSection title="Camada IA-first" accent={accent}>
      <div className="rounded-lg border p-3 mb-3" style={{ background: `${accent}06`, borderColor: `${accent}20` }}>
        <div className="flex items-center gap-1.5 mb-1">
          <Brain className="h-3 w-3" style={{ color: accent }} />
          <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `${accent}90` }}>
            Como este entregável prepara IA na operação do cliente
          </p>
        </div>
      </div>
      <FieldInput label="Pontos onde IA entra" value={vals.ai_integration}
        onChange={v => patch({ ai_integration: v })}
        placeholder="Ex: agente responde dúvidas do formulário, IA qualifica lead após envio, copy otimizada via IA"
        multiline rows={2} />
      <FieldInput label="Dados que serão coletados para treinar / alimentar IA" value={vals.ai_data_points}
        onChange={v => patch({ ai_data_points: v })}
        placeholder="Ex: respostas do cliente, histórico de interações, métricas de conversão"
        multiline rows={2} />
    </NodeSection>
  );
}

// ══════════════════════════════════════════════════════════════
// 1. LANDING PAGE — processo de CONSTRUÇÃO da LP
// ══════════════════════════════════════════════════════════════

export function LandingPageDrawer(props: NodeDrawerProps) {
  const ACCENT = "#818CF8";
  const [vals, patch] = useNodeData(props.node, {
    // Briefing
    objective: "", audience: "", current_state: "",
    // Arquitetura
    headline: "", subheadline: "", cta_text: "", value_props: [] as string[],
    sections_plan: [] as string[],
    // Produção
    stack: "Lovable", design_phase: "pending", copy_phase: "pending",
    dev_phase: "pending", review_phase: "pending",
    // Go-live
    deploy_url: "", deployed_at: "",
    // IA
    ai_integration: "", ai_data_points: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);
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
      toast({ title: "Rascunho gerado pela IA" });
    } catch { toast({ title: "Falha no preenchimento", variant: "destructive" }); }
    setPrefilling(false);
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Landing Page", subtitle: "Construção de LP de conversão para o cliente", accent: ACCENT, icon: LayoutDashboard }} kind="landing_page" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        <NodeAction label={prefilling ? "Gerando..." : "Rascunhar com IA"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        {vals.deploy_url && <a href={vals.deploy_url as string} target="_blank" rel="noreferrer"><NodeAction label="Ver entregue" icon={ExternalLink} onClick={() => {}} /></a>}
        {vals.headline && <NodeAction label="Copiar headline" icon={Copy} onClick={() => { navigator.clipboard.writeText(vals.headline as string); toast({ title: "Copiado!" }); }} />}
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Briefing da landing" accent={ACCENT}>
        <FieldInput label="Objetivo da LP" value={vals.objective as string} onChange={v => patch({ objective: v })} placeholder="Ex: Capturar leads para a consultoria do cliente" multiline rows={2} />
        <FieldInput label="Público-alvo do cliente" value={vals.audience as string} onChange={v => patch({ audience: v })} placeholder="Quem o cliente quer atrair" multiline rows={2} />
        <FieldInput label="Situação atual (tem LP hoje? funciona?)" value={vals.current_state as string} onChange={v => patch({ current_state: v })}
          placeholder="Ex: Não tem LP, usa Instagram / Tem mas não converte" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Arquitetura e copy" accent={ACCENT}>
        <FieldInput label="Headline a ser criada" value={vals.headline as string} onChange={v => patch({ headline: v })} placeholder="Frase que prende em 3 segundos" />
        <FieldInput label="Subheadline" value={vals.subheadline as string} onChange={v => patch({ subheadline: v })} placeholder="Complemento" multiline rows={2} />
        <FieldInput label="Texto do CTA principal" value={vals.cta_text as string} onChange={v => patch({ cta_text: v })} placeholder="Ex: Quero minha consultoria" />
        <ChecklistField label="Propostas de valor a destacar" items={vals.value_props as string[]} onChange={v => patch({ value_props: v })} accent={ACCENT} />
        <ChecklistField label="Seções a construir" items={vals.sections_plan as string[]} onChange={v => patch({ sections_plan: v })} accent={ACCENT} />
      </NodeSection>

      <NodeSection title="Produção e stack" accent={ACCENT}>
        <NodeField label="Stack técnica de construção">
          <Select value={vals.stack as string} onValueChange={v => patch({ stack: v })}>
            <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Lovable","SiteBolt (interno)","WordPress","Webflow","Next.js custom","HTML/CSS"].map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </NodeField>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BuildPhasePill label="Design" status={vals.design_phase as string} onChange={v => patch({ design_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Copy" status={vals.copy_phase as string} onChange={v => patch({ copy_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Desenvolvimento" status={vals.dev_phase as string} onChange={v => patch({ dev_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Revisão" status={vals.review_phase as string} onChange={v => patch({ review_phase: v })} accent={ACCENT} />
        </div>
      </NodeSection>

      <AIFirstSection accent={ACCENT} vals={vals as any} patch={patch as any} />

      <NodeSection title="Go-live" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="URL pública" value={vals.deploy_url as string} onChange={v => patch({ deploy_url: v })} placeholder="https://..." />
          <FieldInput label="Publicada em" value={vals.deployed_at as string} onChange={v => patch({ deployed_at: v })} placeholder="dd/mm/aaaa" />
        </div>
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 2. CRM — estruturar o CRM INTERNO do cliente
// ══════════════════════════════════════════════════════════════

export function CRMDrawer(props: NodeDrawerProps) {
  const ACCENT = "#FBBF24";
  const [vals, patch] = useNodeData(props.node, {
    // Diagnóstico
    current_state: "", pain_points: "",
    // Arquitetura
    base_platform: "Aceleriq CRM (interno)",
    pipeline_stages: ["Lead captado", "Qualificado", "Proposta enviada", "Negociação", "Fechado"] as string[],
    custom_fields: [] as string[],
    triggers_to_create: [] as string[],
    // Integrações a desenvolver
    integrations_to_build: [] as string[],
    data_sources: "",
    // Produção
    setup_phase: "pending", data_migration_phase: "pending",
    automations_phase: "pending", training_phase: "pending",
    // IA
    ai_integration: "", ai_data_points: "",
    // Go-live
    go_live_date: "", north_star: "", owner_at_client: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "CRM / Pipeline", subtitle: "Estruturar o CRM interno do cliente do zero", accent: ACCENT, icon: FolderKanban }} kind="crm" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        <NodeAction label="Copiar pipeline" icon={Copy} onClick={() => {
          navigator.clipboard.writeText((vals.pipeline_stages as string[]).join(" → "));
          toast({ title: "Pipeline copiado!" });
        }} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Diagnóstico do cliente" accent={ACCENT}>
        <FieldInput label="Como ele gerencia vendas hoje" value={vals.current_state as string} onChange={v => patch({ current_state: v })}
          placeholder="Ex: Usa planilha Excel / Tem RD Station mas subutiliza / Nada estruturado" multiline rows={2} />
        <FieldInput label="Dores no processo atual" value={vals.pain_points as string} onChange={v => patch({ pain_points: v })}
          placeholder="Ex: Perde leads, não sabe onde parou, sem previsibilidade" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Arquitetura do CRM a construir" accent={ACCENT}>
        <NodeField label="Base do CRM">
          <Select value={vals.base_platform as string} onValueChange={v => patch({ base_platform: v })}>
            <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["Aceleriq CRM (interno)","Supabase + Lovable custom","RD Station (estruturado por nós)","HubSpot (estruturado por nós)","Notion estruturado","Planilha pro MVP"].map(p => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-white/40 mt-1">Se possível, internalizamos — cliente para de pagar terceiros</p>
        </NodeField>
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/60 mb-1">Etapas do pipeline a desenhar</p>
          {(vals.pipeline_stages as string[]).map((stage, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0"
                style={{ background: `${ACCENT}20`, color: ACCENT, border: `1px solid ${ACCENT}40` }}>{i + 1}</div>
              <Input value={stage} onChange={e => {
                const next = [...(vals.pipeline_stages as string[])];
                next[i] = e.target.value;
                patch({ pipeline_stages: next });
              }} className="h-7 text-xs bg-white/5 border-white/8 text-white/70 focus-visible:ring-0 flex-1" />
              <button type="button" onClick={() => patch({ pipeline_stages: (vals.pipeline_stages as string[]).filter((_, j) => j !== i) })} className="text-white/20 hover:text-red-400">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-6 text-[11px] text-white/30 hover:text-white gap-1.5 ml-8"
            onClick={() => patch({ pipeline_stages: [...(vals.pipeline_stages as string[]), "Nova etapa"] })}>
            <Plus className="h-3 w-3" /> Adicionar etapa
          </Button>
        </div>
        <ChecklistField label="Campos personalizados a criar" items={vals.custom_fields as string[]} onChange={v => patch({ custom_fields: v })} accent={ACCENT} />
        <ChecklistField label="Triggers / automações a desenvolver" items={vals.triggers_to_create as string[]} onChange={v => patch({ triggers_to_create: v })} accent={ACCENT} />
      </NodeSection>

      <NodeSection title="Integrações a construir" accent={ACCENT}>
        <ChecklistField label="Conexões necessárias (WhatsApp, forms, e-mail, etc.)" items={vals.integrations_to_build as string[]} onChange={v => patch({ integrations_to_build: v })} accent={ACCENT} />
        <FieldInput label="Fontes de dados (de onde vêm os leads)" value={vals.data_sources as string} onChange={v => patch({ data_sources: v })}
          placeholder="Ex: formulário da LP, DMs do Instagram, WhatsApp Business, tráfego pago" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Produção" accent={ACCENT}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BuildPhasePill label="Setup base" status={vals.setup_phase as string} onChange={v => patch({ setup_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Migração dados" status={vals.data_migration_phase as string} onChange={v => patch({ data_migration_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Automações" status={vals.automations_phase as string} onChange={v => patch({ automations_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Treinamento" status={vals.training_phase as string} onChange={v => patch({ training_phase: v })} accent={ACCENT} />
        </div>
      </NodeSection>

      <AIFirstSection accent={ACCENT} vals={vals as any} patch={patch as any} />

      <NodeSection title="Go-live e handoff" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Data de go-live" value={vals.go_live_date as string} onChange={v => patch({ go_live_date: v })} placeholder="dd/mm/aaaa" />
          <FieldInput label="Responsável no cliente" value={vals.owner_at_client as string} onChange={v => patch({ owner_at_client: v })} placeholder="Nome / cargo" />
        </div>
        <FieldInput label="Métrica-chave pós go-live" value={vals.north_star as string} onChange={v => patch({ north_star: v })} placeholder="Ex: conversão lead→cliente, ciclo médio de venda" />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 3. AUTOMAÇÃO — construir a automação do zero
// ══════════════════════════════════════════════════════════════

export function AutomacaoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#FB923C";
  const [vals, patch] = useNodeData(props.node, {
    // Diagnóstico
    manual_process: "", time_wasted: "", pain: "",
    // Arquitetura
    trigger: "", flow_steps: [] as string[], output: "",
    exception_handling: "",
    // Produção
    build_stack: "n8n (interno)", setup_phase: "pending", dev_phase: "pending",
    test_phase: "pending", go_live_phase: "pending",
    // IA
    ai_integration: "", ai_data_points: "",
    // Entrega
    deployed_url: "", go_live_date: "", roi_weekly_hours: "",
    tested: false,
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Automação", subtitle: "Desenvolver automação para o processo do cliente", accent: ACCENT, icon: Workflow }} kind="automacao" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        {vals.deployed_url && <a href={vals.deployed_url as string} target="_blank" rel="noreferrer"><NodeAction label="Ver entregue" icon={ExternalLink} onClick={() => {}} accent={ACCENT} /></a>}
        <NodeAction label={vals.tested ? "Testado ✓" : "Marcar testado"} icon={Check} onClick={() => patch({ tested: !vals.tested })} accent={vals.tested ? "#10B981" : undefined} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Diagnóstico do processo" accent={ACCENT}>
        <FieldInput label="Como o cliente faz isso manualmente hoje" value={vals.manual_process as string} onChange={v => patch({ manual_process: v })}
          placeholder="Passo a passo do processo atual" multiline rows={3} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Tempo gasto manualmente" value={vals.time_wasted as string} onChange={v => patch({ time_wasted: v })} placeholder="Ex: 5h por semana" />
          <FieldInput label="Maior dor no processo" value={vals.pain as string} onChange={v => patch({ pain: v })} placeholder="Ex: Sempre esquecem de fazer X" />
        </div>
      </NodeSection>

      <NodeSection title="Arquitetura da automação a construir" accent={ACCENT}>
        <FieldInput label="Trigger — o que dispara" value={vals.trigger as string} onChange={v => patch({ trigger: v })}
          placeholder="Ex: Lead preenche form na LP" multiline rows={2} />
        <ChecklistField label="Passos do fluxo que vamos desenvolver" items={vals.flow_steps as string[]} onChange={v => patch({ flow_steps: v })} accent={ACCENT} />
        <FieldInput label="Output esperado" value={vals.output as string} onChange={v => patch({ output: v })}
          placeholder="Ex: Lead no CRM + WhatsApp enviado + tag aplicada" multiline rows={2} />
        <FieldInput label="Tratamento de exceções" value={vals.exception_handling as string} onChange={v => patch({ exception_handling: v })}
          placeholder="O que fazer quando der errado" />
      </NodeSection>

      <NodeSection title="Stack e produção" accent={ACCENT}>
        <NodeField label="Stack de construção">
          <Select value={vals.build_stack as string} onValueChange={v => patch({ build_stack: v })}>
            <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
            <SelectContent>
              {["n8n (interno)","Make (interno)","Supabase + Edge Functions","Código próprio (TypeScript)","Zapier","ActiveCampaign"].map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-white/40 mt-1">Preferimos stack interna — independência do cliente</p>
        </NodeField>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BuildPhasePill label="Setup" status={vals.setup_phase as string} onChange={v => patch({ setup_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Desenvolvimento" status={vals.dev_phase as string} onChange={v => patch({ dev_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Testes" status={vals.test_phase as string} onChange={v => patch({ test_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Go-live" status={vals.go_live_phase as string} onChange={v => patch({ go_live_phase: v })} accent={ACCENT} />
        </div>
      </NodeSection>

      <AIFirstSection accent={ACCENT} vals={vals as any} patch={patch as any} />

      <NodeSection title="Entrega" accent={ACCENT}>
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="URL do fluxo" value={vals.deployed_url as string} onChange={v => patch({ deployed_url: v })} placeholder="https://..." />
          <FieldInput label="Go-live em" value={vals.go_live_date as string} onChange={v => patch({ go_live_date: v })} placeholder="dd/mm/aaaa" />
          <FieldInput label="Horas/semana poupadas" value={vals.roi_weekly_hours as string} onChange={v => patch({ roi_weekly_hours: v })} placeholder="Ex: 8h" />
        </div>
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 4. CONTEÚDO — criação de conteúdo do zero
// ══════════════════════════════════════════════════════════════

export function ConteudoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#F472B6";
  const [vals, patch] = useNodeData(props.node, {
    // Briefing
    objective: "", format: "Post carrossel", channel: "Instagram",
    pillar: "", target_audience: "",
    // Produção
    hook: "", body: "", cta: "", visual_brief: "", hashtags: "",
    copy_phase: "pending", design_phase: "pending", approval_phase: "pending",
    // IA
    ai_integration: "", ai_data_points: "",
    // Entrega
    publish_date: "", published_url: "", publish_status: "scheduled",
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
      {...props} config={{ title: "Conteúdo", subtitle: "Produção de conteúdo para o cliente", accent: ACCENT, icon: PenTool }} kind="conteudo" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        <NodeAction label={prefilling ? "Criando..." : "Criar copy IA"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        <NodeAction label="Copiar copy final" icon={Copy}
          onClick={() => { navigator.clipboard.writeText(`${vals.hook}\n\n${vals.body}\n\n${vals.cta}\n\n${vals.hashtags}`); toast({ title: "Copiado!" }); }} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Briefing do conteúdo" accent={ACCENT}>
        <FieldInput label="Objetivo deste conteúdo" value={vals.objective as string} onChange={v => patch({ objective: v })}
          placeholder="Ex: Gerar autoridade, capturar leads, educar mercado" />
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Formato">
            <Select value={vals.format as string} onValueChange={v => patch({ format: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Post carrossel","Reels/vídeo curto","Vídeo longo","Story","Thread","Blog post","Email","Newsletter","Roteiro de podcast"].map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <NodeField label="Canal de publicação">
            <Select value={vals.channel as string} onValueChange={v => patch({ channel: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Instagram","LinkedIn","YouTube","TikTok","Twitter/X","Email cliente","Blog cliente","WhatsApp lista"].map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
        </div>
        <FieldInput label="Pilar de conteúdo" value={vals.pillar as string} onChange={v => patch({ pillar: v })} placeholder="Ex: Educação, autoridade, bastidores" />
        <FieldInput label="Público-alvo" value={vals.target_audience as string} onChange={v => patch({ target_audience: v })} placeholder="Para quem fala" />
      </NodeSection>

      <NodeSection title="Produção da copy" accent={ACCENT}>
        <FieldInput label="Hook (3 primeiros segundos)" value={vals.hook as string} onChange={v => patch({ hook: v })} placeholder="O que para o scroll" multiline rows={2} />
        <FieldInput label="Corpo" value={vals.body as string} onChange={v => patch({ body: v })} placeholder="Desenvolvimento da narrativa" multiline rows={5} />
        <FieldInput label="CTA" value={vals.cta as string} onChange={v => patch({ cta: v })} placeholder="Chamada para ação" />
        <FieldInput label="Hashtags" value={vals.hashtags as string} onChange={v => patch({ hashtags: v })} placeholder="#marketing #aceleracao" />
        <FieldInput label="Briefing visual" value={vals.visual_brief as string} onChange={v => patch({ visual_brief: v })}
          placeholder="Cores, referências, mood, estilo da arte" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Produção" accent={ACCENT}>
        <div className="grid grid-cols-3 gap-2">
          <BuildPhasePill label="Copy" status={vals.copy_phase as string} onChange={v => patch({ copy_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Design" status={vals.design_phase as string} onChange={v => patch({ design_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Aprovação cliente" status={vals.approval_phase as string} onChange={v => patch({ approval_phase: v })} accent={ACCENT} />
        </div>
      </NodeSection>

      <AIFirstSection accent={ACCENT} vals={vals as any} patch={patch as any} />

      <NodeSection title="Publicação" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Agendado para" value={vals.publish_date as string} onChange={v => patch({ publish_date: v })} placeholder="dd/mm/aaaa hh:mm" />
          <NodeField label="Status">
            <Select value={vals.publish_status as string} onValueChange={v => patch({ publish_status: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[["scheduled","Agendado"],["posted","Publicado"],["paused","Pausado"]].map(([v,l]) => <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
        </div>
        {vals.publish_status === "posted" && <FieldInput label="URL da publicação" value={vals.published_url as string} onChange={v => patch({ published_url: v })} placeholder="https://..." />}
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 5. TRÁFEGO PAGO — criar e estruturar campanha
// ══════════════════════════════════════════════════════════════

export function TrafegoPagoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#EF4444";
  const [vals, patch] = useNodeData(props.node, {
    // Diagnóstico
    current_state: "", previous_results: "",
    // Arquitetura
    channel: "Meta Ads", campaign_type: "Conversão",
    audience_profile: "", creative_brief: "",
    budget_monthly: "", cpl_target: "",
    // Rastreamento
    pixel_setup: "pending", utm_setup: "pending",
    // Construção
    account_setup_phase: "pending", creative_phase: "pending",
    copy_phase: "pending", launch_phase: "pending",
    // IA
    ai_integration: "", ai_data_points: "",
    // Entrega
    account_url: "", launch_date: "",
    connected_landing_id: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Tráfego Pago", subtitle: "Estruturar e lançar campanha para o cliente", accent: ACCENT, icon: Megaphone }} kind="trafego" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        {vals.account_url && <a href={vals.account_url as string} target="_blank" rel="noreferrer"><NodeAction label="Conta de ads" icon={ExternalLink} onClick={() => {}} accent={ACCENT} /></a>}
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Diagnóstico de tráfego" accent={ACCENT}>
        <FieldInput label="Situação de ads atual" value={vals.current_state as string} onChange={v => patch({ current_state: v })}
          placeholder="Ex: Nunca fez tráfego / Fez com terceiros sem retorno" multiline rows={2} />
        <FieldInput label="Resultados anteriores (se houver)" value={vals.previous_results as string} onChange={v => patch({ previous_results: v })}
          placeholder="Métricas passadas, o que funcionou, o que falhou" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Arquitetura da campanha" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Canal">
            <Select value={vals.channel as string} onValueChange={v => patch({ channel: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Meta Ads","Google Ads","TikTok Ads","LinkedIn Ads","YouTube Ads"].map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <NodeField label="Objetivo">
            <Select value={vals.campaign_type as string} onValueChange={v => patch({ campaign_type: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Conversão","Leads","Vendas","Tráfego","Alcance","Engajamento"].map(o => <SelectItem key={o} value={o} className="text-xs">{o}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
        </div>
        <FieldInput label="Perfil de público-alvo a atingir" value={vals.audience_profile as string} onChange={v => patch({ audience_profile: v })}
          placeholder="Interesses, comportamento, idade, localização" multiline rows={2} />
        <FieldInput label="Briefing dos criativos a produzir" value={vals.creative_brief as string} onChange={v => patch({ creative_brief: v })}
          placeholder="Quantos criativos, formatos, mensagens-chave" multiline rows={2} />
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="Budget mensal" value={vals.budget_monthly as string} onChange={v => patch({ budget_monthly: v })} placeholder="R$ 0,00" />
          <FieldInput label="Custo por lead alvo" value={vals.cpl_target as string} onChange={v => patch({ cpl_target: v })} placeholder="R$ 0,00" />
        </div>
      </NodeSection>

      <NodeSection title="Estruturação (setup técnico)" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-2">
          <BuildPhasePill label="Pixel instalado" status={vals.pixel_setup as string} onChange={v => patch({ pixel_setup: v })} accent={ACCENT} />
          <BuildPhasePill label="UTMs configuradas" status={vals.utm_setup as string} onChange={v => patch({ utm_setup: v })} accent={ACCENT} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
          <BuildPhasePill label="Conta de ads" status={vals.account_setup_phase as string} onChange={v => patch({ account_setup_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Criativos" status={vals.creative_phase as string} onChange={v => patch({ creative_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Copy anúncios" status={vals.copy_phase as string} onChange={v => patch({ copy_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Lançamento" status={vals.launch_phase as string} onChange={v => patch({ launch_phase: v })} accent={ACCENT} />
        </div>
        <FieldInput label="Landing page conectada (ID ou URL)" value={vals.connected_landing_id as string} onChange={v => patch({ connected_landing_id: v })} placeholder="URL da LP de destino" />
      </NodeSection>

      <AIFirstSection accent={ACCENT} vals={vals as any} patch={patch as any} />

      <NodeSection title="Entrega" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <FieldInput label="URL da conta de ads" value={vals.account_url as string} onChange={v => patch({ account_url: v })} placeholder="https://..." />
          <FieldInput label="Data de lançamento" value={vals.launch_date as string} onChange={v => patch({ launch_date: v })} placeholder="dd/mm/aaaa" />
        </div>
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 6. AGENTE IA — construir agente via ChatGPT com contexto
// ══════════════════════════════════════════════════════════════

export function IAAgentDrawer(props: NodeDrawerProps) {
  const ACCENT = "#06B6D4";
  const [vals, patch] = useNodeData(props.node, {
    // Briefing / contexto
    purpose: "", problem_it_solves: "", current_process: "",
    // Construção via ChatGPT
    agent_name: "", persona: "", tone_voice: "",
    base_prompt: "", knowledge_sources: [] as string[],
    guardrails: [] as string[],
    // Conversação
    sample_conversations: [] as string[],
    escalation_rules: "",
    // Canal
    channel: "WhatsApp Business", channel_url: "",
    // Produção
    prompt_phase: "pending", training_phase: "pending",
    test_phase: "pending", integration_phase: "pending",
    // Entrega
    deployed: false, go_live_date: "", test_link: "",
    // IA data points
    ai_integration: "Este node É o agente IA",
    ai_data_points: "",
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
      toast({ title: "Prompt gerado com base no contexto do cliente" });
    } catch { toast({ title: "Falha", variant: "destructive" }); }
    setPrefilling(false);
  };

  const exportForChatGPT = () => {
    const text = `# Agente: ${vals.agent_name || "Agente"}\n\n## Persona\n${vals.persona}\n\n## Tom de voz\n${vals.tone_voice}\n\n## System Prompt\n${vals.base_prompt}\n\n## Fontes de conhecimento\n${(vals.knowledge_sources as string[]).join("\n- ")}\n\n## Guardrails\n${(vals.guardrails as string[]).join("\n- ")}\n\n## Escalação\n${vals.escalation_rules}`;
    navigator.clipboard.writeText(text);
    toast({ title: "Configuração copiada para ChatGPT/Custom GPT" });
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Agente IA", subtitle: "Construir agente via ChatGPT com contexto do cliente", accent: ACCENT, icon: Bot }} kind="ia" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        <NodeAction label={prefilling ? "Gerando..." : "Rascunhar prompt IA"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        <NodeAction label="Exportar pra ChatGPT" icon={Copy} onClick={exportForChatGPT} />
        {vals.test_link && <a href={vals.test_link as string} target="_blank" rel="noreferrer"><NodeAction label="Testar" icon={ExternalLink} onClick={() => {}} /></a>}
        <NodeAction label={vals.deployed ? "No ar ✓" : "Marcar no ar"} icon={Check} onClick={() => patch({ deployed: !vals.deployed })} accent={vals.deployed ? "#10B981" : undefined} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Propósito do agente" accent={ACCENT}>
        <FieldInput label="Para que este agente existe" value={vals.purpose as string} onChange={v => patch({ purpose: v })}
          placeholder="Ex: Atender primeiro contato no WhatsApp do cliente e qualificar o lead" multiline rows={2} />
        <FieldInput label="Problema que resolve" value={vals.problem_it_solves as string} onChange={v => patch({ problem_it_solves: v })}
          placeholder="Ex: Dono perdendo 3h/dia respondendo as mesmas perguntas" multiline rows={2} />
        <FieldInput label="Como é feito hoje (sem IA)" value={vals.current_process as string} onChange={v => patch({ current_process: v })}
          placeholder="Quem faz e como" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Construção via ChatGPT — identidade" accent={ACCENT}>
        <div className="rounded-lg border p-3" style={{ background: `${ACCENT}06`, borderColor: `${ACCENT}20` }}>
          <p className="text-[10px] text-white/50 leading-relaxed">
            O agente é criado no <strong className="text-white/70">ChatGPT / Custom GPT</strong> usando o contexto consolidado deste workspace.
            Depois exportamos o prompt e conectamos ao canal do cliente.
          </p>
        </div>
        <FieldInput label="Nome do agente" value={vals.agent_name as string} onChange={v => patch({ agent_name: v })} placeholder="Ex: Sofia — Assistente Virtual [Empresa]" />
        <FieldInput label="Persona (quem ele é)" value={vals.persona as string} onChange={v => patch({ persona: v })}
          placeholder="Características, conhecimento, limites" multiline rows={2} />
        <FieldInput label="Tom de voz" value={vals.tone_voice as string} onChange={v => patch({ tone_voice: v })}
          placeholder="Formal / informal / técnico, vocabulário a usar/evitar" />
      </NodeSection>

      <NodeSection title="Prompt e conhecimento" accent={ACCENT}>
        <FieldInput label="System prompt completo" value={vals.base_prompt as string} onChange={v => patch({ base_prompt: v })}
          placeholder="Prompt base que define o comportamento do agente" multiline rows={6} />
        <ChecklistField label="Fontes de conhecimento (para alimentar o GPT)" items={vals.knowledge_sources as string[]} onChange={v => patch({ knowledge_sources: v })} accent={ACCENT} />
        <ChecklistField label="Guardrails (o que NUNCA fazer)" items={vals.guardrails as string[]} onChange={v => patch({ guardrails: v })} accent={ACCENT} />
        <ChecklistField label="Conversas-exemplo para testar" items={vals.sample_conversations as string[]} onChange={v => patch({ sample_conversations: v })} accent={ACCENT} />
        <FieldInput label="Regra de escalação para humano" value={vals.escalation_rules as string} onChange={v => patch({ escalation_rules: v })}
          placeholder="Ex: Se mencionar cancelamento, passar para atendimento humano" multiline rows={2} />
      </NodeSection>

      <NodeSection title="Produção do agente" accent={ACCENT}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <BuildPhasePill label="Prompt" status={vals.prompt_phase as string} onChange={v => patch({ prompt_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Treinamento" status={vals.training_phase as string} onChange={v => patch({ training_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Testes" status={vals.test_phase as string} onChange={v => patch({ test_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Integração canal" status={vals.integration_phase as string} onChange={v => patch({ integration_phase: v })} accent={ACCENT} />
        </div>
      </NodeSection>

      <NodeSection title="Canal de atendimento" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Canal principal">
            <Select value={vals.channel as string} onValueChange={v => patch({ channel: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["WhatsApp Business","Telegram","Site — chat widget","Instagram DM","Email","Slack interno","Typebot / custom"].map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <FieldInput label="URL do canal" value={vals.channel_url as string} onChange={v => patch({ channel_url: v })} placeholder="https://..." />
        </div>
        <FieldInput label="Link de teste do agente" value={vals.test_link as string} onChange={v => patch({ test_link: v })} placeholder="https://..." />
      </NodeSection>

      <NodeSection title="Dados e aprendizado contínuo" accent={ACCENT}>
        <FieldInput label="Dados que o agente coleta" value={vals.ai_data_points as string} onChange={v => patch({ ai_data_points: v })}
          placeholder="Ex: dúvidas frequentes, objeções, nível de qualificação dos leads" multiline rows={2} />
        <FieldInput label="Go-live" value={vals.go_live_date as string} onChange={v => patch({ go_live_date: v })} placeholder="dd/mm/aaaa" />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 7. MÉTRICA — instrumentar medição (construção)
// ══════════════════════════════════════════════════════════════

export function MetricaDrawerV2(props: NodeDrawerProps) {
  const ACCENT = "#60A5FA";
  const [vals, patch] = useNodeData(props.node, {
    // Definição
    metric_name: "", why_important: "", formula: "",
    // Fonte de dados — precisa ser construída
    data_source: "A definir", source_readiness: "pending",
    capture_method: "", frequency: "Semanal",
    // Valores
    baseline: "", target: "", current_value: "", unit: "",
    // Produção do dashboard
    dashboard_phase: "pending", integration_phase: "pending",
    // IA
    ai_integration: "", ai_data_points: "",
    // Entrega
    dashboard_url: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  const saveSnapshot = async () => {
    if (!vals.current_value) return;
    await supabase.from("metric_snapshots").insert({
      workspace_id: props.workspaceId, client_id: props.clientId,
      metric_name: vals.metric_name as string || props.node.title,
      value: parseFloat(vals.current_value as string),
      unit: vals.unit as string,
      captured_at: new Date().toISOString(),
    });
    toast({ title: "Snapshot salvo" });
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Métrica", subtitle: "Estruturar medição e dashboard do cliente", accent: ACCENT, icon: BarChart3 }} kind="metrica" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        <NodeAction label="Salvar snapshot" icon={BarChart3} onClick={saveSnapshot} accent={ACCENT} />
        {vals.dashboard_url && <a href={vals.dashboard_url as string} target="_blank" rel="noreferrer"><NodeAction label="Dashboard" icon={ExternalLink} onClick={() => {}} /></a>}
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Definição da métrica" accent={ACCENT}>
        <FieldInput label="Nome da métrica" value={vals.metric_name as string} onChange={v => patch({ metric_name: v })} placeholder="Ex: Taxa de conversão lead → cliente" />
        <FieldInput label="Por que é importante para o cliente" value={vals.why_important as string} onChange={v => patch({ why_important: v })}
          placeholder="O que essa métrica responde" multiline rows={2} />
        <FieldInput label="Fórmula de cálculo" value={vals.formula as string} onChange={v => patch({ formula: v })} placeholder="Ex: (clientes fechados / leads recebidos) × 100" />
      </NodeSection>

      <NodeSection title="Fonte de dados a estruturar" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="De onde virão os dados">
            <Select value={vals.data_source as string} onValueChange={v => patch({ data_source: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["CRM que construímos","Google Analytics (a instalar)","Meta Ads","Google Ads","Planilha estruturada","Integração via n8n","Dashboard custom","Captura manual","A definir"].map(s => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
          <NodeField label="Frequência de atualização">
            <Select value={vals.frequency as string} onValueChange={v => patch({ frequency: v })}>
              <SelectTrigger className="h-8 text-sm bg-white/5 border-white/10 text-white/70 focus:ring-0"><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Diária","Semanal","Quinzenal","Mensal","Trimestral"].map(f => <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </NodeField>
        </div>
        <FieldInput label="Como capturar (método)" value={vals.capture_method as string} onChange={v => patch({ capture_method: v })}
          placeholder="Ex: pixel Meta + UTM no CRM, script no Supabase puxando diariamente" multiline rows={2} />
        <BuildPhasePill label="Prontidão da fonte de dados" status={vals.source_readiness as string} onChange={v => patch({ source_readiness: v })} accent={ACCENT} />
      </NodeSection>

      <NodeSection title="Valores-chave" accent={ACCENT}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { key: "baseline", label: "Baseline", hint: "Antes" },
            { key: "target",   label: "Meta",     hint: "Objetivo" },
            { key: "current_value", label: "Atual", hint: "Agora" },
            { key: "unit",     label: "Unidade",   hint: "%, R$" },
          ].map(({ key, label, hint }) => (
            <div key={key} className="rounded-lg bg-white/4 border border-white/6 p-3">
              <p className="text-[9px] uppercase tracking-wider text-white/40 mb-1">{label} <span className="text-white/20">{hint}</span></p>
              <Input value={vals[key] as string} onChange={e => patch({ [key]: e.target.value })}
                className="h-7 text-sm bg-transparent border-0 p-0 text-white font-semibold focus-visible:ring-0 tabular-nums" placeholder="—" />
            </div>
          ))}
        </div>
      </NodeSection>

      <NodeSection title="Dashboard a construir" accent={ACCENT}>
        <div className="grid grid-cols-2 gap-2">
          <BuildPhasePill label="Dashboard visual" status={vals.dashboard_phase as string} onChange={v => patch({ dashboard_phase: v })} accent={ACCENT} />
          <BuildPhasePill label="Integração automática" status={vals.integration_phase as string} onChange={v => patch({ integration_phase: v })} accent={ACCENT} />
        </div>
        <FieldInput label="URL do dashboard (quando pronto)" value={vals.dashboard_url as string} onChange={v => patch({ dashboard_url: v })} placeholder="https://..." />
      </NodeSection>

      <AIFirstSection accent={ACCENT} vals={vals as any} patch={patch as any} />
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 8. OBJETIVO — estratégia e critério de sucesso
// ══════════════════════════════════════════════════════════════

export function ObjetivoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#10B981";
  const [vals, patch] = useNodeData(props.node, {
    what: "", why: "", measure: "", deadline: "",
    milestones: [] as string[], risks: "", owner_at_aceleriq: "", owner_at_client: "",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Objetivo", subtitle: "Meta estratégica da jornada com o cliente", accent: ACCENT, icon: Target }} kind="objetivo" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Objetivo SMART" accent={ACCENT}>
        <FieldInput label="O que precisa ser construído" value={vals.what as string} onChange={v => patch({ what: v })}
          placeholder="Específico e mensurável" multiline rows={2} />
        <FieldInput label="Por que é importante agora" value={vals.why as string} onChange={v => patch({ why: v })}
          placeholder="Impacto no negócio do cliente" multiline rows={2} />
        <FieldInput label="Como medir sucesso" value={vals.measure as string} onChange={v => patch({ measure: v })}
          placeholder="Qual número/indicador confirma" />
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="Prazo" value={vals.deadline as string} onChange={v => patch({ deadline: v })} placeholder="dd/mm/aaaa" />
          <FieldInput label="Dono na Aceleriq" value={vals.owner_at_aceleriq as string} onChange={v => patch({ owner_at_aceleriq: v })} placeholder="Nome" />
          <FieldInput label="Dono no cliente" value={vals.owner_at_client as string} onChange={v => patch({ owner_at_client: v })} placeholder="Nome / cargo" />
        </div>
      </NodeSection>
      <NodeSection title="Marcos e riscos" accent={ACCENT}>
        <ChecklistField label="Marcos do caminho" items={vals.milestones as string[]} onChange={v => patch({ milestones: v })} accent={ACCENT} />
        <FieldInput label="Riscos e dependências" value={vals.risks as string} onChange={v => patch({ risks: v })} placeholder="O que pode bloquear" multiline rows={2} />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 9. CASE — narrativa de entrega (pós go-live)
// ══════════════════════════════════════════════════════════════

export function CaseDrawer(props: NodeDrawerProps) {
  const ACCENT = "#F59E0B";
  const [vals, patch] = useNodeData(props.node, {
    summary: "", context_before: "", solution_built: "", results_delivered: "",
    client_testimonial: "", learnings_internal: "", publish_url: "",
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
        if (o.results) patch({ results_delivered: o.results });
      }
      toast({ title: "Case estruturado pela IA" });
    } catch { toast({ title: "Falha", variant: "destructive" }); }
    setPrefilling(false);
  };

  const exportCase = () => {
    const text = `# ${props.node.title}\n\n## Resumo\n${vals.summary}\n\n## Contexto antes\n${vals.context_before}\n\n## Solução construída\n${vals.solution_built}\n\n## Resultados entregues\n${vals.results_delivered}\n\n## Aprendizados\n${vals.learnings_internal}\n\n## Depoimento\n${vals.client_testimonial}`;
    const blob = new Blob([text], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `case-${props.node.title.toLowerCase().replace(/\s+/g, "-")}.md`;
    a.click();
  };

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Case", subtitle: "Narrativa do que foi construído e entregue", accent: ACCENT, icon: Trophy }} kind="case" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      actions={<>
        <NodeAction label={prefilling ? "Estruturando..." : "Estruturar com IA"} icon={prefilling ? Loader2 : Sparkles} onClick={prefill} accent={ACCENT} disabled={prefilling} />
        <NodeAction label="Exportar Markdown" icon={Copy} onClick={exportCase} />
      </>}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Narrativa do case" accent={ACCENT}>
        <FieldInput label="Resumo executivo (1-2 frases)" value={vals.summary as string} onChange={v => patch({ summary: v })} placeholder="O que o cliente alcançou" multiline rows={2} />
        <FieldInput label="Contexto antes (problema)" value={vals.context_before as string} onChange={v => patch({ context_before: v })} placeholder="Situação inicial do cliente" multiline rows={3} />
        <FieldInput label="Solução construída pela Aceleriq" value={vals.solution_built as string} onChange={v => patch({ solution_built: v })} placeholder="O que foi construído, não apenas sugerido" multiline rows={3} />
        <FieldInput label="Resultados entregues" value={vals.results_delivered as string} onChange={v => patch({ results_delivered: v })} placeholder="Números concretos, comparativos" multiline rows={3} />
      </NodeSection>
      <NodeSection title="Publicação" accent={ACCENT}>
        <FieldInput label="Aprendizados internos" value={vals.learnings_internal as string} onChange={v => patch({ learnings_internal: v })} placeholder="O que levamos para o próximo cliente" multiline rows={2} />
        <FieldInput label="Depoimento do cliente" value={vals.client_testimonial as string} onChange={v => patch({ client_testimonial: v })} placeholder="Fala real do cliente" multiline rows={2} />
        <FieldInput label="URL de publicação" value={vals.publish_url as string} onChange={v => patch({ publish_url: v })} placeholder="Link onde foi publicado" />
      </NodeSection>
    </NodeDrawerShell>
  );
}

// ══════════════════════════════════════════════════════════════
// 10. DECISÃO — registro estratégico
// ══════════════════════════════════════════════════════════════

export function DecisaoDrawer(props: NodeDrawerProps) {
  const ACCENT = "#A78BFA";
  const [vals, patch] = useNodeData(props.node, {
    context: "", options_evaluated: [] as string[], decision: "",
    owner: "", date: new Date().toISOString().split("T")[0],
    impact_on_build: "", reversible: "Sim",
  });
  const { save } = useSaveNode(props.node, props.workspaceId, props.onUpdated);

  return (
    <NodeDrawerShell
      {...props} config={{ title: "Decisão", subtitle: "Registro de decisão no processo de construção", accent: ACCENT, icon: Scale }} kind="decisao" onPrefillResult={(sec) => patch(mergeAiSections(sec, vals as Record<string, unknown>) as any)}
      onSave={async () => { await save(vals); return true; }}
    >
      <NodeSection title="Contexto da decisão" accent={ACCENT}>
        <FieldInput label="Situação que exigiu a decisão" value={vals.context as string} onChange={v => patch({ context: v })}
          placeholder="O que precisava ser definido durante a construção" multiline rows={3} />
        <ChecklistField label="Opções avaliadas" items={vals.options_evaluated as string[]} onChange={v => patch({ options_evaluated: v })} accent={ACCENT} />
      </NodeSection>
      <NodeSection title="Decisão e impacto" accent={ACCENT}>
        <FieldInput label="Decisão tomada" value={vals.decision as string} onChange={v => patch({ decision: v })} placeholder="O que foi decidido" multiline rows={2} />
        <FieldInput label="Impacto no que será construído" value={vals.impact_on_build as string} onChange={v => patch({ impact_on_build: v })}
          placeholder="Como isso muda o entregável" multiline rows={2} />
        <div className="grid grid-cols-3 gap-3">
          <FieldInput label="Decidido por" value={vals.owner as string} onChange={v => patch({ owner: v })} placeholder="Nome" />
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
