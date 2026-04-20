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
  | "siblings";  // outros canvas_nodes da mesma esteira já preenchidos

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
    { id: "score_gaps",    label: "Pontuar gaps por impacto/esforço",      required: true  },
    { id: "benchmark",     label: "Benchmark com 3 concorrentes",          required: false },
    { id: "share_diag",    label: "Compartilhar diagnóstico com o cliente", required: true },
  ],
  sections: [
    {
      id: "current_state", title: "Estado atual",
      description: "O que existe hoje — site, redes, processos, métricas.",
      fields: [
        { id: "channels",   label: "Canais ativos",        type: "list",     hint: "Site, IG, LinkedIn, etc." },
        { id: "stack",      label: "Stack/ferramentas",    type: "list" },
        { id: "metrics_now",label: "Métricas atuais",      type: "kv",       hint: "Tráfego, conversão, CAC" },
      ],
    },
    {
      id: "gaps", title: "Gaps identificados",
      description: "O que está faltando ou mal feito.",
      fields: [
        { id: "critical",   label: "Críticos (resolver já)",   type: "list" },
        { id: "important",  label: "Importantes (30 dias)",    type: "list" },
        { id: "nice",       label: "Desejáveis (depois)",      type: "list" },
      ],
    },
    {
      id: "benchmark", title: "Benchmark competitivo",
      fields: [
        { id: "competitors", label: "Concorrentes analisados", type: "list" },
        { id: "advantages",  label: "Vantagens deles",         type: "list" },
        { id: "openings",    label: "Aberturas pra atacar",    type: "list" },
      ],
    },
    {
      id: "recommendation", title: "Recomendação",
      fields: [
        { id: "summary",  label: "Síntese executiva",  type: "textarea", hint: "3-5 frases que justificam o projeto" },
        { id: "priorities", label: "Prioridades",      type: "list" },
      ],
    },
  ],
  quickActions: [
    { id: "export_pdf",        label: "Baixar diagnóstico", primary: true },
    { id: "generate_tasks",    label: "Gerar tasks de remediação", primary: true },
    { id: "regenerate_prefill",label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","metrics","client"],
  prefillPrompt:
    "Você é consultor sênior fazendo diagnóstico estrutural. Pontue gaps com critério: " +
    "crítico = bloqueia o objetivo; importante = atrasa; desejável = melhoraria. " +
    "Para benchmark, se não houver dados de concorrentes, deixe vazio — não invente.",
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
  purpose: "Site institucional/produto — arquitetura, copy, SEO e go-live.",
  methodChecklist: [
    { id: "arch",     label: "Arquitetura de páginas aprovada",     required: true  },
    { id: "copy",     label: "Copy validado por página",            required: true  },
    { id: "seo",      label: "SEO técnico (meta, OG, schema)",      required: true  },
    { id: "visual",   label: "Visual aprovado vs design system",    required: true  },
    { id: "tracking", label: "Tracking instalado e validado",       required: true  },
    { id: "live",     label: "Domínio + SSL + indexação",           required: true  },
  ],
  sections: [
    {
      id: "architecture", title: "Arquitetura de páginas",
      fields: [
        { id: "pages",   label: "Páginas planejadas",  type: "list", hint: "Home, Sobre, Serviços, Contato..." },
        { id: "menu",    label: "Estrutura do menu",   type: "list" },
        { id: "footer",  label: "Itens do rodapé",     type: "list" },
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
      ],
    },
    {
      id: "seo", title: "SEO técnico",
      fields: [
        { id: "meta_title",       label: "Meta title da Home",       type: "text",  hint: "<60 caracteres" },
        { id: "meta_description", label: "Meta description",         type: "text",  hint: "<160 caracteres" },
        { id: "keywords",         label: "Keywords-alvo",            type: "list" },
        { id: "schema_type",      label: "Schema.org principal",     type: "text",  hint: "Organization / LocalBusiness / Product" },
      ],
    },
    {
      id: "visual", title: "Specs visuais",
      fields: [
        { id: "palette",   label: "Paleta (do design system)",  type: "kv" },
        { id: "fonts",     label: "Tipografia",                 type: "kv", hint: "headings → ; body →" },
        { id: "imagery",   label: "Direção de imagem",          type: "textarea" },
      ],
    },
    {
      id: "launch", title: "Go-live",
      fields: [
        { id: "domain",       label: "Domínio final",     type: "text",     decisionOnly: true },
        { id: "tracking_ids", label: "IDs de tracking",   type: "kv",       hint: "GA4, Meta Pixel, GTM..." },
        { id: "redirects",    label: "Redirects 301 necessários", type: "list" },
      ],
    },
  ],
  quickActions: [
    { id: "generate_tasks", label: "Gerar tasks de produção", primary: true },
    { id: "go_live",        label: "Checklist pré-launch",    primary: true },
    { id: "link_asset",     label: "Vincular assets" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","client","assets","siblings"],
  prefillPrompt:
    "Você é diretor de criação + estrategista de SEO. Copy curta, benefício antes de feature, " +
    "CTA verbal e direto. Meta title até 60 caracteres com keyword. Meta description até 160. " +
    "Use os objetivos e personas do briefing pra calibrar tom. Não invente domínio nem tracking IDs.",
};

const LANDING: NodeBlueprint = {
  kind: "landing_page",
  purpose: "Landing focada em 1 conversão única — sem distrações.",
  methodChecklist: [
    { id: "single_goal",  label: "1 objetivo único definido",       required: true },
    { id: "above_fold",   label: "Promessa+CTA acima da dobra",     required: true },
    { id: "proof",        label: "Prova social posicionada",        required: true },
    { id: "objections",   label: "Objeções respondidas",            required: true },
    { id: "tracking",     label: "Eventos de conversão tracked",    required: true },
  ],
  sections: [
    {
      id: "goal", title: "Objetivo único",
      fields: [
        { id: "conversion", label: "Conversão alvo",       type: "text", hint: "Ex: agendar demo / baixar e-book" },
        { id: "audience",   label: "Quem é o visitante",   type: "textarea" },
        { id: "source",     label: "De onde vem o tráfego", type: "text" },
      ],
    },
    {
      id: "above_fold", title: "Acima da dobra",
      fields: [
        { id: "headline",    label: "Headline (promessa)",    type: "text",  hint: "Específica, mensurável, urgente" },
        { id: "subheadline", label: "Subheadline (clareza)",  type: "text" },
        { id: "cta_primary", label: "CTA principal",          type: "text",  hint: "Verbo + benefício" },
        { id: "hero_visual", label: "Visual hero",            type: "text",  hint: "Mockup / vídeo / ilustração" },
      ],
    },
    {
      id: "body", title: "Corpo da página (em blocos)",
      fields: [
        { id: "blocks", label: "Blocos em ordem", type: "list", hint: "Ex: benefícios → como funciona → prova → FAQ → CTA" },
        { id: "value_props", label: "Propostas de valor (3)", type: "list" },
        { id: "how_it_works", label: "Como funciona (passos)", type: "list" },
      ],
    },
    {
      id: "proof", title: "Prova social",
      fields: [
        { id: "testimonials", label: "Depoimentos a usar",    type: "list" },
        { id: "logos",        label: "Logos de clientes",      type: "list" },
        { id: "numbers",      label: "Números (X clientes, Y anos)", type: "kv" },
      ],
    },
    {
      id: "objections", title: "Objeções e FAQ",
      fields: [
        { id: "faq", label: "FAQ (pergunta → resposta)", type: "kv" },
      ],
    },
    {
      id: "tracking", title: "Tracking",
      fields: [
        { id: "events",   label: "Eventos a disparar",    type: "list" },
        { id: "thanks",   label: "Página de obrigado",    type: "text" },
      ],
    },
  ],
  quickActions: [
    { id: "generate_tasks", label: "Gerar tasks", primary: true },
    { id: "go_live",        label: "Pré-launch",  primary: true },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","siblings","assets"],
  prefillPrompt:
    "Você é copywriter de resposta direta (Cialdini + Halbert). Headline específica, mensurável, com benefício. " +
    "CTA com verbo de ação. Use depoimentos reais se houver no contexto — nunca invente.",
};

const CONTEUDO: NodeBlueprint = {
  kind: "conteudo",
  purpose: "Peça de conteúdo (post, artigo, roteiro) com pauta e CTA.",
  methodChecklist: [
    { id: "angle",     label: "Ângulo único definido",              required: true },
    { id: "outline",   label: "Outline aprovado",                   required: true },
    { id: "draft",     label: "Rascunho escrito",                   required: true },
    { id: "review",    label: "Revisão de tom + ortografia",        required: true },
    { id: "schedule",  label: "Agendado/publicado",                 required: false },
  ],
  sections: [
    {
      id: "brief", title: "Pauta",
      fields: [
        { id: "format",   label: "Formato",        type: "text", hint: "Post, artigo, vídeo, carrossel" },
        { id: "channel",  label: "Canal",          type: "text" },
        { id: "angle",    label: "Ângulo único",   type: "text", hint: "1 frase do que torna esse conteúdo único" },
        { id: "audience", label: "Quem deve ler",  type: "textarea" },
      ],
    },
    {
      id: "outline", title: "Outline",
      fields: [
        { id: "hook",      label: "Gancho (primeiras 3 linhas)", type: "textarea" },
        { id: "structure", label: "Estrutura em tópicos",        type: "list" },
        { id: "cta",       label: "CTA final",                   type: "text" },
      ],
    },
    {
      id: "draft", title: "Texto / roteiro",
      fields: [
        { id: "body", label: "Conteúdo completo", type: "textarea", hint: "Versão pronta pra publicação" },
      ],
    },
    {
      id: "distribution", title: "Distribuição",
      fields: [
        { id: "schedule_at", label: "Quando publicar",   type: "text", decisionOnly: true },
        { id: "tags",        label: "Tags / hashtags",   type: "list" },
      ],
    },
  ],
  quickActions: [
    { id: "export_pdf", label: "Baixar conteúdo", primary: true },
    { id: "generate_tasks", label: "Gerar tasks de produção" },
    { id: "regenerate_prefill", label: "Regenerar com IA" },
  ],
  sources: ["briefing","context","siblings"],
  prefillPrompt:
    "Você é editor-chefe. Gancho na 1ª linha, valor antes da venda, CTA específico. " +
    "Tom alinhado ao público do briefing. Se for carrossel, divida em slides claros.",
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

// ═══════════════════════════════════════════════════════════════════════════
// Registry
// ═══════════════════════════════════════════════════════════════════════════

/**
 * NOTA: alguns kinds compartilham o mesmo blueprint base (ex: documento e diagnostico
 * são ambos `documento` no enum atual — diferenciamos via título do node).
 * Quando precisar separar de verdade, adicione novo kind no enum.
 */
export const NODE_BLUEPRINTS: NodeBlueprint[] = [
  BRIEFING,
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
