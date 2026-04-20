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

export type FunnelBlockKind =
  // tráfego
  | "traffic_ad" | "traffic_organic" | "traffic_email_cold" | "traffic_partner"
  // páginas
  | "page_landing" | "page_vsl" | "page_thanks" | "page_checkout" | "page_upsell" | "page_downsell"
  // comunicação
  | "comm_email_sequence" | "comm_whatsapp" | "comm_sms" | "comm_push"
  // lógica
  | "logic_decision" | "logic_split_test" | "logic_tag" | "logic_delay";

export type FunnelBlockFamily = "traffic" | "page" | "comm" | "logic";

export interface ConfigField {
  id: string;
  label: string;
  type: "text" | "url" | "number" | "textarea";
  placeholder?: string;
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
  /** Métricas-chave esperadas pra esse bloco */
  metricKeys: string[];
  /** Campos de config (jsonb config) */
  configFields: ConfigField[];
  /** Checklist default de produção */
  checklistTemplate: string[];
}

export const FAMILY_META: Record<FunnelBlockFamily, { label: string; color: string; bg: string; border: string }> = {
  traffic: { label: "Tráfego",     color: "text-violet-400",  bg: "bg-violet-500/10",  border: "border-violet-500/40" },
  page:    { label: "Páginas",     color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/40" },
  comm:    { label: "Comunicação", color: "text-pink-400",    bg: "bg-pink-500/10",    border: "border-pink-500/40" },
  logic:   { label: "Lógica",      color: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/40" },
};

export const FUNNEL_BLOCKS: FunnelBlockMeta[] = [
  // ─── Tráfego ────────────────────────────────────────────────────────
  {
    kind: "traffic_ad", family: "traffic", label: "Anúncio pago", shortLabel: "Ads",
    icon: Megaphone, color: "text-violet-400", border: "border-violet-500/40", bg: "bg-violet-500/10", familyTint: "bg-violet-500/5",
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
    icon: Search, color: "text-violet-400", border: "border-violet-500/40", bg: "bg-violet-500/10", familyTint: "bg-violet-500/5",
    metricKeys: ["impressions","clicks","ctr","position"],
    configFields: [
      { id: "channel", label: "Canal", type: "text", placeholder: "SEO, IG, YouTube, TikTok..." },
      { id: "keyword", label: "Palavra-chave / tema", type: "text" },
    ],
    checklistTemplate: ["Definir tema/keyword", "Produzir conteúdo", "Publicar", "Acompanhar posição"],
  },
  {
    kind: "traffic_email_cold", family: "traffic", label: "E-mail frio", shortLabel: "Cold mail",
    icon: Mail, color: "text-violet-400", border: "border-violet-500/40", bg: "bg-violet-500/10", familyTint: "bg-violet-500/5",
    metricKeys: ["sent","open_rate","reply_rate","positive_reply"],
    configFields: [
      { id: "list_size", label: "Tamanho da lista", type: "number" },
      { id: "tool", label: "Ferramenta", type: "text", placeholder: "Lemlist, Instantly..." },
    ],
    checklistTemplate: ["Lista segmentada", "Copy validada", "Warmup do domínio", "Subir cadência"],
  },
  {
    kind: "traffic_partner", family: "traffic", label: "Parceria / Afiliado", shortLabel: "Parceria",
    icon: Handshake, color: "text-violet-400", border: "border-violet-500/40", bg: "bg-violet-500/10", familyTint: "bg-violet-500/5",
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
    icon: LayoutDashboard, color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", familyTint: "bg-emerald-500/5",
    metricKeys: ["visits","conversion_rate","leads"],
    configFields: [
      { id: "url", label: "URL", type: "url", placeholder: "https://..." },
      { id: "headline", label: "Headline principal", type: "text" },
    ],
    checklistTemplate: ["Wireframe", "Copy aprovada", "Design", "Dev + analytics", "QA mobile/desktop", "Publicar"],
  },
  {
    kind: "page_vsl", family: "page", label: "Página de VSL", shortLabel: "VSL",
    icon: PlayCircle, color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", familyTint: "bg-emerald-500/5",
    metricKeys: ["visits","watch_rate","cta_click_rate"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "video_length", label: "Duração do vídeo (min)", type: "number" },
    ],
    checklistTemplate: ["Roteiro", "Gravação", "Edição", "Player + tracking", "QA", "Publicar"],
  },
  {
    kind: "page_thanks", family: "page", label: "Página de obrigado", shortLabel: "Obrigado",
    icon: CheckCircle2, color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", familyTint: "bg-emerald-500/5",
    metricKeys: ["visits"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "next_action", label: "Próximo passo no copy", type: "text" },
    ],
    checklistTemplate: ["Copy de confirmação", "Próximo CTA", "Pixel de conversão", "Publicar"],
  },
  {
    kind: "page_checkout", family: "page", label: "Checkout", shortLabel: "Checkout",
    icon: ShoppingCart, color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", familyTint: "bg-emerald-500/5",
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
    icon: ArrowUpRight, color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", familyTint: "bg-emerald-500/5",
    metricKeys: ["visits","take_rate","extra_revenue"],
    configFields: [
      { id: "url", label: "URL", type: "url" },
      { id: "price", label: "Preço (R$)", type: "number" },
    ],
    checklistTemplate: ["Oferta definida", "Copy", "Página", "Configurar one-click", "QA"],
  },
  {
    kind: "page_downsell", family: "page", label: "Downsell", shortLabel: "Downsell",
    icon: ArrowDownRight, color: "text-emerald-400", border: "border-emerald-500/40", bg: "bg-emerald-500/10", familyTint: "bg-emerald-500/5",
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
    icon: Mail, color: "text-pink-400", border: "border-pink-500/40", bg: "bg-pink-500/10", familyTint: "bg-pink-500/5",
    metricKeys: ["sent","open_rate","click_rate","unsub_rate"],
    configFields: [
      { id: "email_count", label: "Qtde de e-mails", type: "number" },
      { id: "tool", label: "Ferramenta", type: "text", placeholder: "RD, ActiveCampaign, Mailchimp..." },
    ],
    checklistTemplate: ["Mapa de e-mails", "Copy de cada e-mail", "Configurar automação", "Teste de envio", "Ativar"],
  },
  {
    kind: "comm_whatsapp", family: "comm", label: "WhatsApp", shortLabel: "WhatsApp",
    icon: MessageSquare, color: "text-pink-400", border: "border-pink-500/40", bg: "bg-pink-500/10", familyTint: "bg-pink-500/5",
    metricKeys: ["sent","read_rate","reply_rate"],
    configFields: [
      { id: "tool", label: "Ferramenta / API", type: "text", placeholder: "Z-API, Twilio, oficial..." },
      { id: "message_count", label: "Qtde de mensagens", type: "number" },
    ],
    checklistTemplate: ["Mapa de mensagens", "Templates aprovados (oficial)", "Configurar fluxo", "Testar", "Ativar"],
  },
  {
    kind: "comm_sms", family: "comm", label: "SMS", shortLabel: "SMS",
    icon: Send, color: "text-pink-400", border: "border-pink-500/40", bg: "bg-pink-500/10", familyTint: "bg-pink-500/5",
    metricKeys: ["sent","delivery_rate","click_rate"],
    configFields: [
      { id: "tool", label: "Ferramenta", type: "text" },
      { id: "message", label: "Mensagem", type: "textarea" },
    ],
    checklistTemplate: ["Texto curto (<160c)", "Link encurtado/rastreado", "Disparar teste", "Agendar envio"],
  },
  {
    kind: "comm_push", family: "comm", label: "Push notification", shortLabel: "Push",
    icon: Bell, color: "text-pink-400", border: "border-pink-500/40", bg: "bg-pink-500/10", familyTint: "bg-pink-500/5",
    metricKeys: ["sent","open_rate","click_rate"],
    configFields: [
      { id: "tool", label: "Ferramenta", type: "text", placeholder: "OneSignal, Pushwoosh..." },
    ],
    checklistTemplate: ["Segmento definido", "Copy + imagem", "Agendar", "Acompanhar métricas"],
  },

  // ─── Lógica ─────────────────────────────────────────────────────────
  {
    kind: "logic_decision", family: "logic", label: "Decisão (sim/não)", shortLabel: "Decisão",
    icon: GitBranch, color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", familyTint: "bg-amber-500/5",
    canBranch: true, metricKeys: ["yes_rate","no_rate"],
    configFields: [
      { id: "condition", label: "Condição", type: "textarea", placeholder: "Ex: Lead clicou no e-mail 2?" },
    ],
    checklistTemplate: ["Definir condição", "Configurar regra na ferramenta", "Testar ambos os caminhos"],
  },
  {
    kind: "logic_split_test", family: "logic", label: "Split test A/B", shortLabel: "A/B",
    icon: FlaskConical, color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", familyTint: "bg-amber-500/5",
    canBranch: true, metricKeys: ["variant_a_rate","variant_b_rate","winner"],
    configFields: [
      { id: "hypothesis", label: "Hipótese testada", type: "textarea" },
      { id: "split", label: "Divisão (% A / % B)", type: "text", placeholder: "50/50" },
    ],
    checklistTemplate: ["Hipótese", "Variantes prontas", "Distribuição configurada", "Critério de decisão", "Encerrar e aplicar vencedor"],
  },
  {
    kind: "logic_tag", family: "logic", label: "Aplicar tag/segmento", shortLabel: "Tag",
    icon: Tag, color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", familyTint: "bg-amber-500/5",
    metricKeys: [],
    configFields: [
      { id: "tag", label: "Tag aplicada", type: "text" },
      { id: "tool", label: "Onde", type: "text", placeholder: "RD, ActiveCampaign, CRM..." },
    ],
    checklistTemplate: ["Tag criada", "Regra de aplicação", "Validar"],
  },
  {
    kind: "logic_delay", family: "logic", label: "Atraso / Espera", shortLabel: "Delay",
    icon: Clock, color: "text-amber-400", border: "border-amber-500/40", bg: "bg-amber-500/10", familyTint: "bg-amber-500/5",
    metricKeys: [],
    configFields: [
      { id: "duration", label: "Duração", type: "text", placeholder: "Ex: 2 dias, 3 horas" },
    ],
    checklistTemplate: ["Definir tempo de espera", "Configurar na ferramenta"],
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
  const families: FunnelBlockFamily[] = ["traffic","page","comm","logic"];
  return families.map((f) => ({ family: f, blocks: FUNNEL_BLOCKS.filter((b) => b.family === f) }));
}

/**
 * Calcula taxa de conversão do funil inteiro (multiplicação das taxas).
 * Ignora blocos de lógica e blocos sem conversion_rate definida.
 */
export function calculateFunnelConversion(steps: Array<{ conversion_rate: number | null; block_kind: string }>): number | null {
  const relevant = steps.filter(
    (s) => s.conversion_rate != null && !s.block_kind.startsWith("logic_"),
  );
  if (relevant.length === 0) return null;
  return relevant.reduce((acc, s) => acc * (s.conversion_rate ?? 1), 1);
}
