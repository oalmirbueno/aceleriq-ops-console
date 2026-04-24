/**
 * typePlaybooks — playbooks de canvas expandidos por TIPO DE PROJETO.
 *
 * Versão v2: mais nodes, mais detalhes operacionais, fluxos completos.
 *   - one_shot_site → 15 nodes (entrega completa de site)
 *   - one_shot_automation → 16 nodes (com governança e rollback)
 *   - one_shot_agent → 17 nodes (ciclo completo + learning loop)
 *   - marketing_service → 18 nodes (operação mensal robusta)
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
// SITE — 15 nodes
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_SITE: Omit<Playbook, "planKey"> = {
  name: "Site Institucional",
  description: "Entrega completa de site: briefing, arquitetura, copy, design, dev, SEO, integrações, revisão, go-live, SEO e handoff.",
  nodes: [
    // Entrada
    { ref: "brief",    kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do site",             description: "Objetivo, público, promessa, referências, identidade visual." },
    { ref: "access",   kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos & domínios",           description: "Credenciais do domínio, hospedagem, email corporativo, analytics." },
    { ref: "benchmark",kind: "documento",    stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Benchmark de concorrentes",     description: "Análise de 3-5 sites do nicho. O que copiar, o que melhorar." },
    // Diagnóstico
    { ref: "audit",    kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Auditoria do site atual",       description: "Se existir site antigo: pontos fracos, páginas que funcionam, redirects necessários." },
    // Estrutura Base
    { ref: "arch",     kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Arquitetura de informação",     description: "Mapa de páginas, hierarquia, menus, CTAs, fluxo do usuário." },
    { ref: "wireframe",kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Wireframes das páginas-chave",  description: "Esboço estrutural de home, serviços, contato, blog." },
    // Planejamento
    { ref: "seo_plan", kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Plano de SEO on-page",         description: "Keywords, meta tags, estrutura de títulos, blog inicial se aplicável." },
    // Produção
    { ref: "copy",     kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Copy de todas as páginas",      description: "Textos otimizados para SEO e conversão." },
    { ref: "design",   kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Design visual",                 description: "Layout das páginas, paleta, tipografia, imagens." },
    { ref: "dev",      kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Desenvolvimento do site",       description: "Build em Lovable/Webflow/WordPress/Next.js." },
    { ref: "forms",    kind: "automacao",    stage: "producao",       col: STAGE_COL.producao,       row: 3, title: "Formulários e integrações",     description: "Captura de contato, integração com CRM/email marketing." },
    { ref: "analytics",kind: "integracao",   stage: "producao",       col: STAGE_COL.producao,       row: 4, title: "GA4 + Meta Pixel + GTM",        description: "Instrumentação de tracking para mensuração." },
    // Ativação
    { ref: "review",   kind: "documento",    stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Revisão final com cliente",     description: "Revisão de conteúdo, design, responsividade." },
    { ref: "golive",   kind: "landing_page", stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Go-live + DNS + SSL",           description: "Publicação, checklist final, certificado, redirects antigos." },
    // Expansão
    { ref: "handoff",  kind: "documento",    stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Handoff + tutorial CMS",        description: "Manual de edição, vídeos, acesso do cliente." },
  ],
  edges: [
    { fromRef: "brief",    toRef: "audit",     label: "contextualiza" },
    { fromRef: "brief",    toRef: "benchmark", label: "orienta" },
    { fromRef: "audit",    toRef: "arch",      label: "inspira" },
    { fromRef: "benchmark",toRef: "arch",      label: "referencia" },
    { fromRef: "arch",     toRef: "wireframe", label: "detalha" },
    { fromRef: "arch",     toRef: "seo_plan",  label: "estrutura" },
    { fromRef: "wireframe",toRef: "copy",      label: "guia" },
    { fromRef: "wireframe",toRef: "design",    label: "guia" },
    { fromRef: "seo_plan", toRef: "copy",      label: "orienta" },
    { fromRef: "copy",     toRef: "dev",       label: "preenche" },
    { fromRef: "design",   toRef: "dev",       label: "implementa" },
    { fromRef: "dev",      toRef: "forms",     label: "integra" },
    { fromRef: "dev",      toRef: "analytics", label: "instrumenta" },
    { fromRef: "forms",    toRef: "review",    label: "valida" },
    { fromRef: "analytics",toRef: "review",    label: "valida" },
    { fromRef: "access",   toRef: "golive",    label: "permite" },
    { fromRef: "review",   toRef: "golive",    label: "aprova" },
    { fromRef: "golive",   toRef: "handoff",   label: "finaliza" },
  ],
};

// ═════════════════════════════════════════════════════════════
// AUTOMATION — 16 nodes
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_AUTOMATION: Omit<Playbook, "planKey"> = {
  name: "Automação de Processo",
  description: "Ciclo completo de automação: diagnóstico profundo, arquitetura com fallbacks, build, testes, deploy, monitoramento e governança.",
  nodes: [
    // Entrada
    { ref: "brief",     kind: "briefing",   stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do processo",            description: "Que processo automatizar, frequência, dor atual, quem usa." },
    { ref: "access",    kind: "acessos",    stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos das ferramentas",         description: "APIs, tokens, webhooks, contas de serviço." },
    { ref: "stakeholders", kind: "documento", stage: "entrada",      col: STAGE_COL.entrada,        row: 2, title: "Stakeholders e RACI",             description: "Quem decide, quem aprova, quem testa, quem opera no dia-a-dia." },
    // Diagnóstico
    { ref: "current",   kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Mapeamento do processo atual",    description: "Como é feito hoje, tempo gasto, pontos de falha, exceções comuns." },
    { ref: "metrics_base", kind: "metrica", stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "Métricas de baseline",            description: "Volume, tempo médio, taxa de erro, custo atual." },
    // Estrutura
    { ref: "arch",      kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Arquitetura da automação",        description: "Trigger, passos, condições, outputs, integrações." },
    { ref: "errors",    kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Tratamento de erros & fallbacks", description: "O que fazer quando uma API cair, dado vier errado, etc." },
    // Planejamento
    { ref: "governance",kind: "documento",  stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Governança e logs",               description: "Onde ficam os logs, quem tem acesso, quanto tempo guardar." },
    // Produção
    { ref: "build",     kind: "automacao",  stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Build da automação",              description: "Desenvolvimento em n8n/Make/custom code." },
    { ref: "secrets",   kind: "acessos",    stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Configuração de secrets",         description: "Tokens, credentials, rotação de chaves." },
    // Ativação
    { ref: "test_unit", kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Testes unitários de cada passo",  description: "Cada step isolado funciona com input real." },
    { ref: "test_e2e",  kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Testes end-to-end",               description: "Fluxo completo rodando com dados reais." },
    { ref: "deploy",    kind: "automacao",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 2, title: "Deploy em produção",              description: "Subir pro ambiente real + rollback plan." },
    // Otimização
    { ref: "monitor",   kind: "metrica",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Monitoramento e alertas",         description: "Taxa de sucesso, volume, alertas em caso de falha." },
    { ref: "iterate",   kind: "decisao",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 1, title: "Iteração baseada em dados",       description: "Ajustes com base nos logs e feedback dos usuários." },
    // Expansão
    { ref: "handoff",   kind: "documento",  stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Documentação + treinamento",      description: "Manual, vídeos, canal de suporte, SLA de correções." },
  ],
  edges: [
    { fromRef: "brief",       toRef: "stakeholders", label: "identifica" },
    { fromRef: "brief",       toRef: "current",      label: "aprofunda" },
    { fromRef: "current",     toRef: "metrics_base", label: "mede" },
    { fromRef: "current",     toRef: "arch",         label: "inspira" },
    { fromRef: "metrics_base",toRef: "arch",         label: "valida" },
    { fromRef: "arch",        toRef: "errors",       label: "define" },
    { fromRef: "arch",        toRef: "governance",   label: "planeja" },
    { fromRef: "access",      toRef: "secrets",      label: "alimenta" },
    { fromRef: "arch",        toRef: "build",        label: "executa" },
    { fromRef: "errors",      toRef: "build",        label: "protege" },
    { fromRef: "secrets",     toRef: "build",        label: "autentica" },
    { fromRef: "build",       toRef: "test_unit",    label: "valida" },
    { fromRef: "test_unit",   toRef: "test_e2e",     label: "aprova" },
    { fromRef: "test_e2e",    toRef: "deploy",       label: "libera" },
    { fromRef: "deploy",      toRef: "monitor",      label: "observa" },
    { fromRef: "monitor",     toRef: "iterate",      label: "informa" },
    { fromRef: "iterate",     toRef: "handoff",      label: "finaliza" },
    { fromRef: "governance",  toRef: "handoff",      label: "documenta" },
  ],
};

// ═════════════════════════════════════════════════════════════
// AGENT — 17 nodes
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_AGENT: Omit<Playbook, "planKey"> = {
  name: "Agente IA Conversacional",
  description: "Construção de agente com ciclo completo: contexto, persona, prompt, knowledge base, integração, launch monitorado e learning loop.",
  nodes: [
    // Entrada
    { ref: "brief",       kind: "briefing",   stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do agente",             description: "Propósito, público, canal, tom, escopo, limites." },
    { ref: "access",      kind: "acessos",    stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos às fontes",              description: "CRM, base de conhecimento, API WhatsApp/site." },
    { ref: "use_cases",   kind: "documento",  stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Casos de uso prioritários",      description: "Top 10 interações que o agente precisa resolver bem." },
    // Diagnóstico
    { ref: "knowledge",   kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Consolidação de conhecimento",    description: "Base de conhecimento, FAQs, documentos relevantes." },
    { ref: "gaps",        kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "Gaps de informação",             description: "O que o agente não vai saber responder e o que fazer então." },
    // Estrutura
    { ref: "persona",     kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Persona do agente",              description: "Nome, caráter, tom de voz, formalidade." },
    { ref: "prompt_base", kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "System prompt base",             description: "Instruções principais, estrutura de resposta." },
    { ref: "guardrails",  kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 2, title: "Guardrails e políticas",         description: "O que não fazer, quando escalar, compliance." },
    // Planejamento
    { ref: "escalation",  kind: "documento",  stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Fluxo de escalação humano",      description: "Quando e como passar pra humano quando necessário." },
    // Produção
    { ref: "build",       kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Construção do agente",           description: "Custom GPT, Claude Projects, assistant custom." },
    { ref: "kb_embed",    kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Embedding da knowledge base",    description: "Vetorização e indexação do conhecimento." },
    { ref: "integration", kind: "integracao", stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Integração ao canal",            description: "Conexão WhatsApp/site/Telegram/email." },
    // Ativação
    { ref: "test",        kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Testes com 50+ cenários",        description: "Simulação de conversas reais antes de liberar." },
    { ref: "launch",      kind: "ia",         stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Lançamento soft (10% público)",  description: "Deploy gradual com monitoramento intenso." },
    // Otimização
    { ref: "conv_review", kind: "metrica",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Revisão semanal de conversas",   description: "Leitura de sampling pra detectar problemas." },
    { ref: "tune",        kind: "ia",         stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 1, title: "Ajuste fino do prompt",          description: "Refinamento contínuo com base em dados reais." },
    // Expansão
    { ref: "handoff",     kind: "documento",  stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Documentação + SLA",             description: "Manual, canal de ajustes, SLA de correções." },
  ],
  edges: [
    { fromRef: "brief",       toRef: "use_cases",   label: "detalha" },
    { fromRef: "access",      toRef: "knowledge",   label: "alimenta" },
    { fromRef: "use_cases",   toRef: "knowledge",   label: "orienta" },
    { fromRef: "knowledge",   toRef: "gaps",        label: "revela" },
    { fromRef: "brief",       toRef: "persona",     label: "define" },
    { fromRef: "persona",     toRef: "prompt_base", label: "estrutura" },
    { fromRef: "use_cases",   toRef: "prompt_base", label: "informa" },
    { fromRef: "gaps",        toRef: "guardrails",  label: "protege" },
    { fromRef: "brief",       toRef: "guardrails",  label: "limita" },
    { fromRef: "gaps",        toRef: "escalation",  label: "exige" },
    { fromRef: "prompt_base", toRef: "build",       label: "programa" },
    { fromRef: "guardrails",  toRef: "build",       label: "reforça" },
    { fromRef: "knowledge",   toRef: "kb_embed",    label: "vetoriza" },
    { fromRef: "build",       toRef: "integration", label: "conecta" },
    { fromRef: "integration", toRef: "test",        label: "valida" },
    { fromRef: "test",        toRef: "launch",      label: "aprova" },
    { fromRef: "launch",      toRef: "conv_review", label: "gera dados" },
    { fromRef: "conv_review", toRef: "tune",        label: "orienta" },
    { fromRef: "escalation",  toRef: "launch",      label: "suporta" },
    { fromRef: "tune",        toRef: "handoff",     label: "consolida" },
  ],
};

// ═════════════════════════════════════════════════════════════
// MARKETING — 18 nodes
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_MARKETING: Omit<Playbook, "planKey"> = {
  name: "Marketing Recorrente",
  description: "Operação de marketing mensal completa: estratégia, produção, campanhas, análise e otimização contínua.",
  nodes: [
    // Entrada
    { ref: "brief",     kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do negócio",            description: "Posicionamento, ICP, dores, diferencial, concorrentes." },
    { ref: "obj",       kind: "objetivo",     stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Objetivos 90 dias",              description: "Metas de leads, vendas, awareness, SMART." },
    { ref: "access",    kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Acessos & plataformas",          description: "Redes sociais, anúncios, CRM, analytics, design tools." },
    // Diagnóstico
    { ref: "icp",       kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "ICP + Persona detalhada",        description: "Quem vamos atingir, onde, com que mensagem." },
    { ref: "funnel",    kind: "funil",        stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "Mapeamento do funil",            description: "Como o ICP descobre, considera, decide, compra." },
    { ref: "bench",     kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 2, title: "Análise competitiva",            description: "O que concorrentes fazem, o que funciona, o que não." },
    // Estrutura
    { ref: "voice",     kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Manual de voz e tom",            description: "Como a marca se comunica: palavras, humor, estilo visual." },
    { ref: "assets",    kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Biblioteca de assets",           description: "Logos, fontes, paleta, templates." },
    // Planejamento
    { ref: "strat",     kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Estratégia de conteúdo",         description: "Pilares (educativo/autoridade/bastidores/oferta), canais, frequência." },
    { ref: "calendar",  kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 1, title: "Calendário editorial mensal",    description: "Posts planejados, datas, formatos, responsáveis." },
    // Produção
    { ref: "content",   kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Produção — 8 peças/mês",         description: "Posts, carrosséis, criativos, copy." },
    { ref: "lp",        kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Landing Page (1 por trimestre)", description: "LP de conversão para campanha principal." },
    { ref: "email",     kind: "automacao",    stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Email marketing / nutrição",     description: "Sequências de email pra quem cadastra." },
    // Ativação
    { ref: "ads_meta",  kind: "trafego",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Campanha Meta Ads",              description: "Meta Ads em gestão recorrente com otimização." },
    { ref: "dash",      kind: "metrica",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Dashboard de métricas",          description: "Leads, CPL, engajamento, conversão, ROAS." },
    // Otimização
    { ref: "weekly",    kind: "documento",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Check-in semanal",               description: "Review de performance e ajustes rápidos." },
    { ref: "report",    kind: "documento",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 1, title: "Relatório mensal",               description: "Resultados, aprendizados, plano do mês seguinte." },
    // Expansão
    { ref: "expand",    kind: "decisao",      stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Decisão de expansão",            description: "Escalar canal que funciona, testar novos, cortar o que não." },
  ],
  edges: [
    { fromRef: "brief",    toRef: "icp",       label: "aprofunda" },
    { fromRef: "brief",    toRef: "bench",     label: "contextualiza" },
    { fromRef: "obj",      toRef: "strat",     label: "direciona" },
    { fromRef: "icp",      toRef: "funnel",    label: "modela" },
    { fromRef: "icp",      toRef: "strat",     label: "orienta" },
    { fromRef: "funnel",   toRef: "strat",     label: "estrutura" },
    { fromRef: "bench",    toRef: "voice",     label: "diferencia" },
    { fromRef: "voice",    toRef: "content",   label: "padroniza" },
    { fromRef: "assets",   toRef: "content",   label: "compõe" },
    { fromRef: "strat",    toRef: "calendar",  label: "planeja" },
    { fromRef: "calendar", toRef: "content",   label: "executa" },
    { fromRef: "content",  toRef: "ads_meta",  label: "impulsiona" },
    { fromRef: "lp",       toRef: "ads_meta",  label: "destino" },
    { fromRef: "lp",       toRef: "email",     label: "captura" },
    { fromRef: "email",    toRef: "dash",      label: "alimenta" },
    { fromRef: "ads_meta", toRef: "dash",      label: "alimenta" },
    { fromRef: "dash",     toRef: "weekly",    label: "gera" },
    { fromRef: "weekly",   toRef: "report",    label: "compila" },
    { fromRef: "report",   toRef: "expand",    label: "informa" },
    { fromRef: "access",   toRef: "ads_meta",  label: "habilita" },
    { fromRef: "access",   toRef: "email",     label: "habilita" },
  ],
};

// ═════════════════════════════════════════════════════════════
// Registry
// ═════════════════════════════════════════════════════════════

export const TYPE_PLAYBOOKS: Partial<Record<ProjectType, Omit<Playbook, "planKey">>> = {
  one_shot_site: PLAYBOOK_SITE,
  one_shot_automation: PLAYBOOK_AUTOMATION,
  one_shot_agent: PLAYBOOK_AGENT,
  marketing_service: PLAYBOOK_MARKETING,
};

export function getPlaybookForType(projectType: string | null | undefined): Omit<Playbook, "planKey"> | null {
  if (!projectType) return null;
  return TYPE_PLAYBOOKS[projectType as ProjectType] ?? null;
}

/** Retorna todos os playbooks disponíveis (por tipo + por plano) para o seletor */
export function getAllAvailablePlaybooks(): Array<{
  key: string;
  source: "type" | "plan";
  projectType?: ProjectType;
  planKey?: string;
  name: string;
  description: string;
  nodeCount: number;
}> {
  const list: Array<{ key: string; source: "type" | "plan"; projectType?: ProjectType; planKey?: string; name: string; description: string; nodeCount: number }> = [];

  Object.entries(TYPE_PLAYBOOKS).forEach(([type, pb]) => {
    if (pb) {
      list.push({
        key: `type:${type}`,
        source: "type",
        projectType: type as ProjectType,
        name: pb.name,
        description: pb.description,
        nodeCount: pb.nodes.length,
      });
    }
  });

  return list;
}

export { playbookPos };
