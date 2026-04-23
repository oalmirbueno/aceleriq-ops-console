/**
 * planConfig — configuração dos planos Aceleriq ancorada no método ACELERA.
 *
 * As chaves internas (starter/growth/enterprise) são mantidas por retrocompatibilidade
 * com dados já gravados na coluna `clients.plan_name`. Os rótulos e conteúdo
 * foram reestruturados em Fundação / Aceleração / Escala IA-First.
 */

export type PlanKey = "starter" | "growth" | "enterprise";

/** Categoria de entregável — organiza a lista de entregas dentro de cada plano */
export interface DeliverableGroup {
  category: string;     // Ex: "Estratégia", "Produção", "Ativação"
  items: string[];      // Lista de entregáveis
}

export interface PlanConfig {
  /** Rótulo comercial do plano (mostrado para clientes e no UI) */
  label: string;
  /** Tagline curta — promessa do plano em 1 frase */
  tagline: string;
  /** Descrição expandida */
  description: string;
  /** Valor mensal em R$ */
  monthly: number;
  /** Duração mínima do contrato em meses */
  min_contract_months: number;
  /** Faixa de faturamento do cliente ideal */
  target_revenue: string;
  /** Etapas ACELERA cobertas (chaves do PIPELINE_STAGES_ORDERED) */
  stages_covered: string[];
  /** Máximo de frentes operacionais simultâneas */
  max_active_fronts: number | null; // null = ilimitado
  /** Entregáveis agrupados por categoria */
  deliverables: DeliverableGroup[];
  /** Extras / bônus do plano */
  extras: string[];
  /** Ritmo de reuniões incluso */
  rituals: string[];
}

const STORAGE_KEY = "aceleriq_plan_config_v2";

const DEFAULT_CONFIG: Record<PlanKey, PlanConfig> = {
  // ═══════════════════════════════════════════════════════════
  // FUNDAÇÃO — Preparar o solo
  // ═══════════════════════════════════════════════════════════
  starter: {
    label: "Fundação",
    tagline: "Preparar o solo da sua operação digital.",
    description: "Para empresas iniciando estruturação. Entregamos a base digital, primeiro CRM, primeira landing page e consolidamos o contexto operacional. Ideal pra quem não tem processo estruturado e precisa começar certo.",
    monthly: 1497,
    min_contract_months: 3,
    target_revenue: "Até R$ 200k/mês",
    stages_covered: ["entrada", "diagnostico", "estrutura_base"],
    max_active_fronts: 3,
    deliverables: [
      {
        category: "Contexto e estratégia",
        items: [
          "Briefing Essencial consolidado por IA",
          "Diagnóstico estrutural da operação atual",
          "Mapa de dores + objetivos priorizados",
          "Arquitetura base da operação definida",
        ],
      },
      {
        category: "Construção inicial",
        items: [
          "1 Landing Page de captura (copy + design + deploy)",
          "CRM interno básico (pipeline estruturado)",
          "1 automação essencial (ex: formulário → CRM → notificação)",
          "Base de conhecimento inicial (pronta para IA futura)",
        ],
      },
    ],
    extras: [
      "Acesso ao portal aceleriq.online",
      "Credenciais centralizadas no cofre",
    ],
    rituals: [
      "Kickoff de abertura (1h)",
      "Alignment quinzenal (30min)",
      "Revisão mensal de entregas (1h)",
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // ACELERAÇÃO — Construir a máquina
  // ═══════════════════════════════════════════════════════════
  growth: {
    label: "Aceleração",
    tagline: "Construir a máquina de aquisição do seu negócio.",
    description: "Para empresas com produto validado querendo crescer com método. Montamos todo o motor comercial: CRM completo, funil, automações, conteúdo, tráfego e primeiro agente IA. Etapas de Abertura até Ativação Assistida do método ACELERA.",
    monthly: 3497,
    min_contract_months: 12,
    target_revenue: "R$ 200k a R$ 1M/mês",
    stages_covered: ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao"],
    max_active_fronts: 6,
    deliverables: [
      {
        category: "Estratégia consolidada",
        items: [
          "Tudo do plano Fundação",
          "Planejamento operacional 90 dias",
          "ICP detalhado + persona + jornada mapeada",
        ],
      },
      {
        category: "Operação comercial",
        items: [
          "CRM interno completo (etapas, automações, campos customizados)",
          "Funil de vendas desenhado com SLAs por etapa",
          "Integração de leads (site, Instagram, WhatsApp) → CRM",
        ],
      },
      {
        category: "Aquisição e conteúdo",
        items: [
          "Estratégia de conteúdo mensal + 8 peças/mês",
          "2 campanhas de tráfego pago (setup + otimização)",
          "Instrumentação de pixel + UTMs",
        ],
      },
      {
        category: "Primeira camada IA",
        items: [
          "1 agente IA básico (WhatsApp Business ou chat do site)",
          "Dashboard de métricas com baseline vs meta",
        ],
      },
    ],
    extras: [
      "Portal do cliente com progresso em tempo real",
      "Drive compartilhado organizado por pastas",
      "Timeline de atividades com realtime",
    ],
    rituals: [
      "Kickoff estratégico (2h)",
      "Alignment semanal (45min)",
      "Reunião mensal estratégica (1h30)",
      "QBR trimestral — revisão de métricas e ajustes (2h)",
    ],
  },

  // ═══════════════════════════════════════════════════════════
  // ESCALA IA-FIRST — Virar a chave
  // ═══════════════════════════════════════════════════════════
  enterprise: {
    label: "Escala IA-First",
    tagline: "Virar a chave: sua empresa opera como AI-first.",
    description: "Para empresas acima de R$ 1M/mês prontas para dominar o nicho. Entregamos estrutura completa AI-first: múltiplos agentes IA, automações avançadas com IA embutida, dashboard BI, playbook replicável e consultoria estratégica 1:1. Todas as 8 etapas do método ACELERA ativas.",
    monthly: 6997,
    min_contract_months: 12,
    target_revenue: "R$ 1M+/mês",
    stages_covered: ["entrada", "diagnostico", "estrutura_base", "planejamento", "producao", "ativacao", "otimizacao", "expansao"],
    max_active_fronts: null, // ilimitado
    deliverables: [
      {
        category: "Fundação completa",
        items: [
          "Tudo do plano Aceleração",
          "Consultoria estratégica 1:1 com sócio (3h/mês)",
        ],
      },
      {
        category: "Workforce IA completa",
        items: [
          "5+ agentes IA especializados (atendimento, qualificação, pós-venda, análise, insights internos)",
          "Automações avançadas com IA embutida nos pontos críticos",
          "AI-First Score acima de 80% monitorado",
        ],
      },
      {
        category: "Inteligência e escala",
        items: [
          "Dashboard BI customizado integrado",
          "Métricas em tempo real por canal e campanha",
          "1 canal de tráfego escalado (budget mínimo R$ 15k/mês)",
        ],
      },
      {
        category: "Prova e expansão",
        items: [
          "Case documentado com before/after estruturado",
          "Playbook replicável do negócio (fica como ativo do cliente)",
          "Roadmap de expansão 12 meses",
        ],
      },
    ],
    extras: [
      "Portal premium com relatórios customizados",
      "Priority de desenvolvimento (cliente vai primeiro na fila)",
      "Suporte dedicado via canal privado",
      "Acesso às releases beta do Aceleriq Ops",
    ],
    rituals: [
      "Kickoff profundo (3h — deep dive no negócio)",
      "Alignment semanal (1h)",
      "War room mensal com sócio (2h)",
      "QBR trimestral expandido (3h)",
      "Anual Strategic Planning (dia inteiro)",
    ],
  },
};

const PLAN_KEYS_ORDERED: PlanKey[] = ["starter", "growth", "enterprise"];

/** Read plan config from localStorage, fallback to defaults */
export function getPlanConfig(): Record<PlanKey, PlanConfig> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<Record<PlanKey, PlanConfig>>;
    // Merge with defaults to handle missing fields after migration
    const merged = { ...DEFAULT_CONFIG };
    for (const key of PLAN_KEYS_ORDERED) {
      if (parsed[key]) {
        merged[key] = { ...DEFAULT_CONFIG[key], ...parsed[key] };
      }
    }
    return merged;
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function savePlanConfig(config: Record<PlanKey, PlanConfig>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* quota */ }
}

export function getDefaultConfig(): Record<PlanKey, PlanConfig> {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

export function getPlanOrder(): PlanKey[] {
  return [...PLAN_KEYS_ORDERED];
}
