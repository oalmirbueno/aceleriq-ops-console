/**
 * promptLibrary — coleção curada de prompts calibrados para cada entregável.
 *
 * Cada prompt tem variáveis {{x}} que são substituídas pelo contexto real do cliente
 * (essential_briefing, plano, nodes concluídos, métricas).
 *
 * Uso: time abre a biblioteca, escolhe o prompt, sistema substitui variáveis,
 * copia pra clipboard → cola no ChatGPT/Claude/Custom GPT → entregável sai 5x mais rápido.
 *
 * Ganho real: reduzir tempo de produção de briefing de 4h → 30min, copy de LP de 3h → 20min.
 */

export type PromptCategory =
  | "briefing"       // Consolidação de briefing e diagnóstico
  | "copywriting"    // Copy de LP, anúncios, email
  | "ai_agents"      // System prompts pra agentes IA
  | "strategy"       // Planos estratégicos e roadmaps
  | "content"        // Conteúdo editorial, social
  | "analysis"       // Análise de resultados e insights
  | "case";          // Narrativa de case e prova social

export interface PromptTemplate {
  id: string;
  category: PromptCategory;
  title: string;
  description: string;
  /** Tempo estimado manual vs com IA — argumento de venda interno */
  timeSaved: string;
  /** Modelo de IA recomendado */
  recommendedModel: "gpt-4" | "gpt-4-turbo" | "gpt-5" | "claude-sonnet-4" | "claude-opus-4" | "gemini-2.5-pro";
  /** Prompt template com {{variables}} */
  template: string;
  /** Lista de variáveis que precisam ser preenchidas */
  variables: string[];
  /** Campo opcional — sugestão de follow-ups depois de rodar */
  followups?: string[];
}

// ═══════════════════════════════════════════════════════════════
// VARIÁVEIS CANÔNICAS — lidas do essential_briefing + workspace
// ═══════════════════════════════════════════════════════════════

export interface PromptVariables {
  // Cliente
  client_name?: string;
  company_name?: string;
  segment?: string;
  plan_name?: string;

  // Briefing essencial
  positioning?: string;
  differential?: string;
  icp?: string;
  main_pains?: string;
  goals_12m?: string;
  success_metric?: string;
  revenue_range?: string;
  team_size?: string;
  maturity_digital?: string;
  ai_readiness?: string;

  // Contexto extra opcional
  specific_goal?: string;
  specific_audience?: string;
  specific_channel?: string;
  extra_context?: string;
}

// ═══════════════════════════════════════════════════════════════
// BIBLIOTECA DE PROMPTS
// ═══════════════════════════════════════════════════════════════

export const PROMPT_LIBRARY: PromptTemplate[] = [

  // ─── BRIEFING ────────────────────────────────────────────────

  {
    id: "brief-consolidate",
    category: "briefing",
    title: "Consolidar Briefing em Dossiê Estruturado",
    description: "Recebe briefing bruto do cliente e devolve um dossiê em 8 blocos estruturados: identidade, oferta, operação, comercial, digital, acessos, diagnóstico, decisões.",
    timeSaved: "4h → 20min",
    recommendedModel: "claude-sonnet-4",
    variables: ["client_name", "positioning", "icp", "main_pains", "goals_12m"],
    template: `Você é consultor sênior de operação digital da Aceleriq.
Sua tarefa: transformar o briefing bruto abaixo em um DOSSIÊ OPERACIONAL estruturado.

CLIENTE: {{client_name}}
POSICIONAMENTO: {{positioning}}
ICP: {{icp}}
DORES PRINCIPAIS: {{main_pains}}
OBJETIVO 12 MESES: {{goals_12m}}

Estruture o dossiê em 8 blocos OBRIGATÓRIOS:

1. **Identidade e Posicionamento** — quem é o cliente, promessa central, concorrência.
2. **Oferta e ICP** — o que vende, para quem, persona detalhada com dores/objeções.
3. **Estrutura Comercial** — funil atual (se houver), CAC estimado, ciclo de venda.
4. **Operação** — processos atuais, pontos de fricção, quem executa o quê.
5. **Estrutura Digital** — canais presentes, métricas disponíveis, gaps.
6. **Acessos e Dependências** — sistemas em uso, integrações, senhas críticas.
7. **Diagnóstico Estrutural** — top 5 gargalos operacionais priorizados por impacto × esforço.
8. **Decisões Estratégicas** — 3 decisões-chave que o cliente precisa tomar nos próximos 30 dias.

REGRAS:
- Use marcação clara: **negrito** para títulos, listas com -, separadores ---
- Se informação faltar, escreva "A DEFINIR" — nunca invente.
- Seja direto e operacional. Sem floreio corporativo.
- Máximo 800 palavras no total.`,
    followups: [
      "Gere 5 perguntas-chave para fechar gaps do dossiê",
      "Liste top 3 frentes operacionais prioritárias para os próximos 30 dias",
    ],
  },

  {
    id: "brief-diagnostic",
    category: "briefing",
    title: "Diagnóstico Estrutural Profundo",
    description: "Gera mapa completo de gargalos operacionais priorizado por impacto × esforço, com plano de ação 90 dias.",
    timeSaved: "6h → 30min",
    recommendedModel: "gpt-5",
    variables: ["company_name", "segment", "main_pains", "revenue_range", "team_size", "maturity_digital"],
    template: `Você é consultor estrutural. Gere diagnóstico operacional profundo deste negócio:

EMPRESA: {{company_name}}
SEGMENTO: {{segment}}
FATURAMENTO: {{revenue_range}}
TIME: {{team_size}}
MATURIDADE DIGITAL: {{maturity_digital}}
DORES DECLARADAS: {{main_pains}}

Entregue:

## Matriz de Gargalos (Impacto × Esforço)

Liste 8-12 gargalos identificados, cada um com:
- Nome do gargalo
- Impacto: Baixo / Médio / Alto / Crítico
- Esforço para resolver: Baixo / Médio / Alto
- Prioridade sugerida (1-5)
- Causa raiz provável

## Top 5 Ações Imediatas (primeiras 2 semanas)

Para cada uma:
- Ação específica
- Responsável sugerido
- Output esperado
- Como medir sucesso

## Plano 30-60-90 dias

Organize as ações em 3 fases:
- Mês 1: fundação (corrigir urgências, estruturar base)
- Mês 2: construção (implementar sistemas, processos)
- Mês 3: ativação (medir, otimizar, escalar)

## Riscos e Dependências

Liste 3 riscos que podem descarrilhar o plano e mitigação.

Seja direto, numérico e acionável. Evite genericidades.`,
  },

  // ─── COPYWRITING ──────────────────────────────────────────────

  {
    id: "copy-landing-page",
    category: "copywriting",
    title: "Copy Completa de Landing Page",
    description: "Gera headline, subheadline, seções, CTAs e objeção-killer. Copy pronto pra colar no Lovable/WordPress/Webflow.",
    timeSaved: "3h → 20min",
    recommendedModel: "claude-opus-4",
    variables: ["company_name", "icp", "main_pains", "differential", "success_metric"],
    template: `Você é copywriter de performance especializado em conversão.
Crie copy completa para uma landing page do cliente abaixo.

EMPRESA: {{company_name}}
DIFERENCIAL: {{differential}}
ICP: {{icp}}
DORES DO ICP: {{main_pains}}
PROMESSA DE RESULTADO: {{success_metric}}

Entregue:

## 1. Headline Principal (primeira dobra)
- Máximo 10 palavras
- Foco no resultado que o ICP quer alcançar
- Evite adjetivos genéricos ("melhor", "incrível")

## 2. Subheadline
- Uma frase que complementa e especifica
- Menciona como chegar ao resultado
- Cria urgência sem ser exagerado

## 3. CTA Principal
- Verbo de ação + benefício claro
- Máximo 5 palavras (ex: "Quero minha consultoria gratuita")

## 4. Proposta de Valor (3 bullets)
- Cada bullet começa com benefício, não feature
- Evite jargões técnicos

## 5. Seção "Como Funciona" (3 passos)
- Linguagem simples
- Foco no resultado de cada passo

## 6. Prova Social (template)
- Estrutura de depoimento ideal pra este ICP
- Tipos de prova que convertem pro segmento

## 7. Objeções e Respostas (FAQ — 5 perguntas)
- Use as dores reais do ICP
- Respostas curtas e diretas

## 8. CTA Final (bottom)
- Versão mais agressiva que o CTA principal
- Cria urgência (escassez, tempo, resultado)

Entregue em Markdown. Não explique o que você fez — só entregue a copy.`,
    followups: [
      "Gere 3 variações da headline para teste A/B",
      "Adapte a copy para um anúncio de tráfego Meta Ads (carrossel de 5 slides)",
    ],
  },

  {
    id: "copy-meta-ads",
    category: "copywriting",
    title: "Anúncios para Meta Ads (Conjunto Completo)",
    description: "Gera 5 criativos diferentes para testar: 3 formatos × 2 hooks × CTA. Pronto pra rodar campanha de teste.",
    timeSaved: "2h → 15min",
    recommendedModel: "gpt-5",
    variables: ["company_name", "icp", "main_pains", "success_metric", "specific_goal"],
    template: `Crie 5 anúncios distintos para Meta Ads (Instagram + Facebook).

CLIENTE: {{company_name}}
ICP: {{icp}}
DORES: {{main_pains}}
PROMESSA: {{success_metric}}
OBJETIVO DA CAMPANHA: {{specific_goal}}

Cada anúncio deve ter:
- **Formato** (Reels / Stories / Carrossel / Imagem única)
- **Hook (primeiros 3 segundos)** — pergunta provocativa, número chocante, ou afirmação polêmica
- **Body** — 2-3 frases desenvolvendo o hook
- **CTA** — ação clara com benefício
- **Copy descrição** (acompanha a mídia) — até 125 caracteres
- **Segmentação sugerida** — interesses, comportamentos

Entregue os 5 anúncios como lista estruturada em Markdown.
Varie o ângulo de cada anúncio (benefício vs medo vs autoridade vs prova social vs comparação).`,
  },

  {
    id: "copy-email-sequence",
    category: "copywriting",
    title: "Sequência de E-mails de Nutrição",
    description: "Gera 7 e-mails de nutrição pós-captura, com timing, assuntos e CTAs encadeados.",
    timeSaved: "4h → 25min",
    recommendedModel: "claude-sonnet-4",
    variables: ["company_name", "icp", "main_pains", "differential", "success_metric"],
    template: `Crie sequência de 7 e-mails de nutrição para leads capturados de {{company_name}}.

ICP: {{icp}}
DORES PRINCIPAIS: {{main_pains}}
DIFERENCIAL: {{differential}}
PROMESSA: {{success_metric}}

Cada e-mail deve ter:
- **Dia envio** (D+0, D+2, D+4, D+7, D+11, D+16, D+22)
- **Assunto** (máximo 50 caracteres, evite spam triggers)
- **Preview** (complementa assunto, 60 caracteres)
- **Corpo** (200-400 palavras, tom conversacional)
- **CTA** (verbo + benefício)
- **P.S.** (linha extra com insight ou proof)

Encadeamento lógico:
1. D+0: Boas-vindas + entrega do material prometido
2. D+2: História pessoal / origem do método
3. D+4: Identificação da dor (sem soluções ainda)
4. D+7: Caso real / prova social
5. D+11: Educacional (conceito-chave do método)
6. D+16: Oferta de conversa (descoberta)
7. D+22: Última chance / quebra de objeção

Entregue em Markdown.`,
  },

  // ─── AGENTES IA ───────────────────────────────────────────────

  {
    id: "agent-whatsapp",
    category: "ai_agents",
    title: "Agente IA para WhatsApp Business",
    description: "System prompt completo para criar Custom GPT / agente WhatsApp que qualifica leads do cliente.",
    timeSaved: "5h → 45min",
    recommendedModel: "gpt-5",
    variables: ["company_name", "icp", "differential", "main_pains", "success_metric"],
    template: `Gere o system prompt completo para um agente de atendimento WhatsApp da empresa {{company_name}}.

CONTEXTO DO NEGÓCIO:
- Empresa: {{company_name}}
- ICP (quem ele atende): {{icp}}
- Diferencial real: {{differential}}
- Dores que resolve: {{main_pains}}
- Promessa: {{success_metric}}

Entregue:

## 1. Identidade
- Nome do agente (sugira 3 opções femininas e 3 masculinas, escolha um padrão)
- Personalidade (3-5 traços)
- Limites ("nunca diga X", "nunca prometa Y")

## 2. Mensagem de Abertura
- Primeira resposta quando alguém escreve pela primeira vez
- Curta (máximo 3 linhas)
- Termina com pergunta aberta para engajar

## 3. Fluxo de Qualificação (5 perguntas)
- Pergunta 1: identificar dor
- Pergunta 2: identificar urgência
- Pergunta 3: identificar budget/capacidade
- Pergunta 4: identificar decisor
- Pergunta 5: confirmar interesse em conversar com humano

## 4. Respostas para Objeções Frequentes
Liste 5 objeções comuns deste ICP e respostas curtas (2-3 linhas cada)

## 5. Regras de Escalação para Humano
- Quando passar para atendente (palavras-chave, contexto)
- Como passar de forma suave ("Vou te conectar com o [nome]...")

## 6. System Prompt Final (completo, pronto pra colar em Custom GPT)
Um bloco de código com o prompt inteiro, 400-600 palavras, usando todas as informações acima.

Regras gerais do agente:
- Nunca invente preços
- Nunca prometa resultados garantidos
- Sempre responde em português do Brasil, tom próximo mas profissional
- Máximo 3 linhas por resposta (é WhatsApp)
- Se perguntarem algo fora do escopo, redireciona educadamente

Entregue em Markdown formatado.`,
    followups: [
      "Gere 10 conversas simuladas de teste do agente",
      "Converta este prompt em instruções de configuração para n8n + OpenAI",
    ],
  },

  {
    id: "agent-sales-insights",
    category: "ai_agents",
    title: "Agente IA — Analista de Pipeline",
    description: "System prompt pra agente que analisa CRM semanalmente e gera insights acionáveis para o time de vendas.",
    timeSaved: "3h → 15min",
    recommendedModel: "claude-opus-4",
    variables: ["company_name", "success_metric"],
    template: `Crie o system prompt completo para um agente IA que roda semanalmente analisando o pipeline de vendas de {{company_name}}.

MÉTRICA PRINCIPAL: {{success_metric}}

Entregue:

## Propósito do Agente
Como ele se apresenta para o time de vendas.

## Input Esperado (estrutura de dados)
- Lista de oportunidades com: etapa, valor, dias na etapa, última atividade, score
- Métricas agregadas: conversão entre etapas, ciclo médio, valor médio
- Comparativo: semana atual vs semana anterior

## Análises que ele deve fazer
1. **Oportunidades em risco** — parados há >X dias, sem atividade
2. **Gargalos de funil** — qual etapa está perdendo mais leads e por quê
3. **Oportunidades quentes** — score alto + engajamento recente = priorizar contato
4. **Tendências de conversão** — está melhorando ou piorando?
5. **Recomendações específicas** — "João deveria ligar pra Maria hoje porque..."

## Formato de Output Semanal
- Título: "📊 Pipeline Report — Semana X"
- Sumário executivo (3 frases)
- Top 5 ações da semana (priorizadas)
- Alertas vermelhos (urgências)
- Oportunidades quentes
- Métrica principal vs meta

## System Prompt Final
Bloco de código completo pra Custom GPT ou agente n8n, 500-800 palavras.

Tom: direto, numérico, priorizado. Sem floreios. Cada insight vem com ação específica.`,
  },

  // ─── ESTRATÉGIA ───────────────────────────────────────────────

  {
    id: "strategy-90days",
    category: "strategy",
    title: "Plano Estratégico 90 Dias",
    description: "Roadmap detalhado por sprint com OKRs, entregáveis semanais, responsáveis e KPIs.",
    timeSaved: "5h → 30min",
    recommendedModel: "claude-opus-4",
    variables: ["company_name", "goals_12m", "success_metric", "revenue_range", "main_pains"],
    template: `Crie plano estratégico 90 dias detalhado para {{company_name}}.

OBJETIVO 12 MESES: {{goals_12m}}
MÉTRICA DE SUCESSO: {{success_metric}}
FATURAMENTO ATUAL: {{revenue_range}}
DORES/DESAFIOS: {{main_pains}}

Entregue:

## Objetivo dos 90 dias (derivado do objetivo 12m)
Uma frase específica e mensurável.

## OKRs (1 Objective + 3 Key Results)
- Objective: estado desejado ao fim dos 90 dias
- KR 1, KR 2, KR 3: resultados mensuráveis que provam o objective

## Roadmap por Sprint (6 sprints de 15 dias cada)

Para cada sprint:
- **Tema** — foco macro do sprint
- **Entregáveis** — 3-5 outputs tangíveis
- **Responsáveis** (Aceleriq / Cliente / Ambos)
- **Riscos** — o que pode travar
- **Métrica de check-in** — como saber se sprint foi bem

## Dependências Críticas
Liste 3-5 dependências que PRECISAM estar resolvidas antes de começar.

## Checkpoints (reuniões recorrentes)
Quais rituais, quando, quem participa, que decisões saem de cada um.

## Orçamento Sugerido (se aplicável)
Estimativa de investimento em ads/ferramentas/pessoas para cada sprint.

## Indicadores de Sucesso Final
Como saberemos, ao fim dos 90 dias, que o plano funcionou?

Entregue em Markdown estruturado e pronto pra apresentar ao cliente.`,
  },

  // ─── CONTEÚDO ─────────────────────────────────────────────────

  {
    id: "content-calendar-30d",
    category: "content",
    title: "Calendário Editorial 30 Dias",
    description: "Calendário completo: 20 posts distribuídos por pilares, formatos, horários e ganchos prontos.",
    timeSaved: "6h → 30min",
    recommendedModel: "gpt-5",
    variables: ["company_name", "icp", "main_pains", "differential", "specific_channel"],
    template: `Crie calendário editorial de 30 dias para {{company_name}}.

CANAL PRINCIPAL: {{specific_channel}}
ICP: {{icp}}
DORES DO ICP: {{main_pains}}
DIFERENCIAL: {{differential}}

Entregue:

## Pilares de Conteúdo (4 pilares)
Para cada pilar:
- Nome do pilar
- % de distribuição (ex: Autoridade 30%, Conexão 25%...)
- Objetivo do pilar
- Tipos de formato que funcionam melhor

## Calendário 30 Dias (20 posts)

Para cada post:
- Dia da semana sugerido
- Horário ótimo
- Pilar
- Formato (Reel / Carrossel / Foto / Story / Live / Thread)
- Tema específico
- Hook (primeiros 3s para vídeo, primeira linha para texto)
- Gancho principal (problema/insight/resultado)
- CTA
- Hashtags sugeridas (5-8)

## Séries de Conteúdo Recorrentes (3 séries)
Propostas de séries semanais que geram engajamento e autoridade.

## Métricas para Acompanhar
Quais KPIs monitorar para saber se o plano está funcionando.

Entregue em formato de tabela Markdown + explicação dos pilares.`,
  },

  {
    id: "content-video-scripts",
    category: "content",
    title: "5 Roteiros de Vídeos Curtos",
    description: "Roteiros prontos pra gravar: hook, body, CTA, duração estimada, trilha sugerida.",
    timeSaved: "3h → 20min",
    recommendedModel: "claude-sonnet-4",
    variables: ["company_name", "icp", "main_pains", "differential"],
    template: `Crie 5 roteiros de vídeos curtos (30-60s) para {{company_name}}.

ICP: {{icp}}
DORES: {{main_pains}}
DIFERENCIAL: {{differential}}

Para cada roteiro:

## Roteiro N
- **Título/Tema**
- **Duração estimada**
- **Hook (0-3s)** — texto exato falado ou escrito na tela
- **Desenvolvimento (3-45s)** — linhas específicas, com timing
- **CTA final (últimos 10s)**
- **Elementos visuais sugeridos** — texto na tela, cortes, b-rolls
- **Estilo de trilha** (energética / emocional / cinematográfica / etc.)
- **Por que este vídeo funciona com o ICP** — psicologia da escolha

Use ângulos variados:
1. Vídeo 1: Contraste expectativa × realidade
2. Vídeo 2: Mito vs verdade do nicho
3. Vídeo 3: Storytelling pessoal
4. Vídeo 4: Passo a passo (how-to)
5. Vídeo 5: Provocação polêmica

Entregue em Markdown pronto pra passar pro produtor de conteúdo.`,
  },

  // ─── ANÁLISE ──────────────────────────────────────────────────

  {
    id: "analysis-results-insights",
    category: "analysis",
    title: "Análise de Resultados → Insights Acionáveis",
    description: "Transforma tabela de métricas em diagnóstico + 5 ações imediatas. Ideal pra QBR e relatório mensal.",
    timeSaved: "2h → 10min",
    recommendedModel: "claude-opus-4",
    variables: ["company_name", "success_metric", "extra_context"],
    template: `Você é analista de dados sênior. Transforme os números abaixo em insights acionáveis.

EMPRESA: {{company_name}}
MÉTRICA PRINCIPAL: {{success_metric}}

DADOS (cole após "DADOS:"):
{{extra_context}}

Entregue:

## Leitura Executiva (3 frases)
Resumo do que os números contam. Destaque a narrativa, não só os números.

## 3 Descobertas Principais
Cada uma com:
- O número (com comparativo)
- O que isso significa operacionalmente
- Por que está acontecendo (hipótese)

## 5 Ações Imediatas (priorizadas)
Cada uma com:
- Ação específica
- Responsável sugerido
- Impacto esperado
- Esforço estimado

## Alertas Vermelhos
Métricas que pioraram e exigem atenção esta semana.

## Próxima Revisão
Quais métricas específicas olhar na próxima reunião e o que deve ter mudado.

Seja direto, numérico e acionável. Evite "parece que" — se não tiver certeza, diga "preciso de mais dados sobre X".`,
  },

  // ─── CASE ─────────────────────────────────────────────────────

  {
    id: "case-polish",
    category: "case",
    title: "Polir Narrativa de Case",
    description: "Recebe draft bruto de case (do Case Generator automático) e devolve versão publicável com storytelling profissional.",
    timeSaved: "3h → 15min",
    recommendedModel: "claude-opus-4",
    variables: ["company_name", "extra_context"],
    template: `Você é copywriter especializado em cases de sucesso.
Transforme o draft bruto abaixo em um case publicável com storytelling profissional.

CLIENTE: {{company_name}}

DRAFT BRUTO:
{{extra_context}}

Entregue:

## Case Polido

Siga esta estrutura narrativa:

### 1. Abertura (gancho)
- Comece com uma cena, número chocante ou pergunta provocativa
- Captura atenção em 5 segundos
- NÃO comece com "A empresa X foi fundada..."

### 2. O Problema (conflito)
- Conte a dor de forma vívida, não listada
- Use analogias quando possível
- Traga sensação de urgência

### 3. A Descoberta (turning point)
- Como eles chegaram na Aceleriq?
- O que viram de diferente?
- Qual insight mudou tudo?

### 4. A Jornada (transformação)
- Conte o "como" em 3-5 passos narrativos
- Cada passo é uma mini vitória
- Mantenha o leitor curioso pra próxima

### 5. Os Números (validação)
- Insira os dados do before/after em contexto
- Explique o que cada número significa
- Destaque o ganho composto (1+1=3)

### 6. Lição Universal (transferível)
- O que OUTROS negócios podem aprender com isso?
- Universaliza a solução

### 7. Call to Action Orgânico
- Convida pra próxima conversa
- Sem ser comercial agressivo

TOM: confiante mas humilde, narrativo mas direto, ancorado em números mas humano.

Entregue o case em Markdown, 800-1500 palavras.`,
    followups: [
      "Crie uma versão resumida (200 palavras) para LinkedIn",
      "Gere 5 headlines para publicar este case",
    ],
  },
];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

/** Substitui variáveis {{x}} no template pelos valores reais */
export function renderPrompt(template: PromptTemplate, vars: PromptVariables): string {
  let result = template.template;
  for (const key of template.variables) {
    const value = (vars[key as keyof PromptVariables] as string) ?? `[${key.toUpperCase()} — preencher]`;
    result = result.replaceAll(`{{${key}}}`, value);
  }
  // Substitui variáveis extras se foram passadas mas não declaradas
  Object.entries(vars).forEach(([k, v]) => {
    if (typeof v === "string" && v.length > 0) {
      result = result.replaceAll(`{{${k}}}`, v);
    }
  });
  return result;
}

/** Retorna quais variáveis estão preenchidas e quais faltam */
export function analyzePromptVariables(template: PromptTemplate, vars: PromptVariables): {
  filled: string[];
  missing: string[];
  completeness: number;
} {
  const filled: string[] = [];
  const missing: string[] = [];
  for (const key of template.variables) {
    const v = vars[key as keyof PromptVariables];
    if (typeof v === "string" && v.trim().length > 0) filled.push(key);
    else missing.push(key);
  }
  const completeness = template.variables.length > 0
    ? Math.round((filled.length / template.variables.length) * 100)
    : 100;
  return { filled, missing, completeness };
}

export const CATEGORY_META: Record<PromptCategory, { label: string; color: string }> = {
  briefing:    { label: "Briefing & Diagnóstico", color: "#60A5FA" },
  copywriting: { label: "Copywriting",             color: "#F472B6" },
  ai_agents:   { label: "Agentes IA",              color: "#06B6D4" },
  strategy:    { label: "Estratégia & Plano",      color: "#10B981" },
  content:     { label: "Conteúdo",                color: "#FB923C" },
  analysis:    { label: "Análise de Dados",        color: "#A78BFA" },
  case:        { label: "Case & Prova Social",     color: "#F59E0B" },
};
