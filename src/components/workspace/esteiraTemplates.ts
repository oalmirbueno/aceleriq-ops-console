/**
 * Templates de Esteira de Produção por plano Aceleriq.
 *
 * Cada template define a operação inteira que entregamos para o cliente —
 * não só uma landing solta. Os nodes são posicionados por etapa ACELERA,
 * com checklists herdados do tipo. O briefing geralmente vem da SiteBolt
 * (ou outro origem) — aqui o node de briefing apenas "fixa" essa entrada.
 *
 * Cada template é um conjunto de nodes + edges de sequência (esteira).
 * O usuário escolhe pelo plano do cliente; o engine seedea o canvas.
 */

import type { ProjectNodeKind, AceleraStageKey } from "./canvasProjectTypes";
import type { PlanKey } from "./aceleraConstants";

export interface EsteiraTemplateNode {
  /** Local id used only to wire edges inside the template */
  ref: string;
  kind: ProjectNodeKind;
  stage: AceleraStageKey;
  title: string;
  description?: string;
}

export interface EsteiraTemplateEdge {
  fromRef: string;
  toRef: string;
  label?: string;
}

export interface EsteiraTemplate {
  /** "ai_smart" é gerado dinamicamente pela edge function generate-esteira-ai */
  key: PlanKey | "custom" | "ai_smart";
  label: string;
  tagline: string;
  /** Cor de destaque do card no menu */
  accent: string;
  nodes: EsteiraTemplateNode[];
  edges: EsteiraTemplateEdge[];
}

/* ─── Starter ─── Fundação digital essencial ───
 * Briefing → Site institucional simples → Conteúdo base → Lançamento básico → Métricas
 */
const STARTER: EsteiraTemplate = {
  key: "starter",
  label: "Starter — Fundação",
  tagline: "Presença digital básica + processos iniciais",
  accent: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  nodes: [
    { ref: "brief",   kind: "briefing",     stage: "entrada",       title: "Briefing inicial",            description: "Importado da SiteBolt ou preenchido manualmente." },
    { ref: "diag",    kind: "documento",    stage: "diagnostico",   title: "Diagnóstico digital",         description: "Mapeamento rápido de presença atual e gaps." },
    { ref: "objs",    kind: "objetivo",     stage: "planejamento",  title: "Objetivos do plano Starter",  description: "Metas mínimas a entregar nos primeiros 60 dias." },
    { ref: "site",    kind: "site",         stage: "producao",      title: "Site institucional",          description: "Site essencial responsivo (template SiteBolt)." },
    { ref: "conteudo",kind: "conteudo",     stage: "producao",      title: "Conteúdo base",               description: "Textos, sobre, serviços, contato." },
    { ref: "lanc",    kind: "lancamento",   stage: "ativacao",      title: "Go-live do site",             description: "Publicação, indexação, social mínimo." },
    { ref: "kpi",     kind: "metrica",      stage: "otimizacao",    title: "Métricas iniciais",           description: "Visitas, formulário, base de tracking." },
  ],
  edges: [
    { fromRef: "brief",    toRef: "diag" },
    { fromRef: "diag",     toRef: "objs" },
    { fromRef: "objs",     toRef: "site" },
    { fromRef: "site",     toRef: "conteudo" },
    { fromRef: "conteudo", toRef: "lanc" },
    { fromRef: "lanc",     toRef: "kpi" },
  ],
};

/* ─── Growth ─── Aceleração com funil completo ───
 * Briefing + Diagnóstico → Objetivos + Funil → LP + Conteúdo + Email → Tráfego + CRM → Métricas → Otimização
 */
const GROWTH: EsteiraTemplate = {
  key: "growth",
  label: "Growth — Aceleração",
  tagline: "Funil completo: aquisição, conversão e operação escalável",
  accent: "border-violet-500/40 text-violet-300 bg-violet-500/10",
  nodes: [
    { ref: "brief",   kind: "briefing",     stage: "entrada",        title: "Briefing estratégico",        description: "Importado da SiteBolt + sessão estratégica." },
    { ref: "diag",    kind: "documento",    stage: "diagnostico",    title: "Diagnóstico de operação",     description: "Posicionamento, oferta, canais, bloqueios." },
    { ref: "stake",   kind: "contato",      stage: "estrutura_base", title: "Stakeholders & papéis",       description: "Quem aprova, quem executa, quem é responsável." },
    { ref: "objs",    kind: "objetivo",     stage: "planejamento",   title: "Metas trimestrais",           description: "Receita, leads, ticket, conversão." },
    { ref: "funil",   kind: "funil",        stage: "planejamento",   title: "Funil de aquisição",          description: "Topo, meio, fundo — canais, mensagens, ofertas." },
    { ref: "lp",      kind: "landing_page", stage: "producao",       title: "Landing Page principal",      description: "LP de oferta principal (SiteBolt)." },
    { ref: "conteudo",kind: "conteudo",     stage: "producao",       title: "Conteúdo do funil",           description: "Copy de site, ofertas, materiais ricos." },
    { ref: "email",   kind: "email_mkt",    stage: "producao",       title: "Sequências de email",         description: "Boas-vindas, nutrição, reativação." },
    { ref: "crm",     kind: "crm",          stage: "estrutura_base", title: "CRM / Pipeline comercial",    description: "Estágios, campos, automações de vendas." },
    { ref: "lanc",    kind: "lancamento",   stage: "ativacao",       title: "Lançamento da campanha",      description: "Go-live + comunicação coordenada." },
    { ref: "trafego", kind: "trafego",      stage: "ativacao",       title: "Tráfego pago",                description: "Meta/Google Ads — campanhas iniciais." },
    { ref: "social",  kind: "social",       stage: "ativacao",       title: "Conteúdo social",             description: "Calendário inicial em redes." },
    { ref: "kpi",     kind: "metrica",      stage: "otimizacao",     title: "Painel de métricas",          description: "CPA, CAC, conversão por etapa." },
    { ref: "ba",      kind: "before_after", stage: "expansao",       title: "Before / After do mês",       description: "Resultados vs. ponto de partida." },
  ],
  edges: [
    { fromRef: "brief",    toRef: "diag" },
    { fromRef: "diag",     toRef: "stake" },
    { fromRef: "stake",    toRef: "objs" },
    { fromRef: "objs",     toRef: "funil" },
    { fromRef: "funil",    toRef: "lp" },
    { fromRef: "lp",       toRef: "conteudo" },
    { fromRef: "conteudo", toRef: "email" },
    { fromRef: "email",    toRef: "crm" },
    { fromRef: "crm",      toRef: "lanc" },
    { fromRef: "lanc",     toRef: "trafego" },
    { fromRef: "trafego",  toRef: "social" },
    { fromRef: "social",   toRef: "kpi" },
    { fromRef: "kpi",      toRef: "ba" },
  ],
};

/* ─── Enterprise ─── Operação profunda + IA + automação + escala ─── */
const ENTERPRISE: EsteiraTemplate = {
  key: "enterprise",
  label: "Enterprise — Estruturação Profunda",
  tagline: "Arquitetura completa com IA, automações e expansão contínua",
  accent: "border-primary/50 text-primary bg-primary/10",
  nodes: [
    { ref: "brief",     kind: "briefing",     stage: "entrada",        title: "Briefing de Estruturação",      description: "Briefing Enterprise + sessões com lideranças." },
    { ref: "reuniao",   kind: "reuniao",     stage: "entrada",        title: "Kick-off executivo",            description: "Alinhamento com diretoria e patrocinador." },
    { ref: "diag",      kind: "documento",    stage: "diagnostico",    title: "Diagnóstico estrutural",        description: "Pessoas, processos, sistemas, dados." },
    { ref: "stake",     kind: "contato",      stage: "estrutura_base", title: "Mapa de stakeholders",          description: "RACI completo por área." },
    { ref: "arch",      kind: "documento",    stage: "estrutura_base", title: "Arquitetura da operação",       description: "Stack, integrações, fluxos de dados." },
    { ref: "objs",      kind: "objetivo",     stage: "planejamento",   title: "OKRs anuais",                   description: "Objetivos e KRs por área." },
    { ref: "funil",     kind: "funil",        stage: "planejamento",   title: "Funil omnichannel",             description: "Aquisição, retenção, expansão." },
    { ref: "lp",        kind: "landing_page", stage: "producao",       title: "Landing Pages de oferta",       description: "Múltiplas LPs por persona/segmento." },
    { ref: "site",      kind: "site",         stage: "producao",       title: "Site corporativo",              description: "Site institucional + áreas de cliente." },
    { ref: "conteudo",  kind: "conteudo",     stage: "producao",       title: "Conteúdo & posicionamento",     description: "Narrativa, materiais ricos, blog." },
    { ref: "automacao", kind: "automacao",    stage: "producao",       title: "Automações operacionais",       description: "n8n / Make — integrações entre sistemas." },
    { ref: "ia",        kind: "ia",           stage: "producao",       title: "Agentes de IA",                 description: "IA para atendimento, qualificação, conteúdo." },
    { ref: "integra",   kind: "integracao",   stage: "producao",       title: "Integrações de dados",          description: "CRM ↔ ERP ↔ marketing ↔ analytics." },
    { ref: "crm",       kind: "crm",          stage: "estrutura_base", title: "CRM enterprise",                description: "Pipeline B2B, forecast, automações." },
    { ref: "email",     kind: "email_mkt",    stage: "ativacao",       title: "Email marketing avançado",      description: "Segmentação, lifecycle, transacional." },
    { ref: "trafego",   kind: "trafego",      stage: "ativacao",       title: "Mídia paga multicanal",         description: "Meta, Google, LinkedIn, programática." },
    { ref: "social",    kind: "social",       stage: "ativacao",       title: "Conteúdo & social orgânico",    description: "Calendário editorial em escala." },
    { ref: "lanc",      kind: "lancamento",   stage: "ativacao",       title: "Lançamentos coordenados",       description: "Campanhas integradas trimestrais." },
    { ref: "kpi",       kind: "metrica",      stage: "otimizacao",     title: "Painel executivo",              description: "Dashboards de OKRs e KPIs por área." },
    { ref: "ba",        kind: "before_after", stage: "expansao",       title: "Before / After estratégico",    description: "Comparativos trimestrais vs. baseline." },
    { ref: "case",      kind: "case",         stage: "expansao",       title: "Case Aceleriq",                 description: "Documentação do case para uso em vendas." },
  ],
  edges: [
    { fromRef: "brief",     toRef: "reuniao" },
    { fromRef: "reuniao",   toRef: "diag" },
    { fromRef: "diag",      toRef: "stake" },
    { fromRef: "stake",     toRef: "arch" },
    { fromRef: "arch",      toRef: "objs" },
    { fromRef: "objs",      toRef: "funil" },
    { fromRef: "funil",     toRef: "lp" },
    { fromRef: "lp",        toRef: "site" },
    { fromRef: "site",      toRef: "conteudo" },
    { fromRef: "conteudo",  toRef: "automacao" },
    { fromRef: "automacao", toRef: "ia" },
    { fromRef: "ia",        toRef: "integra" },
    { fromRef: "integra",   toRef: "crm" },
    { fromRef: "crm",       toRef: "email" },
    { fromRef: "email",     toRef: "trafego" },
    { fromRef: "trafego",   toRef: "social" },
    { fromRef: "social",    toRef: "lanc" },
    { fromRef: "lanc",      toRef: "kpi" },
    { fromRef: "kpi",       toRef: "ba" },
    { fromRef: "ba",        toRef: "case" },
  ],
};

/* ─── Custom (mínimo) ─── Apenas pontos de entrada ─── */
const CUSTOM: EsteiraTemplate = {
  key: "custom",
  label: "Personalizado — Apenas Briefing",
  tagline: "Comece do zero: só o briefing inicial, monte o resto manualmente",
  accent: "border-border text-foreground bg-muted/30",
  nodes: [
    { ref: "brief", kind: "briefing", stage: "entrada", title: "Briefing inicial", description: "Ponto de partida da esteira." },
  ],
  edges: [],
};

export const ESTEIRA_TEMPLATES: EsteiraTemplate[] = [STARTER, GROWTH, ENTERPRISE, CUSTOM];

export function getEsteiraTemplateForPlan(plan: string | null | undefined): EsteiraTemplate {
  switch (plan) {
    case "starter":    return STARTER;
    case "growth":     return GROWTH;
    case "enterprise": return ENTERPRISE;
    default:           return GROWTH; // sane default
  }
}

export function getEsteiraTemplate(key: PlanKey | "custom"): EsteiraTemplate {
  return ESTEIRA_TEMPLATES.find((t) => t.key === key) ?? GROWTH;
}
