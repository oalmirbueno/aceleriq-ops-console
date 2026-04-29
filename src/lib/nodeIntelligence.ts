/**
 * nodeIntelligence — "cérebro" de cada tipo de node.
 *
 * Define COMO cada tipo de node deve ser preenchido pela IA:
 *   - Qual agente usar
 *   - Que campos preencher (schema completo do drawer)
 *   - Few-shot examples de resposta boa
 *   - Validação
 *   - Temperatura recomendada
 */

import type { AgentId } from "./aiAgents";

export interface NodeField {
  key: string;
  label: string;
  hint: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}

export interface NodeIntelligence {
  /** Agente especialista */
  agentId: AgentId;
  /** Modelo recomendado */
  suggestedModel: "gemini-2.5-flash" | "gemini-2.5-pro";
  /** Temperatura (0=determinístico, 1=criativo) */
  temperature: number;
  /** Schema completo de campos a preencher */
  fields: NodeField[];
  /** Descrição do entregável (contexto pro agente) */
  deliverableDescription: string;
  /** Regras de qualidade específicas */
  qualityRules: string[];
  /** Exemplo de resposta ideal (few-shot) */
  exampleOutput?: Record<string, string>;
}

// ═══════════════════════════════════════════════════════════════
// MAPEAMENTO COMPLETO — um "cérebro" por tipo de node
// ═══════════════════════════════════════════════════════════════

export const NODE_INTELLIGENCE: Record<string, NodeIntelligence> = {
  // ─── OBJETIVO ───────────────────────────────────────────────
  objetivo: {
    agentId: "strategist",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.4,
    deliverableDescription: "Objetivo SMART com entregável, como fazer e critério de aceite",
    qualityRules: [
      "Objetivo deve ser específico, mensurável, temporal",
      "Evite verbos vagos (melhorar, otimizar) — use números",
      "Conecte a uma métrica do briefing",
      "Descreva executor, prazo e dependências",
    ],
    fields: [
      { key: "description", label: "Descrição do entregável", hint: "O que será construído/alcançado, conectado a métrica", minLength: 100, maxLength: 800 },
      { key: "howTo", label: "Como fazer", hint: "Sequência de 3-5 passos numerados", minLength: 150, maxLength: 1200 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "Como validar — com números/marcos", minLength: 80, maxLength: 600 },
    ],
    exampleOutput: {
      description: "Aumentar conversão de leads para clientes de 12% para 22% até fim de Q1/2026 na linha de serviços técnicos. Entregável consiste em pipeline remodelado no CRM com 5 etapas novas, automação de follow-up após 48h e relatório semanal de funil.",
      howTo: "1. Mapear funil atual e identificar onde lead evapora (semana 1)\n2. Desenhar novo pipeline de 5 etapas com SLAs claros (semana 2)\n3. Configurar automação n8n: quando lead fica 48h parado, dispara WhatsApp do vendedor (semana 3)\n4. Treinar time nos novos status e rituais (semana 4)\n5. Primeira medição após 4 semanas de uso",
      acceptCriteria: "Meta atingida quando: conversão lead→cliente ≥ 22% em janela de 30 dias, menos de 5% dos leads parados >72h sem contato, 100% dos vendedores usando o novo pipeline. Relatório semanal automatizado com os 3 indicadores enviado toda segunda 9h.",
    },
  },

  // ─── DOCUMENTO (ICP, BMC, SOP, etc) ────────────────────────
  documento: {
    agentId: "briefing_analyst",
    suggestedModel: "gemini-2.5-flash",
    temperature: 0.3,
    deliverableDescription: "Documento operacional estruturado e reutilizável",
    qualityRules: [
      "Use o contexto REAL do cliente — nunca invente",
      "Campo com dado ausente: escreva 'A DEFINIR' e a pergunta que falta",
      "Documento deve ser auto-contido (alguém novo entende)",
      "Estruture em seções nomeadas com hífens (sem asteriscos)",
    ],
    fields: [
      { key: "description", label: "Descrição do entregável", hint: "O que o documento contém e para quem serve", minLength: 120, maxLength: 900 },
      { key: "howTo", label: "Como fazer", hint: "Metodologia, fontes, ferramentas", minLength: 150, maxLength: 1500 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "Formato final, validação, onde fica guardado", minLength: 80, maxLength: 600 },
    ],
  },

  // ─── ICP (cliente ideal) ──────────────────────────────────
  icp: {
    agentId: "briefing_analyst",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.3,
    deliverableDescription: "Perfil detalhado do Cliente Ideal (ICP) com persona, dores, objeções, canais",
    qualityRules: [
      "Baseie-se 100% no briefing do cliente — dores reais, não genéricas",
      "Inclua características firmográficas E psicográficas",
      "Especifique canais onde ICP está e linguagem que usa",
      "Liste 3-5 objeções comuns com respostas",
    ],
    fields: [
      { key: "description", label: "ICP detalhado", hint: "Perfil, momento, dores, objeções, canais de descoberta", minLength: 200, maxLength: 1500 },
      { key: "howTo", label: "Como validar o ICP", hint: "Pesquisa, entrevistas, análise de clientes atuais", minLength: 120, maxLength: 800 },
      { key: "acceptCriteria", label: "Critério de validação", hint: "Como confirmar que o ICP está correto (entrevistas, testes)", minLength: 80, maxLength: 500 },
    ],
  },

  // ─── LANDING PAGE ─────────────────────────────────────────
  landing_page: {
    agentId: "copywriter",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.7,
    deliverableDescription: "Landing page de alta conversão com copy estruturado",
    qualityRules: [
      "Headline principal em 10 palavras max — foco em BENEFÍCIO",
      "Estruture as 7 seções canônicas (hero, dor, solução, prova, oferta, garantia, CTA)",
      "Copy direto, sem jargão de marketing",
      "CTAs com verbos de ação e urgência real (sem forçar)",
    ],
    fields: [
      { key: "description", label: "Descrição da LP", hint: "Objetivo, estrutura de 7 seções, CTAs", minLength: 200, maxLength: 1500 },
      { key: "howTo", label: "Como construir", hint: "Ferramenta, layout, copy por seção", minLength: 200, maxLength: 2000 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "Taxa de conversão alvo, responsividade, tempo de carga", minLength: 80, maxLength: 500 },
    ],
  },

  // ─── AUTOMAÇÃO ────────────────────────────────────────────
  automacao: {
    agentId: "automation_architect",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.3,
    deliverableDescription: "Automação de processo com trigger, fluxo, output e fallback",
    qualityRules: [
      "SEMPRE especifique: trigger → passos → output → fallback → log",
      "Calcule ROI em horas economizadas × custo da hora",
      "Identifique pontos de falha antes de propor solução",
      "Preferência por stack interno vs SaaS caro",
    ],
    fields: [
      { key: "description", label: "Descrição do fluxo", hint: "Trigger, passos, output, integrações", minLength: 200, maxLength: 1500 },
      { key: "howTo", label: "Como implementar", hint: "Ferramentas (n8n/Make/etc), configuração, testes", minLength: 200, maxLength: 2000 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "Testes end-to-end, ROI mensurado, fallbacks testados", minLength: 100, maxLength: 600 },
    ],
  },

  // ─── IA / AGENTE ──────────────────────────────────────────
  ia: {
    agentId: "ai_specialist",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.4,
    deliverableDescription: "Agente IA conversacional com persona, guardrails e learning loop",
    qualityRules: [
      "Defina persona: nome, tom, idade conceitual, backstory breve",
      "Liste explicitamente o que FAZ e o que NÃO FAZ",
      "Inclua fluxo de escalação humana (quando e como)",
      "Proponha learning loop (como melhorar com conversas reais)",
    ],
    fields: [
      { key: "description", label: "Descrição do agente", hint: "Persona, escopo, limites, canal, tom", minLength: 250, maxLength: 1800 },
      { key: "howTo", label: "Como construir", hint: "System prompt, guardrails, integração, cenários-teste", minLength: 300, maxLength: 2500 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "50+ cenários testados, % de acerto, tempo de resposta", minLength: 100, maxLength: 600 },
    ],
  },

  // ─── MÉTRICA ──────────────────────────────────────────────
  metrica: {
    agentId: "data_analyst",
    suggestedModel: "gemini-2.5-flash",
    temperature: 0.2,
    deliverableDescription: "Métrica/KPI com fórmula, fonte, frequência, baseline e meta",
    qualityRules: [
      "Métrica sem ação é vaidade — conecte a decisão",
      "SEMPRE: fórmula + fonte + frequência + baseline + meta + dono",
      "Indique se é leading (preditiva) ou lagging (resultado)",
      "Use unidades brasileiras (R$, %, não $)",
    ],
    fields: [
      { key: "description", label: "Descrição da métrica", hint: "O que mede, por que importa, qual decisão informa", minLength: 120, maxLength: 800 },
      { key: "howTo", label: "Como capturar", hint: "Fonte dos dados, fórmula exata, frequência, ferramenta", minLength: 120, maxLength: 1000 },
      { key: "acceptCriteria", label: "Baseline e meta", hint: "Valor atual, valor-alvo, horizonte, dono da métrica", minLength: 80, maxLength: 500 },
    ],
  },

  // ─── CONTEÚDO ─────────────────────────────────────────────
  conteudo: {
    agentId: "content_director",
    suggestedModel: "gemini-2.5-flash",
    temperature: 0.8,
    deliverableDescription: "Peça de conteúdo com hook, desenvolvimento, CTA",
    qualityRules: [
      "Hook nos primeiros 3 segundos/palavras — provocação ou tensão",
      "Desenvolvimento entrega valor antes de pedir algo",
      "CTA natural (não forçado), conectado ao conteúdo",
      "Tom alinhado ao posicionamento do cliente",
    ],
    fields: [
      { key: "description", label: "Descrição do conteúdo", hint: "Formato, canal, tema, pilar", minLength: 80, maxLength: 500 },
      { key: "howTo", label: "Roteiro/estrutura", hint: "Hook + desenvolvimento + CTA, com copy pronta", minLength: 200, maxLength: 2000 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "Engajamento alvo, alinhamento com pilar, aprovação do cliente", minLength: 60, maxLength: 400 },
    ],
  },

  // ─── TRÁFEGO ──────────────────────────────────────────────
  trafego: {
    agentId: "growth_marketer",
    suggestedModel: "gemini-2.5-flash",
    temperature: 0.5,
    deliverableDescription: "Campanha de tráfego estruturada (objetivo, público, criativos, budget)",
    qualityRules: [
      "Defina objetivo de campanha (CPL, CPA, conversão) e KPI",
      "Segmentação: demo + interesses + comportamentos + lookalike",
      "Mínimo 3 criativos para teste (hook diferente cada)",
      "Orçamento diário realista + estratégia de escala",
    ],
    fields: [
      { key: "description", label: "Descrição da campanha", hint: "Objetivo, KPI, canal, público-alvo", minLength: 120, maxLength: 800 },
      { key: "howTo", label: "Estrutura de campanha", hint: "Conjuntos de anúncios, criativos, copy, orçamento", minLength: 200, maxLength: 2000 },
      { key: "acceptCriteria", label: "Métricas alvo", hint: "CPL/CPA meta, CTR mínimo, ROAS alvo", minLength: 80, maxLength: 500 },
    ],
  },

  // ─── FUNIL ────────────────────────────────────────────────
  funil: {
    agentId: "growth_marketer",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.4,
    deliverableDescription: "Funil de aquisição e conversão completo",
    qualityRules: [
      "Mapeie jornada: descoberta → consideração → decisão → ação → retenção",
      "Cada etapa com conteúdo/oferta específico e métrica de passagem",
      "Identifique gargalos atuais e oportunidades",
      "Inclua taxa de conversão esperada por etapa",
    ],
    fields: [
      { key: "description", label: "Descrição do funil", hint: "Etapas, conversão esperada, jornada do ICP", minLength: 200, maxLength: 1500 },
      { key: "howTo", label: "Como construir", hint: "Conteúdo/oferta por etapa, triggers, handoffs", minLength: 200, maxLength: 2000 },
      { key: "acceptCriteria", label: "Taxa de conversão alvo", hint: "% por etapa + CAC + LTV", minLength: 80, maxLength: 500 },
    ],
  },

  // ─── CRM ──────────────────────────────────────────────────
  crm: {
    agentId: "automation_architect",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.3,
    deliverableDescription: "Estrutura de CRM com pipeline, automações e relatórios",
    qualityRules: [
      "Pipeline com 5-7 etapas claras e sem sobreposição",
      "Cada etapa tem SLA, responsável, trigger de próxima ação",
      "Automação de follow-up baseada em tempo",
      "Relatórios: funil, conversão, perdas, ciclo médio",
    ],
    fields: [
      { key: "description", label: "Descrição do CRM", hint: "Pipeline, automações, integrações, times que usam", minLength: 200, maxLength: 1500 },
      { key: "howTo", label: "Como estruturar", hint: "Etapas com SLA, campos, regras, automações", minLength: 250, maxLength: 2000 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "Adoção pelo time, dados populados, relatórios rodando", minLength: 100, maxLength: 600 },
    ],
  },

  // ─── CHECKLIST ────────────────────────────────────────────
  checklist: {
    agentId: "documentarian",
    suggestedModel: "gemini-2.5-flash",
    temperature: 0.2,
    deliverableDescription: "Checklist executável de tarefas ordenadas",
    qualityRules: [
      "Cada item com verbo de ação + objeto + critério",
      "Ordem lógica de execução (pré-requisitos antes)",
      "Itens independentes e testáveis",
      "Estime tempo por item quando possível",
    ],
    fields: [
      { key: "description", label: "Descrição do checklist", hint: "Propósito, contexto, quem usa, quando", minLength: 80, maxLength: 500 },
      { key: "howTo", label: "Items do checklist", hint: "Lista numerada de itens executáveis com critérios", minLength: 200, maxLength: 2500 },
      { key: "acceptCriteria", label: "Critério de conclusão", hint: "Como validar que tudo foi feito corretamente", minLength: 60, maxLength: 400 },
    ],
  },

  // ─── BRIEFING ────────────────────────────────────────────
  briefing: {
    agentId: "briefing_analyst",
    suggestedModel: "gemini-2.5-flash",
    temperature: 0.3,
    deliverableDescription: "Briefing estruturado e consolidado",
    qualityRules: [
      "Identifique lacunas explicitamente — 'A DEFINIR'",
      "Conecte informações dispersas em narrativa coerente",
      "Gere perguntas para completar gaps",
      "Estruture em blocos temáticos nomeados",
    ],
    fields: [
      { key: "description", label: "Briefing consolidado", hint: "Contexto, posicionamento, ICP, dores, objetivos", minLength: 300, maxLength: 2500 },
      { key: "howTo", label: "Como foi consolidado", hint: "Metodologia, fontes, lacunas identificadas", minLength: 150, maxLength: 1000 },
      { key: "acceptCriteria", label: "Completude", hint: "% de campos preenchidos + perguntas para gaps", minLength: 80, maxLength: 500 },
    ],
  },

  // ─── CASE ────────────────────────────────────────────────
  case: {
    agentId: "copywriter",
    suggestedModel: "gemini-2.5-pro",
    temperature: 0.7,
    deliverableDescription: "Case de sucesso estruturado narrativamente",
    qualityRules: [
      "Narrativa em 4 atos: contexto → desafio → solução → resultado",
      "Use NÚMEROS reais — não 'melhorou', mas '+34% em 60 dias'",
      "Depoimento/quote do cliente valoriza",
      "Storytelling — humaniza sem perder fato",
    ],
    fields: [
      { key: "description", label: "Descrição do case", hint: "Cliente, contexto, transformação, resultado", minLength: 200, maxLength: 1500 },
      { key: "howTo", label: "Narrativa completa", hint: "Contexto + desafio + solução + resultado com números", minLength: 300, maxLength: 2500 },
      { key: "acceptCriteria", label: "Aprovação", hint: "Cliente aprovou publicação, números confirmados, depoimento coletado", minLength: 80, maxLength: 500 },
    ],
  },

  // ─── DEFAULT (fallback) ───────────────────────────────────
  default: {
    agentId: "general",
    suggestedModel: "gemini-2.5-flash",
    temperature: 0.5,
    deliverableDescription: "Entregável genérico",
    qualityRules: [
      "Use o contexto do cliente",
      "Seja específico e acionável",
      "Português direto, sem floreios",
    ],
    fields: [
      { key: "description", label: "Descrição do entregável", hint: "O que precisa ser feito", minLength: 100, maxLength: 800 },
      { key: "howTo", label: "Como fazer", hint: "Passos para executar", minLength: 120, maxLength: 1200 },
      { key: "acceptCriteria", label: "Critério de aceite", hint: "Validação final", minLength: 60, maxLength: 500 },
    ],
  },
};

export function getNodeIntelligence(nodeType: string | null | undefined): NodeIntelligence {
  const key = (nodeType ?? "default").toLowerCase();
  const base = NODE_INTELLIGENCE[key] ?? NODE_INTELLIGENCE.default;
  return { ...base, fields: [...base.fields, ...UNIVERSAL_FIELDS] };
}

/**
 * Campos universais — aplicados a todo node além dos específicos do blueprint.
 * Garantem que o prefill IA gere atribuição, plano de execução, critérios e
 * prompts (IA + OpenClaw) para qualquer tipo.
 */
const UNIVERSAL_FIELDS: NodeField[] = [
  { key: "responsible", label: "Responsável", hint: "Quem deve executar (Estratégia, Design, Tráfego, Automação, Conteúdo, Dev, IA/OpenClaw, Cliente)", maxLength: 80 },
  { key: "execution_plan", label: "Plano de execução", hint: "Passos práticos para executar esta etapa: o que fazer, como fazer, ferramentas, saída esperada", minLength: 150, maxLength: 1500 },
  { key: "acceptance_criteria", label: "Critérios de aprovação", hint: "Quando este node pode ser marcado como concluído (com números/marcos verificáveis)", minLength: 60, maxLength: 600 },
  { key: "ai_prompt", label: "Prompt IA", hint: "Prompt pronto pra copiar e usar em ChatGPT/Gemini/Claude para executar esta etapa", minLength: 80, maxLength: 1500 },
  { key: "openclaw_prompt", label: "Prompt OpenClaw", hint: "Instrução para o OpenClaw executar esta etapa dentro do sistema", minLength: 80, maxLength: 1500 },
];

/** Constrói prompt estruturado para a IA preencher o node */
export function buildNodePrompt(intelligence: NodeIntelligence, nodeTitle: string): string {
  const fieldsList = intelligence.fields.map(f =>
    `  "${f.key}": "${f.hint} (${f.minLength ?? 0}-${f.maxLength ?? 2000} caracteres)"`
  ).join(",\n");

  const exampleBlock = intelligence.exampleOutput
    ? `\n\n## EXEMPLO DE RESPOSTA IDEAL (siga esse padrão de profundidade)\n\n\`\`\`json\n${JSON.stringify(intelligence.exampleOutput, null, 2)}\n\`\`\``
    : "";

  return `## ENTREGÁVEL DESTE NODE
Tipo: ${intelligence.deliverableDescription}
Título: ${nodeTitle}

## REGRAS DE QUALIDADE (obrigatórias)
${intelligence.qualityRules.map(r => `- ${r}`).join("\n")}

## FORMATO DE SAÍDA (JSON válido, sem markdown, sem texto fora do JSON)

{
${fieldsList}
}

TODOS os campos acima são obrigatórios e devem vir preenchidos com profundidade. NUNCA retorne campo vazio.
Se faltar contexto específico, use "A DEFINIR com cliente:" e liste 2-3 perguntas.${exampleBlock}`;
}
