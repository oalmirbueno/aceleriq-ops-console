/**
 * Operational Plan Engine — translates Dossiê into structured operational plan.
 *
 * Reads reviewed signals, plan, and scope to produce:
 * 1. Diagnostic reading (5 axes)
 * 2. Operational fronts with scope classification
 * 3. Task suggestions derived from fronts
 *
 * No AI dependency. All rules are explicit and auditable.
 */

import { type ScopeClassification } from "./aceleraConstants";
import { SIGNAL_LABELS, type SignalBlockKey } from "./briefingSignals";
import { ENTERPRISE_SIGNAL_LABELS, ENTERPRISE_SIGNAL_TO_DOSSIER } from "./enterpriseStructuringBlocks";
import { AUTOMATION_SIGNAL_LABELS, AUTOMATION_SIGNAL_TO_DOSSIER } from "./automationBlocks";

/* ─── Types ─── */

export interface ReviewedSignal {
  key: string;
  label: string;
  summary: string;
  dossierBlock: string;
  source: "essential" | "enterprise_structuring" | "ai_automation" | string;
  contextEntryId?: string;
}

export interface DiagnosticAxis {
  label: string;
  key: string;
  items: string[];
}

export interface OperationalFront {
  key: string;
  name: string;
  objective: string;
  signals: string[];
  dossierBlocks: string[];
  priority: "high" | "medium" | "low";
  scopeClassification: ScopeClassification;
  stage: string;
  retained: boolean; // true = not a task, just opportunity/future
  retainedReason?: string;
}

export interface SignalSource {
  signal_key: string;
  briefing_kind: string;
  context_entry_id?: string;
}

export interface ActionPlan {
  what: string;       // O que fazer
  how: string;        // Como fazer
  where: string;      // Onde executar / ferramentas / plataformas
  recommendations: string; // Recomendações operacionais
  deliverables: string;    // Entregáveis esperados
}

export interface DerivedTask {
  title: string;
  description: string;
  priority: string;
  stage: string;
  frontKey: string;
  frontName: string;
  dossierBlock: string;
  signalKeys: string[];
  signalSources: SignalSource[];
  scopeClassification: ScopeClassification;
  operationalReason: string;
  actionPlan: ActionPlan;
}

export interface OperationalPlan {
  diagnostic: DiagnosticAxis[];
  fronts: OperationalFront[];
  tasks: DerivedTask[];
  retained: OperationalFront[];
}

/* ─── Signal label resolver ─── */

function resolveSignalLabel(key: string): string {
  return SIGNAL_LABELS[key as SignalBlockKey]
    ?? ENTERPRISE_SIGNAL_LABELS[key]
    ?? AUTOMATION_SIGNAL_LABELS[key]
    ?? key;
}

function resolveSignalDossierBlock(key: string, explicitBlock?: string): string {
  if (explicitBlock) return explicitBlock;
  return (ENTERPRISE_SIGNAL_TO_DOSSIER[key]
    ?? AUTOMATION_SIGNAL_TO_DOSSIER[key]
    ?? "identity");
}

/* ─── Extract reviewed signals from briefing metadata ─── */

export function extractReviewedSignals(
  briefings: Array<{ id?: string; metadata: Record<string, unknown> | null }>
): ReviewedSignal[] {
  const signals: ReviewedSignal[] = [];

  for (const b of briefings) {
    const meta = b.metadata;
    if (!meta) continue;
    if (meta.import_review_status !== "reviewed") continue;

    const structured = meta.structured_signals as Record<string, { summary: string; dossier_block: string }> | undefined;
    if (!structured) continue;

    const kind = (meta.briefing_kind as string) ?? "essential";

    for (const [key, entry] of Object.entries(structured)) {
      signals.push({
        key,
        label: resolveSignalLabel(key),
        summary: entry.summary ?? "",
        dossierBlock: resolveSignalDossierBlock(key, entry.dossier_block),
        source: kind,
        contextEntryId: b.id,
      });
    }
  }

  return signals;
}

/* ─── Diagnostic builder (5 axes) ─── */

const DIAGNOSTIC_AXES: Array<{
  key: string;
  label: string;
  dossierBlocks: string[];
  signalKeys: string[];
}> = [
  {
    key: "current_structure",
    label: "Estrutura Atual",
    dossierBlocks: ["identity", "offer", "commercial", "operational"],
    signalKeys: ["identity", "offer", "icp_persona", "company_moment", "revenue_model",
      "commercial_structure", "operational_structure", "current_operations"],
  },
  {
    key: "main_bottlenecks",
    label: "Gargalos Principais",
    dossierBlocks: ["diagnostic"],
    signalKeys: ["pain_points", "diagnosis", "process_gaps", "bottlenecks", "ai_readiness"],
  },
  {
    key: "declared_priorities",
    label: "Prioridades Declaradas",
    dossierBlocks: ["decisions"],
    signalKeys: ["priorities", "goals", "priority_constraints", "scaling_vision"],
  },
  {
    key: "dependencies_gaps",
    label: "Dependências e Lacunas",
    dossierBlocks: ["access"],
    signalKeys: ["accesses", "gaps", "access_dependencies", "internal_tools", "tools_stack"],
  },
  {
    key: "mapped_opportunities",
    label: "Oportunidades Mapeadas",
    dossierBlocks: ["decisions", "digital"],
    signalKeys: ["structuring_opportunities", "automation_opportunities",
      "content_marketing", "sales_pipeline", "customer_journey", "digital_operation"],
  },
];

export function buildDiagnostic(signals: ReviewedSignal[]): DiagnosticAxis[] {
  const axes: DiagnosticAxis[] = [];

  for (const axis of DIAGNOSTIC_AXES) {
    const items: string[] = [];
    for (const sig of signals) {
      if (axis.signalKeys.includes(sig.key) || axis.dossierBlocks.includes(sig.dossierBlock)) {
        const raw = sig.summary ?? "";
        const snippet = raw.length > 150 ? raw.slice(0, 150) + "…" : raw;
        items.push(`${sig.label}: ${snippet}`);
      }
    }
    axes.push({ key: axis.key, label: axis.label, items });
  }

  return axes;
}

/* ─── Plan-based scope classification ─── */

interface FrontDef {
  key: string;
  name: string;
  objective: string;
  triggerSignals: string[];
  triggerDossierBlocks: string[];
  stage: string;
  planScope: Record<string, ScopeClassification>;
  focusAreas: string[];
}

const FRONT_DEFINITIONS: FrontDef[] = [
  {
    key: "commercial",
    name: "Estrutura Comercial",
    objective: "Montar ou otimizar funil de aquisição e processo de vendas.",
    triggerSignals: ["commercial_structure", "sales_pipeline", "icp_persona", "offer", "revenue_model"],
    triggerDossierBlocks: ["commercial", "offer"],
    stage: "estrutura_base",
    planScope: { starter: "conditional", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["commercial"],
  },
  {
    key: "operational",
    name: "Estrutura Operacional",
    objective: "Organizar fluxo de entrega, processos e papéis.",
    triggerSignals: ["operational_structure", "process_gaps", "team_roles", "current_operations", "customer_journey"],
    triggerDossierBlocks: ["operational"],
    stage: "estrutura_base",
    planScope: { starter: "conditional", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["systems", "strategy"],
  },
  {
    key: "digital",
    name: "Operação Digital",
    objective: "Estruturar presença digital, canais e métricas.",
    triggerSignals: ["digital_operation", "content_marketing", "data_management", "tools_stack"],
    triggerDossierBlocks: ["digital"],
    stage: "producao",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["marketing", "website", "seo"],
  },
  {
    key: "access",
    name: "Acessos e Dependências",
    objective: "Coletar, validar e organizar acessos críticos.",
    triggerSignals: ["accesses", "access_dependencies", "internal_tools", "gaps"],
    triggerDossierBlocks: ["access"],
    stage: "entrada",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["systems", "security"],
  },
  {
    key: "automation",
    name: "Automação Prioritária",
    objective: "Implantar automações de maior impacto.",
    triggerSignals: ["automation_opportunities", "bottlenecks", "ai_readiness", "priorities"],
    triggerDossierBlocks: [],
    stage: "producao",
    planScope: { starter: "addon", growth: "conditional", enterprise: "in_plan" },
    focusAreas: ["ai", "systems"],
  },
  {
    key: "documentation",
    name: "Documentação e Processos",
    objective: "Documentar processos, identidade e operação.",
    triggerSignals: ["identity", "company_moment", "goals"],
    triggerDossierBlocks: ["identity"],
    stage: "planejamento",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["branding", "strategy"],
  },
  {
    key: "technical",
    name: "Implantação Técnica",
    objective: "Configurar ferramentas, integrações e infraestrutura.",
    triggerSignals: ["tools_stack", "internal_tools", "data_management"],
    triggerDossierBlocks: [],
    stage: "producao",
    planScope: { starter: "addon", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["systems", "security"],
  },
  {
    key: "activation",
    name: "Ativação Inicial",
    objective: "Primeira ativação com entregáveis visíveis.",
    triggerSignals: ["scaling_vision", "growth_readiness", "communication_channels"],
    triggerDossierBlocks: [],
    stage: "ativacao",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["marketing", "commercial", "website"],
  },
  {
    key: "diagnostic_deep",
    name: "Diagnóstico Aprofundado",
    objective: "Investigar lacunas antes de planejar próximos passos.",
    triggerSignals: ["diagnosis", "pain_points", "process_gaps", "bottlenecks"],
    triggerDossierBlocks: ["diagnostic"],
    stage: "diagnostico",
    planScope: { starter: "conditional", growth: "in_plan", enterprise: "in_plan" },
    focusAreas: ["strategy", "systems", "ai"],
  },
];

const SCOPE_RETAINED: ScopeClassification[] = ["conditional", "addon", "standalone", "extra_cost"];

/* ─── Scope → Bucket mapping ─── */

/**
 * Maps scope classification to the correct bucket_status.
 * - in_plan → active (execute now)
 * - conditional → conditional (needs operator confirmation)
 * - addon / standalone / extra_cost → out_of_scope (not in current plan)
 * - future is NEVER assigned by default — reserved for explicit future scheduling
 */
export function scopeToBucket(scope: ScopeClassification): "active" | "conditional" | "future" | "out_of_scope" {
  switch (scope) {
    case "in_plan": return "active";
    case "conditional": return "conditional";
    case "addon":
    case "standalone":
    case "extra_cost": return "out_of_scope";
    default: return "out_of_scope";
  }
}

function resolveScopeForPlan(front: FrontDef, planName: string | null): ScopeClassification {
  const plan = planName ?? "starter";
  return front.planScope[plan] ?? "addon";
}

export function buildOperationalFronts(
  signals: ReviewedSignal[],
  planName: string | null,
  focusAreas?: string[] | null
): { fronts: OperationalFront[]; retained: OperationalFront[] } {
  const signalKeys = new Set(signals.map((s) => s.key));
  const dossierBlocks = new Set(signals.map((s) => s.dossierBlock));
  const hasFocusFilter = focusAreas && focusAreas.length > 0;

  const fronts: OperationalFront[] = [];
  const retained: OperationalFront[] = [];

  for (const def of FRONT_DEFINITIONS) {
    // If focus areas are set, skip fronts that don't match any
    if (hasFocusFilter && !def.focusAreas.some((fa) => focusAreas.includes(fa))) continue;

    // Check if this front has enough signal support
    const matchingSignals = def.triggerSignals.filter((k) => signalKeys.has(k));
    const matchingBlocks = def.triggerDossierBlocks.filter((k) => dossierBlocks.has(k));

    if (matchingSignals.length === 0 && matchingBlocks.length === 0) continue;

    const scope = resolveScopeForPlan(def, planName);
    const isRetained = SCOPE_RETAINED.includes(scope);

    const priority: "high" | "medium" | "low" =
      matchingSignals.length >= 3 ? "high" :
      matchingSignals.length >= 1 ? "medium" : "low";

    const front: OperationalFront = {
      key: def.key,
      name: def.name,
      objective: def.objective,
      signals: matchingSignals,
      dossierBlocks: [...new Set([...matchingBlocks, ...matchingSignals.map((k) => {
        const sig = signals.find((s) => s.key === k);
        return sig?.dossierBlock ?? "";
      }).filter(Boolean)])],
      priority,
      scopeClassification: scope,
      stage: def.stage,
      retained: isRetained,
      retainedReason: isRetained
        ? scope === "conditional"
          ? "Condicional — requer confirmação do operador para virar task."
          : `Classificado como ${scope} — não incluído na execução automática.`
        : undefined,
    };

    if (isRetained) {
      retained.push(front);
    } else {
      fronts.push(front);
    }
  }

  // Sort fronts by execution order
  const stageOrder = ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"];
  const sortByStage = (a: OperationalFront, b: OperationalFront) =>
    stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);

  fronts.sort(sortByStage);
  retained.sort(sortByStage);

  return { fronts, retained };
}

/* ─── Task derivation from fronts ─── */

interface TaskTemplate {
  frontKey: string;
  title: (front: OperationalFront, signals: ReviewedSignal[]) => string;
  description: (front: OperationalFront, signals: ReviewedSignal[]) => string;
  actionPlan: (front: OperationalFront, signals: ReviewedSignal[]) => ActionPlan;
  priority: string;
  condition?: (front: OperationalFront, signals: ReviewedSignal[]) => boolean;
}

function getFrontSignals(front: OperationalFront, allSignals: ReviewedSignal[]): ReviewedSignal[] {
  return allSignals.filter((s) => front.signals.includes(s.key));
}

function signalSnippet(signals: ReviewedSignal[], maxLen = 200): string {
  if (signals.length === 0) return "";
  const raw = signals[0]?.summary ?? "";
  return raw.length > maxLen ? raw.slice(0, maxLen) + "…" : raw;
}

function signalContext(signals: ReviewedSignal[]): string {
  return signals.map((s) => `• ${s.label}: ${s.summary ?? ""}`).join("\n");
}

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    frontKey: "access",
    title: () => "Coletar e validar acessos pendentes",
    description: (f, sigs) => `Levantar, solicitar e validar todos os acessos necessários para operação.\n\nContexto dos sinais:\n${signalContext(getFrontSignals(f, sigs))}`,
    priority: "high",
    actionPlan: (f, sigs) => ({
      what: "Mapear todos os acessos necessários (plataformas, ferramentas, contas, domínios, redes sociais, analytics) e garantir que estejam funcionais e com permissões corretas.",
      how: "1. Listar acessos identificados nos sinais do briefing\n2. Enviar checklist ao cliente via e-mail ou formulário\n3. Validar cada acesso recebido (login, permissões, 2FA)\n4. Documentar status de cada acesso no contexto do workspace",
      where: "Google Workspace, Meta Business Suite, Google Analytics, Google Search Console, ferramentas de automação do cliente, domínios e hospedagem.",
      recommendations: "Priorizar acessos bloqueantes para outras frentes. Solicitar acessos de administrador sempre que possível. Documentar senhas em gerenciador seguro compartilhado.",
      deliverables: "• Checklist de acessos com status (obtido/pendente/bloqueado)\n• Acessos validados e documentados\n• Comunicação formal ao cliente sobre pendências",
    }),
  },
  {
    frontKey: "diagnostic_deep",
    title: () => "Completar diagnóstico operacional aprofundado",
    description: (f, sigs) => `Investigar lacunas operacionais e gargalos antes de definir plano de ação.\n\nContexto dos sinais:\n${signalContext(getFrontSignals(f, sigs))}`,
    priority: "high",
    actionPlan: (f, sigs) => ({
      what: "Realizar análise completa do estado atual da operação do cliente, identificando gargalos, lacunas de processo e oportunidades de melhoria.",
      how: "1. Revisar todos os sinais do Dossiê relacionados a dores e diagnóstico\n2. Mapear processos atuais vs. processos ideais\n3. Identificar dependências entre áreas\n4. Classificar gargalos por impacto e urgência\n5. Documentar findings no Dossiê",
      where: "Análise interna no workspace, reunião de alinhamento com cliente se necessário, ferramentas de mapeamento de processos.",
      recommendations: "Não avançar para execução sem diagnóstico completo. Priorizar gargalos que impactam receita diretamente. Validar findings com o cliente antes de planejar ações.",
      deliverables: "• Mapa de gargalos classificados por impacto\n• Relatório de diagnóstico operacional\n• Recomendações priorizadas para próximas etapas",
    }),
  },
  {
    frontKey: "documentation",
    title: () => "Documentar identidade, posicionamento e processos",
    description: () => "Formalizar identidade do cliente, proposta de valor, posicionamento e processos-chave com base nos sinais revisados.",
    priority: "medium",
    actionPlan: () => ({
      what: "Criar documentação estruturada da identidade do cliente, posicionamento de mercado, proposta de valor e processos operacionais principais.",
      how: "1. Consolidar sinais de identidade e oferta do Dossiê\n2. Redigir documento de posicionamento (quem é, o que faz, para quem, diferencial)\n3. Mapear processos-chave de entrega e atendimento\n4. Validar documentação com o cliente",
      where: "Documento interno no workspace, Google Docs ou Notion para compartilhar com cliente.",
      recommendations: "Usar linguagem do próprio cliente sempre que possível. Documentação deve ser referência viva, não arquivo morto. Atualizar conforme operação evolui.",
      deliverables: "• Documento de identidade e posicionamento\n• Mapa de processos operacionais\n• Proposta de valor formalizada",
    }),
  },
  {
    frontKey: "commercial",
    title: () => "Estruturar funil e processo comercial",
    description: (f, sigs) => `Montar ou otimizar funil de aquisição e processo de vendas completo.\n\nContexto dos sinais:\n${signalContext(getFrontSignals(f, sigs))}`,
    priority: "high",
    actionPlan: (f, sigs) => ({
      what: "Definir ou reestruturar o funil comercial do cliente — da atração ao fechamento — incluindo etapas, critérios de qualificação e automações.",
      how: "1. Definir ICP (perfil de cliente ideal) com base nos sinais\n2. Mapear etapas do funil (atração → qualificação → proposta → fechamento)\n3. Definir critérios de passagem entre etapas\n4. Configurar CRM ou ferramenta de gestão comercial\n5. Criar templates de proposta e follow-up",
      where: "CRM do cliente (HubSpot, Pipedrive, RD Station, ou equivalente), planilhas de controle se não houver CRM.",
      recommendations: "Começar simples e evoluir. Funil complexo demais no início gera abandono. Automatizar follow-up desde o primeiro dia. Definir métricas de conversão por etapa.",
      deliverables: "• Funil comercial documentado com etapas e critérios\n• CRM configurado com pipeline\n• Templates de proposta e follow-up\n• Métricas de acompanhamento definidas",
    }),
  },
  {
    frontKey: "operational",
    title: () => "Organizar fluxo de entrega e operação",
    description: (f, sigs) => `Estruturar processos de entrega, papéis e fluxos operacionais.\n\nContexto dos sinais:\n${signalContext(getFrontSignals(f, sigs))}`,
    priority: "high",
    actionPlan: (f, sigs) => ({
      what: "Organizar a operação de entrega do cliente — definir fluxos, responsabilidades, prazos e pontos de controle.",
      how: "1. Mapear fluxo atual de entrega (do pedido ao pós-venda)\n2. Identificar etapas sem dono ou sem prazo\n3. Definir responsabilidades claras por etapa\n4. Criar checklist operacional por tipo de entrega\n5. Implementar rotina de acompanhamento",
      where: "Ferramenta de gestão de projetos (Asana, Trello, ClickUp, Notion), reuniões de alinhamento operacional.",
      recommendations: "Priorizar processos que mais geram retrabalho ou reclamação. Não tentar organizar tudo de uma vez — começar pelo processo principal de entrega. Criar SOPs progressivamente.",
      deliverables: "• Fluxo de entrega documentado\n• Matriz de responsabilidades (RACI)\n• Checklist operacional por tipo de entrega\n• Rotina de acompanhamento definida",
    }),
  },
  {
    frontKey: "digital",
    title: () => "Implantar estrutura de operação digital",
    description: (f, sigs) => `Organizar presença digital, canais, métricas e operação online.\n\nContexto dos sinais:\n${signalContext(getFrontSignals(f, sigs))}`,
    priority: "medium",
    actionPlan: (f, sigs) => ({
      what: "Estruturar a presença digital do cliente — canais, conteúdo, métricas e ferramentas — de forma integrada e rastreável.",
      how: "1. Auditar presença digital atual (site, redes, Google, e-mail)\n2. Definir canais prioritários com base no ICP\n3. Configurar analytics e rastreamento\n4. Criar calendário editorial básico\n5. Configurar ferramentas de automação de marketing",
      where: "Google Analytics, Google Search Console, Meta Business, Instagram, LinkedIn, ferramenta de e-mail marketing, site do cliente.",
      recommendations: "Focar nos canais onde o público-alvo realmente está. Não abrir todos os canais ao mesmo tempo. Garantir rastreamento antes de investir em tráfego.",
      deliverables: "• Auditoria de presença digital\n• Canais prioritários definidos e configurados\n• Analytics e rastreamento implementados\n• Calendário editorial inicial",
    }),
  },
  {
    frontKey: "technical",
    title: () => "Configurar ferramentas, integrações e infraestrutura",
    description: (f, sigs) => `Implantar stack técnica necessária para operação.\n\nContexto dos sinais:\n${signalContext(getFrontSignals(f, sigs))}`,
    priority: "medium",
    actionPlan: (f, sigs) => ({
      what: "Configurar e integrar as ferramentas técnicas necessárias para a operação do cliente funcionar de forma conectada.",
      how: "1. Levantar ferramentas atuais e gaps de integração\n2. Definir stack técnica ideal vs. viável agora\n3. Configurar integrações prioritárias (CRM ↔ e-mail, site ↔ analytics, automações)\n4. Testar fluxos de dados entre ferramentas\n5. Documentar configurações e acessos",
      where: "Ferramentas do cliente, APIs, Zapier/Make para automações, integrações nativas.",
      recommendations: "Começar pelas integrações que eliminam trabalho manual repetitivo. Documentar todas as configurações para manutenção futura. Testar com dados reais antes de ativar.",
      deliverables: "• Stack técnica documentada\n• Integrações configuradas e testadas\n• Documentação de configuração e acessos\n• Fluxos de dados validados",
    }),
  },
  {
    frontKey: "automation",
    title: () => "Implantar automações de maior impacto",
    description: (f, sigs) => `Automatizar processos repetitivos e de maior impacto operacional.\n\nContexto dos sinais:\n${signalContext(getFrontSignals(f, sigs))}`,
    priority: "medium",
    actionPlan: (f, sigs) => ({
      what: "Identificar e implantar automações que reduzem trabalho manual, eliminam erros e aceleram processos críticos.",
      how: "1. Mapear processos repetitivos e manuais identificados no diagnóstico\n2. Classificar por impacto (tempo economizado × frequência)\n3. Definir ferramentas de automação (Zapier, Make, n8n, scripts)\n4. Construir e testar cada automação\n5. Monitorar por 1 semana antes de considerar estável",
      where: "Zapier, Make, n8n, Google Apps Script, APIs das ferramentas do cliente.",
      recommendations: "Automação simples e confiável > complexa e frágil. Começar com 2-3 automações de alto impacto. Documentar cada automação com trigger, ação e fallback. Criar alertas de falha.",
      deliverables: "• Mapa de automações priorizadas\n• Automações implementadas e testadas\n• Documentação técnica de cada automação\n• Relatório de impacto (tempo economizado)",
    }),
  },
  {
    frontKey: "activation",
    title: () => "Executar primeira ativação com entregáveis visíveis",
    description: () => "Entregar resultados visíveis iniciais para validar a operação e gerar confiança no processo.",
    priority: "medium",
    actionPlan: () => ({
      what: "Realizar a primeira entrega tangível e visível para o cliente — um marco que demonstra valor concreto da operação.",
      how: "1. Identificar o entregável de maior impacto visual e menor complexidade\n2. Preparar entrega com qualidade profissional\n3. Apresentar ao cliente com contexto de valor\n4. Coletar feedback e ajustar\n5. Documentar como case de referência",
      where: "Canais do cliente, reunião de apresentação, documento de entrega formal.",
      recommendations: "A primeira entrega define a percepção de toda a operação. Priorizar qualidade sobre quantidade. Apresentar com contexto — mostrar o 'antes e depois'. Pedir feedback formal.",
      deliverables: "• Entregável principal ativado e funcionando\n• Apresentação de resultados ao cliente\n• Feedback documentado\n• Registro na timeline do workspace",
    }),
  },
];

function buildSignalSources(sigs: ReviewedSignal[]): SignalSource[] {
  return sigs.map((s) => ({
    signal_key: s.key,
    briefing_kind: s.source,
    context_entry_id: s.contextEntryId,
  }));
}

function buildGenericActionPlan(front: OperationalFront, signals: ReviewedSignal[]): ActionPlan {
  const frontSigs = getFrontSignals(front, signals);
  return {
    what: front.objective,
    how: `1. Revisar sinais relacionados no Dossiê\n2. Planejar ações específicas\n3. Executar e documentar\n4. Validar resultados`,
    where: "Definir conforme contexto da operação.",
    recommendations: frontSigs.length > 0
      ? `Basear execução nos sinais identificados:\n${frontSigs.map(s => `• ${s.label}`).join("\n")}`
      : "Avaliar contexto antes de iniciar execução.",
    deliverables: "• Ações executadas e documentadas\n• Resultados validados",
  };
}

export function deriveTasksFromFronts(
  fronts: OperationalFront[],
  signals: ReviewedSignal[]
): DerivedTask[] {
  const tasks: DerivedTask[] = [];

  for (const front of fronts) {
    if (front.retained) continue;

    const templates = TASK_TEMPLATES.filter((t) => t.frontKey === front.key);
    if (templates.length === 0) {
      const frontSigs = getFrontSignals(front, signals);
      tasks.push({
        title: `Executar: ${front.name}`,
        description: `${front.objective}\n\nContexto dos sinais:\n${signalContext(frontSigs)}`,
        priority: front.priority,
        stage: front.stage,
        frontKey: front.key,
        frontName: front.name,
        dossierBlock: front.dossierBlocks[0] ?? "",
        signalKeys: front.signals,
        signalSources: buildSignalSources(frontSigs),
        scopeClassification: front.scopeClassification,
        operationalReason: `Frente "${front.name}" com ${front.signals.length} sinal(is) de suporte.`,
        actionPlan: buildGenericActionPlan(front, signals),
      });
      continue;
    }

    for (const tmpl of templates) {
      if (tmpl.condition && !tmpl.condition(front, signals)) continue;

      const frontSigs = getFrontSignals(front, signals);
      tasks.push({
        title: tmpl.title(front, signals),
        description: tmpl.description(front, signals),
        priority: tmpl.priority,
        stage: front.stage,
        frontKey: front.key,
        frontName: front.name,
        dossierBlock: front.dossierBlocks[0] ?? "",
        signalKeys: front.signals,
        signalSources: buildSignalSources(frontSigs),
        scopeClassification: front.scopeClassification,
        operationalReason: `Derivada da frente "${front.name}" — ${front.objective}`,
        actionPlan: tmpl.actionPlan(front, signals),
      });
    }
  }

  // Sort: high > medium > low
  const pOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => (pOrder[a.priority] ?? 9) - (pOrder[b.priority] ?? 9));

  return tasks;
}

/* ─── Full plan builder ─── */

export function buildOperationalPlan(
  briefings: Array<{ id?: string; metadata: Record<string, unknown> | null }>,
  planName: string | null
): OperationalPlan {
  const signals = extractReviewedSignals(briefings);
  const diagnostic = buildDiagnostic(signals);
  const { fronts, retained } = buildOperationalFronts(signals, planName);
  const tasks = deriveTasksFromFronts(fronts, signals);

  return { diagnostic, fronts, tasks, retained };
}
