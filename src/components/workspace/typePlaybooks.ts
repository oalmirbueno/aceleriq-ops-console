/**
 * typePlaybooks v3 — playbooks com IA embutida em cada etapa.
 *
 * Estratégia: em vez de IA ser um node "a parte", ela é TRANSVERSAL:
 *  - Orb de consolidação de contexto (entrada)
 *  - Orb de análise de diagnóstico (diagnóstico)
 *  - Agentes específicos (produção)
 *  - Orb de insights (otimização)
 *
 * Cada playbook agora tem 18-22 nodes com IA em pontos estratégicos.
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
// SITE — 19 nodes (com IA transversal)
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_SITE: Omit<Playbook, "planKey"> = {
  name: "Site Institucional + IA",
  description: "Entrega de site com IA embutida: copy gerado por IA, chatbot no site, análise de concorrentes automatizada.",
  nodes: [
    // Entrada
    { ref: "brief",       kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do site",             description: "Objetivo, público, promessa, identidade visual." },
    { ref: "access",      kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos & domínios",           description: "Domínio, hospedagem, email corporativo, analytics." },
    { ref: "orb_ctx",     kind: "ai_orb",       stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Orb: Consolidar contexto",     description: "IA consolida briefing + portal em dossiê executivo." },
    // Diagnóstico
    { ref: "benchmark",   kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Benchmark de concorrentes",    description: "Análise de 3-5 sites do nicho com IA." },
    { ref: "audit",       kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "Auditoria do site atual",      description: "Se existir: pontos fortes, gargalos, redirects." },
    { ref: "orb_diag",    kind: "ai_orb",       stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 2, title: "Orb: Gaps vs concorrentes",    description: "IA identifica oportunidades ignoradas pela concorrência." },
    // Estrutura
    { ref: "arch",        kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Arquitetura de informação",    description: "Mapa de páginas, menus, CTAs, fluxo." },
    { ref: "wireframe",   kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Wireframes das páginas-chave", description: "Esboço estrutural." },
    // Planejamento
    { ref: "seo_plan",    kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Plano de SEO on-page",        description: "Keywords, meta tags, estrutura." },
    // Produção
    { ref: "copy",        kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Copy com IA (todas páginas)",  description: "Textos otimizados via Claude/GPT com contexto do cliente." },
    { ref: "design",      kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Design visual",                description: "Layout, paleta, tipografia." },
    { ref: "dev",         kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Desenvolvimento",              description: "Build em Lovable/Webflow/WordPress." },
    { ref: "forms",       kind: "automacao",    stage: "producao",       col: STAGE_COL.producao,       row: 3, title: "Formulários → CRM",           description: "Captura integrada com automação." },
    { ref: "chatbot",     kind: "ia",           stage: "producao",       col: STAGE_COL.producao,       row: 4, title: "Chatbot IA no site",          description: "Agente conversacional que atende visitantes 24/7." },
    { ref: "analytics",   kind: "integracao",   stage: "producao",       col: STAGE_COL.producao,       row: 5, title: "GA4 + Meta Pixel + GTM",      description: "Tracking para mensuração." },
    // Ativação
    { ref: "review",      kind: "documento",    stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Revisão final",                description: "Cliente aprova conteúdo, design, responsividade." },
    { ref: "golive",      kind: "landing_page", stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Go-live + DNS + SSL",         description: "Publicação, redirects antigos, certificado." },
    // Otimização
    { ref: "orb_insight", kind: "ai_orb",       stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Orb: Análise de tráfego 30d",  description: "IA analisa dados pós-launch e sugere melhorias." },
    // Expansão
    { ref: "handoff",     kind: "documento",    stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Handoff + tutorial CMS",      description: "Manual de edição, vídeos, acesso." },
    // Chat IA — apoio ao time
    { ref: "chat",        kind: "chat_node",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 1, title: "Chat IA do projeto",          description: "Assistente IA com contexto do briefing, arquitetura e copy.",
      data: { scope: "workspace", fn: "production", size: "M" } },
  ],
  edges: [
    { fromRef: "brief",     toRef: "orb_ctx",     label: "alimenta" },
    { fromRef: "orb_ctx",   toRef: "benchmark",   label: "guia" },
    { fromRef: "orb_ctx",   toRef: "audit",       label: "contextualiza" },
    { fromRef: "benchmark", toRef: "orb_diag",    label: "compara" },
    { fromRef: "audit",     toRef: "orb_diag",    label: "insumo" },
    { fromRef: "orb_diag",  toRef: "arch",        label: "orienta" },
    { fromRef: "arch",      toRef: "wireframe",   label: "detalha" },
    { fromRef: "arch",      toRef: "seo_plan",    label: "estrutura" },
    { fromRef: "wireframe", toRef: "copy",        label: "guia" },
    { fromRef: "wireframe", toRef: "design",      label: "guia" },
    { fromRef: "seo_plan",  toRef: "copy",        label: "otimiza" },
    { fromRef: "orb_ctx",   toRef: "copy",        label: "personaliza" },
    { fromRef: "copy",      toRef: "dev",         label: "preenche" },
    { fromRef: "design",    toRef: "dev",         label: "implementa" },
    { fromRef: "dev",       toRef: "forms",       label: "integra" },
    { fromRef: "dev",       toRef: "chatbot",     label: "incorpora" },
    { fromRef: "orb_ctx",   toRef: "chatbot",     label: "treina" },
    { fromRef: "dev",       toRef: "analytics",   label: "instrumenta" },
    { fromRef: "forms",     toRef: "review",      label: "valida" },
    { fromRef: "chatbot",   toRef: "review",      label: "valida" },
    { fromRef: "access",    toRef: "golive",      label: "permite" },
    { fromRef: "review",    toRef: "golive",      label: "aprova" },
    { fromRef: "analytics", toRef: "orb_insight", label: "alimenta" },
    { fromRef: "golive",    toRef: "orb_insight", label: "observa" },
    { fromRef: "orb_insight",toRef: "handoff",    label: "documenta" },
    // Chat IA
    { fromRef: "arch",      toRef: "chat",        label: "contextualiza" },
    { fromRef: "copy",      toRef: "chat",        label: "alimenta" },
  ],
};

// ═════════════════════════════════════════════════════════════
// AUTOMATION — 20 nodes (com IA tomada de decisão)
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_AUTOMATION: Omit<Playbook, "planKey"> = {
  name: "Automação Inteligente",
  description: "Automação com IA embutida em pontos de decisão, classificação e enriquecimento. Não é só workflow — é operação AI-first.",
  nodes: [
    // Entrada
    { ref: "brief",       kind: "briefing",   stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do processo",            description: "Processo, frequência, dor, quem usa." },
    { ref: "access",      kind: "acessos",    stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos das ferramentas",         description: "APIs, tokens, webhooks." },
    { ref: "stakeholders",kind: "documento",  stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Stakeholders e RACI",             description: "Quem decide, aprova, testa, opera." },
    { ref: "orb_ctx",     kind: "ai_orb",     stage: "entrada",        col: STAGE_COL.entrada,        row: 3, title: "Orb: Contexto do processo",      description: "IA consolida briefing + dados históricos." },
    // Diagnóstico
    { ref: "current",     kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Mapeamento do processo atual",    description: "Como é feito hoje, tempo, erros, exceções." },
    { ref: "metrics_base",kind: "metrica",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "Métricas de baseline",            description: "Volume, tempo médio, taxa de erro, custo." },
    { ref: "orb_opt",     kind: "ai_orb",     stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 2, title: "Orb: Oportunidades de IA",       description: "IA identifica onde aplicar IA no fluxo (classificação, enriquecimento, decisão)." },
    // Estrutura
    { ref: "arch",        kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Arquitetura da automação",        description: "Trigger, passos, condições, outputs." },
    { ref: "errors",      kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Tratamento de erros & fallbacks", description: "O que fazer em falhas." },
    // Planejamento
    { ref: "governance",  kind: "documento",  stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Governança e logs",               description: "Onde ficam os logs, retenção, acesso." },
    // Produção
    { ref: "build",       kind: "automacao",  stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Build da automação",              description: "Desenvolvimento em n8n/Make/custom." },
    { ref: "agent_dec",   kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Agente IA: Classificação",       description: "IA classifica inputs/leads antes do fluxo seguir." },
    { ref: "agent_enrich",kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Agente IA: Enriquecimento",      description: "IA preenche campos faltantes de forma inteligente." },
    { ref: "secrets",     kind: "acessos",    stage: "producao",       col: STAGE_COL.producao,       row: 3, title: "Configuração de secrets",         description: "Tokens, credentials, rotação." },
    // Ativação
    { ref: "test_unit",   kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Testes unitários",                description: "Cada step isolado com input real." },
    { ref: "test_e2e",    kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Testes end-to-end",               description: "Fluxo completo com dados reais." },
    { ref: "deploy",      kind: "automacao",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 2, title: "Deploy em produção",              description: "Go-live + rollback plan." },
    // Otimização
    { ref: "monitor",     kind: "metrica",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Monitoramento e alertas",         description: "Taxa sucesso, volume, alertas." },
    { ref: "orb_iter",    kind: "ai_orb",     stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 1, title: "Orb: Insights e iteração",       description: "IA analisa logs e sugere ajustes no fluxo." },
    // Expansão
    { ref: "handoff",     kind: "documento",  stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Documentação + SLA",              description: "Manual, vídeos, canal de suporte." },
    // Chat IA — copiloto da automação
    { ref: "chat",        kind: "chat_node",  stage: "planejamento",   col: STAGE_COL.planejamento,   row: 1, title: "Chat IA da Automação",            description: "Copiloto para debug, análise de logs e otimização do fluxo.",
      data: { scope: "workspace", fn: "analysis", size: "M" } },
  ],
  edges: [
    { fromRef: "brief",        toRef: "orb_ctx",      label: "alimenta" },
    { fromRef: "stakeholders", toRef: "orb_ctx",      label: "contextualiza" },
    { fromRef: "orb_ctx",      toRef: "current",      label: "orienta" },
    { fromRef: "current",      toRef: "metrics_base", label: "mede" },
    { fromRef: "metrics_base", toRef: "orb_opt",      label: "analisa" },
    { fromRef: "current",      toRef: "orb_opt",      label: "mapeia" },
    { fromRef: "orb_opt",      toRef: "arch",         label: "sugere IA" },
    { fromRef: "arch",         toRef: "errors",       label: "define" },
    { fromRef: "arch",         toRef: "governance",   label: "planeja" },
    { fromRef: "access",       toRef: "secrets",      label: "alimenta" },
    { fromRef: "arch",         toRef: "build",        label: "executa" },
    { fromRef: "orb_opt",      toRef: "agent_dec",    label: "especifica" },
    { fromRef: "orb_opt",      toRef: "agent_enrich", label: "especifica" },
    { fromRef: "errors",       toRef: "build",        label: "protege" },
    { fromRef: "secrets",      toRef: "build",        label: "autentica" },
    { fromRef: "build",        toRef: "agent_dec",    label: "chama" },
    { fromRef: "build",        toRef: "agent_enrich", label: "chama" },
    { fromRef: "agent_dec",    toRef: "test_unit",    label: "testa" },
    { fromRef: "agent_enrich", toRef: "test_unit",    label: "testa" },
    { fromRef: "build",        toRef: "test_unit",    label: "valida" },
    { fromRef: "test_unit",    toRef: "test_e2e",     label: "aprova" },
    { fromRef: "test_e2e",     toRef: "deploy",       label: "libera" },
    { fromRef: "deploy",       toRef: "monitor",      label: "observa" },
    { fromRef: "monitor",      toRef: "orb_iter",     label: "alimenta" },
    { fromRef: "orb_iter",     toRef: "handoff",      label: "melhora" },
    { fromRef: "governance",   toRef: "handoff",      label: "documenta" },
    // Chat IA
    { fromRef: "arch",         toRef: "chat",         label: "contextualiza" },
    { fromRef: "monitor",      toRef: "chat",         label: "logs" },
  ],
};

// ═════════════════════════════════════════════════════════════
// AGENT IA — 22 nodes (o mais IA-heavy)
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_AGENT: Omit<Playbook, "planKey"> = {
  name: "Agente IA Conversacional",
  description: "Construção completa de agente IA: contexto, persona, knowledge base vetorial, integração, learning loop e melhoria contínua.",
  nodes: [
    // Entrada
    { ref: "brief",       kind: "briefing",   stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do agente",             description: "Propósito, público, canal, tom, escopo." },
    { ref: "access",      kind: "acessos",    stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Acessos às fontes",              description: "CRM, base conhecimento, API WhatsApp/site." },
    { ref: "use_cases",   kind: "documento",  stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Casos de uso prioritários",      description: "Top 10 interações que precisa resolver bem." },
    { ref: "orb_ctx",     kind: "ai_orb",     stage: "entrada",        col: STAGE_COL.entrada,        row: 3, title: "Orb: Contexto consolidado",     description: "IA sintetiza briefing + dados + concorrência." },
    // Diagnóstico
    { ref: "knowledge",   kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "Consolidação de conhecimento",   description: "Base de conhecimento, FAQs, documentos." },
    { ref: "gaps",        kind: "documento",  stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "Gaps de informação",             description: "O que o agente não vai saber responder." },
    { ref: "orb_persona", kind: "ai_orb",     stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 2, title: "Orb: Arquiteta a persona",       description: "IA constrói persona baseada em posicionamento." },
    // Estrutura
    { ref: "persona",     kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Persona do agente",              description: "Nome, caráter, tom de voz." },
    { ref: "prompt_base", kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "System prompt base",             description: "Instruções principais." },
    { ref: "guardrails",  kind: "documento",  stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 2, title: "Guardrails e políticas",         description: "O que não fazer, compliance." },
    // Planejamento
    { ref: "escalation",  kind: "documento",  stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Fluxo de escalação humano",      description: "Quando passar pra humano." },
    // Produção
    { ref: "build",       kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Agente: Core conversacional",    description: "Custom GPT, Claude Projects ou assistant custom." },
    { ref: "kb_embed",    kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Agente: Knowledge Base vetorial",description: "Embedding e indexação do conhecimento." },
    { ref: "agent_func",  kind: "ia",         stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Agente: Functions/tools",        description: "Ações que o agente executa (buscar, agendar, criar ticket)." },
    { ref: "integration", kind: "integracao", stage: "producao",       col: STAGE_COL.producao,       row: 3, title: "Integração ao canal",            description: "WhatsApp/site/Telegram/email." },
    // Ativação
    { ref: "test",        kind: "documento",  stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Testes: 50+ cenários",           description: "Simulação de conversas reais." },
    { ref: "orb_eval",    kind: "ai_orb",     stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Orb: Auto-avalia respostas",    description: "IA revisa respostas do agente antes do launch." },
    { ref: "launch",      kind: "ia",         stage: "ativacao",       col: STAGE_COL.ativacao,       row: 2, title: "Launch soft (10%)",              description: "Deploy gradual com monitoramento." },
    // Otimização
    { ref: "conv_review", kind: "metrica",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Review semanal de conversas",    description: "Sampling + análise de qualidade." },
    { ref: "orb_learn",   kind: "ai_orb",     stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 1, title: "Orb: Learning loop",             description: "IA identifica patterns e sugere melhorias no prompt." },
    { ref: "tune",        kind: "ia",         stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 2, title: "Agente: Prompt refinado",        description: "Nova versão do agente com ajustes." },
    // Expansão
    { ref: "handoff",     kind: "documento",  stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Documentação + SLA",             description: "Manual, canal de ajustes, SLA." },
    // Chat IA — meta-agente que ajuda a construir o agente
    { ref: "chat",        kind: "chat_node",  stage: "planejamento",   col: STAGE_COL.planejamento,   row: 1, title: "Chat IA do Projeto",             description: "Assistente para refinar persona, prompt base e guardrails iterativamente.",
      data: { scope: "workspace", fn: "briefing", size: "L" } },
  ],
  edges: [
    { fromRef: "brief",       toRef: "orb_ctx",      label: "alimenta" },
    { fromRef: "use_cases",   toRef: "orb_ctx",      label: "detalha" },
    { fromRef: "access",      toRef: "knowledge",    label: "alimenta" },
    { fromRef: "orb_ctx",     toRef: "knowledge",    label: "orienta" },
    { fromRef: "knowledge",   toRef: "gaps",         label: "revela" },
    { fromRef: "orb_ctx",     toRef: "orb_persona",  label: "contextualiza" },
    { fromRef: "orb_persona", toRef: "persona",      label: "define" },
    { fromRef: "persona",     toRef: "prompt_base",  label: "estrutura" },
    { fromRef: "use_cases",   toRef: "prompt_base",  label: "informa" },
    { fromRef: "gaps",        toRef: "guardrails",   label: "protege" },
    { fromRef: "brief",       toRef: "guardrails",   label: "limita" },
    { fromRef: "gaps",        toRef: "escalation",   label: "exige" },
    { fromRef: "prompt_base", toRef: "build",        label: "programa" },
    { fromRef: "guardrails",  toRef: "build",        label: "reforça" },
    { fromRef: "knowledge",   toRef: "kb_embed",     label: "vetoriza" },
    { fromRef: "build",       toRef: "agent_func",   label: "estende" },
    { fromRef: "kb_embed",    toRef: "build",        label: "alimenta" },
    { fromRef: "build",       toRef: "integration",  label: "conecta" },
    { fromRef: "agent_func",  toRef: "integration",  label: "integra" },
    { fromRef: "integration", toRef: "test",         label: "valida" },
    { fromRef: "test",        toRef: "orb_eval",     label: "revisa" },
    { fromRef: "orb_eval",    toRef: "launch",       label: "aprova" },
    { fromRef: "launch",      toRef: "conv_review",  label: "gera dados" },
    { fromRef: "conv_review", toRef: "orb_learn",    label: "analisa" },
    { fromRef: "orb_learn",   toRef: "tune",         label: "melhora" },
    { fromRef: "tune",        toRef: "launch",       label: "substitui" },
    { fromRef: "escalation",  toRef: "launch",       label: "suporta" },
    { fromRef: "tune",        toRef: "handoff",      label: "documenta" },
    // Chat IA
    { fromRef: "persona",     toRef: "chat",         label: "alimenta" },
    { fromRef: "prompt_base", toRef: "chat",         label: "refina" },
  ],
};

// ═════════════════════════════════════════════════════════════
// MARKETING — 21 nodes (com IA em conteúdo, análise e otimização)
// ═════════════════════════════════════════════════════════════

const PLAYBOOK_MARKETING: Omit<Playbook, "planKey"> = {
  name: "Marketing com IA",
  description: "Operação de marketing com IA em todas as etapas: geração de ideias, copy, criativos, otimização de ads e análise de resultados.",
  nodes: [
    // Entrada
    { ref: "brief",       kind: "briefing",     stage: "entrada",        col: STAGE_COL.entrada,        row: 0, title: "Briefing do negócio",            description: "Posicionamento, ICP, dores, diferencial." },
    { ref: "obj",         kind: "objetivo",     stage: "entrada",        col: STAGE_COL.entrada,        row: 1, title: "Objetivos 90 dias",              description: "Metas SMART de leads/vendas/awareness." },
    { ref: "access",      kind: "acessos",      stage: "entrada",        col: STAGE_COL.entrada,        row: 2, title: "Acessos & plataformas",          description: "Redes, ads, CRM, analytics, design." },
    { ref: "orb_ctx",     kind: "ai_orb",       stage: "entrada",        col: STAGE_COL.entrada,        row: 3, title: "Orb: Contexto de marca",         description: "IA consolida briefing + análise de voz/tom." },
    // Diagnóstico
    { ref: "icp",         kind: "documento",    stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 0, title: "ICP + Persona",                  description: "Quem vamos atingir, onde, com que mensagem." },
    { ref: "funnel",      kind: "funil",        stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 1, title: "Mapeamento do funil",            description: "Descobre → considera → decide → compra." },
    { ref: "orb_bench",   kind: "ai_orb",       stage: "diagnostico",    col: STAGE_COL.diagnostico,    row: 2, title: "Orb: Análise competitiva IA",   description: "IA analisa concorrentes e identifica oportunidades." },
    // Estrutura
    { ref: "voice",       kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 0, title: "Manual de voz e tom",            description: "Como a marca se comunica." },
    { ref: "assets",      kind: "documento",    stage: "estrutura_base", col: STAGE_COL.estrutura_base, row: 1, title: "Biblioteca de assets",           description: "Logos, fontes, paleta, templates." },
    // Planejamento
    { ref: "strat",       kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 0, title: "Estratégia de conteúdo",         description: "Pilares, canais, frequência." },
    { ref: "calendar",    kind: "documento",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 1, title: "Calendário editorial",           description: "Posts planejados, datas, formatos." },
    // Produção
    { ref: "agent_copy",  kind: "ia",           stage: "producao",       col: STAGE_COL.producao,       row: 0, title: "Agente IA: Gerador de copy",    description: "IA cria copy de posts/ads/emails com contexto do cliente." },
    { ref: "content",     kind: "conteudo",     stage: "producao",       col: STAGE_COL.producao,       row: 1, title: "Produção — 8 peças/mês",         description: "Posts, carrosséis, criativos." },
    { ref: "lp",          kind: "landing_page", stage: "producao",       col: STAGE_COL.producao,       row: 2, title: "Landing Page trimestral",        description: "LP de conversão pra campanha." },
    { ref: "email",       kind: "automacao",    stage: "producao",       col: STAGE_COL.producao,       row: 3, title: "Email marketing / nutrição",     description: "Sequências de email automáticas." },
    // Ativação
    { ref: "ads_meta",    kind: "trafego",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 0, title: "Campanha Meta Ads",              description: "Gestão recorrente com otimização." },
    { ref: "dash",        kind: "metrica",      stage: "ativacao",       col: STAGE_COL.ativacao,       row: 1, title: "Dashboard de métricas",          description: "Leads, CPL, engajamento, ROAS." },
    // Otimização
    { ref: "weekly",      kind: "documento",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 0, title: "Check-in semanal",               description: "Review de performance + ajustes." },
    { ref: "orb_insight", kind: "ai_orb",       stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 1, title: "Orb: Insights de performance",   description: "IA analisa dashboard e recomenda próximos passos." },
    { ref: "report",      kind: "documento",    stage: "otimizacao",     col: STAGE_COL.otimizacao,     row: 2, title: "Relatório mensal",               description: "Resultados, aprendizados, plano próximo mês." },
    // Expansão
    { ref: "expand",      kind: "decisao",      stage: "expansao",       col: STAGE_COL.expansao,       row: 0, title: "Decisão de expansão",            description: "Escalar canal que funciona, cortar que não." },
    // Chat IA — assistente de marketing
    { ref: "chat",        kind: "chat_node",    stage: "planejamento",   col: STAGE_COL.planejamento,   row: 2, title: "Chat IA de Marketing",           description: "Copiloto para calendário, copy e análise de campanhas.",
      data: { scope: "workspace", fn: "production", size: "L" } },
  ],
  edges: [
    { fromRef: "brief",       toRef: "orb_ctx",      label: "alimenta" },
    { fromRef: "orb_ctx",     toRef: "icp",          label: "aprofunda" },
    { fromRef: "obj",         toRef: "strat",        label: "direciona" },
    { fromRef: "icp",         toRef: "funnel",       label: "modela" },
    { fromRef: "icp",         toRef: "orb_bench",    label: "contextualiza" },
    { fromRef: "orb_bench",   toRef: "voice",        label: "diferencia" },
    { fromRef: "voice",       toRef: "agent_copy",   label: "programa" },
    { fromRef: "assets",      toRef: "content",      label: "compõe" },
    { fromRef: "funnel",      toRef: "strat",        label: "estrutura" },
    { fromRef: "strat",       toRef: "calendar",     label: "planeja" },
    { fromRef: "calendar",    toRef: "agent_copy",   label: "briefa" },
    { fromRef: "agent_copy",  toRef: "content",      label: "gera" },
    { fromRef: "content",     toRef: "ads_meta",     label: "impulsiona" },
    { fromRef: "agent_copy",  toRef: "lp",           label: "escreve" },
    { fromRef: "lp",          toRef: "ads_meta",     label: "destino" },
    { fromRef: "lp",          toRef: "email",        label: "captura" },
    { fromRef: "agent_copy",  toRef: "email",        label: "escreve" },
    { fromRef: "email",       toRef: "dash",         label: "alimenta" },
    { fromRef: "ads_meta",    toRef: "dash",         label: "alimenta" },
    { fromRef: "dash",        toRef: "weekly",       label: "gera" },
    { fromRef: "dash",        toRef: "orb_insight",  label: "analisa" },
    { fromRef: "orb_insight", toRef: "weekly",       label: "orienta" },
    { fromRef: "weekly",      toRef: "report",       label: "compila" },
    { fromRef: "orb_insight", toRef: "report",       label: "embasa" },
    { fromRef: "report",      toRef: "expand",       label: "informa" },
    { fromRef: "access",      toRef: "ads_meta",     label: "habilita" },
    { fromRef: "access",      toRef: "email",        label: "habilita" },
    // Chat IA
    { fromRef: "icp",         toRef: "chat",         label: "contextualiza" },
    { fromRef: "calendar",    toRef: "chat",         label: "planeja" },
    { fromRef: "dash",        toRef: "chat",         label: "métricas" },
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
    if (pb) list.push({
      key: `type:${type}`, source: "type", projectType: type as ProjectType,
      name: pb.name, description: pb.description, nodeCount: pb.nodes.length,
    });
  });
  return list;
}

export { playbookPos };
