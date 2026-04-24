/**
 * diagnosticQuiz — definição do quiz de diagnóstico inicial.
 *
 * Gera o MESMO essential_briefing que o formulário do ClientEssentialBriefing,
 * só com UX gamificada (1 pergunta por vez, progresso, feedback visual).
 *
 * Fluxo:
 *  1. Cliente/time abre quiz
 *  2. Responde 12 perguntas (mix de multiple choice + open-ended)
 *  3. Ao final, gera automaticamente:
 *     - essential_briefing completo salvo em clients.metadata
 *     - ICP-fit score calculado na hora
 *     - Plano recomendado
 *     - Primeiros passos
 */

export type QuestionType = "single_select" | "multi_select" | "open_text" | "scale";

export interface QuizOption {
  value: string;
  label: string;
  description?: string;
  /** Peso para cálculo de ICP-fit (se aplicável) */
  icpWeight?: number;
}

export interface QuizQuestion {
  id: string;
  /** Campo do essential_briefing que esta pergunta popula */
  briefingField: "positioning" | "differential" | "icp" | "main_pains" | "goals_12m" | "success_metric" | "revenue_range" | "team_size" | "maturity_digital" | "ai_readiness";
  type: QuestionType;
  /** Pergunta principal mostrada ao cliente */
  question: string;
  /** Contexto / explicação do porquê da pergunta */
  helperText?: string;
  /** Exemplos ou placeholder */
  placeholder?: string;
  options?: QuizOption[];
  /** Obrigatório? */
  required?: boolean;
  /** Se tipo open_text, mínimo de caracteres */
  minLength?: number;
  /** Categoria visual do passo */
  category: "identidade" | "mercado" | "objetivos" | "perfil" | "maturidade";
}

export const DIAGNOSTIC_QUIZ: QuizQuestion[] = [
  // ═══ IDENTIDADE (2 perguntas) ═══
  {
    id: "positioning",
    briefingField: "positioning",
    type: "open_text",
    category: "identidade",
    question: "Em 1-2 frases, como você descreveria o que sua empresa faz?",
    helperText: "Explique como se estivesse numa rodada de networking. Seja direto, sem jargão.",
    placeholder: "Ex: Somos uma consultoria boutique que ajuda pequenas indústrias a digitalizar operações e dobrar produtividade.",
    required: true,
    minLength: 30,
  },
  {
    id: "differential",
    briefingField: "differential",
    type: "open_text",
    category: "identidade",
    question: "O que vocês entregam que os concorrentes diretos NÃO entregam?",
    helperText: "Foque no DIFERENCIAL REAL, não em adjetivos. Evite 'qualidade' e 'atendimento diferenciado' — todo mundo diz isso.",
    placeholder: "Ex: Somos os únicos que conectam o CRM do cliente com o chão de fábrica via IoT.",
    required: true,
    minLength: 30,
  },

  // ═══ MERCADO (2 perguntas) ═══
  {
    id: "icp",
    briefingField: "icp",
    type: "open_text",
    category: "mercado",
    question: "Descreva seu cliente ideal: quem é, o que faz, qual o momento dele.",
    helperText: "Seja específico: segmento, tamanho, estágio, dor principal. Vago = resultado vago.",
    placeholder: "Ex: Donos de indústria de confecção entre 50-200 funcionários, faturando entre R$ 5M-R$ 30M/ano, com processo de produção ainda no papel ou Excel.",
    required: true,
    minLength: 40,
  },
  {
    id: "main_pains",
    briefingField: "main_pains",
    type: "open_text",
    category: "mercado",
    question: "Quais as 3 principais dores desse cliente antes de fechar com você?",
    helperText: "Liste dores CONCRETAS que esses clientes sentem no dia-a-dia — a razão real de buscarem ajuda.",
    placeholder: "Ex:\n1. Perde 40% dos pedidos por desorganização da produção\n2. Não consegue precificar direito porque não sabe custo real\n3. Tentou planilhas e CRM mas nada ficou de pé",
    required: true,
    minLength: 50,
  },

  // ═══ OBJETIVOS (2 perguntas) ═══
  {
    id: "goals_12m",
    briefingField: "goals_12m",
    type: "open_text",
    category: "objetivos",
    question: "Qual é seu principal objetivo para os próximos 12 meses?",
    helperText: "Objetivo SMART: específico, mensurável, com prazo. Não 'crescer' — 'dobrar faturamento de R$X pra R$Y até dez/26'.",
    placeholder: "Ex: Escalar de R$ 500k/mês para R$ 1.2M/mês consolidando a operação com CRM, tráfego pago e 2 agentes IA.",
    required: true,
    minLength: 30,
  },
  {
    id: "success_metric",
    briefingField: "success_metric",
    type: "open_text",
    category: "objetivos",
    question: "Qual métrica define o sucesso dessa jornada para você?",
    helperText: "Um número ÚNICO. Se mover esse número, vale a pena. Se não, não valeu.",
    placeholder: "Ex: Faturamento mensal recorrente (MRR) passar de R$ 500k para R$ 1.2M",
    required: true,
  },

  // ═══ PERFIL DA EMPRESA (2 perguntas) ═══
  {
    id: "revenue_range",
    briefingField: "revenue_range",
    type: "single_select",
    category: "perfil",
    question: "Qual a faixa de faturamento mensal da empresa hoje?",
    helperText: "Informação comercial — serve para recomendar o plano certo para seu estágio.",
    required: true,
    options: [
      { value: "Até R$ 20k/mês",       label: "Até R$ 20k/mês",        description: "Começando", icpWeight: 20 },
      { value: "R$ 20k-50k/mês",       label: "R$ 20k-50k/mês",         description: "Validando",  icpWeight: 35 },
      { value: "R$ 50k-200k/mês",      label: "R$ 50k-200k/mês",        description: "Crescendo",  icpWeight: 55 },
      { value: "R$ 200k-500k/mês",     label: "R$ 200k-500k/mês",       description: "Estruturando",icpWeight: 75 },
      { value: "R$ 500k-1M/mês",       label: "R$ 500k-1M/mês",         description: "Escalando",  icpWeight: 85 },
      { value: "R$ 1M-5M/mês",         label: "R$ 1M-5M/mês",           description: "Consolidada",icpWeight: 95 },
      { value: "R$ 5M+/mês",           label: "R$ 5M+/mês",             description: "Estabelecida",icpWeight: 100 },
    ],
  },
  {
    id: "team_size",
    briefingField: "team_size",
    type: "single_select",
    category: "perfil",
    question: "Quantas pessoas trabalham na empresa hoje?",
    helperText: "Time = capacidade de execução interna. Menos gente = mais Aceleriq executa direto.",
    required: true,
    options: [
      { value: "Solo (1 pessoa)",  label: "Solo (1 pessoa)",       icpWeight: 30 },
      { value: "2-5 pessoas",      label: "2-5 pessoas",           icpWeight: 50 },
      { value: "6-15 pessoas",     label: "6-15 pessoas",          icpWeight: 75 },
      { value: "16-50 pessoas",    label: "16-50 pessoas",         icpWeight: 90 },
      { value: "51-200 pessoas",   label: "51-200 pessoas",        icpWeight: 95 },
      { value: "200+",             label: "Mais de 200 pessoas",   icpWeight: 100 },
    ],
  },

  // ═══ MATURIDADE (2 perguntas) ═══
  {
    id: "maturity_digital",
    briefingField: "maturity_digital",
    type: "single_select",
    category: "maturidade",
    question: "Como você descreveria a maturidade digital da empresa?",
    helperText: "Onde vocês estão hoje em termos de digitalização da operação.",
    required: true,
    options: [
      { value: "baixa", label: "Baixa", description: "Começando do zero. Sem processo digital consolidado.", icpWeight: 30 },
      { value: "media", label: "Média", description: "Tem presença digital mas opera sem método consistente.", icpWeight: 65 },
      { value: "alta",  label: "Alta",  description: "Já opera com método digital e ferramentas integradas.", icpWeight: 95 },
    ],
  },
  {
    id: "ai_readiness",
    briefingField: "ai_readiness",
    type: "single_select",
    category: "maturidade",
    question: "Qual sua experiência com IA na empresa hoje?",
    helperText: "Essa é a pergunta-chave. O Aceleriq entrega operação AI-first — queremos saber de onde estamos partindo.",
    required: true,
    options: [
      { value: "baixa", label: "Baixa", description: "Nunca usei IA no negócio. Começando do zero.", icpWeight: 30 },
      { value: "media", label: "Média", description: "Uso ChatGPT pessoal mas sem estrutura na operação.", icpWeight: 65 },
      { value: "alta",  label: "Alta",  description: "Já tenho algum agente ou automação com IA rodando.", icpWeight: 95 },
    ],
  },
];

export const CATEGORY_META = {
  identidade: { label: "Identidade e Posicionamento", color: "#60A5FA", order: 1 },
  mercado:    { label: "Mercado e Cliente Ideal",     color: "#EC4899", order: 2 },
  objetivos:  { label: "Objetivos e Sucesso",         color: "#10B981", order: 3 },
  perfil:     { label: "Perfil da Empresa",           color: "#FBBF24", order: 4 },
  maturidade: { label: "Maturidade Operacional",      color: "#8B5CF6", order: 5 },
} as const;

// ─── Answer → briefing conversion ────────────────────────────

export interface QuizAnswers {
  [questionId: string]: string | string[];
}

/** Converte respostas do quiz para o formato essential_briefing */
export function answersToEssentialBriefing(answers: QuizAnswers): Record<string, string> {
  const briefing: Record<string, string> = {};
  DIAGNOSTIC_QUIZ.forEach((q) => {
    const ans = answers[q.id];
    if (!ans) return;
    briefing[q.briefingField] = Array.isArray(ans) ? ans.join(", ") : String(ans);
  });
  briefing.updated_at = new Date().toISOString();
  return briefing;
}

/** Extrai variáveis do briefing existente para pré-preencher o quiz */
export function briefingToAnswers(briefing: Record<string, string> | null | undefined): QuizAnswers {
  if (!briefing) return {};
  const answers: QuizAnswers = {};
  DIAGNOSTIC_QUIZ.forEach((q) => {
    const v = briefing[q.briefingField];
    if (v) answers[q.id] = v;
  });
  return answers;
}
