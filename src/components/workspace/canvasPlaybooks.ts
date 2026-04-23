/**
 * canvasPlaybooks — playbooks de esteira por plano Aceleriq.
 *
 * Cada plano tem uma esteira pré-construída de nodes + edges.
 * Ao aplicar o playbook, os nodes são criados no canvas do cliente
 * já com posições sensatas e conexões entre eles.
 *
 * Mapeamento:
 *  - starter     → PLAYBOOK_FUNDACAO (A + C + E) — 6 nodes
 *  - growth      → PLAYBOOK_ACELERACAO (A→R)     — 14 nodes
 *  - enterprise  → PLAYBOOK_ESCALA (todas 8)     — 24 nodes
 */
import type { ProjectNodeKind, AceleraStageKey } from "./canvasProjectTypes";
import type { PlanKey } from "@/lib/planConfig";

export interface PlaybookNode {
  /** Referência lógica única no playbook — usada nas edges */
  ref: string;
  kind: ProjectNodeKind;
  stage: AceleraStageKey;
  title: string;
  description: string;
  /** Posição relativa — o engine aplica offset ao origem do cliente */
  col: number;  // coluna da etapa (0-7 mapeando entrada→expansao)
  row: number;  // fileira dentro da etapa (0,1,2...)
  /** Metadata inicial do node.data */
  data?: Record<string, unknown>;
}

export interface PlaybookEdge {
  fromRef: string;
  toRef: string;
  label: string;
}

export interface Playbook {
  planKey: PlanKey;
  name: string;
  description: string;
  nodes: PlaybookNode[];
  edges: PlaybookEdge[];
}

// ─── Stage column mapping ────────────────────────────────────

const STAGE_COL: Record<AceleraStageKey, number> = {
  entrada: 0,
  diagnostico: 1,
  estrutura_base: 2,
  planejamento: 3,
  producao: 4,
  ativacao: 5,
  otimizacao: 6,
  expansao: 7,
};

/** Converte col/row relativos em pos_x/pos_y absolutos */
export function playbookPos(col: number, row: number): { pos_x: number; pos_y: number } {
  const COL_WIDTH = 340;  // largura de uma etapa
  const ROW_HEIGHT = 180; // altura de uma linha
  const ORIGIN_X = 40;
  const ORIGIN_Y = 60;
  return {
    pos_x: ORIGIN_X + col * COL_WIDTH,
    pos_y: ORIGIN_Y + row * ROW_HEIGHT,
  };
}

// ═════════════════════════════════════════════════════════════
// PLAYBOOK FUNDAÇÃO — starter (3 meses, A+C+E)
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_FUNDACAO: Playbook = {
  planKey: "starter",
  name: "Fundação",
  description: "Esteira de 6 nodes cobrindo Abertura + Diagnóstico + Arquitetura Base. Entrega: contexto consolidado, diagnóstico, 1 LP, CRM básico e 1 automação essencial.",
  nodes: [
    // A — Abertura Estratégica
    { ref: "brief",     kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing Essencial",       description: "Captura e consolida contexto do cliente via IA." },
    { ref: "access",    kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Cofre de acessos",         description: "Credenciais do cliente centralizadas e criptografadas." },

    // C — Diagnóstico Estrutural
    { ref: "diag",      kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Diagnóstico Estrutural",   description: "Mapa de processos, gargalos e dores identificadas." },

    // E — Arquitetura Base
    { ref: "crm",       kind: "crm",          stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "CRM Base",                 description: "Estrutura inicial do CRM interno do cliente." },
    { ref: "lp",        kind: "landing_page", stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Landing Page de captura", description: "LP principal de conversão com copy + design + deploy." },
    { ref: "autom",     kind: "automacao",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 2, title: "Automação essencial",     description: "Fluxo mínimo: formulário da LP → CRM → notificação." },
  ],
  edges: [
    { fromRef: "brief",  toRef: "diag",   label: "alimenta" },
    { fromRef: "access", toRef: "diag",   label: "insumo" },
    { fromRef: "diag",   toRef: "crm",    label: "orienta" },
    { fromRef: "diag",   toRef: "lp",     label: "orienta" },
    { fromRef: "lp",     toRef: "autom",  label: "dispara" },
    { fromRef: "autom",  toRef: "crm",    label: "alimenta" },
  ],
};

// ═════════════════════════════════════════════════════════════
// PLAYBOOK ACELERAÇÃO — growth (12 meses, A→R)
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_ACELERACAO: Playbook = {
  planKey: "growth",
  name: "Aceleração",
  description: "Esteira de 14 nodes cobrindo Abertura até Ativação Assistida. Entrega: tudo da Fundação + funil comercial, estratégia de conteúdo, 2 campanhas, agente IA básico e dashboard.",
  nodes: [
    // A — Abertura
    { ref: "brief",     kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing Essencial",            description: "Captura e consolida contexto do cliente via IA." },
    { ref: "access",    kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Cofre de acessos",              description: "Credenciais do cliente centralizadas." },
    { ref: "obj",       kind: "objetivo",     stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Objetivo SMART 12m",            description: "Meta estratégica e critérios de sucesso." },

    // C — Diagnóstico
    { ref: "diag",      kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Diagnóstico Estrutural",        description: "Mapa de processos, gargalos e dores." },
    { ref: "icp",       kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "ICP + Persona + Jornada",       description: "Perfil detalhado do cliente ideal e jornada de compra." },

    // E — Arquitetura Base
    { ref: "crm",       kind: "crm",          stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "CRM Completo",                  description: "CRM interno do cliente com etapas, automações, campos customizados." },
    { ref: "funnel",    kind: "funil",        stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Funil de Vendas",               description: "Funil desenhado com SLAs por etapa." },

    // L — Plano Diretor
    { ref: "contentst", kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Estratégia de Conteúdo",        description: "Pilares, calendário editorial, canais de distribuição." },

    // E — Implantação
    { ref: "lp",        kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Landing Page principal",        description: "LP de conversão completa com copy + design." },
    { ref: "content",   kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Conteúdo mensal — 8 peças",     description: "Produção recorrente alinhada aos pilares." },
    { ref: "agent",     kind: "ia",           stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Agente IA base",                description: "Agente para WhatsApp ou chat do site." },

    // R — Ativação Assistida
    { ref: "trafego1",  kind: "trafego",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Campanha Meta Ads",             description: "Setup + otimização campanha de aquisição." },
    { ref: "trafego2",  kind: "trafego",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Campanha Google Ads",           description: "Setup + otimização campanha de search/display." },
    { ref: "dash",      kind: "metrica",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 2, title: "Dashboard de Métricas",         description: "Baseline vs meta, métricas por canal, alertas." },
  ],
  edges: [
    // Abertura
    { fromRef: "brief",     toRef: "diag",      label: "alimenta" },
    { fromRef: "access",    toRef: "diag",      label: "insumo" },
    { fromRef: "obj",       toRef: "diag",      label: "guia" },
    // Diagnóstico → Arquitetura
    { fromRef: "diag",      toRef: "icp",       label: "desdobra" },
    { fromRef: "icp",       toRef: "crm",       label: "estrutura" },
    { fromRef: "icp",       toRef: "funnel",    label: "desenha" },
    { fromRef: "crm",       toRef: "funnel",    label: "implementa" },
    // Arquitetura → Plano
    { fromRef: "icp",       toRef: "contentst", label: "orienta" },
    // Plano → Implantação
    { fromRef: "contentst", toRef: "content",   label: "executa" },
    { fromRef: "funnel",    toRef: "lp",        label: "captura" },
    { fromRef: "funnel",    toRef: "agent",     label: "qualifica" },
    // Implantação → Ativação
    { fromRef: "lp",        toRef: "trafego1",  label: "destino" },
    { fromRef: "lp",        toRef: "trafego2",  label: "destino" },
    { fromRef: "trafego1",  toRef: "crm",       label: "gera lead" },
    { fromRef: "trafego2",  toRef: "crm",       label: "gera lead" },
    { fromRef: "agent",     toRef: "crm",       label: "registra" },
    { fromRef: "trafego1",  toRef: "dash",      label: "alimenta" },
    { fromRef: "trafego2",  toRef: "dash",      label: "alimenta" },
    { fromRef: "crm",       toRef: "dash",      label: "alimenta" },
  ],
};

// ═════════════════════════════════════════════════════════════
// PLAYBOOK ESCALA IA-FIRST — enterprise (todas 8 etapas)
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_ESCALA: Playbook = {
  planKey: "enterprise",
  name: "Escala IA-First",
  description: "Esteira de 24 nodes cobrindo todas as 8 etapas ACELERA. Entrega: Aceleração completa + 5+ agentes IA especializados, automações avançadas, BI custom, case e playbook replicável.",
  nodes: [
    // A — Abertura
    { ref: "brief",     kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing Essencial",          description: "Captura e consolida contexto do cliente." },
    { ref: "access",    kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Cofre de acessos",            description: "Credenciais centralizadas." },
    { ref: "obj",       kind: "objetivo",     stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Objetivo SMART 12m",          description: "Meta estratégica e OKRs." },
    { ref: "kickoff",   kind: "reuniao",      stage: "entrada",        col: STAGE_COL.entrada,        row: 3, title: "Kickoff Deep Dive",           description: "Reunião de 3h com sócio — mergulho no negócio." },

    // C — Diagnóstico
    { ref: "diag",      kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Diagnóstico Estrutural",      description: "Mapa profundo de processos e gargalos." },
    { ref: "icp",       kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "ICP + Persona + Jornada",     description: "Arquetipos detalhados." },
    { ref: "baseline",  kind: "metrica",      stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 2, title: "Baseline — Estado Atual",     description: "Snapshot de métricas iniciais." },

    // E — Arquitetura Base
    { ref: "crm",       kind: "crm",          stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "CRM Completo",                description: "CRM interno com todas as integrações." },
    { ref: "funnel",    kind: "funil",        stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Funil de Vendas",             description: "Funil desenhado com SLAs." },
    { ref: "integr",    kind: "integracao",   stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 2, title: "Integrações de dados",        description: "Conectores entre sistemas do cliente." },

    // L — Plano Diretor
    { ref: "contentst", kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Estratégia de Conteúdo",      description: "Pilares + calendário + canais." },
    { ref: "aistrat",   kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 1, title: "Estratégia IA-First",         description: "Roadmap de agentes IA na operação." },

    // E — Implantação
    { ref: "lp",        kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Landing Page principal",      description: "LP de conversão completa." },
    { ref: "content",   kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Conteúdo — pilar 1",          description: "Produção recorrente primeiro pilar." },
    { ref: "ag1",       kind: "ia",           stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Agente Atendimento",          description: "Agente WhatsApp primeiro contato." },
    { ref: "ag2",       kind: "ia",           stage: "producao",       col: STAGE_COL.producao,       row: 3, title: "Agente Qualificação",         description: "Agente que qualifica leads." },
    { ref: "auto1",     kind: "automacao",    stage: "producao",       col: STAGE_COL.producao,       row: 4, title: "Automação Onboarding",        description: "Fluxo auto do fechamento ao 30º dia." },

    // R — Ativação
    { ref: "trafego",   kind: "trafego",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Tráfego escalado",            description: "Canal principal com budget R$ 15k+/mês." },
    { ref: "ag3",       kind: "ia",           stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Agente Pós-venda",            description: "Agente que acompanha cliente após fechamento." },
    { ref: "dash",      kind: "metrica",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 2, title: "Dashboard BI Custom",         description: "BI completo integrando todos canais." },

    // A — Otimização
    { ref: "ba",        kind: "before_after", stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Before / After",              description: "Comparativo estado inicial vs atual." },
    { ref: "ag4",       kind: "ia",           stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 1, title: "Agente Insights",             description: "Agente que analisa métricas e sugere ajustes." },
    { ref: "dec1",      kind: "decisao",      stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 2, title: "War Room — Decisões",         description: "Registro de decisões baseadas em dados." },

    // + — Escala
    { ref: "caseFinal", kind: "case",         stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Case documentado",            description: "Narrativa completa com before/after e resultados." },
    { ref: "playbook",  kind: "documento",    stage: "expansao",       col: STAGE_COL.expansao,       row: 1, title: "Playbook replicável",         description: "Playbook do negócio como ativo do cliente." },
  ],
  edges: [
    // Abertura → Diagnóstico
    { fromRef: "brief",     toRef: "diag",      label: "alimenta" },
    { fromRef: "access",    toRef: "diag",      label: "insumo" },
    { fromRef: "obj",       toRef: "diag",      label: "guia" },
    { fromRef: "kickoff",   toRef: "diag",      label: "insumo" },
    // Diagnóstico
    { fromRef: "diag",      toRef: "icp",       label: "desdobra" },
    { fromRef: "diag",      toRef: "baseline",  label: "mede" },
    // Arquitetura
    { fromRef: "icp",       toRef: "crm",       label: "estrutura" },
    { fromRef: "icp",       toRef: "funnel",    label: "desenha" },
    { fromRef: "crm",       toRef: "integr",    label: "conecta" },
    // Plano
    { fromRef: "icp",       toRef: "contentst", label: "orienta" },
    { fromRef: "obj",       toRef: "aistrat",   label: "guia" },
    // Implantação
    { fromRef: "contentst", toRef: "content",   label: "executa" },
    { fromRef: "funnel",    toRef: "lp",        label: "captura" },
    { fromRef: "aistrat",   toRef: "ag1",       label: "constrói" },
    { fromRef: "aistrat",   toRef: "ag2",       label: "constrói" },
    { fromRef: "ag1",       toRef: "ag2",       label: "escala" },
    { fromRef: "crm",       toRef: "auto1",     label: "dispara" },
    // Ativação
    { fromRef: "lp",        toRef: "trafego",   label: "destino" },
    { fromRef: "trafego",   toRef: "crm",       label: "gera lead" },
    { fromRef: "crm",       toRef: "ag3",       label: "aciona" },
    { fromRef: "trafego",   toRef: "dash",      label: "alimenta" },
    { fromRef: "crm",       toRef: "dash",      label: "alimenta" },
    // Otimização
    { fromRef: "baseline",  toRef: "ba",        label: "compara" },
    { fromRef: "dash",      toRef: "ba",        label: "evidencia" },
    { fromRef: "dash",      toRef: "ag4",       label: "analisa" },
    { fromRef: "ag4",       toRef: "dec1",      label: "sugere" },
    // Expansão
    { fromRef: "ba",        toRef: "caseFinal", label: "prova" },
    { fromRef: "caseFinal", toRef: "playbook",  label: "gera" },
  ],
};

// ═════════════════════════════════════════════════════════════
// Registry
// ═════════════════════════════════════════════════════════════

export const PLAYBOOKS: Record<PlanKey, Playbook> = {
  starter:    PLAYBOOK_FUNDACAO,
  growth:     PLAYBOOK_ACELERACAO,
  enterprise: PLAYBOOK_ESCALA,
};

export function getPlaybookForPlan(planName: string | null | undefined): Playbook | null {
  if (!planName) return null;
  return PLAYBOOKS[planName as PlanKey] ?? null;
}
