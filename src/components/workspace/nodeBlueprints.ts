/**
 * nodeBlueprints.ts
 *
 * Para cada tipo de node operacional, define a "receita" do drawer especializado:
 *  - methodChecklist: passos do método ACELERA específicos do tipo (sempre presentes)
 *  - sections:        seções editáveis do drawer (cada uma com schema específico)
 *  - quickActions:    botões de ação rápida no header do drawer
 *  - sources:         fontes que o `prefill-node` deve consultar para rascunhar
 *  - prefillPrompt:   instrução base para a IA preencher o JSON estruturado das sections
 *
 * O hook useNodePrefill consome este registro: na 1ª abertura do drawer, dispara
 * a edge function `prefill-node` passando o blueprint + ids; recebe o JSON
 * preenchido e cacheia em `canvas_nodes.metadata.prefill`.
 *
 * Regra de ouro: cada drawer tem que ter cara própria — Briefing ≠ Kickoff ≠ Site.
 * Se você só está copiando seções de um tipo pra outro, está errado.
 */

import type { ProjectNodeKind } from "./canvasProjectTypes";

// ═══════════════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════════════

export type PrefillSource =
  | "briefing"   // ConsolidatedBriefing IA (do edge consolidate-briefing)
  | "context"    // context_entries do cliente (notas, transcrições, importados)
  | "metrics"    // metric_snapshots
  | "fronts"     // fronts de atuação do cliente
  | "client"     // dados estruturados do cliente (segmento, plano, links)
  | "assets"     // anexos do cliente / da workspace
  | "siblings"   // outros canvas_nodes da mesma esteira já preenchidos
  | "diagnostico_docs"; // documentos do Contexto que sustentam diagnóstico (diagnostico/dor/decisao)

export type SectionFieldType =
  | "text"        // input curto
  | "textarea"    // bloco de texto livre
  | "list"        // lista de strings (bullet points)
  | "kv"          // pares chave→valor (ex: meta→60% conversão)
  | "checklist"   // itens com done:boolean
  | "attachments";// anexos (PDF, imagens, links) — UI usa AttachmentUploader; IA não preenche

export interface SectionField {
  id: string;
  label: string;
  type: SectionFieldType;
  /** Hint mostrado em placeholder e enviado pra IA pra ajudar no rascunho. */
  hint?: string;
  /** Marca campo como decisão humana — IA não deve preencher, apenas sugerir. */
  decisionOnly?: boolean;
}

export interface NodeSection {
  id: string;
  title: string;
  description?: string;
  fields: SectionField[];
}

export interface MethodChecklistItem {
  id: string;
  label: string;
  required: boolean;
}

export type QuickActionId =
  | "generate_tasks"      // dispara TaskPlanningWizard pré-preenchido
  | "export_pdf"          // exporta seções como PDF formatado
  | "approve"             // marca node como aprovado/concluído
  | "regenerate_prefill"  // refaz prefill da IA
  | "open_briefing"       // abre BriefingConsolidatedView no contexto
  | "create_snapshot"     // cria metric_snapshot vinculado
  | "create_front"        // cria front de atuação
  | "link_asset"          // vincula asset existente
  | "schedule_meeting"    // gera evento .ics
  | "go_live";            // checklist de pré-launch

export interface NodeQuickAction {
  id: QuickActionId;
  label: string;
  /** Mostrar como ação primária (botão preenchido) ou secundária (outline/ghost). */
  primary?: boolean;
}

export interface NodeBlueprint {
  kind: ProjectNodeKind;
  /** Subtítulo do drawer ("O que esse node entrega") */
  purpose: string;
  methodChecklist: MethodChecklistItem[];
  sections: NodeSection[];
  quickActions: NodeQuickAction[];
  sources: PrefillSource[];
  /** Prompt base — o edge function injeta o contexto e o schema. */
  prefillPrompt: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// Blueprints — 12 tipos prioritários
// ═══════════════════════════════════════════════════════════════════════════

const BRIEFING: NodeBlueprint = {
  kind: "briefing",
  purpose: "Captura completa da intenção do cliente — base de tudo que vem depois.",
  methodChecklist: [
    { id: "review_basics",   label: "Revisar dados básicos do cliente",         required: true  },
    { id: "validate_goals",  label: "Validar objetivos com o cliente",          required: true  },
    { id: "confirm_limits",  label: "Confirmar restrições (orçamento, prazo)",  required: true  },
    { id: "map_positioning", label: "Mapear posicionamento e mercado",          required: true  },
    { id: "collect_refs",    label: "Coletar referências e materiais (PDF/links)", required: false },
    { id: "seal_brief",      label: "Selar briefing — não pode mais mudar",     required: true  },
    { id: "share_summary",   label: "Compartilhar resumo executivo",            required: false },
  ],
  sections: [
    {
      id: "client_summary", title: "Resumo do cliente",
      description: "Quem é, o que vende, em que estágio está.",
      fields: [
        { id: "who",      label: "Quem é o cliente",          type: "textarea", hint: "Empresa, fundadores, posicionamento" },
        { id: "offer",    label: "Oferta principal",          type: "textarea", hint: "Produto/serviço + ticket médio" },
        { id: "stage",    label: "Estágio atual do negócio",  type: "text",     hint: "Validação / tração / escala" },
        { id: "history",  label: "Histórico relevante",       type: "textarea", hint: "Marcos, pivôs, números de tração" },
      ],
    },
    {
      id: "positioning", title: "Posicionamento e mercado",
      description: "Como o cliente se posiciona vs alternativas — base pra copy e diferenciação.",
      fields: [
        { id: "category",     label: "Categoria de mercado",        type: "text",     hint: "Em qual prateleira a oferta vive" },
        { id: "positioning",  label: "Frase de posicionamento",     type: "textarea", hint: "Para [persona], que sofre [dor], oferecemos [solução] ao contrário de [alternativa]" },
        { id: "competitors",  label: "Concorrentes diretos (3-5)",  type: "list" },
        { id: "alternatives", label: "Alternativas indiretas",      type: "list",     hint: "Não-consumo, planilha, agência X..." },
        { id: "tone",         label: "Tom de voz",                  type: "text",     hint: "Próximo / técnico / provocador / etc." },
      ],
    },
    {
      id: "goals", title: "Objetivos do projeto",
      description: "O que precisa acontecer pra esse projeto ser sucesso.",
      fields: [
        { id: "north_star",   label: "Objetivo norte (1 frase)",  type: "text",     hint: "Ex: Triplicar leads qualificados em 90 dias" },
        { id: "kpis",         label: "KPIs primários",            type: "list",     hint: "3-5 métricas mensuráveis" },
        { id: "horizon",      label: "Horizonte de avaliação",    type: "text",     hint: "30/60/90 dias" },
        { id: "success",      label: "Como saberemos que deu certo", type: "textarea", hint: "Critério explícito de vitória" },
      ],
    },
    {
      id: "audience", title: "Público-alvo",
      fields: [
        { id: "primary",   label: "Persona primária",   type: "textarea", hint: "Cargo, dor, gatilho de compra" },
        { id: "secondary", label: "Persona secundária", type: "textarea" },
        { id: "objections",label: "Objeções comuns",    type: "list" },
        { id: "channels",  label: "Onde essa persona está", type: "list", hint: "IG, LinkedIn, evento X..." },
      ],
    },
    {
      id: "differentials", title: "Diferenciais e prova",
      fields: [
        { id: "uvp",      label: "UVP (proposta de valor única)", type: "textarea" },
        { id: "proofs",   label: "Provas sociais disponíveis",    type: "list", hint: "Cases, depoimentos, números" },
        { id: "moats",    label: "Vantagens estruturais (moats)", type: "list", hint: "Tecnologia, rede, marca, dados" },
      ],
    },
    {
      id: "references", title: "Referências e inspirações",
      description: "Marcas/sites/peças que o cliente quer (ou NÃO quer) parecer.",
      fields: [
        { id: "love",   label: "Referências positivas (com link)", type: "list", hint: "Link + por que gosta" },
        { id: "hate",   label: "Referências negativas",            type: "list", hint: "O que evitar" },
      ],
    },
    {
      id: "constraints", title: "Restrições",
      fields: [
        { id: "budget",   label: "Orçamento aprovado",  type: "text",     decisionOnly: true },
        { id: "deadline", label: "Prazo final inegociável", type: "text", decisionOnly: true },
        { id: "vetoes",   label: "Vetos / não-pode",    type: "list",     hint: "Tom, palavras, concorrentes a evitar" },
        { id: "legal",    label: "Restrições legais/compliance", type: "list", hint: "LGPD, ANVISA, CVM, etc." },
      ],
    },
    {
      id: "materials", title: "Materiais do cliente (anexos)",
      description: "PDFs, decks, planilhas e referências enviadas pelo cliente.",
      fields: [
        { id: "files", label: "Documentos anexados", type: "attachments", hint: "Briefings, decks, manuais de marca, planilhas" },
      ],
    },
    {
      id: "next_steps", title: "Próximos passos",
      fields: [
        { id: "actions", label: "Ações imediatas",  type: "list", hint: "Quem faz o quê nos próximos 7 dias" },
        { id: "owner",   label: "Dono do briefing", type: "text", decisionOnly: true },
      ],
    },
  ],
  quickActions: [
    { id: "export_pdf",       label: "Baixar PDF",           primary: true  },
    { id: "generate_tasks",   label: "Gerar tasks",          primary: true  },
    { id: "approve",          label: "Selar briefing"                       },
    { id: "regenerate_prefill", label: "Regenerar com IA"                   },
  ],
  sources: ["briefing","context","client","assets"],
  prefillPrompt:
    "Você é o diretor estratégico que transforma briefings brutos em documentos executáveis. " +
    "Use o briefing consolidado e os contextos importados pra preencher CADA campo com a melhor síntese possível. " +
    "Para 'positioning', escreva no formato: 'Para [persona], que sofre [dor], oferecemos [solução] ao contrário de [alternativa]'. " +
    "Para 'references', sugira 3-5 marcas/peças COM justificativa curta — se não houver no contexto, marque empty. " +
    "Tom: direto, profissional, sem floreio. Quando faltar informação, marque o campo como vazio — não invente fatos sobre orçamento ou prazo.",
};

const DIAGNOSTICO: NodeBlueprint = {
  kind: "documento", // mapeamos 'diagnostico' como subtipo de documento na fase entrada
  purpose: "Mapeamento estrutural do estado atual — gaps que justificam o projeto.",
  methodChecklist: [
    { id: "map_assets",    label: "Mapear ativos digitais existentes",     required: true  },
    { id: "review_docs",   label: "Revisar documentos puxados do Contexto", required: true },
    { id: "score_gaps",    label: "Pontuar gaps por impacto/esforço",      required: true  },
    { id: "structural",    label: "Análise por dimensão (oferta/canais/conv/retenção/ops)", required: true },
    { id: "quick_wins",    label: "Identificar 3-5 quick wins acionáveis",  required: true },
    { id: "benchmark",     label: "Benchmark com 3 concorrentes",          required: false },
    { id: "plan",          label: "Plano de remediação 30/60/90",          required: true },
    { id: "share_diag",    label: "Compartilhar diagnóstico com o cliente", required: true },
  ],
  sections: [
    {
      id: "documents", title: "Documentos revisados",
      description: "Lista materiais do Contexto que sustentam o diagnóstico — adicione anexos extras se faltar.",
      fields: [
        { id: "reviewed",    label: "Documentos analisados (do Contexto + anexos)", type: "list", hint: "Auto-puxado de Contexto: diagnósticos, dores, decisões" },
        { id: "key_quotes",  label: "Trechos-chave citados",      type: "list",  hint: "Citações textuais que sustentam o diagnóstico" },
        { id: "extras",      label: "Documentos adicionais (PDF/links)", type: "attachments" },
      ],
    },
    {
      id: "current_state", title: "Estado atual",
      description: "O que existe hoje — site, redes, processos, métricas.",
      fields: [
        { id: "channels",   label: "Canais ativos",        type: "list",     hint: "Site, IG, LinkedIn, etc." },
        { id: "stack",      label: "Stack/ferramentas",    type: "list" },
        { id: "metrics_now",label: "Métricas atuais",      type: "kv",       hint: "Tráfego, conversão, CAC" },
        { id: "team",       label: "Time e responsabilidades hoje", type: "list", hint: "Quem opera o quê" },
        { id: "processes",  label: "Processos existentes (que funcionam)", type: "list" },
      ],
    },
    {
      id: "structural", title: "Análise estrutural por dimensão",
      description: "Pontue cada dimensão de 1-5 e justifique. Base do plano de ataque.",
      fields: [
        { id: "offer",     label: "Oferta e posicionamento",      type: "textarea", hint: "Score 1-5 + justificativa: clareza, diferenciação, fit" },
        { id: "channels",  label: "Canais de aquisição",          type: "textarea", hint: "Score 1-5: diversidade, eficiência, dependência" },
        { id: "conversion",label: "Funil de conversão",           type: "textarea", hint: "Score 1-5: pontos de fricção, taxas por etapa" },
        { id: "retention", label: "Retenção e LTV",               type: "textarea", hint: "Score 1-5: churn, repetição, NPS" },
        { id: "ops",       label: "Operação e dados",             type: "textarea", hint: "Score 1-5: tracking, governança, automação" },
        { id: "brand",     label: "Marca e percepção",            type: "textarea", hint: "Score 1-5: awareness, autoridade, prova social" },
      ],
    },
    {
      id: "gaps", title: "Gaps identificados",
      description: "Priorize por impacto × esforço — não liste tudo.",
      fields: [
        { id: "critical",   label: "Críticos (bloqueiam o objetivo)",   type: "list", hint: "Resolver já — sem isso nada avança" },
        { id: "important",  label: "Importantes (atrasam — 30 dias)",    type: "list" },
        { id: "nice",       label: "Desejáveis (otimização — depois)",   type: "list" },
        { id: "evidence",   label: "Evidência por gap",                  type: "kv",   hint: "gap → fonte/dado que prova" },
      ],
    },
    {
      id: "risks", title: "Riscos e bloqueios",
      fields: [
        { id: "risks",       label: "Riscos estruturais identificados", type: "list", hint: "Probabilidade × impacto" },
        { id: "blockers",    label: "Bloqueios externos",               type: "list", hint: "Aprovações, fornecedores, legais" },
        { id: "tech_debt",   label: "Débito técnico relevante",         type: "list" },
      ],
    },
    {
      id: "benchmark", title: "Benchmark competitivo",
      fields: [
        { id: "competitors", label: "Concorrentes analisados", type: "list" },
        { id: "advantages",  label: "Vantagens deles",         type: "list" },
        { id: "weaknesses",  label: "Fraquezas deles",         type: "list" },
        { id: "openings",    label: "Aberturas pra atacar",    type: "list" },
      ],
    },
    {
      id: "quick_wins", title: "Quick wins (≤14 dias)",
      description: "Ações de alto impacto e baixo esforço — pra mostrar tração rápido.",
      fields: [
        { id: "wins",     label: "Quick wins identificados",  type: "list",  hint: "Ação → impacto esperado" },
        { id: "owner",    label: "Dono de cada quick win",    type: "kv",    hint: "ação → responsável" },
      ],
    },
    {
      id: "plan", title: "Plano de remediação 30/60/90",
      description: "Sequência de ataque por horizonte — alimenta a etapa de Estrutura/Planejamento.",
      fields: [
        { id: "h30",  label: "Primeiros 30 dias",  type: "list", hint: "Resolver críticos + quick wins" },
        { id: "h60",  label: "30-60 dias",         type: "list" },
        { id: "h90",  label: "60-90 dias",         type: "list" },
        { id: "deps", label: "Dependências entre fases", type: "list", hint: "O que precisa estar pronto antes" },
      ],
    },
    {
      id: "recommendation", title: "Recomendação",
      fields: [
        { id: "summary",  label: "Síntese executiva",  type: "textarea", hint: "3-5 frases que justificam o projeto" },
        { id: "priorities", label: "Prioridades",      type: "list" },
        { id: "next_step", label: "Próximo passo único e claro",  type: "text",     decisionOnly: true },
      ],
    },
  ],
  quickActions: [
    { id: "export_pdf",        label: "Baixar diagnóstico", primary: true },
    { id: "generate_tasks",    label: "Gerar tasks de remediação", primary: true },
    { id: "regenerate_prefill",label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","metrics","client","diagnostico_docs","assets"],
  prefillPrompt:
    "Você é consultor sênior (ex-McKinsey) fazendo diagnóstico estrutural. " +
    "PRIORIDADE ABSOLUTA: leia TODOS os documentos em `diagnostico_docs` e `context_entries` — eles são a base factual. " +
    "Em 'documents.reviewed', liste cada documento revisado pelo TÍTULO exato (1 por linha). " +
    "Em 'documents.key_quotes', extraia 3-7 trechos textuais curtos que sustentam o diagnóstico (use citation com o título do doc). " +
    "Em 'structural', dê SCORE 1-5 + 1-2 frases de justificativa por dimensão — base do plano. " +
    "Pontue gaps com critério: crítico = bloqueia o objetivo; importante = atrasa; desejável = melhoraria. " +
    "Em 'gaps.evidence', vincule cada gap a uma fonte específica (briefing, doc X, métrica Y). " +
    "Quick wins: só itens de ALTO impacto e BAIXO esforço (≤14 dias, ≤1 pessoa). Se não tiver, deixe vazio. " +
    "Plano 30/60/90: sequência lógica — críticos primeiro, dependências respeitadas. " +
    "Para benchmark, se não houver dados reais de concorrentes, deixe vazio — não invente.",
};

const OBJETIVO: NodeBlueprint = {
  kind: "objetivo",
  purpose: "Tradução do briefing em metas SMART por horizonte.",
  methodChecklist: [
    { id: "smart",        label: "Cada meta tem prazo + número",         required: true },
    { id: "owner",        label: "Cada meta tem dono",                   required: true },
    { id: "baseline",     label: "Baseline registrado",                  required: true },
    { id: "review_cad",   label: "Cadência de review definida",          required: true },
    { id: "risks",        label: "Riscos e dependências mapeados",       required: true },
    { id: "leading",      label: "Indicador antecedente definido",       required: false },
  ],
  sections: [
    {
      id: "north_star", title: "Norte estratégico",
      fields: [
        { id: "statement", label: "1 frase que define vitória", type: "text" },
        { id: "horizon",   label: "Horizonte (90/180/365 dias)", type: "text" },
        { id: "why_now",   label: "Por que esse objetivo agora", type: "textarea", hint: "Contexto que justifica priorizar isso" },
      ],
    },
    {
      id: "objectives", title: "Objetivos por horizonte",
      fields: [
        { id: "h30",  label: "30 dias",  type: "list", hint: "Metas curtas, mensuráveis" },
        { id: "h60",  label: "60 dias",  type: "list" },
        { id: "h90",  label: "90 dias",  type: "list" },
      ],
    },
    {
      id: "kpis", title: "KPIs e baseline",
      fields: [
        { id: "kpis",      label: "KPIs primários",   type: "kv", hint: "métrica → meta" },
        { id: "baseline",  label: "Baseline atual",   type: "kv", hint: "métrica → valor hoje" },
        { id: "leading",   label: "Indicadores antecedentes (leading)", type: "kv", hint: "Métricas que prevêem o resultado" },
      ],
    },
    {
      id: "hypothesis", title: "Hipóteses que sustentam o objetivo",
      description: "Se essas hipóteses forem falsas, o objetivo cai. Liste explicitamente.",
      fields: [
        { id: "assumptions", label: "Premissas que precisam ser verdade", type: "list" },
        { id: "to_validate", label: "O que validar primeiro",            type: "list", hint: "Testes baratos antes de investir pesado" },
      ],
    },
    {
      id: "risks", title: "Riscos e dependências",
      fields: [
        { id: "risks",        label: "Riscos por probabilidade × impacto", type: "list", hint: "Ex: alta × alta — pixel quebrado" },
        { id: "dependencies", label: "Dependências externas",              type: "list", hint: "Aprovações, integrações, fornecedores" },
        { id: "mitigation",   label: "Mitigações planejadas",              type: "kv",   hint: "risco → ação" },
      ],
    },
    {
      id: "owners", title: "Donos e cadência",
      fields: [
        { id: "owners",  label: "Dono por objetivo",  type: "list", decisionOnly: true },
        { id: "cadence", label: "Frequência de review", type: "text", hint: "Semanal / quinzenal / mensal" },
        { id: "ritual",  label: "Ritual de review (formato)", type: "textarea", hint: "Quem participa, agenda, decisões" },
      ],
    },
    {
      id: "supporting", title: "Documentos de suporte",
      fields: [
        { id: "files", label: "OKRs, planilhas, contratos", type: "attachments" },
      ],
    },
  ],
  quickActions: [
    { id: "create_snapshot", label: "Criar snapshot baseline", primary: true },
    { id: "generate_tasks",  label: "Gerar tasks por objetivo", primary: true },
    { id: "export_pdf",      label: "Baixar OKRs" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","metrics","fronts","siblings"],
  prefillPrompt:
    "Você é coach de OKRs. Toda meta deve ser SMART: Specific, Measurable, Achievable, Relevant, Time-bound. " +
    "Use o briefing pra entender direção e métricas existentes pra calibrar baseline. " +
    "Sempre liste hipóteses explícitas — premissas que, se falsas, derrubam o objetivo. " +
    "Em 'risks', use o formato 'probabilidade × impacto — descrição'. " +
    "Se não houver baseline, marque 'a medir' — não chute.",
};

const DOCUMENTO: NodeBlueprint = {
  kind: "documento",
  purpose: "Documento estruturado de referência — política, processo ou especificação.",
  methodChecklist: [
    { id: "scope",       label: "Escopo definido",                    required: true },
    { id: "structure",   label: "Estrutura aprovada",                 required: true },
    { id: "review",      label: "Revisão por 2ª pessoa",              required: true },
    { id: "publish",     label: "Publicado no canal certo",           required: false },
  ],
  sections: [
    {
      id: "meta", title: "Identificação",
      fields: [
        { id: "purpose",  label: "Para que serve este documento", type: "textarea" },
        { id: "audience", label: "Quem deve ler",                  type: "text" },
        { id: "version",  label: "Versão atual",                   type: "text" },
      ],
    },
    {
      id: "content", title: "Conteúdo principal",
      fields: [
        { id: "summary",   label: "TL;DR",                  type: "textarea", hint: "Síntese em 2-3 frases" },
        { id: "sections",  label: "Tópicos (em ordem)",     type: "list" },
        { id: "details",   label: "Detalhes / corpo",       type: "textarea" },
      ],
    },
    {
      id: "actions", title: "Ações esperadas do leitor",
      fields: [
        { id: "actions", label: "O que o leitor deve fazer depois de ler", type: "list" },
      ],
    },
  ],
  quickActions: [
    { id: "export_pdf",        label: "Baixar documento", primary: true },
    { id: "regenerate_prefill",label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","client"],
  prefillPrompt:
    "Você é technical writer. Escreva claro, com TL;DR no topo. Ordene tópicos por relevância pro leitor. " +
    "Tom: profissional, sem jargão desnecessário.",
};

const SITE: NodeBlueprint = {
  kind: "site",
  purpose: "Site institucional/produto — arquitetura, copy, SEO, performance e go-live em fluxo único.",
  methodChecklist: [
    { id: "arch",     label: "Arquitetura de páginas aprovada",     required: true  },
    { id: "copy",     label: "Copy validado por página",            required: true  },
    { id: "seo",      label: "SEO técnico (meta, OG, schema)",      required: true  },
    { id: "visual",   label: "Visual aprovado vs design system",    required: true  },
    { id: "tracking", label: "Tracking instalado e validado",       required: true  },
    { id: "perf",     label: "Performance (LCP<2.5s, CLS<0.1)",     required: true  },
    { id: "a11y",     label: "Acessibilidade WCAG AA",              required: true  },
    { id: "legal",    label: "Privacy / Termos / Cookies publicados", required: true },
    { id: "live",     label: "Domínio + SSL + indexação",           required: true  },
  ],
  sections: [
    {
      id: "stack", title: "Stack e plataforma",
      description: "Decida onde o site vive antes de escrever copy.",
      fields: [
        { id: "platform",   label: "Plataforma",          type: "text",  hint: "Lovable/Next.js, WordPress, Webflow, Framer, Shopify..." },
        { id: "cms",        label: "CMS / fonte de conteúdo", type: "text", hint: "Sanity, Contentful, headless WP, MDX..." },
        { id: "hosting",    label: "Hosting / CDN",       type: "text",  hint: "Vercel, Cloudflare, Netlify..." },
        { id: "repo_url",   label: "Repositório",         type: "text",  decisionOnly: true },
        { id: "staging_url",label: "URL de staging",      type: "text",  decisionOnly: true },
        { id: "integrations", label: "Integrações esperadas", type: "list", hint: "CRM, e-mail, pagamento, chat..." },
      ],
    },
    {
      id: "architecture", title: "Arquitetura de páginas",
      fields: [
        { id: "pages",   label: "Páginas planejadas",  type: "list", hint: "Home, Sobre, Serviços, Contato..." },
        { id: "menu",    label: "Estrutura do menu",   type: "list" },
        { id: "footer",  label: "Itens do rodapé",     type: "list" },
        { id: "routes",  label: "Rotas técnicas (slug)", type: "kv",   hint: "Home → / ; Blog → /blog/[slug]" },
      ],
    },
    {
      id: "copy", title: "Copy por página",
      description: "Hero + benefícios + CTA por página.",
      fields: [
        { id: "hero_headline",    label: "Headline da Home",        type: "text" },
        { id: "hero_subheadline", label: "Subheadline da Home",     type: "text" },
        { id: "hero_cta",         label: "CTA principal",            type: "text" },
        { id: "value_props",      label: "Propostas de valor (3-5)", type: "list" },
        { id: "about_copy",       label: "Sobre nós (parágrafo)",    type: "textarea" },
        { id: "services_copy",    label: "Bloco de serviços/produtos", type: "textarea" },
        { id: "social_proof",     label: "Prova social (depoimentos, números, logos)", type: "list" },
        { id: "footer_copy",      label: "CTA final / rodapé",       type: "textarea" },
      ],
    },
    {
      id: "seo", title: "SEO técnico",
      fields: [
        { id: "meta_title",       label: "Meta title da Home",       type: "text",  hint: "<60 caracteres" },
        { id: "meta_description", label: "Meta description",         type: "text",  hint: "<160 caracteres" },
        { id: "keywords",         label: "Keywords-alvo",            type: "list" },
        { id: "schema_type",      label: "Schema.org principal",     type: "text",  hint: "Organization / LocalBusiness / Product" },
        { id: "og_image_brief",   label: "Brief da OG image",        type: "text",  hint: "1200x630, com logo + claim" },
        { id: "sitemap_robots",   label: "Sitemap + robots.txt",     type: "text",  hint: "Auto / manual / excluir páginas?" },
      ],
    },
    {
      id: "visual", title: "Specs visuais",
      fields: [
        { id: "palette",   label: "Paleta (do design system)",  type: "kv" },
        { id: "fonts",     label: "Tipografia",                 type: "kv", hint: "headings → ; body →" },
        { id: "imagery",   label: "Direção de imagem",          type: "textarea" },
        { id: "components",label: "Componentes-chave",          type: "list", hint: "Hero, Card, Pricing, FAQ accordion..." },
        { id: "motion",    label: "Diretrizes de animação",     type: "text",  hint: "Sutis / nenhuma / grandes parallax" },
      ],
    },
    {
      id: "performance", title: "Performance e qualidade",
      fields: [
        { id: "perf_targets", label: "Metas Core Web Vitals", type: "kv", hint: "LCP→<2.5s ; CLS→<0.1 ; INP→<200ms" },
        { id: "image_strategy", label: "Estratégia de imagens", type: "text", hint: "AVIF/WebP, lazy, responsive srcset" },
        { id: "a11y_checks", label: "Checks de acessibilidade", type: "list", hint: "Contraste AA, alt em imagens, foco visível, semântica" },
        { id: "i18n",       label: "Idiomas suportados",     type: "list" },
      ],
    },
    {
      id: "legal", title: "Legal e cookies",
      fields: [
        { id: "privacy_url",  label: "URL Política de Privacidade", type: "text", decisionOnly: true },
        { id: "terms_url",    label: "URL Termos de uso",            type: "text", decisionOnly: true },
        { id: "cookies_banner", label: "Banner de cookies",          type: "text", hint: "Cookiebot / Iubenda / próprio" },
        { id: "lgpd_owner",   label: "Encarregado de dados (DPO)",   type: "text", decisionOnly: true },
      ],
    },
    {
      id: "launch", title: "Go-live",
      fields: [
        { id: "domain",       label: "Domínio final",     type: "text",     decisionOnly: true },
        { id: "tracking_ids", label: "IDs de tracking",   type: "kv",       hint: "GA4, Meta Pixel, GTM..." },
        { id: "redirects",    label: "Redirects 301 necessários", type: "list" },
        { id: "dns_notes",    label: "Notas de DNS / SSL", type: "textarea", hint: "Registrador, propagação, certificado" },
        { id: "rollback_plan",label: "Plano de rollback",  type: "textarea" },
      ],
    },
    {
      id: "references", title: "Referências e anexos",
      fields: [
        { id: "inspiration",   label: "Sites de inspiração",  type: "list", hint: "URLs com 1 frase do que copiar" },
        { id: "competitors",   label: "Concorrentes a estudar", type: "list" },
        { id: "files",         label: "Anexos (mockups, logos, brand guide)", type: "attachments" },
      ],
    },
  ],
  quickActions: [
    { id: "generate_tasks", label: "Gerar tasks de produção", primary: true },
    { id: "go_live",        label: "Checklist pré-launch",    primary: true },
    { id: "link_asset",     label: "Vincular assets" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
    { id: "export_pdf",     label: "Exportar brief técnico" },
  ],
  sources: ["briefing","context","client","assets","siblings"],
  prefillPrompt:
    "Você é diretor de criação + estrategista de SEO + tech lead front-end. " +
    "Copy curta, benefício antes de feature, CTA verbal e direto. Meta title até 60 caracteres com keyword. Meta description até 160. " +
    "Sugira plataforma/CMS coerentes com o porte do cliente (Lovable+Next pra MVP, Webflow pra marketing puro, WP+headless pra equipe editorial). " +
    "Componentes citados devem casar com a arquitetura. Para legal/domínio/tracking/repositório, marque origin='empty' — decisão humana. " +
    "Performance: sempre proponha LCP<2.5s, CLS<0.1, INP<200ms como meta-base. " +
    "Use os objetivos e personas do briefing pra calibrar tom.",
};

const LANDING: NodeBlueprint = {
  kind: "landing_page",
  purpose: "Landing focada em 1 conversão única — copy de resposta direta com base de conversão completa.",
  methodChecklist: [
    { id: "single_goal",  label: "1 objetivo único definido",       required: true },
    { id: "above_fold",   label: "Promessa+CTA acima da dobra",     required: true },
    { id: "proof",        label: "Prova social posicionada",        required: true },
    { id: "objections",   label: "Objeções respondidas",            required: true },
    { id: "tracking",     label: "Eventos de conversão tracked",    required: true },
    { id: "ab_plan",      label: "Plano de teste A/B definido",     required: false },
    { id: "speed",        label: "LCP<2.5s validado",               required: true },
  ],
  sections: [
    {
      id: "goal", title: "Objetivo único e contexto de tráfego",
      fields: [
        { id: "conversion", label: "Conversão alvo",       type: "text", hint: "Ex: agendar demo / baixar e-book" },
        { id: "audience",   label: "Quem é o visitante",   type: "textarea" },
        { id: "source",     label: "De onde vem o tráfego", type: "text" },
        { id: "match",      label: "Message-match (anúncio → headline)", type: "text", hint: "A landing tem que continuar a frase do anúncio" },
        { id: "stage",      label: "Momento de consciência",  type: "text", hint: "Inconsciente / problema / solução / produto / mais consciente (Schwartz)" },
        { id: "goal_metric", label: "Métrica-meta",            type: "kv",   hint: "CTR_hero→% ; conv_total→% ; CPL→R$" },
      ],
    },
    {
      id: "promise", title: "Big Idea / promessa central",
      description: "Core promise antes de escrever qualquer headline.",
      fields: [
        { id: "big_idea",      label: "Big Idea (1 frase)",   type: "text", hint: "O insight novo/contra-intuitivo que sustenta a oferta" },
        { id: "transformation",label: "Transformação prometida", type: "textarea", hint: "De [estado atual] → para [estado desejado] em [prazo]" },
        { id: "mechanism",     label: "Mecanismo único",       type: "text",  hint: "Por que SÓ você entrega isso" },
        { id: "guarantee",     label: "Garantia / risco-zero", type: "text" },
      ],
    },
    {
      id: "above_fold", title: "Acima da dobra",
      fields: [
        { id: "headline",    label: "Headline (promessa)",    type: "text",  hint: "Específica, mensurável, urgente" },
        { id: "subheadline", label: "Subheadline (clareza)",  type: "text" },
        { id: "headline_alts", label: "3 variações de headline (A/B)", type: "list" },
        { id: "cta_primary", label: "CTA principal",          type: "text",  hint: "Verbo + benefício" },
        { id: "cta_alts",    label: "Variações de CTA",       type: "list" },
        { id: "microtrust",  label: "Microcopy de confiança", type: "text",  hint: "Ex: 'Sem cartão de crédito' / '+1.200 clientes'" },
        { id: "hero_visual", label: "Visual hero",            type: "text",  hint: "Mockup / vídeo / ilustração" },
      ],
    },
    {
      id: "body", title: "Corpo da página (em blocos)",
      fields: [
        { id: "blocks", label: "Blocos em ordem", type: "list", hint: "Ex: benefícios → como funciona → prova → FAQ → CTA" },
        { id: "pains",       label: "Dores que a página agita", type: "list" },
        { id: "value_props", label: "Propostas de valor (3-5, benefício+feature+prova)", type: "list" },
        { id: "how_it_works", label: "Como funciona (passos)", type: "list" },
        { id: "for_who",     label: "Pra quem é / pra quem não é", type: "kv", hint: "para→ ; não para→" },
        { id: "bonuses",     label: "Bônus / extras",         type: "list" },
      ],
    },
    {
      id: "offer", title: "Oferta",
      description: "Stack de valor + ancoragem + escassez.",
      fields: [
        { id: "price",       label: "Preço (real ou simbólico)", type: "text" },
        { id: "anchor",      label: "Ancoragem de preço",        type: "text",  hint: "De R$X por R$Y / equivalente a Z" },
        { id: "stack",       label: "Stack de valor",            type: "list",  hint: "Item + valor percebido" },
        { id: "urgency",     label: "Urgência / escassez",       type: "text",  hint: "Vagas, prazo, lote — apenas se real" },
        { id: "payment",     label: "Condições de pagamento",    type: "text" },
      ],
    },
    {
      id: "proof", title: "Prova social",
      fields: [
        { id: "testimonials", label: "Depoimentos a usar",    type: "list" },
        { id: "case_studies", label: "Cases / before-after",   type: "list" },
        { id: "logos",        label: "Logos de clientes",      type: "list" },
        { id: "numbers",      label: "Números (X clientes, Y anos)", type: "kv" },
        { id: "press",        label: "Mídia / certificações",  type: "list" },
      ],
    },
    {
      id: "objections", title: "Objeções e FAQ",
      fields: [
        { id: "top_objections", label: "Top 5 objeções a derrubar", type: "list" },
        { id: "faq", label: "FAQ (pergunta → resposta)", type: "kv" },
        { id: "risk_reversal", label: "Risk reversal (garantia, devolução)", type: "text" },
      ],
    },
    {
      id: "tracking", title: "Tracking e instrumentação",
      fields: [
        { id: "events",   label: "Eventos a disparar",    type: "list" },
        { id: "pixels",   label: "Pixels / tags",         type: "kv",   hint: "GA4, Meta, GTM, LinkedIn..." },
        { id: "utm_plan", label: "Plano de UTMs",         type: "kv",   hint: "source→ ; medium→ ; campaign→" },
        { id: "thanks",   label: "Página de obrigado",    type: "text" },
        { id: "post_conv",label: "Pós-conversão (e-mail, WhatsApp, redirect)", type: "list" },
      ],
    },
    {
      id: "ab", title: "Plano de teste A/B",
      fields: [
        { id: "hypothesis", label: "Hipóteses a testar (em ordem)", type: "list", hint: "Headline → CTA → ordem dos blocos → preço" },
        { id: "min_volume", label: "Volume mínimo para significância", type: "text", hint: "Ex: 1.000 visitas/variação" },
        { id: "kpi",        label: "KPI de decisão",      type: "text",  hint: "Conversão / CPL / receita" },
      ],
    },
    {
      id: "references", title: "Referências e assets",
      fields: [
        { id: "swipe_files", label: "Swipe files (URLs de inspiração)", type: "list" },
        { id: "files",       label: "Anexos (wireframe, vídeo, mockups)", type: "attachments" },
      ],
    },
  ],
  quickActions: [
    { id: "generate_tasks", label: "Gerar tasks de produção", primary: true },
    { id: "go_live",        label: "Pré-launch",  primary: true },
    { id: "export_pdf",     label: "Exportar copy doc" },
    { id: "link_asset",     label: "Vincular assets" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","siblings","assets"],
  prefillPrompt:
    "Você é copywriter de resposta direta (Halbert + Eugene Schwartz + Hormozi). " +
    "Calibre o tom pelo nível de consciência (Schwartz). Headline específica, mensurável, com benefício e — quando couber — dispositivo de curiosidade. " +
    "Big Idea: 1 frase contra-intuitiva, não chavão. Mecanismo único é o motivo de SÓ a marca entregar a transformação. " +
    "Stack de valor: cada item com valor percebido em R$ (Hormozi). Urgência só se real — nunca invente lote/vaga. " +
    "Variações A/B: produza 3 headlines distintas em ângulo (dor / desejo / curiosidade), não em sinônimos. " +
    "Use depoimentos reais se houver no contexto — NUNCA invente. Para preço, garantia e datas, marque decisionOnly como vazio se não houver fonte. " +
    "FAQ: gere as 5 objeções mais prováveis pra esse público com resposta curta + prova.",
};

const CONTEUDO: NodeBlueprint = {
  kind: "conteudo",
  purpose: "Peça de conteúdo dentro de um calendário editorial — pauta, ângulo, draft, distribuição e métrica.",
  methodChecklist: [
    { id: "calendar",  label: "Posicionado no calendário editorial",required: true },
    { id: "angle",     label: "Ângulo único definido",              required: true },
    { id: "outline",   label: "Outline aprovado",                   required: true },
    { id: "draft",     label: "Rascunho escrito",                   required: true },
    { id: "review",    label: "Revisão de tom + ortografia",        required: true },
    { id: "assets",    label: "Assets visuais entregues",           required: true },
    { id: "approval",  label: "Aprovação do cliente registrada",    required: true },
    { id: "schedule",  label: "Agendado/publicado",                 required: false },
    { id: "measure",   label: "Métrica medida em D+7",              required: false },
  ],
  sections: [
    {
      id: "editorial", title: "Calendário editorial",
      description: "Onde essa peça vive dentro do plano do mês.",
      fields: [
        { id: "campaign",     label: "Campanha / pilar de conteúdo", type: "text", hint: "Ex: 'Lançamento Curso Q2' / 'Pilar Educação'" },
        { id: "pillar",       label: "Pilar editorial",          type: "text",  hint: "Educar / Inspirar / Converter / Bastidores / Autoridade" },
        { id: "funnel_stage", label: "Etapa do funil",           type: "text",  hint: "ToFu / MoFu / BoFu" },
        { id: "publish_at",   label: "Data e hora de publicação", type: "text", decisionOnly: true },
        { id: "frequency_ctx",label: "Cadência do canal nesse mês", type: "text", hint: "Ex: 3x/semana, terça/quinta/sábado" },
        { id: "owner",        label: "Responsável (criador)",     type: "text", decisionOnly: true },
        { id: "approver",     label: "Aprovador final",           type: "text", decisionOnly: true },
      ],
    },
    {
      id: "brief", title: "Pauta",
      fields: [
        { id: "format",   label: "Formato",        type: "text", hint: "Reels, carrossel, post estático, artigo, vídeo, podcast, e-mail, thread" },
        { id: "channel",  label: "Canal",          type: "text" },
        { id: "angle",    label: "Ângulo único",   type: "text", hint: "1 frase do que torna esse conteúdo único" },
        { id: "promise",  label: "Promessa pro leitor",   type: "text",  hint: "O que ele leva embora em 1 frase" },
        { id: "audience", label: "Quem deve ler",  type: "textarea" },
        { id: "keywords", label: "Keywords / hashtags-alvo", type: "list" },
        { id: "references", label: "Referências de inspiração", type: "list" },
      ],
    },
    {
      id: "outline", title: "Outline e estrutura",
      fields: [
        { id: "hook",      label: "Gancho (primeiras 3 linhas / 3s)", type: "textarea", hint: "Quebra padrão, pergunta, dado chocante" },
        { id: "hook_alts", label: "Variações de gancho",        type: "list",     hint: "3 versões pra teste" },
        { id: "structure", label: "Estrutura em tópicos",        type: "list" },
        { id: "cta",       label: "CTA final",                   type: "text" },
        { id: "next_action", label: "Para onde leva (link, perfil, DM)", type: "text" },
      ],
    },
    {
      id: "script", title: "Roteiro / texto",
      description: "Conteúdo pronto pra publicação. Para vídeo: cenas + falas. Para carrossel: slides numerados.",
      fields: [
        { id: "body",          label: "Conteúdo completo",        type: "textarea" },
        { id: "slides",        label: "Slides do carrossel (1 por linha)", type: "list" },
        { id: "scenes",        label: "Cenas / takes (vídeo)",    type: "list", hint: "[Cena 1] Plano + ação + fala" },
        { id: "subtitles",     label: "Legendas / closed captions", type: "textarea" },
        { id: "alt_text",      label: "Alt-text das imagens",     type: "list" },
      ],
    },
    {
      id: "production", title: "Produção e assets",
      fields: [
        { id: "shotlist",   label: "Shot list / takes a gravar",  type: "list" },
        { id: "props",      label: "Props / cenário / locação",   type: "list" },
        { id: "wardrobe",   label: "Figurino / styling",          type: "text" },
        { id: "music",      label: "Trilha / áudio sugerido",     type: "text" },
        { id: "files",      label: "Anexos (mídia, draft, brand)",type: "attachments" },
      ],
    },
    {
      id: "distribution", title: "Distribuição",
      fields: [
        { id: "primary_channel", label: "Canal principal",        type: "text" },
        { id: "repurpose",       label: "Repurpose (mesma peça em outros canais)", type: "list", hint: "Reels → TikTok → Shorts → carrossel LinkedIn" },
        { id: "tags",            label: "Tags / hashtags / mentions", type: "list" },
        { id: "boosting",        label: "Plano de impulsionamento", type: "kv", hint: "budget→R$ ; público→ ; objetivo→" },
        { id: "cross_promo",     label: "Cross-promo (parcerias, stories de apoio)", type: "list" },
      ],
    },
    {
      id: "measurement", title: "Medição e aprendizado",
      fields: [
        { id: "kpi",         label: "KPI principal",                 type: "text", hint: "Saves, alcance, cliques, leads, vendas" },
        { id: "benchmark",   label: "Benchmark do canal",            type: "text", hint: "Média histórica desse formato/canal" },
        { id: "actuals",     label: "Resultado real (D+7)",          type: "kv",   hint: "alcance→ ; eng→ ; cliques→ ; conv→" },
        { id: "learnings",   label: "Aprendizado / hipótese pro próximo", type: "textarea" },
      ],
    },
  ],
  quickActions: [
    { id: "export_pdf", label: "Baixar conteúdo", primary: true },
    { id: "generate_tasks", label: "Gerar tasks de produção" },
    { id: "schedule_meeting", label: "Bloquear gravação/agenda" },
    { id: "link_asset",       label: "Vincular assets" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","siblings","metrics"],
  prefillPrompt:
    "Você é editor-chefe + roteirista de conteúdo digital. " +
    "Posicione a peça no calendário (pilar + etapa de funil) com base nos pilares do briefing. " +
    "Gancho na 1ª linha/3s — quebra de padrão, pergunta provocadora ou dado contra-intuitivo. " +
    "Sempre proponha 3 variações de gancho com ângulos diferentes (dor / curiosidade / desejo). " +
    "Se for carrossel, escreva slide a slide (capa + 5-8 conteúdos + CTA). " +
    "Se for vídeo, divida em cenas com (plano + ação + fala). " +
    "CTA específico, não 'comente aí'. Repurpose: sugira 2-3 adaptações pra outros canais. " +
    "Para data, owner, approver e budget — origin='empty' (decisão humana). " +
    "Use métricas históricas se houver no contexto pra propor benchmark realista.",
};

const ASSET: NodeBlueprint = {
  kind: "asset",
  purpose: "Asset entregue (logo, peça, template) — versionado e catalogado.",
  methodChecklist: [
    { id: "spec",      label: "Spec técnica registrada",            required: true },
    { id: "versions",  label: "Versões (claro/escuro/etc.) prontas",required: true },
    { id: "approval",  label: "Aprovado pelo cliente",              required: true },
    { id: "filed",     label: "Arquivado no repo correto",          required: true },
  ],
  sections: [
    {
      id: "identity", title: "Identificação",
      fields: [
        { id: "name",     label: "Nome do asset",        type: "text" },
        { id: "type",     label: "Tipo",                  type: "text", hint: "Logo, banner, template, etc." },
        { id: "purpose",  label: "Onde será usado",       type: "text" },
      ],
    },
    {
      id: "specs", title: "Specs técnicas",
      fields: [
        { id: "formats",   label: "Formatos entregues",   type: "list", hint: "PNG, SVG, PDF..." },
        { id: "sizes",     label: "Tamanhos / variações", type: "list" },
        { id: "colors",    label: "Paleta usada",         type: "kv" },
        { id: "fonts",     label: "Tipografias",          type: "kv" },
      ],
    },
    {
      id: "usage", title: "Regras de uso",
      fields: [
        { id: "do",     label: "Pode",  type: "list" },
        { id: "dont",   label: "Não pode", type: "list" },
      ],
    },
  ],
  quickActions: [
    { id: "link_asset",        label: "Vincular versão", primary: true },
    { id: "approve",           label: "Aprovar"                       },
    { id: "regenerate_prefill",label: "Regenerar com IA"              },
  ],
  sources: ["briefing","client","assets"],
  prefillPrompt:
    "Você é diretor de arte documentando assets. Specs precisas, regras de uso claras. " +
    "Não invente cores/fontes — pegue do design system ou marque como 'a definir'.",
};

const LANCAMENTO: NodeBlueprint = {
  kind: "lancamento",
  purpose: "Go-live coordenado — checklist + comunicação + monitoramento.",
  methodChecklist: [
    { id: "prelaunch", label: "Checklist pré-launch 100%",       required: true },
    { id: "comms",     label: "Comunicação preparada",           required: true },
    { id: "rollback",  label: "Plano de rollback documentado",   required: true },
    { id: "monitor",   label: "Monitoramento ativo nas 1ªs 24h", required: true },
    { id: "retro",     label: "Retro feita em até 7 dias",       required: false },
  ],
  sections: [
    {
      id: "scope", title: "O que está lançando",
      fields: [
        { id: "what",       label: "Resumo do que vai ao ar",  type: "textarea" },
        { id: "audience",   label: "Quem vai ver/usar",         type: "text" },
        { id: "date",       label: "Data e horário do go-live", type: "text", decisionOnly: true },
      ],
    },
    {
      id: "prelaunch", title: "Checklist pré-launch",
      fields: [
        { id: "items", label: "Itens obrigatórios", type: "checklist", hint: "Tracking, backup, redirects, copy, visual..." },
      ],
    },
    {
      id: "comms", title: "Plano de comunicação",
      fields: [
        { id: "channels", label: "Canais a anunciar",   type: "list" },
        { id: "messages", label: "Mensagens por canal", type: "kv", hint: "canal → texto" },
        { id: "owner",    label: "Quem dispara cada um", type: "kv", decisionOnly: true },
      ],
    },
    {
      id: "rollback", title: "Plano B",
      fields: [
        { id: "triggers", label: "Quando reverter (gatilhos)", type: "list" },
        { id: "steps",    label: "Passos do rollback",         type: "list" },
      ],
    },
    {
      id: "monitor", title: "Monitoramento",
      fields: [
        { id: "metrics",   label: "Métricas a acompanhar",  type: "list" },
        { id: "thresholds",label: "Thresholds de alerta",   type: "kv", hint: "métrica → limite" },
      ],
    },
  ],
  quickActions: [
    { id: "go_live",        label: "Iniciar go-live", primary: true },
    { id: "generate_tasks", label: "Gerar tasks de pré-launch" },
    { id: "create_snapshot",label: "Snapshot pós-launch" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","siblings","metrics"],
  prefillPrompt:
    "Você é PM rodando launch. Checklist pré-launch deve cobrir: tracking, backup, redirects, " +
    "copy revisada, visual aprovado, comunicação, monitoramento. " +
    "Nunca invente data — marque como decisão humana.",
};

const CAMPANHA: NodeBlueprint = {
  kind: "trafego",
  purpose: "Campanha de tráfego paga — público, criativo, oferta, mensuração.",
  methodChecklist: [
    { id: "audience", label: "Públicos definidos",            required: true },
    { id: "creative", label: "Criativos aprovados",           required: true },
    { id: "tracking", label: "Eventos de conversão validados", required: true },
    { id: "budget",   label: "Budget alocado",                required: true },
    { id: "review",   label: "Review semanal agendada",       required: true },
  ],
  sections: [
    {
      id: "objective", title: "Objetivo da campanha",
      fields: [
        { id: "goal",        label: "Objetivo (lead/venda/awareness)", type: "text" },
        { id: "kpi",         label: "KPI principal + meta",            type: "text", hint: "CPL <R$X / ROAS >Y" },
        { id: "horizon",     label: "Período da campanha",             type: "text", decisionOnly: true },
      ],
    },
    {
      id: "audiences", title: "Públicos",
      fields: [
        { id: "primary",   label: "Público primário",     type: "textarea" },
        { id: "lookalikes",label: "Lookalikes / similares", type: "list" },
        { id: "exclusions", label: "Exclusões",           type: "list" },
      ],
    },
    {
      id: "creative", title: "Criativo",
      fields: [
        { id: "angles",   label: "Ângulos a testar (3-5)",  type: "list" },
        { id: "formats",  label: "Formatos",                 type: "list", hint: "Static, vídeo, carrossel..." },
        { id: "ctas",     label: "CTAs a testar",            type: "list" },
      ],
    },
    {
      id: "budget", title: "Budget",
      fields: [
        { id: "total",      label: "Budget total",      type: "text", decisionOnly: true },
        { id: "split",      label: "Distribuição por canal/público", type: "kv" },
      ],
    },
    {
      id: "tracking", title: "Mensuração",
      fields: [
        { id: "events",       label: "Eventos rastreados",      type: "list" },
        { id: "attribution",  label: "Modelo de atribuição",    type: "text" },
        { id: "review_cad",   label: "Cadência de otimização",  type: "text" },
      ],
    },
  ],
  quickActions: [
    { id: "create_snapshot", label: "Snapshot inicial", primary: true },
    { id: "generate_tasks",  label: "Gerar tasks de setup" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","siblings","metrics","fronts"],
  prefillPrompt:
    "Você é mídia paga sênior. Use o objetivo do briefing pra escolher KPI. " +
    "Sugira 3-5 ângulos criativos diferentes. Não chute budget — marque como decisão humana.",
};

const METRICA: NodeBlueprint = {
  kind: "metrica",
  purpose: "Acompanhamento contínuo de KPI — baseline, meta, plano de ação.",
  methodChecklist: [
    { id: "kpi",       label: "KPI claro e único",              required: true },
    { id: "baseline",  label: "Baseline registrado",            required: true },
    { id: "target",    label: "Meta 30/60/90 definida",         required: true },
    { id: "review",    label: "Review periódica agendada",      required: true },
  ],
  sections: [
    {
      id: "kpi", title: "KPI",
      fields: [
        { id: "name",     label: "Nome do KPI",   type: "text" },
        { id: "formula",  label: "Como calcular", type: "text" },
        { id: "source",   label: "Fonte do dado", type: "text", hint: "GA4, planilha, CRM..." },
      ],
    },
    {
      id: "baseline", title: "Baseline",
      fields: [
        { id: "value",  label: "Valor atual",        type: "text" },
        { id: "date",   label: "Data da medição",    type: "text" },
        { id: "context",label: "Contexto da medição", type: "textarea" },
      ],
    },
    {
      id: "targets", title: "Metas por horizonte",
      fields: [
        { id: "h30",  label: "30 dias", type: "text" },
        { id: "h60",  label: "60 dias", type: "text" },
        { id: "h90",  label: "90 dias", type: "text" },
      ],
    },
    {
      id: "playbook", title: "Plano de ação por cenário",
      fields: [
        { id: "if_above",  label: "Se acima da meta",  type: "list", hint: "Escalar o que funciona" },
        { id: "if_on",     label: "Se na meta",        type: "list" },
        { id: "if_below",  label: "Se abaixo",         type: "list", hint: "Diagnóstico + ações" },
      ],
    },
  ],
  quickActions: [
    { id: "create_snapshot", label: "Criar snapshot agora", primary: true },
    { id: "create_front",    label: "Vincular front" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["metrics","fronts","siblings","briefing"],
  prefillPrompt:
    "Você é analista de métricas. Use snapshots existentes pra preencher baseline. " +
    "Defina metas realistas a partir do briefing. Crie playbook acionável por cenário.",
};

const KICKOFF: NodeBlueprint = {
  kind: "reuniao",
  purpose: "Reunião de kickoff — alinhamento inicial, papéis, agenda do projeto.",
  methodChecklist: [
    { id: "agenda",      label: "Agenda enviada com 24h",       required: true },
    { id: "participants",label: "Participantes confirmados",    required: true },
    { id: "preread",     label: "Pré-leitura compartilhada",    required: true },
    { id: "recording",   label: "Gravação + transcrição salva", required: false },
    { id: "minutes",     label: "Ata documentada e enviada",    required: true },
    { id: "decisions",   label: "Decisões registradas com dono", required: true },
    { id: "followups",   label: "Follow-ups com dono e prazo",  required: true },
  ],
  sections: [
    {
      id: "meta", title: "Detalhes da reunião",
      fields: [
        { id: "date",     label: "Data e horário",     type: "text", decisionOnly: true },
        { id: "duration", label: "Duração prevista",   type: "text" },
        { id: "channel",  label: "Canal (Meet/Zoom)",  type: "text", decisionOnly: true },
        { id: "link",     label: "Link da call",       type: "text", decisionOnly: true },
        { id: "recording_url", label: "Link da gravação", type: "text", decisionOnly: true },
      ],
    },
    {
      id: "agenda", title: "Agenda",
      fields: [
        { id: "items", label: "Tópicos em ordem (com tempo)", type: "list", hint: "Ex: Apresentações (5min), Briefing (15min)..." },
        { id: "objective", label: "Objetivo único da reunião", type: "text", hint: "1 frase do que precisa sair daqui" },
      ],
    },
    {
      id: "participants", title: "Participantes",
      fields: [
        { id: "client", label: "Time do cliente", type: "list", hint: "Nome — papel" },
        { id: "agency", label: "Time interno",    type: "list" },
        { id: "decision_maker", label: "Quem decide na sala", type: "text", decisionOnly: true },
      ],
    },
    {
      id: "decisions", title: "Decisões esperadas",
      fields: [
        { id: "expected", label: "O que precisa ser decidido nesta reunião", type: "list" },
        { id: "made",     label: "Decisões efetivamente tomadas",            type: "list", hint: "Preencher após a call" },
        { id: "pending",  label: "Decisões que ficaram em aberto",           type: "list" },
      ],
    },
    {
      id: "preread", title: "Pré-leitura",
      fields: [
        { id: "docs", label: "Documentos a ler antes", type: "list" },
        { id: "files", label: "Anexos enviados ao cliente", type: "attachments" },
      ],
    },
    {
      id: "minutes", title: "Ata da reunião",
      description: "Resumo executivo do que foi conversado — base pra próximos passos.",
      fields: [
        { id: "summary",       label: "Resumo executivo (3-5 linhas)", type: "textarea" },
        { id: "highlights",    label: "Pontos-chave discutidos",       type: "list" },
        { id: "blockers",      label: "Bloqueios identificados",       type: "list" },
        { id: "transcript_ref",label: "Link/referência da transcrição", type: "text", decisionOnly: true },
      ],
    },
    {
      id: "followups", title: "Pós-reunião",
      fields: [
        { id: "actions", label: "Ações com dono + prazo", type: "list" },
        { id: "next_meeting", label: "Próxima reunião agendada", type: "text", decisionOnly: true },
      ],
    },
  ],
  quickActions: [
    { id: "schedule_meeting", label: "Exportar .ics",     primary: true },
    { id: "generate_tasks",   label: "Tasks de follow-up", primary: true },
    { id: "open_briefing",    label: "Ver briefing"                    },
    { id: "export_pdf",       label: "Baixar ata"                      },
    { id: "regenerate_prefill",label: "Regenerar com IA"               },
  ],
  sources: ["briefing","client","siblings"],
  prefillPrompt:
    "Você é chief of staff montando kickoff. Agenda com tempos concretos por bloco. " +
    "Se houver transcrição/contexto da reunião, extraia decisões tomadas vs pendentes — não confunda. " +
    "Resumo executivo deve responder: o que foi decidido, quem está fazendo o quê, qual o próximo marco. " +
    "Pré-leitura curta e relevante. Decisões esperadas explícitas. Não invente data — decisão humana.",
};

const IDEIA: NodeBlueprint = {
  kind: "ideia",
  purpose: "Hipótese ou ideia em estado bruto — formaliza, prioriza e define teste mínimo.",
  methodChecklist: [
    { id: "frame",       label: "Hipótese escrita no formato 'se X, então Y, porque Z'", required: true },
    { id: "evidence",    label: "Evidências a favor e contra listadas",                  required: true },
    { id: "score",       label: "Pontuada (impacto × confiança × esforço)",              required: true },
    { id: "test",        label: "Teste mínimo definido (custo + critério)",              required: true },
    { id: "decision",    label: "Decisão tomada: validar / matar / arquivar",            required: true },
  ],
  sections: [
    {
      id: "hypothesis", title: "Hipótese",
      description: "Formato: 'Se [mudança], então [efeito esperado], porque [mecanismo].'",
      fields: [
        { id: "statement",  label: "Hipótese (1 frase)",     type: "textarea", hint: "Se X, então Y, porque Z" },
        { id: "origin",     label: "De onde veio essa ideia", type: "text",    hint: "Briefing, conversa, dado, intuição..." },
        { id: "category",   label: "Categoria",              type: "text",    hint: "Aquisição, ativação, retenção, receita, referência" },
      ],
    },
    {
      id: "evidence", title: "Evidências",
      description: "O que sustenta ou contradiz a hipótese hoje.",
      fields: [
        { id: "for",      label: "A favor",     type: "list", hint: "Dados, falas de cliente, benchmark" },
        { id: "against",  label: "Contra",       type: "list" },
        { id: "missing",  label: "O que falta saber", type: "list", hint: "Perguntas em aberto" },
      ],
    },
    {
      id: "scoring", title: "Pontuação ICE",
      description: "Impacto × Confiança × Esforço (1-10 cada). Use pra priorizar.",
      fields: [
        { id: "impact",     label: "Impacto (1-10)",     type: "text", hint: "Quanto move o ponteiro se der certo" },
        { id: "confidence", label: "Confiança (1-10)",   type: "text", hint: "Quão certo de que vai funcionar" },
        { id: "effort",     label: "Esforço (1-10)",     type: "text", hint: "10 = fácil; 1 = muito difícil" },
        { id: "score",      label: "Score final (I × C × E / 100)", type: "text", decisionOnly: true },
      ],
    },
    {
      id: "test", title: "Teste mínimo",
      description: "Como validar barato antes de investir pesado.",
      fields: [
        { id: "design",    label: "Como testar",           type: "textarea", hint: "Experimento, MVP, fake door, smoke test..." },
        { id: "metric",    label: "Métrica de sucesso",    type: "text",     hint: "Ex: ≥ 5% conversão em 100 visitas" },
        { id: "duration",  label: "Duração do teste",      type: "text" },
        { id: "cost",      label: "Custo estimado",        type: "text", decisionOnly: true },
      ],
    },
    {
      id: "risks", title: "Riscos e suposições",
      fields: [
        { id: "assumptions", label: "Suposições críticas",   type: "list", hint: "Se falsa, a ideia cai" },
        { id: "risks",       label: "Riscos do teste em si", type: "list", hint: "Reputação, custo, tempo do time" },
      ],
    },
    {
      id: "decision", title: "Decisão",
      description: "Sair daqui com uma decisão clara — não deixar limbo.",
      fields: [
        { id: "verdict",   label: "Veredito",        type: "text",     decisionOnly: true, hint: "validar / matar / arquivar / pivotar" },
        { id: "rationale", label: "Justificativa",   type: "textarea" },
        { id: "owner",     label: "Dono do próximo passo", type: "text", decisionOnly: true },
      ],
    },
    {
      id: "supporting", title: "Materiais de apoio",
      fields: [
        { id: "files", label: "Referências, prints, planilhas", type: "attachments" },
      ],
    },
  ],
  quickActions: [
    { id: "generate_tasks",     label: "Gerar tasks do teste", primary: true },
    { id: "approve",            label: "Marcar decisão"                       },
    { id: "export_pdf",         label: "Baixar PDF"                           },
    { id: "regenerate_prefill", label: "Sugerir com IA"                       },
  ],
  sources: ["briefing","context","siblings"],
  prefillPrompt:
    "Você é product manager experiente avaliando ideias. Reescreva a ideia no formato " +
    "'Se X, então Y, porque Z' — mecanismo causal explícito. " +
    "Use o briefing e contexto pra listar 3-5 evidências reais a favor/contra (sem inventar). " +
    "Em ICE, sugira números 1-10 com justificativa curta no citation. " +
    "Em 'test', proponha o experimento MAIS BARATO que decide a hipótese. " +
    "Para 'verdict' e 'cost', use origin=empty — são decisões humanas.",
};

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

const CHECKLIST: NodeBlueprint = {
  kind: "checklist",
  purpose: "Checklist enterprise de governança e operação — RACI, processos, qualidade, segurança e prontidão.",
  methodChecklist: [
    { id: "scope_def",     label: "Escopo do checklist definido (operação X)",     required: true  },
    { id: "raci_clear",    label: "RACI preenchido para itens críticos",           required: true  },
    { id: "owner_each",    label: "Cada item tem responsável (R) único",           required: true  },
    { id: "deadline_each", label: "Prazo definido por item",                       required: true  },
    { id: "evidence",      label: "Critério de aceite + evidência por item",       required: true  },
    { id: "review_cad",    label: "Cadência de revisão acordada",                  required: true  },
    { id: "approval",      label: "Approver (A) confirmado",                       required: true  },
    { id: "archive",       label: "Versão final arquivada no repositório certo",   required: false },
  ],
  sections: [
    {
      id: "scope", title: "Escopo e contexto",
      description: "Pra que esse checklist existe e quando ele é aplicado.",
      fields: [
        { id: "purpose",     label: "Objetivo do checklist",       type: "textarea", hint: "Ex: Garantir prontidão pré-launch / Onboarding de cliente / Setup de tracking" },
        { id: "trigger",     label: "Quando é executado",          type: "text",     hint: "Sempre antes de X / Mensalmente / Por projeto" },
        { id: "scope_in",    label: "Está no escopo",              type: "list" },
        { id: "scope_out",   label: "Fora do escopo",              type: "list",     hint: "O que esse checklist NÃO cobre" },
        { id: "version",     label: "Versão",                      type: "text",     decisionOnly: true },
      ],
    },
    {
      id: "raci", title: "RACI — papéis por item",
      description: "Responsible (faz), Accountable (responde), Consulted (opina), Informed (sabe). Um único A por item.",
      fields: [
        { id: "responsible", label: "R — Quem executa (por área/pessoa)", type: "kv", hint: "item ou área → executor" },
        { id: "accountable", label: "A — Quem responde pelo resultado",   type: "kv", hint: "item → 1 nome (único)" },
        { id: "consulted",   label: "C — Consultados antes de decidir",   type: "kv", hint: "item → especialistas/áreas" },
        { id: "informed",    label: "I — Informados após executar",       type: "kv", hint: "item → stakeholders" },
      ],
    },
    {
      id: "governance", title: "Governança e processos",
      description: "Como esse checklist é gerido, revisado e auditado.",
      fields: [
        { id: "owner_doc",     label: "Dono do documento",                type: "text", decisionOnly: true },
        { id: "review_cycle",  label: "Ciclo de revisão",                 type: "text", hint: "Mensal / trimestral / por release" },
        { id: "approvers",     label: "Aprovadores oficiais",             type: "list", decisionOnly: true },
        { id: "escalation",    label: "Caminho de escalação",             type: "list", hint: "Se item bloqueia → escalar pra X em até Y horas" },
        { id: "decision_log",  label: "Onde registrar decisões",          type: "text", hint: "Notion, planilha, este node..." },
      ],
    },
    {
      id: "quality", title: "Qualidade e critérios de aceite",
      description: "Definition of Done por item — sem isso checklist vira teatro.",
      fields: [
        { id: "dod",          label: "Definition of Done global",          type: "list",  hint: "Critérios mínimos pra fechar checklist" },
        { id: "evidence",     label: "Evidência exigida por item",         type: "kv",    hint: "item → screenshot / link / aprovação" },
        { id: "qa_owner",     label: "QA / dupla checagem por",            type: "text",  decisionOnly: true },
        { id: "metrics",      label: "Métricas de qualidade do processo", type: "kv",    hint: "métrica → meta (ex: rework <5%)" },
      ],
    },
    {
      id: "security", title: "Segurança, dados e compliance",
      fields: [
        { id: "data_handled", label: "Dados manipulados",         type: "list",  hint: "PII, financeiro, saúde, etc." },
        { id: "access_ctrl",  label: "Controle de acesso",        type: "list",  hint: "Quem pode ler/editar/aprovar" },
        { id: "compliance",   label: "Compliance aplicável",      type: "list",  hint: "LGPD, SOC2, ISO, etc." },
        { id: "secrets",      label: "Onde ficam credenciais",    type: "text",  hint: "Vault, 1Password, etc." },
        { id: "audit_trail",  label: "Trilha de auditoria",       type: "text",  hint: "Onde fica o log do que foi feito" },
      ],
    },
    {
      id: "items", title: "Itens do checklist",
      description: "Lista executável — cada item granular, verificável e com dono.",
      fields: [
        { id: "preflight",    label: "Pré-requisitos (antes de começar)", type: "checklist" },
        { id: "core",         label: "Itens centrais (execução)",         type: "checklist" },
        { id: "validation",   label: "Validação / testes",                type: "checklist" },
        { id: "signoff",      label: "Aprovações finais",                 type: "checklist", hint: "Sign-off de cliente, jurídico, etc." },
      ],
    },
    {
      id: "risks", title: "Riscos e plano B",
      fields: [
        { id: "blockers",  label: "Bloqueios conhecidos",         type: "list", hint: "O que costuma travar este checklist" },
        { id: "mitigation",label: "Plano B por bloqueio",         type: "kv",   hint: "bloqueio → ação" },
        { id: "rollback",  label: "Rollback se algo falhar",      type: "list" },
      ],
    },
    {
      id: "references", title: "Referências e anexos",
      fields: [
        { id: "docs",   label: "Documentos relacionados", type: "list",        hint: "Políticas, SOPs, contratos relevantes" },
        { id: "files",  label: "Anexos (PDF, planilhas)", type: "attachments" },
      ],
    },
    {
      id: "review", title: "Histórico de execução",
      fields: [
        { id: "last_run",   label: "Última execução",     type: "text", hint: "Data + responsável + resultado" },
        { id: "lessons",    label: "Lições aprendidas",   type: "list", hint: "Pra evoluir o checklist no próximo ciclo" },
        { id: "changes",    label: "Mudanças aplicadas",  type: "list", hint: "Versão anterior → mudou X porque Y" },
      ],
    },
  ],
  quickActions: [
    { id: "generate_tasks",     label: "Gerar tasks dos itens", primary: true },
    { id: "export_pdf",         label: "Baixar checklist",      primary: true },
    { id: "approve",            label: "Marcar concluído"                      },
    { id: "regenerate_prefill", label: "Regenerar com IA"                      },
  ],
  sources: ["briefing","context","client","siblings"],
  prefillPrompt:
    "Você é PMO sênior montando checklist enterprise de governança. " +
    "Use o briefing, o tipo de operação e o segmento do cliente pra calibrar quais itens entram. " +
    "Cada item deve ser verificável (não 'fazer bem feito' — sim 'pixel disparou evento PageView'). " +
    "RACI: cada linha com 1 R + 1 A único. C/I podem ter múltiplos. Se o cliente é regulado (saúde, " +
    "financeiro, educação), inclua compliance específico. Em 'items', seja granular: preflight (5-10), " +
    "core (10-20), validation (5-10), signoff (3-5). Não invente nomes de pessoas — use papéis (PM, " +
    "Tech Lead, Cliente, Jurídico). Decisões humanas: dono, aprovadores, versão.",
};

const CONTATO: NodeBlueprint = {
  kind: "contato",
  purpose: "Stakeholder mapeado — papel, poder de decisão, canal preferido e ritual de comunicação.",
  methodChecklist: [
    { id: "identity",     label: "Identidade completa registrada",                required: true },
    { id: "role_clear",   label: "Papel no projeto explícito (RACI)",             required: true },
    { id: "decision",     label: "Poder de decisão classificado",                 required: true },
    { id: "channel_pref", label: "Canal preferido + horário acordado",            required: true },
    { id: "cadence",      label: "Cadência de comunicação definida",              required: true },
    { id: "context_in",   label: "Contexto pessoal/profissional capturado",       required: false },
    { id: "consent",      label: "LGPD: consentimento de dados registrado",       required: true },
  ],
  sections: [
    {
      id: "identity", title: "Identidade",
      fields: [
        { id: "full_name",   label: "Nome completo",          type: "text" },
        { id: "preferred",   label: "Como prefere ser chamado(a)", type: "text" },
        { id: "company",     label: "Empresa",                type: "text" },
        { id: "title",       label: "Cargo / função formal",  type: "text" },
        { id: "department",  label: "Departamento / time",    type: "text" },
        { id: "location",    label: "Localização / fuso",     type: "text", hint: "Cidade + UTC" },
        { id: "languages",   label: "Idiomas",                type: "list" },
      ],
    },
    {
      id: "role", title: "Papel no projeto (RACI)",
      description: "Como esse stakeholder se posiciona em relação às entregas.",
      fields: [
        { id: "raci",        label: "Tipo (R / A / C / I)",   type: "text",  hint: "R=executa  A=aprova  C=consultado  I=informado" },
        { id: "scope",       label: "Sobre o que decide / opina", type: "list", hint: "Áreas de influência específicas" },
        { id: "authority",   label: "Nível de autoridade",    type: "text",  hint: "Decisor final / co-decisor / influenciador / executor" },
        { id: "budget_power",label: "Poder orçamentário",     type: "text",  decisionOnly: true, hint: "Aprova / sugere / sem alçada" },
        { id: "champion",    label: "Champion ou cético?",    type: "text",  hint: "Aliado, neutro, resistente — direciona abordagem" },
      ],
    },
    {
      id: "channels", title: "Canais e disponibilidade",
      description: "Como falar — e quando NÃO falar.",
      fields: [
        { id: "email",       label: "E-mail",                 type: "text", decisionOnly: true },
        { id: "phone",       label: "Telefone / WhatsApp",    type: "text", decisionOnly: true },
        { id: "linkedin",    label: "LinkedIn",               type: "text", decisionOnly: true },
        { id: "preferred",   label: "Canal preferido",        type: "text", hint: "WhatsApp / Slack / e-mail / call agendada" },
        { id: "hours",       label: "Horário ideal de contato", type: "text", hint: "Ex: dias úteis 9h–18h" },
        { id: "do_not",      label: "Não fazer",              type: "list", hint: "Não ligar fim de semana / não usar emoji / etc." },
        { id: "response_sla",label: "SLA típico de resposta", type: "text", hint: "Horas / dias úteis" },
      ],
    },
    {
      id: "communication", title: "Ritual de comunicação",
      description: "Cadência acordada — evita ruído e mantém alinhamento.",
      fields: [
        { id: "cadence",     label: "Frequência de updates",  type: "text", hint: "Diário / semanal / quinzenal" },
        { id: "format",      label: "Formato dos updates",    type: "text", hint: "Email semanal / call de 30min / dashboard" },
        { id: "reports_to",  label: "A quem reporta dentro do projeto", type: "text" },
        { id: "escalation",  label: "Escalação (acima dele/dela)", type: "text", hint: "Se trava aqui, falar com X" },
        { id: "delegates",   label: "Pode delegar para",      type: "list", hint: "Outros nomes que respondem por ele" },
      ],
    },
    {
      id: "context", title: "Contexto pessoal e profissional",
      description: "Detalhes que ajudam a construir relacionamento — sem invadir.",
      fields: [
        { id: "background",  label: "Background profissional", type: "textarea", hint: "Trajetória, empresas anteriores, especialidades" },
        { id: "motivations", label: "Motivações / o que o(a) move", type: "list", hint: "Crescer carreira, KPI específico, reconhecimento, etc." },
        { id: "pains",       label: "Dores ou pressões atuais", type: "list",   hint: "O que tira o sono — ajuda a posicionar a oferta" },
        { id: "wins",        label: "Vitórias recentes",       type: "list",    hint: "Pra reconhecer e construir rapport" },
        { id: "interests",   label: "Interesses pessoais",     type: "list",    hint: "Hobbies, tópicos preferidos — small talk de qualidade" },
      ],
    },
    {
      id: "history", title: "Histórico de interações",
      fields: [
        { id: "first_contact", label: "Primeiro contato",     type: "text", hint: "Quando, como, contexto" },
        { id: "key_moments",   label: "Marcos de relacionamento", type: "list", hint: "Reuniões importantes, decisões marcantes" },
        { id: "objections",    label: "Objeções recorrentes", type: "list" },
        { id: "wins_together", label: "Vitórias conjuntas",   type: "list" },
      ],
    },
    {
      id: "compliance", title: "LGPD e consentimento",
      description: "Base legal e consentimento explícito pra contato.",
      fields: [
        { id: "legal_basis", label: "Base legal de tratamento", type: "text",     hint: "Execução de contrato / consentimento / interesse legítimo" },
        { id: "consent",     label: "Consentimento de contato registrado",  type: "text", decisionOnly: true, hint: "Onde / quando / como" },
        { id: "purposes",    label: "Finalidades autorizadas",              type: "list" },
        { id: "retention",   label: "Política de retenção",                 type: "text" },
        { id: "opt_out",     label: "Como solicitar opt-out",               type: "text" },
      ],
    },
    {
      id: "next", title: "Próximo passo",
      fields: [
        { id: "action",     label: "Próxima ação com este contato", type: "text",  decisionOnly: true },
        { id: "owner",      label: "Dono da próxima ação",          type: "text",  decisionOnly: true },
        { id: "deadline",   label: "Quando",                        type: "text",  decisionOnly: true },
      ],
    },
  ],
  quickActions: [
    { id: "schedule_meeting",   label: "Agendar reunião",    primary: true },
    { id: "generate_tasks",     label: "Gerar follow-ups",    primary: true },
    { id: "export_pdf",         label: "Baixar perfil"                       },
    { id: "regenerate_prefill", label: "Sugerir com IA"                      },
  ],
  sources: ["briefing","context","client","siblings"],
  prefillPrompt:
    "Você é chief of staff montando perfil de stakeholder. " +
    "Use briefing + context_entries pra preencher: papel real, autoridade, canal preferido. " +
    "Em RACI, escolha 1 letra principal — se for misto, coloque a dominante e explique no citation. " +
    "Em 'context.motivations' e 'context.pains', SÓ liste se houver evidência no contexto — nunca chute traços de personalidade. " +
    "Para LGPD: se não houver registro de consentimento explícito, marque base legal como 'a confirmar' " +
    "e consent como vazio — decisão humana. Não invente e-mail, telefone ou LinkedIn. " +
    "Tom: profissional, objetivo, sem julgamento ('cético' ≠ 'difícil').",
};

/**
 * NOTA: alguns kinds compartilham o mesmo blueprint base (ex: documento e diagnostico
 * são ambos `documento` no enum atual — diferenciamos via título do node).
 * Quando precisar separar de verdade, adicione novo kind no enum.
 */
export const NODE_BLUEPRINTS: NodeBlueprint[] = [
  BRIEFING,
  IDEIA,
  DIAGNOSTICO, // shares kind 'documento' — registry resolve por ordem
  OBJETIVO,
  DOCUMENTO,
  SITE,
  LANDING,
  CONTEUDO,
  ASSET,
  LANCAMENTO,
  CAMPANHA,
  METRICA,
  KICKOFF, // shares kind 'reuniao'
  CHECKLIST,
  CONTATO,
];

/**
 * Retorna o primeiro blueprint que casa com o kind. Para tipos com múltiplos
 * blueprints (documento/diagnostico, reuniao/kickoff), o caller pode passar
 * um `discriminator` baseado no título ou metadata pra escolher o certo.
 */
export function getNodeBlueprint(
  kind: ProjectNodeKind,
  discriminator?: { title?: string; stage?: string },
): NodeBlueprint | null {
  // Discriminadores especiais — diagnostico vs documento, kickoff vs reuniao
  if (kind === "documento" && discriminator?.title) {
    const t = discriminator.title.toLowerCase();
    if (t.includes("diagn")) return DIAGNOSTICO;
  }
  if (kind === "reuniao" && discriminator?.title) {
    const t = discriminator.title.toLowerCase();
    if (t.includes("kickoff") || t.includes("kick-off") || t.includes("kick off")) return KICKOFF;
  }
  return NODE_BLUEPRINTS.find((b) => b.kind === kind) ?? null;
}

export function hasBlueprint(kind: ProjectNodeKind): boolean {
  return NODE_BLUEPRINTS.some((b) => b.kind === kind);
}
