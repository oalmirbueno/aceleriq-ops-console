/**
 * typePlaybooks — playbooks de canvas por TIPO DE PROJETO.
 *
 * Diferente de canvasPlaybooks.ts (que é por PLANO), este é por TIPO:
 *   - one_shot_site → fluxo de entrega de site
 *   - one_shot_automation → fluxo de desenvolvimento de automação
 *   - one_shot_agent → fluxo de criação de agente IA
 *   - marketing_service → fluxo de marketing recorrente
 *   - legacy_marketing → livre (sem playbook)
 *   - ai_first → usa o canvasPlaybooks do plano (starter/growth/enterprise)
 *
 * Cada playbook aqui é ENXUTO e focado no entregável específico.
 */
import type { ProjectNodeKind, AceleraStageKey } from "./canvasProjectTypes";
import type { ProjectType } from "@/lib/projectTypes";
import type { Playbook } from "./canvasPlaybooks";
import { playbookPos } from "./canvasPlaybooks";

const STAGE_COL: Record<AceleraStageKey, number> = {
  entrada: 0, diagnostico: 1, estrutura_base: 2, planejamento: 3,
  producao: 4, ativacao: 5, otimizacao: 6, expansao: 7,
};

// ═════════════════════════════════════════════════════════════
// ONE-SHOT SITE — entrega de site institucional
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_SITE: Omit<Playbook, "planKey"> = {
  name: "Site Institucional",
  description: "Fluxo enxuto de entrega de site. Briefing, arquitetura, design, dev, revisão, go-live.",
  nodes: [
    { ref: "brief",    kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do site",           description: "Objetivo, público, referências, identidade visual." },
    { ref: "access",   kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos & domínios",        description: "Credenciais do domínio, hospedagem, integrações." },
    { ref: "arch",     kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Arquitetura do site",       description: "Mapa de páginas, menus, fluxos, CTAs." },
    { ref: "copy",     kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Copy de todas as páginas",  description: "Textos de home, sobre, serviços, contato." },
    { ref: "design",   kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Design + Dev do site",      description: "Layout, desenvolvimento no Lovable/Webflow/WordPress." },
    { ref: "forms",    kind: "automacao",    stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Formulários e integrações", description: "Captura de contato, conexão com CRM/email." },
    { ref: "review",   kind: "documento",    stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Revisão final com cliente",  description: "Revisão de conteúdo, design e ajustes." },
    { ref: "golive",   kind: "landing_page", stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Go-live + DNS",              description: "Publicação no domínio final, SSL, checklist." },
    { ref: "handoff",  kind: "documento",    stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Handoff + tutorial CMS",     description: "Manual de edição para o cliente." },
  ],
  edges: [
    { fromRef: "brief",   toRef: "arch",    label: "gera" },
    { fromRef: "access",  toRef: "golive",  label: "necessário" },
    { fromRef: "arch",    toRef: "copy",    label: "orienta" },
    { fromRef: "arch",    toRef: "design",  label: "orienta" },
    { fromRef: "copy",    toRef: "design",  label: "insere" },
    { fromRef: "design",  toRef: "forms",   label: "integra" },
    { fromRef: "design",  toRef: "review",  label: "revisa" },
    { fromRef: "review",  toRef: "golive",  label: "aprova" },
    { fromRef: "golive",  toRef: "handoff", label: "finaliza" },
  ],
};

// ═════════════════════════════════════════════════════════════
// ONE-SHOT AUTOMATION — desenvolvimento de automação
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_AUTOMATION: Omit<Playbook, "planKey"> = {
  name: "Automação de Processo",
  description: "Fluxo enxuto pra construir e entregar uma automação: diagnóstico, arquitetura, build, testes, deploy.",
  nodes: [
    { ref: "brief",     kind: "briefing",   stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do processo",         description: "Que processo automatizar, frequência, dor atual." },
    { ref: "access",    kind: "acessos",    stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos das ferramentas",      description: "APIs, tokens, webhooks, conexões necessárias." },
    { ref: "diag",      kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Mapeamento do processo atual", description: "Como é feito hoje, onde trava, o que custa." },
    { ref: "arch",      kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Arquitetura da automação",     description: "Trigger, passos, condições, tratamento de erros." },
    { ref: "build",     kind: "automacao",  stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Build da automação",           description: "Desenvolvimento em n8n/Make/custom." },
    { ref: "test",      kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Testes e casos de borda",      description: "Cenários reais, validação com cliente." },
    { ref: "deploy",    kind: "automacao",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Deploy em produção",           description: "Subir pro ambiente real do cliente." },
    { ref: "monitor",   kind: "metrica",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Monitoramento e métricas",     description: "Taxa de sucesso, volume, tempo economizado." },
    { ref: "handoff",   kind: "documento",  stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Documentação + handoff",       description: "Manual do fluxo, como editar, onde ver logs." },
  ],
  edges: [
    { fromRef: "brief",  toRef: "diag",    label: "alimenta" },
    { fromRef: "access", toRef: "build",   label: "necessário" },
    { fromRef: "diag",   toRef: "arch",    label: "desenha" },
    { fromRef: "arch",   toRef: "build",   label: "executa" },
    { fromRef: "build",  toRef: "test",    label: "valida" },
    { fromRef: "test",   toRef: "deploy",  label: "aprova" },
    { fromRef: "deploy", toRef: "monitor", label: "mede" },
    { fromRef: "monitor",toRef: "handoff", label: "documenta" },
  ],
};

// ═════════════════════════════════════════════════════════════
// ONE-SHOT AGENT — criação de agente IA
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_AGENT: Omit<Playbook, "planKey"> = {
  name: "Agente IA Conversacional",
  description: "Fluxo de construção de agente IA: contexto, persona, prompt, treinamento, integração, monitoramento.",
  nodes: [
    { ref: "brief",     kind: "briefing",   stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do agente",           description: "Propósito, público, canal, tom de voz, escopo." },
    { ref: "access",    kind: "acessos",    stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos às fontes de dados",   description: "CRM, base de conhecimento, API WhatsApp/site." },
    { ref: "context",   kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Consolidação de contexto",     description: "Base de conhecimento, FAQs, histórico relevante." },
    { ref: "persona",   kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Persona + Prompt base",        description: "Caráter do agente, instruções principais, guardrails." },
    { ref: "build",     kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Construção do agente",         description: "Custom GPT, Claude Projects, ou agente custom." },
    { ref: "integration", kind: "integracao", stage: "producao",     col: STAGE_COL.producao,       row: 1, title: "Integração ao canal",          description: "Conexão WhatsApp/site/Telegram/etc." },
    { ref: "test",      kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Testes com casos reais",       description: "Rodar com cenários reais antes de liberar." },
    { ref: "launch",    kind: "ia",         stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Lançamento com monitoramento", description: "Deploy e observação das primeiras conversas." },
    { ref: "tune",      kind: "ia",         stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Ajuste fino do prompt",        description: "Refinar baseado em conversas reais." },
    { ref: "handoff",   kind: "documento",  stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Documentação + treinamento",  description: "Manual do agente, como atualizar, quando escalar." },
  ],
  edges: [
    { fromRef: "brief",     toRef: "context",     label: "orienta" },
    { fromRef: "access",    toRef: "integration", label: "necessário" },
    { fromRef: "context",   toRef: "persona",     label: "alimenta" },
    { fromRef: "persona",   toRef: "build",       label: "constrói" },
    { fromRef: "build",     toRef: "integration", label: "integra" },
    { fromRef: "integration",toRef: "test",       label: "valida" },
    { fromRef: "test",      toRef: "launch",      label: "aprova" },
    { fromRef: "launch",    toRef: "tune",        label: "calibra" },
    { fromRef: "tune",      toRef: "handoff",     label: "documenta" },
  ],
};

// ═════════════════════════════════════════════════════════════
// MARKETING SERVICE — marketing recorrente
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_MARKETING: Omit<Playbook, "planKey"> = {
  name: "Marketing Recorrente",
  description: "Fluxo de operação de marketing mensal: briefing, estratégia, calendário, produção, campanhas, relatório.",
  nodes: [
    { ref: "brief",     kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do negócio",            description: "Posicionamento, ICP, dores, diferencial." },
    { ref: "obj",       kind: "objetivo",     stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Objetivos 90 dias",              description: "Metas de leads, vendas, awareness." },
    { ref: "icp",       kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "ICP + Persona detalhada",        description: "Quem vamos atingir, onde, com que mensagem." },
    { ref: "strat",     kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Estratégia de conteúdo",         description: "Pilares, canais, frequência, tom." },
    { ref: "calendar",  kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 1, title: "Calendário editorial mensal",    description: "Posts planejados para o mês." },
    { ref: "content",   kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Produção — 8 peças/mês",         description: "Posts, carrosséis, criativos." },
    { ref: "lp",        kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Landing Page (1 por trimestre)", description: "LP de conversão para campanhas." },
    { ref: "ads",       kind: "trafego",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Campanha de tráfego ativa",      description: "Meta OU Google Ads em gestão." },
    { ref: "dash",      kind: "metrica",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Dashboard de métricas",          description: "Leads, CPL, engajamento, conversão." },
    { ref: "report",    kind: "documento",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Relatório mensal",               description: "Resultados, aprendizados, ajustes próximos." },
  ],
  edges: [
    { fromRef: "brief",    toRef: "icp",      label: "aprofunda" },
    { fromRef: "obj",      toRef: "strat",    label: "direciona" },
    { fromRef: "icp",      toRef: "strat",    label: "orienta" },
    { fromRef: "strat",    toRef: "calendar", label: "planeja" },
    { fromRef: "calendar", toRef: "content",  label: "executa" },
    { fromRef: "content",  toRef: "ads",      label: "impulsiona" },
    { fromRef: "lp",       toRef: "ads",      label: "destino" },
    { fromRef: "ads",      toRef: "dash",     label: "alimenta" },
    { fromRef: "dash",     toRef: "report",   label: "compõe" },
  ],
};

// ═════════════════════════════════════════════════════════════
// Type Playbooks Registry
// ═════════════════════════════════════════════════════════════

export const TYPE_PLAYBOOKS: Partial<Record<ProjectType, Omit<Playbook, "planKey">>> = {
  one_shot_site: PLAYBOOK_SITE,
  one_shot_automation: PLAYBOOK_AUTOMATION,
  one_shot_agent: PLAYBOOK_AGENT,
  marketing_service: PLAYBOOK_MARKETING,
  // legacy_marketing: não tem playbook (canvas livre)
  // ai_first: usa canvasPlaybooks.ts por plano
};

export function getPlaybookForType(projectType: string | null | undefined): Omit<Playbook, "planKey"> | null {
  if (!projectType) return null;
  return TYPE_PLAYBOOKS[projectType as ProjectType] ?? null;
}

export { playbookPos };
