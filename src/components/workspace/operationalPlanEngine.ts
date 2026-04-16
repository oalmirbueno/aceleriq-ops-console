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
  },
  {
    key: "operational",
    name: "Estrutura Operacional",
    objective: "Organizar fluxo de entrega, processos e papéis.",
    triggerSignals: ["operational_structure", "process_gaps", "team_roles", "current_operations", "customer_journey"],
    triggerDossierBlocks: ["operational"],
    stage: "estrutura_base",
    planScope: { starter: "conditional", growth: "in_plan", enterprise: "in_plan" },
  },
  {
    key: "digital",
    name: "Operação Digital",
    objective: "Estruturar presença digital, canais e métricas.",
    triggerSignals: ["digital_operation", "content_marketing", "data_management", "tools_stack"],
    triggerDossierBlocks: ["digital"],
    stage: "producao",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
  },
  {
    key: "access",
    name: "Acessos e Dependências",
    objective: "Coletar, validar e organizar acessos críticos.",
    triggerSignals: ["accesses", "access_dependencies", "internal_tools", "gaps"],
    triggerDossierBlocks: ["access"],
    stage: "entrada",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
  },
  {
    key: "automation",
    name: "Automação Prioritária",
    objective: "Implantar automações de maior impacto.",
    triggerSignals: ["automation_opportunities", "bottlenecks", "ai_readiness", "priorities"],
    triggerDossierBlocks: [],
    stage: "producao",
    planScope: { starter: "addon", growth: "conditional", enterprise: "in_plan" },
  },
  {
    key: "documentation",
    name: "Documentação e Processos",
    objective: "Documentar processos, identidade e operação.",
    triggerSignals: ["identity", "company_moment", "goals"],
    triggerDossierBlocks: ["identity"],
    stage: "planejamento",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
  },
  {
    key: "technical",
    name: "Implantação Técnica",
    objective: "Configurar ferramentas, integrações e infraestrutura.",
    triggerSignals: ["tools_stack", "internal_tools", "data_management"],
    triggerDossierBlocks: [],
    stage: "producao",
    planScope: { starter: "addon", growth: "in_plan", enterprise: "in_plan" },
  },
  {
    key: "activation",
    name: "Ativação Inicial",
    objective: "Primeira ativação com entregáveis visíveis.",
    triggerSignals: ["scaling_vision", "growth_readiness", "communication_channels"],
    triggerDossierBlocks: [],
    stage: "ativacao",
    planScope: { starter: "in_plan", growth: "in_plan", enterprise: "in_plan" },
  },
  {
    key: "diagnostic_deep",
    name: "Diagnóstico Aprofundado",
    objective: "Investigar lacunas antes de planejar próximos passos.",
    triggerSignals: ["diagnosis", "pain_points", "process_gaps", "bottlenecks"],
    triggerDossierBlocks: ["diagnostic"],
    stage: "diagnostico",
    planScope: { starter: "conditional", growth: "in_plan", enterprise: "in_plan" },
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
  planName: string | null
): { fronts: OperationalFront[]; retained: OperationalFront[] } {
  const signalKeys = new Set(signals.map((s) => s.key));
  const dossierBlocks = new Set(signals.map((s) => s.dossierBlock));

  const fronts: OperationalFront[] = [];
  const retained: OperationalFront[] = [];

  for (const def of FRONT_DEFINITIONS) {
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
  priority: string;
  condition?: (front: OperationalFront, signals: ReviewedSignal[]) => boolean;
}

function getFrontSignals(front: OperationalFront, allSignals: ReviewedSignal[]): ReviewedSignal[] {
  return allSignals.filter((s) => front.signals.includes(s.key));
}

function signalSnippet(signals: ReviewedSignal[], maxLen = 100): string {
  if (signals.length === 0) return "";
  const first = signals[0];
  return first.summary.length > maxLen ? first.summary.slice(0, maxLen) + "…" : first.summary;
}

const TASK_TEMPLATES: TaskTemplate[] = [
  {
    frontKey: "access",
    title: () => "Coletar e validar acessos pendentes",
    description: (f, sigs) => `Organizar acessos necessários: ${signalSnippet(getFrontSignals(f, sigs))}`,
    priority: "high",
  },
  {
    frontKey: "diagnostic_deep",
    title: () => "Completar diagnóstico operacional",
    description: (f, sigs) => `Investigar lacunas identificadas: ${signalSnippet(getFrontSignals(f, sigs))}`,
    priority: "high",
  },
  {
    frontKey: "documentation",
    title: () => "Documentar identidade e posicionamento",
    description: () => "Formalizar identidade, proposta de valor e posicionamento com base nos sinais revisados.",
    priority: "medium",
  },
  {
    frontKey: "commercial",
    title: () => "Estruturar funil e processo comercial",
    description: (f, sigs) => `Montar ou otimizar funil de vendas: ${signalSnippet(getFrontSignals(f, sigs))}`,
    priority: "high",
  },
  {
    frontKey: "operational",
    title: () => "Organizar fluxo de entrega e operação",
    description: (f, sigs) => `Estruturar operação: ${signalSnippet(getFrontSignals(f, sigs))}`,
    priority: "high",
  },
  {
    frontKey: "digital",
    title: () => "Implantar estrutura digital",
    description: (f, sigs) => `Organizar presença e operação digital: ${signalSnippet(getFrontSignals(f, sigs))}`,
    priority: "medium",
  },
  {
    frontKey: "technical",
    title: () => "Configurar ferramentas e integrações",
    description: (f, sigs) => `Implantar stack técnica: ${signalSnippet(getFrontSignals(f, sigs))}`,
    priority: "medium",
  },
  {
    frontKey: "automation",
    title: () => "Implantar automações prioritárias",
    description: (f, sigs) => `Automatizar processos de maior impacto: ${signalSnippet(getFrontSignals(f, sigs))}`,
    priority: "medium",
  },
  {
    frontKey: "activation",
    title: () => "Executar primeira ativação com entregáveis",
    description: () => "Entregar resultados visíveis iniciais para validar operação.",
    priority: "medium",
  },
];
function buildSignalSources(sigs: ReviewedSignal[]): SignalSource[] {
  return sigs.map((s) => ({
    signal_key: s.key,
    briefing_kind: s.source,
    context_entry_id: s.contextEntryId,
  }));
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
      // Generic task for fronts without specific template
      const frontSigs = getFrontSignals(front, signals);
      tasks.push({
        title: `Executar: ${front.name}`,
        description: front.objective,
        priority: front.priority,
        stage: front.stage,
        frontKey: front.key,
        frontName: front.name,
        dossierBlock: front.dossierBlocks[0] ?? "",
        signalKeys: front.signals,
        signalSources: buildSignalSources(frontSigs),
        scopeClassification: front.scopeClassification,
        operationalReason: `Frente "${front.name}" com ${front.signals.length} sinal(is) de suporte.`,
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
