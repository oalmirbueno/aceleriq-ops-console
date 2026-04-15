/**
 * Enterprise Structuring Briefing — Block definitions and signal mapping.
 *
 * 12 structured blocks with operational questions.
 * Each block maps to a signal key used in metadata.structured_signals.
 */

export interface EnterpriseBlock {
  key: string;
  label: string;
  description: string;
  questions: string[];
  signalKey: string;
  dossierBlock: string;
}

export const ENTERPRISE_BLOCKS: EnterpriseBlock[] = [
  {
    key: "company_moment",
    label: "Empresa e Momento Atual",
    description: "Contexto geral, história recente, fase atual do negócio.",
    questions: [
      "Qual o segmento da empresa e há quanto tempo opera?",
      "Em que fase o negócio se encontra? (início, crescimento, reestruturação, escala)",
      "Houve alguma mudança relevante nos últimos 6 meses? (sócios, modelo, mercado)",
      "Qual o faturamento mensal médio atual?",
    ],
    signalKey: "company_moment",
    dossierBlock: "identity",
  },
  {
    key: "revenue_model",
    label: "Oferta e Modelo de Receita",
    description: "O que vende, como cobra, margens e ticket.",
    questions: [
      "Quais são os produtos/serviços principais?",
      "Qual o modelo de cobrança? (recorrente, projeto, hora, comissão)",
      "Qual o ticket médio por cliente?",
      "Existe upsell ou cross-sell estruturado?",
    ],
    signalKey: "revenue_model",
    dossierBlock: "offer",
  },
  {
    key: "commercial_structure",
    label: "Estrutura Comercial",
    description: "Como a empresa vende e gera demanda.",
    questions: [
      "Como novos clientes chegam hoje? (indicação, tráfego, outbound, parcerias)",
      "Existe um funil de vendas definido? Quais etapas?",
      "Quem é responsável pela parte comercial?",
      "Qual a taxa de conversão estimada de lead para cliente?",
    ],
    signalKey: "commercial_structure",
    dossierBlock: "commercial",
  },
  {
    key: "operational_structure",
    label: "Estrutura Operacional",
    description: "Como a empresa entrega e opera no dia a dia.",
    questions: [
      "Como funciona o fluxo de entrega após a venda?",
      "Existe onboarding estruturado para novos clientes?",
      "Quais são as etapas operacionais principais?",
      "Quanto tempo leva do fechamento à primeira entrega?",
    ],
    signalKey: "operational_structure",
    dossierBlock: "operational",
  },
  {
    key: "process_gaps",
    label: "Processos e Gargalos",
    description: "Onde trava, onde perde tempo, o que não funciona.",
    questions: [
      "Quais processos são manuais e consomem mais tempo?",
      "Onde a operação trava com mais frequência?",
      "Existe retrabalho recorrente? Em que área?",
      "O que mais gera atrito interno ou com clientes?",
    ],
    signalKey: "process_gaps",
    dossierBlock: "diagnostic",
  },
  {
    key: "team_roles",
    label: "Time e Papéis",
    description: "Quem faz o quê, capacidade e dependências de pessoas.",
    questions: [
      "Quantas pessoas compõem o time? (CLT, PJ, freelancers)",
      "Quais funções existem hoje?",
      "Existe alguém sobrecarregado ou acumulando funções?",
      "Há plano de contratação ou é preciso otimizar o time atual?",
    ],
    signalKey: "team_roles",
    dossierBlock: "operational",
  },
  {
    key: "tools_stack",
    label: "Ferramentas e Stack",
    description: "Sistemas, plataformas e integrações em uso.",
    questions: [
      "Quais ferramentas a empresa usa no dia a dia? (CRM, ERP, e-mail, automação, etc.)",
      "Existem ferramentas pagas que não estão sendo aproveitadas?",
      "Há integrações entre sistemas ou tudo é manual?",
      "O que funciona bem e o que precisa trocar?",
    ],
    signalKey: "tools_stack",
    dossierBlock: "digital",
  },
  {
    key: "access_dependencies",
    label: "Acessos e Dependências",
    description: "Credenciais, domínios, fornecedores críticos.",
    questions: [
      "Quais acessos estão centralizados e quais estão espalhados?",
      "Existe dependência de fornecedor para algo crítico? (hospedagem, sistema, dados)",
      "Domínio e hospedagem estão sob controle da empresa?",
      "Há acessos pendentes ou que precisam ser recuperados?",
    ],
    signalKey: "access_dependencies",
    dossierBlock: "access",
  },
  {
    key: "digital_operation",
    label: "Operação Digital",
    description: "Presença online, canais ativos, métricas digitais.",
    questions: [
      "Quais canais digitais estão ativos? (site, redes, e-mail, ads)",
      "Existe tráfego pago rodando? Qual investimento mensal?",
      "O site gera leads ou vendas? Qual volume?",
      "Há métricas acompanhadas regularmente? Quais?",
    ],
    signalKey: "digital_operation",
    dossierBlock: "digital",
  },
  {
    key: "structuring_opportunities",
    label: "Oportunidades de Estruturação",
    description: "O que pode ser melhorado, automatizado ou criado.",
    questions: [
      "Quais processos poderiam ser automatizados?",
      "Onde existe oportunidade clara de melhoria que não foi atacada?",
      "O que o mercado faz que a empresa ainda não implementou?",
      "Se pudesse resolver 3 problemas agora, quais seriam?",
    ],
    signalKey: "structuring_opportunities",
    dossierBlock: "decisions",
  },
  {
    key: "priority_constraints",
    label: "Prioridades e Travas",
    description: "O que é urgente, o que está bloqueando, restrições reais.",
    questions: [
      "Qual a prioridade número 1 da empresa neste momento?",
      "Existe algo bloqueando o crescimento ou a operação?",
      "Há restrições de orçamento, tempo ou equipe?",
      "Quais decisões estão pendentes e precisam de direcionamento?",
    ],
    signalKey: "priority_constraints",
    dossierBlock: "decisions",
  },
  {
    key: "growth_readiness",
    label: "Visão de Crescimento",
    description: "Onde quer chegar, metas e ambição de escala.",
    questions: [
      "Qual o objetivo principal da empresa para os próximos 6-12 meses?",
      "Existe meta de faturamento ou crescimento definida?",
      "A empresa está pronta para escalar ou precisa primeiro arrumar a base?",
      "O que definiria sucesso deste projeto de estruturação?",
    ],
    signalKey: "growth_readiness",
    dossierBlock: "offer",
  },
];

/** All enterprise signal keys */
export const ENTERPRISE_SIGNAL_KEYS = ENTERPRISE_BLOCKS.map((b) => b.signalKey);

/** Enterprise signal → dossier block mapping */
export const ENTERPRISE_SIGNAL_TO_DOSSIER: Record<string, string> = Object.fromEntries(
  ENTERPRISE_BLOCKS.map((b) => [b.signalKey, b.dossierBlock])
);

/** Enterprise signal labels */
export const ENTERPRISE_SIGNAL_LABELS: Record<string, string> = Object.fromEntries(
  ENTERPRISE_BLOCKS.map((b) => [b.signalKey, b.label])
);

/** Task-relevant enterprise signals */
export const ENTERPRISE_TASK_SIGNALS = [
  "process_gaps", "commercial_structure", "operational_structure",
  "tools_stack", "access_dependencies", "structuring_opportunities",
  "priority_constraints", "growth_readiness",
];

/** Doc-relevant enterprise signals */
export const ENTERPRISE_DOC_SIGNALS = [
  "company_moment", "revenue_model", "commercial_structure",
  "team_roles", "tools_stack", "digital_operation",
];
