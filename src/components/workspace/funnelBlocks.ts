/**
 * funnelBlocks.ts — catálogo de blocos do editor de funis
 *
 * 4 famílias: tráfego, páginas, comunicação, lógica.
 * Cada bloco tem ícone, cor, campos esperados em `config` (jsonb) e checklist
 * default de produção (copy/design/dev/QA quando aplicável).
 */
import {
  Megaphone, Search, Mail, Handshake,
  LayoutDashboard, PlayCircle, CheckCircle2, ShoppingCart, ArrowUpRight, ArrowDownRight,
  MessageSquare, Send, Smartphone, Bell,
  GitBranch, FlaskConical, Tag, Clock,
  type LucideIcon,
} from "lucide-react";
import { Zap, Webhook, Database, Workflow } from "lucide-react";

export type FunnelBlockKind =
  // tráfego
  | "traffic_ad" | "traffic_organic" | "traffic_email_cold" | "traffic_partner"
  // páginas
  | "page_landing" | "page_vsl" | "page_thanks" | "page_checkout" | "page_upsell" | "page_downsell"
  // comunicação
  | "comm_email_sequence" | "comm_whatsapp" | "comm_sms" | "comm_push"
  // lógica
  | "logic_decision" | "logic_split_test" | "logic_tag" | "logic_delay"
  // automação técnica (integração com sistemas externos)
  | "auto_workflow" | "auto_webhook" | "auto_crm_event" | "auto_pixel_event";

export type FunnelBlockFamily = "traffic" | "page" | "comm" | "logic" | "auto";

export interface ConfigField {
  id: string;
  label: string;
  type: "text" | "url" | "number" | "textarea";
  placeholder?: string;
}

export interface OfferTemplate {
  /** Permite definir oferta/promessa/preço/prova por etapa.
   *  Persistido em step.config sob a chave `offer_*`. */
  hasOffer: boolean;
}

export interface FunnelBlockMeta {
  kind: FunnelBlockKind;
  family: FunnelBlockFamily;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  /** Tailwind text color */
  color: string;
  /** Tailwind border color */
  border: string;
  /** Tailwind background tint */
  bg: string;
  /** Family-level accent (header band) */
  familyTint: string;
  /** Pode ramificar (logic_decision, logic_split_test) */
  canBranch?: boolean;
  /** Bloco aceita uma oferta direta (promessa+preço+prova) ao usuário.
   *  True para pages monetizáveis (checkout/upsell/downsell/landing/vsl). */
  hasOffer?: boolean;
  /** Bloco é uma integração técnica/automação — requer ferramenta + trigger + ação. */
  isAutomation?: boolean;
  /** Métricas-chave esperadas pra esse bloco */
  metricKeys: string[];
  /** Campos de config (jsonb config) */
  configFields: ConfigField[];
  /** Checklist default de produção */
  checklistTemplate: string[];
}

export const FAMILY_META: Record<FunnelBlockFamily, { label: string; color: string; bg: string; border: string }> = {
  traffic: { label: "Tráfego",     color: "text-foreground/60",      bg: "bg-transparent",     border: "border-border" },
  page:    { label: "Páginas",     color: "text-foreground/60",      bg: "bg-transparent",     border: "border-border" },
  comm:    { label: "Comunicação", color: "text-foreground/60",      bg: "bg-transparent",     border: "border-border" },
  logic:   { label: "Lógica",      color: "text-foreground/60",      bg: "bg-transparent",     border: "border-border" },
  auto:    { label: "Automação",   color: "text-foreground/60",      bg: "bg-transparent",     border: "border-border" },
};

export const FUNNEL_BLOCKS: FunnelBlockMeta[] = [
  // ─── Tráfego ────────────────────────────────────────────────────────
  {
    kind: "traffic_ad", family: "traffic", label: "Anúncio pago", shortLabel: "Ads",
    icon: Megaphone, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["impressions","clicks","ctr","cpc","spend","cpl"],
    configFields: [
      { id: "platform", label: "Plataforma", type: "text", placeholder: "Meta Ads, Google Ads, TikTok..." },
      { id: "campaign", label: "Campanha", type: "text", placeholder: "Nome da campanha" },
      { id: "budget", label: "Verba diária (R$)", type: "number", placeholder: "100" },
    ],
    checklistTemplate: ["Definir público", "Criativos aprovados", "Pixel/conversão configurado", "Subir e validar entrega"],
  },
  {
    kind: "traffic_organic", family: "traffic", label: "Tráfego orgânico", shortLabel: "Orgânico",
    icon: Search, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["impressions","clicks","ctr","position"],
    configFields: [
      { id: "channel", label: "Canal", type: "text", placeholder: "SEO, IG, YouTube, TikTok..." },
      { id: "keyword", label: "Palavra-chave / tema", type: "text" },
    ],
    checklistTemplate: ["Definir tema/keyword", "Produzir conteúdo", "Publicar", "Acompanhar posição"],
  },
  {
    kind: "traffic_email_cold", family: "traffic", label: "E-mail frio", shortLabel: "Cold mail",
    icon: Mail, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["sent","open_rate","reply_rate","positive_reply"],
    configFields: [
      { id: "list_size", label: "Tamanho da lista", type: "number" },
      { id: "tool", label: "Ferramenta", type: "text", placeholder: "Lemlist, Instantly..." },
    ],
    checklistTemplate: ["Lista segmentada", "Copy validada", "Warmup do domínio", "Subir cadência"],
  },
  {
    kind: "traffic_partner", family: "traffic", label: "Parceria / Afiliado", shortLabel: "Parceria",
    icon: Handshake, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["clicks","conversions","commission"],
    configFields: [
      { id: "partner", label: "Parceiro", type: "text" },
      { id: "commission", label: "Comissão (%)", type: "number" },
    ],
    checklistTemplate: ["Acordo assinado", "Material entregue", "Link rastreável", "Acompanhar performance"],
  },

  // ─── Páginas ────────────────────────────────────────────────────────
  {
    kind: "page_landing", family: "page", label: "Landing page", shortLabel: "Landing",
    icon: LayoutDashboard, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    hasOffer: true,
    metricKeys: ["visits","conversion_rate","leads"],
    configFields: [
      { id: "url", label: "URL", type: "url", placeholder: "https://..." },
      { id: "headline", label: "Headline principal", type: "text" },
    ],
    checklistTemplate: ["Wireframe", "Copy aprovada", "Design", "Dev + analytics", "QA mobile/desktop", "Publicar"],
  },
  {
    kind: "page_vsl", family: "page", label: "Página de VSL", shortLabel: "VSL",
    icon: PlayCircle, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    hasOffer: true,
    metricKeys: ["visits","watch_rate","cta_click_rate"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "video_length", label: "Duração do vídeo (min)", type: "number" },
    ],
    checklistTemplate: ["Roteiro", "Gravação", "Edição", "Player + tracking", "QA", "Publicar"],
  },
  {
    kind: "page_thanks", family: "page", label: "Página de obrigado", shortLabel: "Obrigado",
    icon: CheckCircle2, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["visits"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "next_action", label: "Próximo passo no copy", type: "text" },
    ],
    checklistTemplate: ["Copy de confirmação", "Próximo CTA", "Pixel de conversão", "Publicar"],
  },
  {
    kind: "page_checkout", family: "page", label: "Checkout", shortLabel: "Checkout",
    icon: ShoppingCart, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    hasOffer: true,
    metricKeys: ["visits","conversion_rate","sales","ticket_avg"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "platform", label: "Plataforma", type: "text", placeholder: "Hotmart, Eduzz, Stripe..." },
      { id: "price", label: "Preço (R$)", type: "number" },
    ],
    checklistTemplate: ["Produto cadastrado", "Métodos de pagamento", "Order bump", "QA fluxo completo", "Liberar"],
  },
  {
    kind: "page_upsell", family: "page", label: "Upsell", shortLabel: "Upsell",
    icon: ArrowUpRight, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    hasOffer: true,
    metricKeys: ["visits","take_rate","extra_revenue"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "price", label: "Preço (R$)", type: "number" },
    ],
    checklistTemplate: ["Oferta definida", "Copy", "Página", "Configurar one-click", "QA"],
  },
  {
    kind: "page_downsell", family: "page", label: "Downsell", shortLabel: "Downsell",
    icon: ArrowDownRight, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    hasOffer: true,
    metricKeys: ["visits","take_rate"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "price", label: "Preço (R$)", type: "number" },
    ],
    checklistTemplate: ["Oferta alternativa", "Copy", "Página", "QA"],
  },

  // ─── Comunicação ────────────────────────────────────────────────────
  {
    kind: "comm_email_sequence", family: "comm", label: "Sequência de e-mail", shortLabel: "E-mail",
    icon: Mail, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["sent","open_rate","click_rate","unsub_rate"],
    configFields: [
      { id: "email_count", label: "Qtde de e-mails", type: "number" },
      { id: "tool", label: "Ferramenta", type: "text", placeholder: "RD, ActiveCampaign, Mailchimp..." },
    ],
    checklistTemplate: ["Mapa de e-mails", "Copy de cada e-mail", "Configurar automação", "Teste de envio", "Ativar"],
  },
  {
    kind: "comm_whatsapp", family: "comm", label: "WhatsApp", shortLabel: "WhatsApp",
    icon: MessageSquare, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["sent","read_rate","reply_rate"],
    configFields: [
      { id: "tool", label: "Ferramenta / API", type: "text", placeholder: "Z-API, Twilio, oficial..." },
      { id: "message_count", label: "Qtde de mensagens", type: "number" },
    ],
    checklistTemplate: ["Mapa de mensagens", "Templates aprovados (oficial)", "Configurar fluxo", "Testar", "Ativar"],
  },
  {
    kind: "comm_sms", family: "comm", label: "SMS", shortLabel: "SMS",
    icon: Send, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["sent","delivery_rate","click_rate"],
    configFields: [
      { id: "tool", label: "Ferramenta", type: "text" },
      { id: "message", label: "Mensagem", type: "textarea" },
    ],
    checklistTemplate: ["Texto curto (<160c)", "Link encurtado/rastreado", "Disparar teste", "Agendar envio"],
  },
  {
    kind: "comm_push", family: "comm", label: "Push notification", shortLabel: "Push",
    icon: Bell, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: ["sent","open_rate","click_rate"],
    configFields: [
      { id: "tool", label: "Ferramenta", type: "text", placeholder: "OneSignal, Pushwoosh..." },
    ],
    checklistTemplate: ["Segmento definido", "Copy + imagem", "Agendar", "Acompanhar métricas"],
  },

  // ─── Lógica ─────────────────────────────────────────────────────────
  {
    kind: "logic_decision", family: "logic", label: "Decisão (sim/não)", shortLabel: "Decisão",
    icon: GitBranch, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    canBranch: true, metricKeys: ["yes_rate","no_rate"],
    configFields: [
      { id: "condition", label: "Condição", type: "textarea", placeholder: "Ex: Lead clicou no e-mail 2?" },
    ],
    checklistTemplate: ["Definir condição", "Configurar regra na ferramenta", "Testar ambos os caminhos"],
  },
  {
    kind: "logic_split_test", family: "logic", label: "Split test A/B", shortLabel: "A/B",
    icon: FlaskConical, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    canBranch: true, metricKeys: ["variant_a_rate","variant_b_rate","winner"],
    configFields: [
      { id: "hypothesis", label: "Hipótese testada", type: "textarea" },
      { id: "split", label: "Divisão (% A / % B)", type: "text", placeholder: "50/50" },
    ],
    checklistTemplate: ["Hipótese", "Variantes prontas", "Distribuição configurada", "Critério de decisão", "Encerrar e aplicar vencedor"],
  },
  {
    kind: "logic_tag", family: "logic", label: "Aplicar tag/segmento", shortLabel: "Tag",
    icon: Tag, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: [],
    configFields: [
      { id: "tag", label: "Tag aplicada", type: "text" },
      { id: "tool", label: "Onde", type: "text", placeholder: "RD, ActiveCampaign, CRM..." },
    ],
    checklistTemplate: ["Tag criada", "Regra de aplicação", "Validar"],
  },
  {
    kind: "logic_delay", family: "logic", label: "Atraso / Espera", shortLabel: "Delay",
    icon: Clock, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    metricKeys: [],
    configFields: [
      { id: "duration", label: "Duração", type: "text", placeholder: "Ex: 2 dias, 3 horas" },
    ],
    checklistTemplate: ["Definir tempo de espera", "Configurar na ferramenta"],
  },

  // ─── Automação ──────────────────────────────────────────────────────
  {
    kind: "auto_workflow", family: "auto", label: "Workflow no-code", shortLabel: "Workflow",
    icon: Workflow, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    isAutomation: true, metricKeys: ["runs","success_rate","error_count"],
    configFields: [
      { id: "tool",     label: "Ferramenta",    type: "text",     placeholder: "Zapier, Make, n8n, Pipedream..." },
      { id: "trigger",  label: "Gatilho",       type: "text",     placeholder: "Ex: novo lead no formulário X" },
      { id: "action",   label: "Ação",          type: "textarea", placeholder: "O que acontece quando dispara" },
      { id: "scenario", label: "ID do cenário/zap", type: "text", placeholder: "URL ou ID interno" },
    ],
    checklistTemplate: ["Mapear gatilho", "Configurar ferramenta", "Testar end-to-end", "Monitorar erros"],
  },
  {
    kind: "auto_webhook", family: "auto", label: "Webhook / API", shortLabel: "Webhook",
    icon: Webhook, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    isAutomation: true, metricKeys: ["calls","2xx_rate","p95_latency_ms"],
    configFields: [
      { id: "endpoint", label: "Endpoint",      type: "url",      placeholder: "https://api.exemplo.com/hook" },
      { id: "method",   label: "Método",        type: "text",     placeholder: "POST / PUT / GET" },
      { id: "auth",     label: "Auth",          type: "text",     placeholder: "Bearer / API key / nenhum" },
      { id: "payload",  label: "Payload esperado", type: "textarea", placeholder: "Estrutura JSON" },
    ],
    checklistTemplate: ["Documentar payload", "Testar com Postman/curl", "Tratar retry", "Logar erros em sentry/log"],
  },
  {
    kind: "auto_crm_event", family: "auto", label: "Evento no CRM", shortLabel: "CRM event",
    icon: Database, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    isAutomation: true, metricKeys: ["events_logged","stage_advance_rate"],
    configFields: [
      { id: "crm",        label: "CRM",            type: "text", placeholder: "RD, HubSpot, Pipedrive, Salesforce..." },
      { id: "event_name", label: "Nome do evento", type: "text", placeholder: "Ex: lead_qualified" },
      { id: "pipeline",   label: "Pipeline / etapa destino", type: "text" },
      { id: "fields",     label: "Campos atualizados", type: "textarea", placeholder: "Lista de campos modificados" },
    ],
    checklistTemplate: ["Mapear evento", "Configurar pipeline", "Testar com lead real", "Acompanhar avanço de etapa"],
  },
  {
    kind: "auto_pixel_event", family: "auto", label: "Pixel / conversão", shortLabel: "Pixel",
    icon: Zap, color: "text-foreground/60", border: "border-border", bg: "bg-transparent", familyTint: "bg-transparent",
    isAutomation: true, metricKeys: ["events_fired","match_rate","value_total"],
    configFields: [
      { id: "platform",   label: "Plataforma",        type: "text", placeholder: "Meta CAPI, GA4, GTM, TikTok..." },
      { id: "event_name", label: "Nome do evento",    type: "text", placeholder: "Lead, Purchase, AddToCart..." },
      { id: "value",      label: "Valor enviado (R$)", type: "number" },
      { id: "match_keys", label: "Chaves de matching", type: "text", placeholder: "email, phone, fbp, fbc" },
    ],
    checklistTemplate: ["Definir evento", "Configurar pixel/CAPI", "Validar no debug", "Acompanhar match quality"],
  },
];

export function getFunnelBlock(kind: string): FunnelBlockMeta {
  return FUNNEL_BLOCKS.find((b) => b.kind === kind) ?? FUNNEL_BLOCKS[0];
}

export function getFamilyMeta(family: FunnelBlockFamily) {
  return FAMILY_META[family];
}

/** Agrupa o palette por família pra UI de adicionar bloco */
export function blocksByFamily(): Array<{ family: FunnelBlockFamily; blocks: FunnelBlockMeta[] }> {
  const families: FunnelBlockFamily[] = ["traffic","page","comm","logic","auto"];
  return families.map((f) => ({ family: f, blocks: FUNNEL_BLOCKS.filter((b) => b.family === f) }));
}

/**
 * Calcula taxa de conversão do funil inteiro (multiplicação das taxas).
 * Ignora blocos de lógica e blocos sem conversion_rate definida.
 */
export function calculateFunnelConversion(steps: Array<{ conversion_rate: number | null; block_kind: string }>): number | null {
  const relevant = steps.filter(
    (s) => s.conversion_rate != null && !s.block_kind.startsWith("logic_") && !s.block_kind.startsWith("auto_"),
  );
  if (relevant.length === 0) return null;
  return relevant.reduce((acc, s) => acc * (s.conversion_rate ?? 1), 1);
}

// ═══════════════════════════════════════════════════════════════════════════
// KPIs agregados do funil
// ═══════════════════════════════════════════════════════════════════════════

export interface FunnelStepLite {
  block_kind: string;
  conversion_rate: number | null;
  expected_volume: number | null;
  actual_volume: number | null;
  config?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Agrega métricas-chave do funil:
 *  - revenue: soma de (volume × preço) em pages com hasOffer + price
 *  - spend:   soma de (budget × dias) em traffic_ad ou metrics.spend
 *  - leads:   maior expected/actual volume entre pages que terminam em "/leads" (page_landing/thanks)
 *  - sales:   actual_volume de page_checkout
 *  - cac:     spend / sales
 *  - roi:     (revenue - spend) / spend
 */
export interface FunnelKpis {
  revenue: number | null;
  spend: number | null;
  leads: number | null;
  sales: number | null;
  cac: number | null;
  roi: number | null;
  ticketAvg: number | null;
}

export function computeFunnelKpis(steps: FunnelStepLite[]): FunnelKpis {
  let revenue = 0; let revenueHits = 0;
  let spend   = 0; let spendHits   = 0;
  let leads: number | null = null;
  let sales: number | null = null;
  let ticketSum = 0; let ticketCount = 0;

  for (const s of steps) {
    const meta = getFunnelBlock(s.block_kind);
    const vol = s.actual_volume ?? s.expected_volume ?? 0;
    const price = num(s.config?.price);

    if (meta.hasOffer && price && vol > 0) {
      revenue += price * vol;
      revenueHits += 1;
      ticketSum += price; ticketCount += 1;
    }
    if (s.block_kind === "page_checkout" && vol > 0) {
      sales = (sales ?? 0) + vol;
    }
    if (s.block_kind === "page_landing" && vol > 0) {
      leads = Math.max(leads ?? 0, vol);
    }
    if (s.block_kind === "traffic_ad") {
      const budget = num(s.config?.budget);
      const metricSpend = num(s.metrics?.spend);
      if (metricSpend != null) { spend += metricSpend; spendHits += 1; }
      else if (budget != null) { spend += budget * 30; spendHits += 1; } // budget diário × 30
    }
  }

  return {
    revenue:   revenueHits > 0 ? revenue : null,
    spend:     spendHits   > 0 ? spend   : null,
    leads,
    sales,
    cac:       spend > 0 && sales && sales > 0 ? spend / sales : null,
    roi:       spend > 0 && revenueHits > 0    ? (revenue - spend) / spend : null,
    ticketAvg: ticketCount > 0 ? ticketSum / ticketCount : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Templates prontos
// ═══════════════════════════════════════════════════════════════════════════

export interface FunnelTemplate {
  id: string;
  name: string;
  description: string;
  /** Steps na ordem em que devem ser criados */
  steps: Array<{
    kind: FunnelBlockKind;
    title: string;
    description?: string;
    conversion_rate?: number;
    config?: Record<string, string | number | null>;
  }>;
}

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  {
    id: "lead_magnet",
    name: "Lead Magnet → Nutrição → Venda",
    description: "Captura via material rico, nutre por e-mail e leva pra checkout. Ideal pra ticket médio (R$ 200-2k).",
    steps: [
      { kind: "traffic_ad",          title: "Ads de captura",       conversion_rate: 0.025, config: { platform: "Meta Ads" } },
      { kind: "page_landing",        title: "Landing do lead magnet", conversion_rate: 0.35 },
      { kind: "page_thanks",         title: "Página de obrigado" },
      { kind: "comm_email_sequence", title: "Sequência de nutrição (5 e-mails)", conversion_rate: 0.08, config: { email_count: 5 } },
      { kind: "page_checkout",       title: "Checkout",             conversion_rate: 0.06 },
      { kind: "auto_pixel_event",    title: "Pixel de Purchase",    config: { event_name: "Purchase" } },
    ],
  },
  {
    id: "vsl_direct",
    name: "VSL → Checkout direto",
    description: "Tráfego direto pra VSL com checkout no fim. Funil curto pra oferta validada (high-ticket inclusive).",
    steps: [
      { kind: "traffic_ad",     title: "Ads pra VSL",       conversion_rate: 0.018 },
      { kind: "page_vsl",       title: "VSL principal",     conversion_rate: 0.12 },
      { kind: "page_checkout",  title: "Checkout",          conversion_rate: 0.45 },
      { kind: "page_upsell",    title: "Upsell #1",         conversion_rate: 0.18 },
      { kind: "page_thanks",    title: "Confirmação" },
      { kind: "comm_email_sequence", title: "Onboarding pós-compra", config: { email_count: 4 } },
    ],
  },
  {
    id: "webinar",
    name: "Webinar / Aula ao vivo",
    description: "Captura → confirmações → ao vivo → pitch → checkout com janela de oferta.",
    steps: [
      { kind: "traffic_ad",          title: "Ads de inscrição" },
      { kind: "page_landing",        title: "Inscrição no webinar", conversion_rate: 0.4 },
      { kind: "comm_whatsapp",       title: "Confirmações WhatsApp", conversion_rate: 0.55 },
      { kind: "comm_email_sequence", title: "Lembretes por e-mail",  config: { email_count: 3 } },
      { kind: "page_vsl",            title: "Aula ao vivo",          conversion_rate: 0.65 },
      { kind: "page_checkout",       title: "Checkout com oferta limitada", conversion_rate: 0.05 },
      { kind: "logic_delay",         title: "Janela de 72h",          config: { duration: "72 horas" } },
      { kind: "comm_email_sequence", title: "Quebra de objeções",     config: { email_count: 4 } },
    ],
  },
  {
    id: "launch_classic",
    name: "Lançamento clássico (PLF)",
    description: "Pré-lançamento com 3 conteúdos + carrinho aberto. Para lançamentos sazonais e produtos novos.",
    steps: [
      { kind: "traffic_ad",          title: "Captura pré-lançamento" },
      { kind: "page_landing",        title: "Inscrição no evento", conversion_rate: 0.5 },
      { kind: "comm_email_sequence", title: "Aulas 1, 2 e 3", config: { email_count: 3 } },
      { kind: "comm_whatsapp",       title: "Grupo VIP" },
      { kind: "page_vsl",            title: "Aula final + pitch", conversion_rate: 0.55 },
      { kind: "page_checkout",       title: "Checkout (carrinho aberto)", conversion_rate: 0.04 },
      { kind: "logic_delay",         title: "Janela de 7 dias", config: { duration: "7 dias" } },
      { kind: "comm_email_sequence", title: "Sequência de fechamento", config: { email_count: 6 } },
    ],
  },
  {
    id: "b2b_outbound",
    name: "B2B Outbound → Demo → Proposta",
    description: "Cold mail / LinkedIn → call de descoberta → proposta → fechamento. Ciclo longo.",
    steps: [
      { kind: "traffic_email_cold",  title: "Cold mail segmentado", conversion_rate: 0.05 },
      { kind: "page_landing",        title: "Página de demo",       conversion_rate: 0.3 },
      { kind: "auto_crm_event",      title: "Lead qualificado no CRM", config: { event_name: "lead_qualified" } },
      { kind: "comm_whatsapp",       title: "SDR — agendamento",    conversion_rate: 0.4 },
      { kind: "page_vsl",            title: "Call de descoberta",   conversion_rate: 0.5 },
      { kind: "comm_email_sequence", title: "Envio de proposta",    config: { email_count: 3 } },
      { kind: "page_checkout",       title: "Aceite + assinatura",  conversion_rate: 0.35 },
    ],
  },
];

export function getFunnelTemplate(id: string): FunnelTemplate | undefined {
  return FUNNEL_TEMPLATES.find((t) => t.id === id);
}
