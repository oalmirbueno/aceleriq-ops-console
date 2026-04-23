/**
 * Esteira ACELERA — node types operacionais (projetos, entregáveis, recursos)
 * Cada tipo tem template de drawer (campos esperados em data jsonb).
 */
import {
  FileText, MessageSquare, Globe, LayoutDashboard, Workflow, Bot,
  PenTool, Megaphone, Mail, Database, Lightbulb, Calendar, Paperclip,
  BarChart3, Trophy, Sparkles, Building2, FolderKanban, ListChecks,
  PackageCheck, type LucideIcon, Image as ImageIcon, Video, Phone,
  Target, Rocket, KeyRound, BrainCircuit, GitBranch, ClipboardCheck,
} from "lucide-react";

export type AceleraStageKey =
  | "entrada" | "diagnostico" | "estrutura_base" | "planejamento"
  | "producao" | "ativacao" | "otimizacao" | "expansao";

export interface AceleraStageMeta {
  key: AceleraStageKey;
  letter: string;
  label: string;
  short: string;
  color: string;     // text + border tone
  bg: string;        // background tint for column
  badge: string;     // badge classes
}

export const ACELERA_STAGES: AceleraStageMeta[] = [
  { key: "entrada",        letter: "A", label: "Abertura Estratégica",         short: "Entrada",      color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
  { key: "diagnostico",    letter: "C", label: "Diagnóstico Estrutural",       short: "Diagnóstico",  color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
  { key: "estrutura_base", letter: "E", label: "Arquitetura Base",             short: "Estrutura",    color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
  { key: "planejamento",   letter: "L", label: "Plano Diretor",                short: "Planejamento", color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
  { key: "producao",       letter: "E", label: "Implantação e Construção",     short: "Produção",     color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
  { key: "ativacao",       letter: "R", label: "Ativação Assistida",           short: "Ativação",     color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
  { key: "otimizacao",     letter: "A", label: "Otimização por Evidência",     short: "Otimização",   color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
  { key: "expansao",       letter: "+", label: "Escala e Alavancagem",         short: "Expansão",     color: "text-foreground/70 border-border",  bg: "bg-muted/5",  badge: "bg-muted/10 text-muted-foreground border-border" },
];

export const STAGE_COLUMN_WIDTH = 320;
export const STAGE_HEADER_HEIGHT = 48;
export const STAGE_CONTENT_TOP = 60; // y offset where node area starts inside stage column
export const NODE_VERTICAL_GAP = 130;

export function getStageMeta(key: string): AceleraStageMeta {
  return ACELERA_STAGES.find((s) => s.key === key) ?? ACELERA_STAGES[0];
}

export function stageColumnX(key: string, offsetX = 0): number {
  const idx = ACELERA_STAGES.findIndex((s) => s.key === key);
  return offsetX + Math.max(0, idx) * STAGE_COLUMN_WIDTH;
}

export function stageFromX(x: number, offsetX = 0): AceleraStageKey {
  const rel = Math.max(0, x - offsetX);
  const idx = Math.min(ACELERA_STAGES.length - 1, Math.floor(rel / STAGE_COLUMN_WIDTH));
  return ACELERA_STAGES[idx].key;
}

/* ─── Project / deliverable types (RICH catalog) ─── */

export type ProjectNodeKind =
  | "contexto_ops" | "instrucao" | "engine" | "resultado" | "decisao" | "agente"
  | "briefing" | "ideia" | "reuniao" | "documento" | "acessos"
  | "landing_page" | "site" | "funil"
  | "automacao" | "ia" | "integracao"
  | "conteudo" | "trafego" | "email_mkt" | "social"
  | "crm" | "checklist" | "asset" | "metrica"
  | "before_after" | "case" | "video" | "imagem"
  | "contato" | "objetivo" | "lancamento";

export type NodeFamily =
  | "entry" | "structure" | "plan" | "build"
  | "tech" | "content" | "launch" | "growth" | "proof";

export type NodeFlowRole = "context" | "instruction" | "engine" | "result" | "decision" | "measurement" | "proof" | "narrative" | "execution";

export interface ProjectNodeTypeMeta {
  kind: ProjectNodeKind;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  color: string; // border + text accent
  bg: string;    // soft background
  family?: NodeFamily;
  defaultStage: AceleraStageKey;
  /** Sections rendered in the rich drawer */
  sections: Array<"overview" | "links" | "copy" | "checklist" | "attachments" | "notes" | "metrics">;
  /** Suggested initial title prefix */
  titleTemplate: string;
}

export const PROJECT_TYPES: ProjectNodeTypeMeta[] = [
  // Gramática operacional do Canvas — contexto → instrução → engine → resultado → decisão
  { kind: "contexto_ops", label: "Contexto operacional", shortLabel: "Contexto", icon: Paperclip,       color: "border-border text-foreground/60", bg: "bg-transparent", defaultStage: "entrada",        sections: ["overview","links","attachments","notes"],           titleTemplate: "Contexto" },
  { kind: "instrucao",    label: "Instrução / SOP",       shortLabel: "Instrução", icon: ClipboardCheck, color: "border-border text-foreground/60", bg: "bg-transparent", defaultStage: "planejamento",   sections: ["overview","copy","checklist","notes"],              titleTemplate: "Instrução" },
  { kind: "engine",       label: "Engine de orquestração", shortLabel: "Engine",    icon: BrainCircuit,   color: "border-border text-foreground/60", bg: "bg-transparent", defaultStage: "planejamento",   sections: ["overview","links","checklist","notes"],             titleTemplate: "Engine" },
  { kind: "resultado",    label: "Resultado / Output",    shortLabel: "Resultado", icon: PackageCheck,    color: "border-border text-foreground/60", bg: "bg-transparent", defaultStage: "producao",       sections: ["overview","links","attachments","metrics","notes"], titleTemplate: "Resultado" },
  { kind: "decisao",      label: "Decisão / Aprovação",   shortLabel: "Decisão",   icon: GitBranch,       color: "border-border text-foreground/60", bg: "bg-transparent", defaultStage: "ativacao",       sections: ["overview","checklist","notes"],                      titleTemplate: "Decisão" },
  { kind: "agente",       label: "Agente operacional",    shortLabel: "Agente",    icon: Bot,             color: "border-border text-foreground/60", bg: "bg-transparent", defaultStage: "producao",       sections: ["overview","links","copy","checklist","notes"],     titleTemplate: "Agente" },

  // Entrada
  { kind: "briefing",     label: "Briefing",            shortLabel: "Briefing",     icon: FileText,        color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "entrada",        sections: ["overview","links","notes","attachments"],                       titleTemplate: "Briefing" },
  { kind: "reuniao",      label: "Reunião / Call",      shortLabel: "Reunião",      icon: Phone,           color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "entrada",        sections: ["overview","notes","attachments"],                                titleTemplate: "Reunião" },
  { kind: "ideia",        label: "Ideia / Hipótese",    shortLabel: "Ideia",        icon: Lightbulb,       color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "entrada",        sections: ["overview","notes","links"],                                      titleTemplate: "Ideia" },
  { kind: "objetivo",     label: "Objetivo / Meta",     shortLabel: "Objetivo",     icon: Target,          color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "entrada",        sections: ["overview","metrics","notes"],                                    titleTemplate: "Objetivo" },
  { kind: "acessos",      label: "Acessos & Senhas",    shortLabel: "Acessos",      icon: KeyRound,        color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "entrada",        sections: ["overview","notes"],                                              titleTemplate: "Acessos do cliente" },

  // Diagnóstico / Estrutura
  { kind: "documento",    label: "Documento",           shortLabel: "Doc",          icon: FileText,        color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "diagnostico",    sections: ["overview","links","attachments","notes"],                        titleTemplate: "Documento" },
  { kind: "checklist",    label: "Checklist",           shortLabel: "Checklist",    icon: ListChecks,      color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "estrutura_base", sections: ["overview","checklist","notes"],                                  titleTemplate: "Checklist" },
  { kind: "contato",      label: "Contato / Stakeholder", shortLabel: "Contato",    icon: MessageSquare,   color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "estrutura_base", sections: ["overview","links","notes"],                                      titleTemplate: "Contato" },

  // Planejamento
  { kind: "funil",        label: "Funil",               shortLabel: "Funil",        icon: Workflow,        color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "planejamento",   sections: ["overview","links","copy","checklist","notes"],                   titleTemplate: "Funil" },

  // Produção (entregáveis principais)
  { kind: "landing_page", label: "Landing Page",        shortLabel: "Landing",      icon: LayoutDashboard, color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","links","copy","checklist","attachments","notes"],     titleTemplate: "Landing Page" },
  { kind: "site",         label: "Site",                shortLabel: "Site",         icon: Globe,           color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","links","copy","checklist","attachments","notes"],     titleTemplate: "Site" },
  { kind: "automacao",    label: "Automação",           shortLabel: "Automação",    icon: Workflow,        color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","links","checklist","notes","attachments"],            titleTemplate: "Automação" },
  { kind: "ia",           label: "Agente IA",           shortLabel: "IA",           icon: Bot,             color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","links","checklist","notes","attachments"],            titleTemplate: "Agente IA" },
  { kind: "integracao",   label: "Integração",          shortLabel: "Integração",   icon: Database,        color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","links","notes"],                                      titleTemplate: "Integração" },
  { kind: "conteudo",     label: "Conteúdo",            shortLabel: "Conteúdo",     icon: PenTool,         color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","copy","attachments","notes"],                         titleTemplate: "Conteúdo" },
  { kind: "video",        label: "Vídeo",               shortLabel: "Vídeo",        icon: Video,           color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","links","attachments","notes"],                        titleTemplate: "Vídeo" },
  { kind: "imagem",       label: "Imagem / Criativo",   shortLabel: "Imagem",       icon: ImageIcon,       color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","attachments","notes"],                                titleTemplate: "Imagem" },
  { kind: "asset",        label: "Asset entregue",      shortLabel: "Asset",        icon: PackageCheck,    color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "producao",       sections: ["overview","links","attachments","notes"],                        titleTemplate: "Asset" },

  // Ativação / Otimização
  { kind: "lancamento",   label: "Lançamento",          shortLabel: "Lançamento",   icon: Rocket,          color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "ativacao",       sections: ["overview","links","checklist","notes"],                          titleTemplate: "Lançamento" },
  { kind: "trafego",      label: "Tráfego pago",        shortLabel: "Tráfego",      icon: Megaphone,       color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "ativacao",       sections: ["overview","links","copy","metrics","notes"],                     titleTemplate: "Campanha de tráfego" },
  { kind: "email_mkt",    label: "Email Marketing",     shortLabel: "Email",        icon: Mail,            color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "ativacao",       sections: ["overview","copy","links","metrics","notes"],                     titleTemplate: "Sequência de email" },
  { kind: "social",       label: "Redes sociais",       shortLabel: "Social",       icon: Megaphone,       color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "ativacao",       sections: ["overview","copy","attachments","metrics","notes"],               titleTemplate: "Conteúdo social" },
  { kind: "crm",          label: "CRM / Pipeline",      shortLabel: "CRM",          icon: FolderKanban,    color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "otimizacao",     sections: ["overview","links","metrics","notes"],                            titleTemplate: "CRM" },
  { kind: "metrica",      label: "Métrica",             shortLabel: "Métrica",      icon: BarChart3,       color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "otimizacao",     sections: ["overview","metrics","notes"],                                    titleTemplate: "Métrica" },

  // Expansão / prova
  { kind: "before_after", label: "Before / After",      shortLabel: "Before/After", icon: Sparkles,        color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "expansao",       sections: ["overview","attachments","metrics","notes"],                      titleTemplate: "Before/After" },
  { kind: "case",         label: "Case",                shortLabel: "Case",         icon: Trophy,          color: "border-border text-foreground/60",     bg: "bg-transparent",    defaultStage: "expansao",       sections: ["overview","links","attachments","notes","metrics"],              titleTemplate: "Case" },
];

export function getProjectTypeMeta(kind: string): ProjectNodeTypeMeta | null {
  return PROJECT_TYPES.find((p) => p.kind === kind) ?? null;
}

/* ─── Family mapping ─── */
const KIND_TO_FAMILY: Record<ProjectNodeKind, NodeFamily> = {
  contexto_ops: "entry", instrucao: "plan", engine: "tech", resultado: "build", decisao: "growth", agente: "tech",
  briefing: "entry", reuniao: "entry", ideia: "entry", objetivo: "entry", acessos: "entry",
  documento: "structure", checklist: "structure", contato: "structure",
  funil: "plan",
  landing_page: "build", site: "build", asset: "build",
  automacao: "tech", ia: "tech", integracao: "tech",
  conteudo: "content", video: "content", imagem: "content",
  lancamento: "launch", trafego: "launch", email_mkt: "launch", social: "launch",
  crm: "growth", metrica: "proof",
  before_after: "proof", case: "proof",
};

export function getNodeFamily(kind: string): NodeFamily {
  return KIND_TO_FAMILY[kind as ProjectNodeKind] ?? "structure";
}

export const NODE_FAMILY_LABELS: Record<NodeFamily, string> = {
  entry: "Descoberta",
  structure: "Estrutura",
  plan: "Plano",
  build: "Construção",
  tech: "Tecnologia",
  content: "Conteúdo",
  launch: "Lançamento",
  growth: "Crescimento",
  proof: "Prova",
};

export const NODE_FLOW_ROLE_LABELS: Record<NodeFlowRole, string> = {
  context: "Contexto",
  instruction: "Instrução",
  engine: "Engine",
  result: "Entrega",
  decision: "Decisão",
  measurement: "Medição",
  proof: "Prova",
  narrative: "Case",
  execution: "Execução",
};

export function getNodeFlowRole(kind: string): NodeFlowRole {
  if (["contexto_ops", "briefing", "documento", "reuniao", "ideia", "objetivo", "acessos", "contato"].includes(kind)) return "context";
  if (["instrucao", "funil", "checklist"].includes(kind)) return "instruction";
  if (["engine", "automacao", "ia", "integracao"].includes(kind)) return "engine";
  if (["agente"].includes(kind)) return "execution";
  if (["decisao"].includes(kind)) return "decision";
  if (["metrica", "crm", "trafego", "email_mkt", "social"].includes(kind)) return "measurement";
  if (["before_after"].includes(kind)) return "proof";
  if (["case"].includes(kind)) return "narrative";
  if (["resultado", "landing_page", "site", "conteudo", "video", "imagem", "asset", "lancamento"].includes(kind)) return "result";
  return "execution";
}

/** Group catalog into bands for the palette */
export const PROJECT_TYPE_GROUPS: Array<{ stage: AceleraStageKey; types: ProjectNodeKind[] }> = [
  { stage: "entrada",        types: ["contexto_ops","briefing","reuniao","ideia","objetivo","acessos"] },
  { stage: "diagnostico",    types: ["documento","contato"] },
  { stage: "estrutura_base", types: ["checklist"] },
  { stage: "planejamento",   types: ["engine","instrucao","funil"] },
  { stage: "producao",       types: ["resultado","agente","landing_page","site","automacao","ia","integracao","conteudo","video","imagem","asset"] },
  { stage: "ativacao",       types: ["decisao","lancamento","trafego","email_mkt","social"] },
  { stage: "otimizacao",     types: ["crm","metrica"] },
  { stage: "expansao",       types: ["before_after","case"] },
];

/** Map ProjectNodeKind → DB node_type enum value (existing canvas_nodes.node_type uses CanvasNodeType) */
export function projectKindToDbNodeType(kind: ProjectNodeKind | "dossie"): string {
  switch (kind) {
    case "site": return "site";
    case "landing_page": return "landing_page";
    case "automacao": return "automation";
    case "ia": return "ai_agent";
    case "agente": return "ai_agent";
    case "conteudo": return "content";
    case "video": return "content";
    case "imagem": return "content";
    case "social": return "content";
    case "email_mkt": return "content";
    case "trafego": return "traffic";
    case "lancamento": return "traffic";
    case "metrica": return "metric";
    case "before_after": return "before_after";
    case "case": return "case";
    case "asset": return "asset";
    case "dossie": return "dossier";
    case "briefing":
    case "contexto_ops":
    case "reuniao":
    case "ideia":
    case "objetivo":
    case "acessos":
    case "contato":
    case "documento":
      return "context";
    case "checklist": return "task";
    case "crm": return "front";
    case "funil": return "front";
    case "integracao": return "front";
    case "instrucao": return "front";
    case "engine": return "front";
    case "resultado": return "front";
    case "decisao": return "front";
    default: return "front";
  }
}

/** Reverse lookup helper from stored data.kind */
export function readKindFromData(data: Record<string, unknown> | null | undefined): ProjectNodeKind | null {
  const k = (data ?? {})["kind"];
  if (typeof k === "string") return k as ProjectNodeKind;
  return null;
}

export function resolveProjectNodeKind(input: {
  nodeType?: string | null;
  data?: Record<string, unknown> | null;
}): ProjectNodeKind | null {
  const fromData = readKindFromData(input.data);
  if (fromData) return fromData;

  const fromNodeType = input.nodeType;
  if (!fromNodeType) return null;

  return PROJECT_TYPES.some((projectType) => projectType.kind === fromNodeType)
    ? (fromNodeType as ProjectNodeKind)
    : null;
}

/* ─── Checklist templates por tipo de projeto ───
 * Cada item vira um ChecklistItem padrão quando o node é criado.
 * Pode ser editado/removido livremente depois.
 */
export const CHECKLIST_TEMPLATES: Partial<Record<ProjectNodeKind, string[]>> = {
  contexto_ops: [
    "Vincular briefing, assets e referências",
    "Registrar regras de marca e restrições",
    "Marcar origem e validade da informação",
    "Conectar ao engine que vai usar este contexto",
  ],
  instrucao: [
    "Definir objetivo operacional",
    "Escrever SOP / prompt / regra de execução",
    "Definir critérios de aceite",
    "Conectar à engine ou resultado específico",
  ],
  engine: [
    "Listar entradas obrigatórias",
    "Definir saída esperada",
    "Mapear automações e handoffs",
    "Conectar outputs e decisões",
  ],
  resultado: [
    "Definir owner e prazo",
    "Produzir versão inicial",
    "Anexar evidência / link final",
    "Enviar para decisão ou revisão",
  ],
  decisao: [
    "Definir condição de aprovação",
    "Mapear caminho se aprovado",
    "Mapear caminho se reprovado",
    "Registrar decisão e responsável",
  ],
  agente: [
    "Definir papel do agente",
    "Configurar instrução padrão",
    "Conectar fontes de contexto",
    "Testar ação/handoff principal",
  ],
  briefing: [
    "Coletar objetivo do cliente",
    "Mapear público-alvo e dores",
    "Levantar referências e concorrentes",
    "Definir entregáveis e prazos",
    "Validar briefing com o cliente",
  ],
  reuniao: [
    "Definir pauta e objetivo",
    "Enviar convite com link",
    "Tomar notas e decisões",
    "Compartilhar resumo pós-reunião",
  ],
  ideia: [
    "Descrever a hipótese",
    "Listar evidências a favor",
    "Definir teste mínimo",
    "Decidir: validar ou descartar",
  ],
  objetivo: [
    "Escrever meta SMART",
    "Definir métrica e baseline",
    "Definir prazo",
    "Definir owner",
  ],
  documento: [
    "Estrutura / sumário",
    "Conteúdo redigido",
    "Revisão técnica",
    "Aprovação final",
  ],
  funil: [
    "Mapear etapas do funil",
    "Definir oferta por etapa",
    "Métrica de cada etapa",
    "Pontos de automação",
    "Validar com cliente",
  ],
  landing_page: [
    "Wireframe / estrutura",
    "Copy aprovada",
    "Design das seções",
    "Desenvolvimento / publicação",
    "Pixel + analytics",
    "QA mobile e desktop",
    "Publicar e validar URL",
  ],
  site: [
    "Arquitetura de páginas",
    "Copy de cada página",
    "Design system",
    "Desenvolvimento",
    "SEO básico (title, meta, sitemap)",
    "QA cross-browser",
    "Deploy e DNS",
  ],
  automacao: [
    "Mapear gatilho e fluxo",
    "Configurar integrações",
    "Construir automação",
    "Teste end-to-end",
    "Documentar fluxo",
    "Ativar em produção",
  ],
  ia: [
    "Definir objetivo do agente",
    "Escrever prompt / instruções",
    "Conectar fontes de dados",
    "Testar conversas-chave",
    "Definir handoff humano",
    "Publicar canal (web/whats)",
  ],
  integracao: [
    "Documentar sistemas envolvidos",
    "Validar credenciais / API keys",
    "Implementar conexão",
    "Teste de payload",
    "Tratamento de erro",
  ],
  conteudo: [
    "Pauta aprovada",
    "Roteiro / texto",
    "Revisão",
    "Diagramação / mídia",
    "Aprovação final",
    "Agendar publicação",
  ],
  video: [
    "Roteiro",
    "Gravação",
    "Edição",
    "Revisão",
    "Exportar formatos finais",
  ],
  imagem: [
    "Briefing visual",
    "Versão 1",
    "Ajustes",
    "Aprovação final",
    "Exportar formatos",
  ],
  asset: [
    "Conferir entrega vs. escopo",
    "Subir para repositório oficial",
    "Comunicar entrega ao cliente",
  ],
  lancamento: [
    "Definir data e cronograma",
    "Aquecimento (conteúdo prévio)",
    "Pré-lançamento",
    "Abertura de carrinho / oferta",
    "Acompanhamento diário",
    "Pós-lançamento e métricas",
  ],
  trafego: [
    "Definir objetivo da campanha",
    "Públicos e segmentações",
    "Criativos (copy + arte)",
    "Estruturar conjuntos / campanhas",
    "Configurar pixels e conversões",
    "Subir e validar entrega",
    "Otimização semanal",
  ],
  email_mkt: [
    "Definir objetivo da sequência",
    "Mapear emails (assunto + ângulo)",
    "Escrever copy de cada email",
    "Configurar automação",
    "Teste de envio e links",
    "Agendar / ativar",
  ],
  social: [
    "Definir formato e tema",
    "Roteiro / copy",
    "Criativo (arte/vídeo)",
    "Aprovação",
    "Agendar publicação",
    "Engajamento pós-publicação",
  ],
  crm: [
    "Mapear estágios do pipeline",
    "Importar contatos",
    "Configurar automações",
    "Definir SLA por etapa",
    "Treinar time",
  ],
  metrica: [
    "Definir métrica e fórmula",
    "Definir fonte de dados",
    "Baseline atual",
    "Meta",
    "Cadência de revisão",
  ],
  before_after: [
    "Coletar dado/evidência inicial",
    "Coletar dado/evidência final",
    "Selecionar mídias comparativas",
    "Escrever narrativa do resultado",
    "Aprovação para uso",
  ],
  case: [
    "Resumo executivo",
    "Contexto e desafio",
    "Solução implementada",
    "Resultados (números)",
    "Mídias e prints",
    "Aprovação do cliente para divulgar",
  ],
  contato: [
    "Nome, papel, canal",
    "Frequência de contato",
    "Decisões de alçada",
  ],
  checklist: [],
  acessos: [
    "Coletar acessos das plataformas de mídia (Meta, Google Ads, GA4)",
    "Coletar acessos de hospedagem e DNS",
    "Coletar acessos do CMS / site",
    "Coletar acessos de redes sociais e e-mail corporativo",
    "Validar 2FA e papéis de cada acesso",
    "Marcar credenciais sensíveis (revelação só admin)",
  ],
};

export function getChecklistTemplate(kind: string): Array<{ id: string; text: string; done: boolean }> {
  const items = CHECKLIST_TEMPLATES[kind as ProjectNodeKind] ?? [];
  return items.map((text, i) => ({
    id: `${Date.now().toString(36)}-${i}`,
    text,
    done: false,
  }));
}
