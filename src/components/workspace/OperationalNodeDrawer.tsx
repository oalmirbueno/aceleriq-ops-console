/**
 * OperationalNodeDrawer — drawer enxuto e operacional.
 *
 * Cada tipo de node tem sua "lógica essencial":
 *  - landing_page: objetivo + hero + CTA + tracking
 *  - case:         PASTA (problema/ação/solução/tração/aprendizado)
 *  - ia / agente:  persona + system prompt + ferramentas
 *  - automacao:    trigger + fluxo + output
 *  - crm:          pipeline + etapas
 *  - site:         domínio + stack + páginas
 *  - metrica:      formula + baseline + target
 *  - content/video/imagem: objetivo + roteiro + CTA
 *  - default:      descrição + notes + checklist
 *
 * Todos têm:
 *  - Header com título editável + status + botão "Preencher com IA" + "Abrir Chat"
 *  - Footer com Deletar + Salvar
 */
import { useEffect, useState, useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Trash2, Sparkles, MessageCircle, Loader2, ExternalLink, Workflow } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getProjectTypeMeta, resolveProjectNodeKind, type ProjectNodeKind } from "./canvasProjectTypes";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
  onOpenChat?: (nodeId: string) => void;
}

// ─── Section config per kind ────────────────────────────────

type FieldDef = {
  id: string;
  label: string;
  type: "text" | "textarea" | "select" | "list";
  hint?: string;
  options?: string[];
  placeholder?: string;
  rows?: number;
};

type KindConfig = {
  title: string;
  subtitle: string;
  accent: string;
  sections: Array<{ id: string; title: string; fields: FieldDef[] }>;
  aiPrompt: string;
};

const KIND_CONFIGS: Partial<Record<ProjectNodeKind, KindConfig>> = {
  landing_page: {
    title: "Landing Page",
    subtitle: "Uma página, uma promessa, uma conversão",
    accent: "#E879F9",
    aiPrompt: "Gere copy de landing page completa baseada no contexto do cliente: headline, subheadline, 3 pains, 3 benefícios, CTA principal, objeções + FAQ.",
    sections: [
      {
        id: "objetivo",
        title: "Objetivo",
        fields: [
          { id: "conversion", label: "Conversão-alvo", type: "text", placeholder: "agendar demo / baixar e-book / comprar" },
          { id: "audience", label: "Quem é o visitante", type: "textarea", rows: 2, placeholder: "perfil + momento + dor principal" },
        ],
      },
      {
        id: "oferta",
        title: "Promessa central",
        fields: [
          { id: "headline", label: "Headline (1 frase)", type: "text", placeholder: "o que você entrega + pra quem + em quanto tempo" },
          { id: "mechanism", label: "Mecanismo único", type: "textarea", rows: 2, placeholder: "por que SÓ você entrega isso" },
          { id: "guarantee", label: "Garantia / risco-zero", type: "text" },
        ],
      },
      {
        id: "conversao",
        title: "CTA + tracking",
        fields: [
          { id: "cta", label: "CTA principal", type: "text", placeholder: "verbo + benefício" },
          { id: "pixels", label: "Pixels / tags", type: "text", placeholder: "GA4, Meta, GTM, LinkedIn..." },
          { id: "utm", label: "UTM padrão", type: "text", placeholder: "source · medium · campaign" },
        ],
      },
    ],
  },
  case: {
    title: "Case de sucesso",
    subtitle: "Estrutura PASTA — prova replicável",
    accent: "#FBBF24",
    aiPrompt: "Estruture um case PASTA baseado nos dados deste cliente: Problema, Ação, Solução, Tração (com números), Aprendizados.",
    sections: [
      {
        id: "identificacao",
        title: "Identificação",
        fields: [
          { id: "client", label: "Cliente", type: "text" },
          { id: "sector", label: "Setor / vertical", type: "text" },
          { id: "period", label: "Período", type: "text", placeholder: "Mar/2024 – Set/2024 (6 meses)" },
          { id: "headline", label: "Manchete do case", type: "text", placeholder: "Resultado + tempo + verbo forte" },
        ],
      },
      {
        id: "pasta",
        title: "P.A.S.T.A",
        fields: [
          { id: "problema", label: "P — Problema", type: "textarea", rows: 3, placeholder: "Estado inicial, dor específica, custo" },
          { id: "acao", label: "A — Ação", type: "textarea", rows: 3, placeholder: "Diagnóstico, hipótese, fases" },
          { id: "solucao", label: "S — Solução", type: "textarea", rows: 3, placeholder: "Entregáveis e decisões estratégicas" },
          { id: "tracao", label: "T — Tração", type: "textarea", rows: 3, placeholder: "KPIs primários com baseline + resultado" },
          { id: "aprendizado", label: "A — Aprendizado", type: "textarea", rows: 3, placeholder: "O que funcionou e o que não (honesto)" },
        ],
      },
    ],
  },
  ia: {
    title: "Agente de IA",
    subtitle: "Persona + prompt + ferramentas + guardrails",
    accent: "#06B6D4",
    aiPrompt: "Configure este agente IA: persona, system prompt, ferramentas necessárias, guardrails, casos de teste.",
    sections: [
      {
        id: "proposito",
        title: "Propósito",
        fields: [
          { id: "name", label: "Nome do agente", type: "text" },
          { id: "pitch", label: "Pitch em 1 frase", type: "text", placeholder: "o que ele faz pra quem, em até 15 palavras" },
          { id: "user", label: "Usuário-alvo", type: "textarea", rows: 2 },
          { id: "success", label: "Definição de sucesso", type: "textarea", rows: 2, placeholder: "Quando consideramos uma conversa boa?" },
        ],
      },
      {
        id: "model",
        title: "Modelo e plataforma",
        fields: [
          { id: "platform", label: "Plataforma", type: "select", options: ["Lovable AI Gateway", "OpenAI Assistants", "Anthropic", "Vertex", "n8n AI Agent", "Voiceflow"] },
          { id: "model", label: "Modelo", type: "text", placeholder: "google/gemini-3-flash-preview, gpt-5, claude-4.5..." },
          { id: "temp", label: "Temperature + params", type: "text", placeholder: "temp=0.3 · top_p=0.9 · max_tokens=1024" },
          { id: "interface", label: "Interface (canal de uso)", type: "text", placeholder: "Chat web, WhatsApp, Slack, iframe" },
        ],
      },
      {
        id: "prompt",
        title: "System prompt",
        fields: [
          { id: "persona", label: "Persona / tom", type: "textarea", rows: 3 },
          { id: "system", label: "System prompt completo", type: "textarea", rows: 6 },
          { id: "output", label: "Formato de saída", type: "text", placeholder: "Markdown / JSON com schema / texto puro" },
        ],
      },
      {
        id: "tools",
        title: "Ferramentas (function calling)",
        fields: [
          { id: "tools_list", label: "Tools (nome → o que faz)", type: "textarea", rows: 3 },
          { id: "when_tools", label: "Quando chamar cada tool", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "guardrails",
        title: "Guardrails",
        fields: [
          { id: "refuse", label: "O que recusar", type: "textarea", rows: 2 },
          { id: "pii", label: "Política de PII", type: "text" },
          { id: "prompt_injection", label: "Defesa contra prompt injection", type: "textarea", rows: 2 },
        ],
      },
    ],
  },
  agente: {
    title: "Agente operacional",
    subtitle: "Execução + handoffs + validação",
    accent: "#06B6D4",
    aiPrompt: "Configure este agente operacional: objetivo, trigger, fluxo, handoffs, métricas.",
    sections: [
      {
        id: "funcao",
        title: "Função",
        fields: [
          { id: "goal", label: "Objetivo", type: "textarea", rows: 2 },
          { id: "trigger", label: "Trigger de ativação", type: "text" },
          { id: "output", label: "Output esperado", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "fluxo",
        title: "Fluxo operacional",
        fields: [
          { id: "steps", label: "Passos (ordenados)", type: "textarea", rows: 5 },
          { id: "handoffs", label: "Handoffs pra humano", type: "textarea", rows: 2 },
          { id: "validation", label: "Critérios de aceite", type: "textarea", rows: 2 },
        ],
      },
    ],
  },
  automacao: {
    title: "Automação",
    subtitle: "Trigger + flow + output",
    accent: "#34D399",
    aiPrompt: "Desenhe esta automação: trigger, fluxo em etapas, integrações necessárias, fallback.",
    sections: [
      {
        id: "trigger",
        title: "Trigger",
        fields: [
          { id: "event", label: "Evento disparador", type: "text", placeholder: "Webhook de X / cron / form submit" },
          { id: "source", label: "Fonte dos dados", type: "text" },
        ],
      },
      {
        id: "flow",
        title: "Fluxo",
        fields: [
          { id: "steps", label: "Passos do fluxo", type: "textarea", rows: 6, placeholder: "1. Valida\n2. Busca\n3. Transforma\n4. Envia" },
          { id: "integrations", label: "Integrações", type: "text", placeholder: "n8n, Make, Zapier, API própria..." },
          { id: "fallback", label: "Fallback (se falhar)", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "output",
        title: "Output + monitoring",
        fields: [
          { id: "result", label: "Resultado esperado", type: "textarea", rows: 2 },
          { id: "logs", label: "Onde loga", type: "text" },
          { id: "roi", label: "ROI estimado (horas/mês)", type: "text" },
        ],
      },
    ],
  },
  crm: {
    title: "CRM / Pipeline",
    subtitle: "Pipeline + lead scoring + nutrição",
    accent: "#8B5CF6",
    aiPrompt: "Configure este CRM: etapas do pipeline, critérios de entrada/saída, SLA, automações.",
    sections: [
      {
        id: "platform",
        title: "Plataforma",
        fields: [
          { id: "tool", label: "CRM principal", type: "text", placeholder: "HubSpot, RD Station, Pipedrive, Salesforce..." },
          { id: "marketing", label: "Automação de marketing", type: "text" },
        ],
      },
      {
        id: "pipeline",
        title: "Pipeline (etapas)",
        fields: [
          { id: "stages", label: "Estágios do pipeline", type: "textarea", rows: 4, placeholder: "Lead novo → MQL → SQL → Proposta → Fechado" },
          { id: "entry", label: "Critério de ENTRADA por estágio", type: "textarea", rows: 3 },
          { id: "exit", label: "Critério de SAÍDA por estágio", type: "textarea", rows: 3 },
          { id: "sla", label: "SLA por estágio (tempo máx)", type: "text" },
        ],
      },
      {
        id: "scoring",
        title: "Lead scoring",
        fields: [
          { id: "positive", label: "Pontos positivos", type: "textarea", rows: 2 },
          { id: "negative", label: "Pontos negativos", type: "textarea", rows: 2 },
          { id: "threshold", label: "Threshold → estágio", type: "text" },
        ],
      },
    ],
  },
  site: {
    title: "Site / Portal",
    subtitle: "Domínio + stack + páginas",
    accent: "#60A5FA",
    aiPrompt: "Estruture este site: objetivo, páginas, stack técnico, integrações.",
    sections: [
      {
        id: "base",
        title: "Base",
        fields: [
          { id: "domain", label: "Domínio", type: "text" },
          { id: "purpose", label: "Objetivo do site", type: "textarea", rows: 2 },
          { id: "stack", label: "Stack técnico", type: "text", placeholder: "Next.js / Lovable / WordPress..." },
        ],
      },
      {
        id: "pages",
        title: "Páginas",
        fields: [
          { id: "structure", label: "Estrutura (sitemap)", type: "textarea", rows: 5 },
          { id: "cta", label: "CTA principal do site", type: "text" },
        ],
      },
    ],
  },
  metrica: {
    title: "Métrica",
    subtitle: "Fórmula + baseline + target",
    accent: "#F472B6",
    aiPrompt: "Defina esta métrica: fórmula exata, baseline atual, target, frequência de medição.",
    sections: [
      {
        id: "def",
        title: "Definição",
        fields: [
          { id: "name", label: "Nome da métrica", type: "text" },
          { id: "formula", label: "Fórmula", type: "textarea", rows: 2, placeholder: "ex: MRR = Σ(planos ativos) / mês" },
          { id: "source", label: "Fonte dos dados", type: "text" },
        ],
      },
      {
        id: "target",
        title: "Baseline + Target",
        fields: [
          { id: "baseline", label: "Baseline atual", type: "text" },
          { id: "target", label: "Target (90d / 6m / 1a)", type: "text" },
          { id: "frequency", label: "Frequência de medição", type: "select", options: ["Diária", "Semanal", "Mensal", "Trimestral"] },
        ],
      },
    ],
  },
  conteudo: {
    title: "Conteúdo",
    subtitle: "Objetivo + roteiro + CTA",
    accent: "#F59E0B",
    aiPrompt: "Crie este conteúdo: hook, desenvolvimento, CTA, distribuição.",
    sections: [
      {
        id: "brief",
        title: "Briefing",
        fields: [
          { id: "goal", label: "Objetivo do conteúdo", type: "text" },
          { id: "audience", label: "Público-alvo", type: "textarea", rows: 2 },
          { id: "format", label: "Formato", type: "select", options: ["Post feed", "Reel/Short", "Carrossel", "Artigo blog", "Newsletter", "Vídeo longo", "Podcast"] },
        ],
      },
      {
        id: "content",
        title: "Conteúdo",
        fields: [
          { id: "hook", label: "Hook (3 primeiros segundos)", type: "textarea", rows: 2 },
          { id: "body", label: "Desenvolvimento", type: "textarea", rows: 5 },
          { id: "cta", label: "CTA final", type: "text" },
        ],
      },
    ],
  },
  briefing: {
    title: "Briefing",
    subtitle: "Entrada consolidada de contexto",
    accent: "#00FF88",
    aiPrompt: "Consolide este briefing: empresa, mercado, objetivos, restrições, KPIs.",
    sections: [
      {
        id: "empresa",
        title: "Empresa",
        fields: [
          { id: "name", label: "Nome / razão", type: "text" },
          { id: "positioning", label: "Posicionamento atual", type: "textarea", rows: 2 },
          { id: "differentiator", label: "Diferencial", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "mercado",
        title: "Mercado",
        fields: [
          { id: "icp", label: "ICP — Cliente ideal", type: "textarea", rows: 3 },
          { id: "competitors", label: "Principais concorrentes", type: "text" },
          { id: "objections", label: "Objeções recorrentes", type: "textarea", rows: 2 },
        ],
      },
      {
        id: "objetivos",
        title: "Objetivos + restrições",
        fields: [
          { id: "goals", label: "Objetivos (90d)", type: "textarea", rows: 3 },
          { id: "kpis", label: "KPIs acompanhados", type: "textarea", rows: 2 },
          { id: "constraints", label: "Restrições / não-fazer", type: "textarea", rows: 2 },
        ],
      },
    ],
  },
};

// Default config for unknown kinds
const DEFAULT_CONFIG: KindConfig = {
  title: "Node",
  subtitle: "Conteúdo operacional",
  accent: "#00FF88",
  aiPrompt: "Preencha os campos deste node com base no contexto do workspace.",
  sections: [
    {
      id: "basics",
      title: "Conteúdo",
      fields: [
        { id: "description", label: "Descrição", type: "textarea", rows: 3 },
        { id: "notes", label: "Notas", type: "textarea", rows: 4 },
      ],
    },
  ],
};

// ─── Main Drawer ─────────────────────────────────────────────

export default function OperationalNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName,
  onDelete, onUpdated, onOpenChat,
}: Props) {
  const kind = resolveProjectNodeKind({ nodeType: node.node_type, data: node.data }) as ProjectNodeKind | null;
  const config = (kind && KIND_CONFIGS[kind]) || DEFAULT_CONFIG;
  const meta = kind ? getProjectTypeMeta(kind) : null;

  const [title, setTitle] = useState(node.title);
  const [status, setStatus] = useState(node.status ?? "active");
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [prefilling, setPrefilling] = useState(false);

  // Load values from node.data
  useEffect(() => {
    const data = (node.data as Record<string, unknown> | null) ?? {};
    const existing = (data.fields as Record<string, string> | undefined) ?? {};
    setValues(existing);
    setTitle(node.title);
    setStatus(node.status ?? "active");
  }, [node]);

  const setField = useCallback((key: string, v: string) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const currentData = (node.data as Record<string, unknown> | null) ?? {};
    const { error } = await supabase
      .from("canvas_nodes")
      .update({
        title,
        status,
        data: { ...currentData, fields: values, lastEditedAt: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Salvo", description: `${config.title} atualizado.` });
    await onUpdated?.();
  }, [node.id, node.data, title, status, values, config.title, onUpdated]);

  const prefillWithAI = useCallback(async () => {
    setPrefilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("prefill-node", {
        body: {
          nodeId: node.id,
          workspaceId,
          clientId,
          kind,
          customPrompt: config.aiPrompt,
          sections: config.sections.map((s) => ({
            id: s.id,
            title: s.title,
            fields: s.fields.map((f) => ({ id: f.id, label: f.label, type: f.type })),
          })),
        },
      });
      if (error) throw error;
      if (data?.fields) {
        const merged: Record<string, string> = { ...values };
        Object.entries(data.fields as Record<string, string>).forEach(([k, v]) => {
          if (v && typeof v === "string") merged[k] = v;
        });
        setValues(merged);
        toast({ title: "Preenchido com IA", description: "Campos rascunhados — revise antes de salvar." });
      }
    } catch (err) {
      toast({
        title: "Falha no preenchimento",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setPrefilling(false);
    }
  }, [node.id, workspaceId, clientId, kind, config, values]);

  const deleteNode = useCallback(async () => {
    if (!onDelete) return;
    const ok = window.confirm(`Excluir ${config.title} "${title}"?`);
    if (!ok) return;
    await onDelete(node.id);
    onOpenChange(false);
  }, [onDelete, node.id, title, config.title, onOpenChange]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
        style={{ background: "#0A0D08" }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 border-b"
          style={{
            borderColor: `${config.accent}20`,
            background: `linear-gradient(135deg, ${config.accent}08, transparent)`,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg shrink-0"
                style={{
                  background: `${config.accent}15`,
                  border: `1px solid ${config.accent}40`,
                  color: config.accent,
                }}
              >
                {meta?.icon ? <meta.icon className="h-4 w-4" /> : <Workflow className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider mb-1" style={{ color: config.accent }}>
                  {config.title}
                  <Badge variant="outline" className="h-4 text-[9px] px-1.5">
                    {status}
                  </Badge>
                </div>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="h-8 text-base font-semibold bg-transparent border-0 px-0 focus-visible:ring-0"
                />
                <p className="text-xs text-muted-foreground mt-1">{config.subtitle}</p>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <Button
              onClick={prefillWithAI}
              disabled={prefilling}
              size="sm"
              className="h-7 gap-1.5 text-xs"
              style={{ background: `${config.accent}20`, color: config.accent, border: `1px solid ${config.accent}40` }}
            >
              {prefilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Preencher com IA
            </Button>
            {onOpenChat && (
              <Button
                onClick={() => onOpenChat(node.id)}
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs"
              >
                <MessageCircle className="h-3 w-3" />
                Abrir Chat
              </Button>
            )}
            <div className="flex-1" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Rascunho</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="blocked">Bloqueado</SelectItem>
                <SelectItem value="done">Concluído</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Sections */}
        <ScrollArea className="flex-1">
          <div className="px-5 py-4 space-y-5">
            {config.sections.map((section) => (
              <section key={section.id}>
                <h3 className="text-[11px] uppercase tracking-wider font-semibold mb-2.5" style={{ color: config.accent }}>
                  {section.title}
                </h3>
                <div className="space-y-3">
                  {section.fields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label className="text-xs text-foreground/80">{field.label}</Label>
                      {field.type === "textarea" ? (
                        <Textarea
                          value={values[field.id] ?? ""}
                          onChange={(e) => setField(field.id, e.target.value)}
                          placeholder={field.placeholder ?? field.hint}
                          rows={field.rows ?? 3}
                          className="text-xs bg-background/60"
                        />
                      ) : field.type === "select" ? (
                        <Select
                          value={values[field.id] ?? ""}
                          onValueChange={(v) => setField(field.id, v)}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {(field.options ?? []).map((opt) => (
                              <SelectItem key={opt} value={opt} className="text-xs">
                                {opt}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          value={values[field.id] ?? ""}
                          onChange={(e) => setField(field.id, e.target.value)}
                          placeholder={field.placeholder ?? field.hint}
                          className="h-8 text-xs"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border/50 flex items-center gap-2 bg-background/40">
          <Button
            variant="ghost"
            size="sm"
            onClick={deleteNode}
            disabled={!onDelete}
            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3 w-3 mr-1.5" />
            Excluir
          </Button>
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
            Fechar
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            size="sm"
            className="h-8 text-xs gap-1.5"
            style={{ background: config.accent, color: "#0A0D08" }}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
