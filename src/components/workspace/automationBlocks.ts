/**
 * AI & Automation Briefing — Block definitions and signal mapping.
 *
 * 12 structured blocks for mapping automation and AI opportunities.
 * Each block maps to a signal key used in metadata.structured_signals.
 */

export interface AutomationBlock {
  key: string;
  label: string;
  description: string;
  questions: string[];
  signalKey: string;
  dossierBlock: string;
}

export const AUTOMATION_BLOCKS: AutomationBlock[] = [
  {
    key: "current_operations",
    label: "Operações Atuais",
    description: "Como a operação funciona hoje, fluxos manuais e repetitivos.",
    questions: [
      "Quais são os processos mais repetitivos no dia a dia da empresa?",
      "Quanto tempo por semana a equipe gasta com tarefas manuais e operacionais?",
      "Quais processos dependem de copiar dados entre sistemas manualmente?",
      "Existe algum fluxo que a equipe considera 'perda de tempo' mas continua fazendo?",
    ],
    signalKey: "current_operations",
    dossierBlock: "operational",
  },
  {
    key: "communication_channels",
    label: "Canais de Comunicação",
    description: "Como a empresa se comunica com clientes e internamente.",
    questions: [
      "Quais canais a empresa usa para atender clientes? (WhatsApp, e-mail, chat, telefone)",
      "Existe um padrão de atendimento ou cada pessoa responde do seu jeito?",
      "Quanto tempo leva para responder um cliente em média?",
      "Quais perguntas os clientes fazem com mais frequência?",
    ],
    signalKey: "communication_channels",
    dossierBlock: "commercial",
  },
  {
    key: "data_management",
    label: "Gestão de Dados",
    description: "Como dados são coletados, organizados e usados.",
    questions: [
      "Onde os dados de clientes ficam armazenados? (planilha, CRM, sistema, caderno)",
      "Existe uma base de dados centralizada ou tudo está espalhado?",
      "Quais relatórios são gerados manualmente hoje?",
      "Há dados que a empresa coleta mas nunca usa efetivamente?",
    ],
    signalKey: "data_management",
    dossierBlock: "digital",
  },
  {
    key: "sales_pipeline",
    label: "Pipeline de Vendas",
    description: "Como o processo comercial funciona e onde pode ser otimizado.",
    questions: [
      "Como o lead entra no funil de vendas? O processo é manual ou automático?",
      "Existe follow-up estruturado ou depende da memória do vendedor?",
      "Quanto tempo leva do primeiro contato ao fechamento?",
      "Quais etapas do processo de vendas poderiam ser automatizadas?",
    ],
    signalKey: "sales_pipeline",
    dossierBlock: "commercial",
  },
  {
    key: "content_marketing",
    label: "Conteúdo e Marketing",
    description: "Produção de conteúdo, campanhas e presença digital.",
    questions: [
      "A empresa produz conteúdo regularmente? (posts, vídeos, e-mails, blog)",
      "Quanto tempo por semana é investido em criação de conteúdo?",
      "Existe um calendário editorial ou a produção é improvisada?",
      "Quais tarefas de marketing poderiam ser aceleradas com IA?",
    ],
    signalKey: "content_marketing",
    dossierBlock: "digital",
  },
  {
    key: "customer_journey",
    label: "Jornada do Cliente",
    description: "Da captação à entrega e pós-venda.",
    questions: [
      "O que acontece depois que o cliente compra? Existe um onboarding?",
      "Como a empresa coleta feedback dos clientes?",
      "Existe algum processo de retenção ou recompra estruturado?",
      "Quais pontos da jornada geram mais atrito ou reclamação?",
    ],
    signalKey: "customer_journey",
    dossierBlock: "operational",
  },
  {
    key: "internal_tools",
    label: "Ferramentas e Integrações",
    description: "Stack atual e potencial de integração.",
    questions: [
      "Quais ferramentas a empresa usa hoje? (CRM, ERP, automação, e-mail, etc.)",
      "Essas ferramentas se comunicam entre si ou são isoladas?",
      "Existe alguma ferramenta que a equipe detesta usar?",
      "Quais integrações fariam diferença na operação?",
    ],
    signalKey: "internal_tools",
    dossierBlock: "digital",
  },
  {
    key: "ai_readiness",
    label: "Maturidade para IA",
    description: "Nível de preparo e expectativas sobre inteligência artificial.",
    questions: [
      "A equipe já usa alguma ferramenta de IA? (ChatGPT, Copilot, automações)",
      "Qual o nível de abertura da equipe para novas tecnologias?",
      "Existe resistência interna a automações ou IA?",
      "O que a empresa espera ganhar com IA? (tempo, qualidade, escala, redução de custo)",
    ],
    signalKey: "ai_readiness",
    dossierBlock: "diagnostic",
  },
  {
    key: "bottlenecks",
    label: "Gargalos e Desperdícios",
    description: "Onde a empresa perde tempo, dinheiro ou qualidade.",
    questions: [
      "Qual processo mais consome tempo sem gerar valor direto?",
      "Onde a empresa perde dinheiro com ineficiência?",
      "Quais erros humanos acontecem com frequência?",
      "Se pudesse eliminar 3 tarefas da rotina, quais seriam?",
    ],
    signalKey: "bottlenecks",
    dossierBlock: "diagnostic",
  },
  {
    key: "automation_opportunities",
    label: "Oportunidades de Automação",
    description: "Processos que poderiam rodar no automático.",
    questions: [
      "Quais tarefas poderiam acontecer sem intervenção humana?",
      "Existe algum fluxo que segue sempre as mesmas regras? (aprovação, notificação, cobrança)",
      "Quais notificações ou alertas seriam úteis para a equipe?",
      "Já tentou automatizar algo antes? O que deu certo ou errado?",
    ],
    signalKey: "automation_opportunities",
    dossierBlock: "decisions",
  },
  {
    key: "priorities",
    label: "Prioridades de Automação",
    description: "O que atacar primeiro e restrições reais.",
    questions: [
      "Se pudesse automatizar apenas 1 coisa agora, o que seria?",
      "Qual área tem mais urgência de melhoria? (vendas, atendimento, operação, marketing)",
      "Existe orçamento definido para investir em automação?",
      "Há alguma restrição técnica ou regulatória que limita automações?",
    ],
    signalKey: "priorities",
    dossierBlock: "decisions",
  },
  {
    key: "scaling_vision",
    label: "Visão de Escala",
    description: "Onde a empresa quer chegar com automação e IA.",
    questions: [
      "Qual o cenário ideal da operação daqui a 6 meses?",
      "O que definiria sucesso neste projeto de automação?",
      "A empresa quer escalar volume ou melhorar qualidade primeiro?",
      "Existe alguma referência de empresa ou processo que admira?",
    ],
    signalKey: "scaling_vision",
    dossierBlock: "decisions",
  },
];

/** All automation signal keys */
export const AUTOMATION_SIGNAL_KEYS = AUTOMATION_BLOCKS.map((b) => b.signalKey);

/** Automation signal → dossier block mapping */
export const AUTOMATION_SIGNAL_TO_DOSSIER: Record<string, string> = Object.fromEntries(
  AUTOMATION_BLOCKS.map((b) => [b.signalKey, b.dossierBlock])
);

/** Automation signal labels */
export const AUTOMATION_SIGNAL_LABELS: Record<string, string> = Object.fromEntries(
  AUTOMATION_BLOCKS.map((b) => [b.signalKey, b.label])
);

/** Task-relevant automation signals */
export const AUTOMATION_TASK_SIGNALS = [
  "bottlenecks", "sales_pipeline", "automation_opportunities",
  "priorities", "current_operations", "communication_channels",
  "customer_journey", "scaling_vision",
];

/** Doc-relevant automation signals */
export const AUTOMATION_DOC_SIGNALS = [
  "current_operations", "internal_tools", "data_management",
  "communication_channels", "content_marketing", "ai_readiness",
];
