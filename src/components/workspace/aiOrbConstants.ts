import type { AiOrbType } from "./AiOrbNode";
import type { AceleraStageKey, ProjectNodeKind } from "./canvasProjectTypes";

export type AiEngine = "internal" | "gpt_external" | "claude_api" | "custom";
export type AiOrbContextSource = "briefing" | "context" | "metrics" | "fronts" | "assets" | "dossier" | "tasks" | "siblings";

export interface AiOrbMemoryEntry {
  timestamp: string;
  action: "generated" | "refined" | "connected" | "feedback";
  insight: string;
  sourceNodeId?: string;
  metricsSnapshot?: Record<string, number>;
}

export interface AiOrbData extends Record<string, unknown> {
  kind: "ai_orb";
  orbType: AiOrbType;
  orbLabel: string;
  specialization: string;
  aiEngine: AiEngine;
  aiModel?: string;
  gptEndpoint?: string;
  customWebhookUrl?: string;
  isGenerating: boolean;
  lastGeneratedAt?: string;
  generationCount: number;
  lastError?: string;
  systemPrompt?: string;
  temperature: number;
  focusAreas: string[];
  contextSources: AiOrbContextSource[];
  generatedNodeIds: string[];
  memory: AiOrbMemoryEntry[];
}

export interface AiOrbGeneratedNodeSpec {
  ref: string;
  kind: ProjectNodeKind;
  stage: AceleraStageKey;
  title: string;
  description: string;
}

export interface AiOrbGeneratedEdgeSpec {
  fromRef: string;
  toRef: string;
  label?: string | null;
}

export interface AiOrbDefinition {
  type: AiOrbType;
  label: string;
  specialization: string;
  focusAreas: string[];
  contextSources: AiOrbContextSource[];
  hint: string;
  systemPrompt: string;
  fallbackNodes: AiOrbGeneratedNodeSpec[];
  fallbackEdges: AiOrbGeneratedEdgeSpec[];
}

const ORB_FRAMEWORKS = `Frameworks internos: OKR, ICE/RICE, Jobs To Be Done, Business Model Canvas, Value Proposition Canvas, Lean Startup, AARRR, North Star Metric, StoryBrand, SOP, Kanban, PDCA, PAS e AIDA. Não cite frameworks como decoração: traduza em recomendações operacionais simples, acionáveis e auditáveis.`;

export const AI_ORB_DEFINITIONS: Record<AiOrbType, AiOrbDefinition> = {
  planner: {
    type: "planner",
    label: "Planejar",
    specialization: "plano operacional",
    focusAreas: ["OKRs", "roadmap 90 dias", "priorização"],
    contextSources: ["briefing", "context", "metrics", "fronts", "dossier", "siblings"],
    hint: "Foco em planejamento estratégico com OKRs, roadmap de 90 dias e priorização por impacto × esforço.",
    systemPrompt: `Você é consultor sênior de estratégia empresarial e operações digitais. ${ORB_FRAMEWORKS}
Regras: objetivos SMART; quick wins nos primeiros 30 dias; plano em sprints 0-30, 30-60 e 60-90; cada frente com hipótese, métrica e risco; classificar escopo; se faltar informação, declarar lacuna sem inventar.`,
    fallbackNodes: [
      { ref: "okr", kind: "objetivo", stage: "entrada", title: "OKRs operacionais", description: "Objetivos SMART e resultados-chave que orientam a operação." },
      { ref: "plan", kind: "documento", stage: "planejamento", title: "Plano Operacional 90 dias", description: "Roadmap dividido em fundação, construção e ativação." },
      { ref: "sprint1", kind: "checklist", stage: "planejamento", title: "Sprint 1 — Fundação", description: "Quick wins e dependências críticas dos primeiros 30 dias." },
    ],
    fallbackEdges: [{ fromRef: "okr", toRef: "plan", label: "orienta" }, { fromRef: "plan", toRef: "sprint1", label: "executa" }],
  },
  docs: {
    type: "docs",
    label: "Docs",
    specialization: "BMC · ICP · SOP",
    focusAreas: ["BMC", "ICP", "SOP", "processos"],
    contextSources: ["briefing", "context", "dossier", "siblings"],
    hint: "Foco em documentação estrutural: BMC, ICP, persona, processos, SOP e lacunas documentais.",
    systemPrompt: `Você é especialista em estruturação empresarial e documentação operacional. ${ORB_FRAMEWORKS}
Regras: documentos autocontidos; usar contexto real; ICP com dores, gatilhos, objeções e canais; SOP com trigger, passos, responsável, output e exceções; linguagem profissional e acessível.`,
    fallbackNodes: [
      { ref: "bmc", kind: "documento", stage: "diagnostico", title: "Business Model Canvas", description: "Modelo de negócio estruturado nos blocos essenciais." },
      { ref: "icp", kind: "documento", stage: "diagnostico", title: "ICP — Cliente Ideal", description: "Perfil de cliente ideal, dores, gatilhos e objeções." },
      { ref: "sop", kind: "documento", stage: "estrutura_base", title: "SOP — Processos Padrão", description: "Processos padrão com responsáveis, outputs e exceções." },
    ],
    fallbackEdges: [{ fromRef: "bmc", toRef: "icp", label: "segmenta" }, { fromRef: "icp", toRef: "sop", label: "estrutura" }],
  },
  content: {
    type: "content",
    label: "Conteúdo",
    specialization: "copy · calendário",
    focusAreas: ["pilares", "copy", "calendário", "CTA"],
    contextSources: ["briefing", "context", "assets", "dossier", "siblings"],
    hint: "Foco em calendário editorial, pilares de conteúdo, copy, headlines, CTAs e canais de ativação.",
    systemPrompt: `Você é diretor de conteúdo e estrategista de growth marketing. ${ORB_FRAMEWORKS}
Regras: mix de canais e formatos; cada peça com hook, corpo e CTA; headlines específicas; usar dados reais sem inventar números; adaptar tom por canal.`,
    fallbackNodes: [
      { ref: "pillars", kind: "conteudo", stage: "planejamento", title: "Pilares de Conteúdo", description: "Pilares temáticos conectados ao posicionamento do cliente." },
      { ref: "calendar", kind: "conteudo", stage: "producao", title: "Calendário Editorial — Mês 1", description: "Plano de publicações priorizado para ativação inicial." },
      { ref: "social", kind: "social", stage: "ativacao", title: "Estratégia Instagram", description: "Distribuição social com formatos, hooks e CTAs." },
    ],
    fallbackEdges: [{ fromRef: "pillars", toRef: "calendar", label: "desdobra" }, { fromRef: "calendar", toRef: "social", label: "ativa" }],
  },
  tech: {
    type: "tech",
    label: "Tech",
    specialization: "n8n · integrações",
    focusAreas: ["n8n", "integrações", "agentes", "CRM"],
    contextSources: ["briefing", "context", "fronts", "assets", "siblings"],
    hint: "Foco em automações, integrações, agentes IA, CRM e ROI operacional.",
    systemPrompt: `Você é arquiteto de automação e sistemas inteligentes. ${ORB_FRAMEWORKS}
Regras: cada automação com trigger, flow, output e fallback; estimar ROI em horas/mês; priorizar trabalho humano repetitivo; nunca expor API keys no frontend.`,
    fallbackNodes: [
      { ref: "onboarding", kind: "automacao", stage: "producao", title: "Fluxo de Onboarding Automático", description: "Automação para reduzir handoffs manuais no início da operação." },
      { ref: "agent", kind: "ia", stage: "producao", title: "Agente de Atendimento", description: "Agente com base de conhecimento, regras de escalação e métricas." },
      { ref: "crm", kind: "crm", stage: "otimizacao", title: "Pipeline Comercial", description: "Etapas, campos obrigatórios e follow-ups automatizados." },
    ],
    fallbackEdges: [{ fromRef: "onboarding", toRef: "agent", label: "aciona" }, { fromRef: "agent", toRef: "crm", label: "registra" }],
  },
  proof: {
    type: "proof",
    label: "Provas",
    specialization: "KPI · case",
    focusAreas: ["KPIs", "baseline", "before/after", "case"],
    contextSources: ["metrics", "assets", "context", "dossier", "siblings"],
    hint: "Foco em medição, baseline, evidências before/after, dashboard e case de sucesso.",
    systemPrompt: `Você é analista de dados e estrategista de growth obcecado por evidências. ${ORB_FRAMEWORKS}
Regras: toda métrica com fórmula, fonte, frequência, meta e baseline; sem baseline não há prova; cases com números reais; dashboard acionável.`,
    fallbackNodes: [
      { ref: "kpis", kind: "metrica", stage: "otimizacao", title: "North Star + KPIs Primários", description: "Árvore de métricas conectada aos objetivos do cliente." },
      { ref: "baseline", kind: "metrica", stage: "diagnostico", title: "Baseline — Estado Atual", description: "Registro do ponto de partida antes das intervenções." },
      { ref: "case", kind: "case", stage: "expansao", title: "Case de Sucesso — Template", description: "Estrutura de narrativa baseada em contexto, desafio, solução e resultado." },
    ],
    fallbackEdges: [{ fromRef: "baseline", toRef: "kpis", label: "mede" }, { fromRef: "kpis", toRef: "case", label: "comprova" }],
  },
  full: {
    type: "full",
    label: "Tudo",
    specialization: "esteira completa",
    focusAreas: ["fundação", "estratégia", "construção", "conteúdo", "prova"],
    contextSources: ["briefing", "context", "metrics", "fronts", "assets", "dossier", "tasks", "siblings"],
    hint: "Foco em esteira operacional completa: fundação, estratégia, construção, conteúdo, ativação e prova.",
    systemPrompt: `Você é o COO virtual da Aceleriq, responsável por orquestrar a operação completa. ${ORB_FRAMEWORKS}
Regras: sequência executável sem dependências circulares; adaptar ao plano Starter/Growth/Enterprise; checkpoints entre fases; último node sempre orientado a case/prova de sucesso.`,
    fallbackNodes: [
      { ref: "brief", kind: "briefing", stage: "entrada", title: "Briefing operacional", description: "Entrada central para consolidar objetivos, contexto e restrições." },
      { ref: "plan", kind: "documento", stage: "planejamento", title: "Resumo Operacional", description: "Overview da esteira completa e decisões de execução." },
      { ref: "build", kind: "resultado", stage: "producao", title: "Entrega principal", description: "Primeiro output operacional de maior impacto." },
      { ref: "proof", kind: "case", stage: "expansao", title: "Case de sucesso", description: "Destino final da operação: prova reutilizável de resultado." },
    ],
    fallbackEdges: [{ fromRef: "brief", toRef: "plan", label: "base" }, { fromRef: "plan", toRef: "build", label: "executa" }, { fromRef: "build", toRef: "proof", label: "prova" }],
  },
};

export const AI_ORBS = Object.values(AI_ORB_DEFINITIONS).map(({ type, label, specialization }) => ({ type, label, specialization }));

export function createAiOrbData(orbType: AiOrbType): AiOrbData {
  const def = AI_ORB_DEFINITIONS[orbType] ?? AI_ORB_DEFINITIONS.planner;
  return {
    kind: "ai_orb",
    orbType,
    orbLabel: def.label,
    specialization: def.specialization,
    aiEngine: "internal",
    aiModel: "internal",
    isGenerating: false,
    generationCount: 0,
    temperature: 0.3,
    focusAreas: def.focusAreas,
    contextSources: def.contextSources,
    generatedNodeIds: [],
    memory: [],
  };
}