/**
 * portalClient — camada de acesso do OPS V2 ao Portal Aceleriq.
 *
 * REGRA DE PRODUTO:
 *   - Cliente, projeto, milestone e task vivem APENAS no Portal.
 *   - O OPS V2 não duplica essas entidades.
 *   - Esta camada é a ÚNICA porta de entrada para dados do Portal no V2.
 *
 * STATUS ATUAL (Fase V2.0):
 *   Implementação em mock até o contrato com o Portal ser aprovado.
 *   Trocar `mockClient` por uma implementação real (`httpClient`) sem
 *   alterar a interface pública.
 *
 * NÃO USAR neste cliente:
 *   - pull-portal-tasks
 *   - sync-to-portal
 *   - backfill-from-portal
 *   - receive-portal-sync
 *   Essas edge functions ficam restritas ao OPS legacy / Modo Dev.
 *
 * Quando o contrato for aprovado, a implementação real chamará uma
 * bridge dedicada (ex.: edge function `portal-bridge` no projeto OPS,
 * que por sua vez fala com endpoints novos do Portal). Ver
 * docs/ops-v2-portal-contract.md.
 */

export type PortalTaskStatus =
  | "todo"
  | "in_progress"
  | "blocked"
  | "done"
  | "archived";

export type PortalMilestoneStatus =
  | "planned"
  | "in_progress"
  | "done"
  | "paused";

export interface PortalClient {
  id: string;
  name: string;
  avatarUrl?: string | null;
  activeProjectsCount: number;
}

export interface PortalProject {
  id: string;
  clientId: string;
  clientName: string;
  name: string;
  status: "active" | "paused" | "done" | "archived";
  progress: number; // 0..1
  currentMilestoneId?: string | null;
  updatedAt: string;
}

export interface PortalMilestone {
  id: string;
  projectId: string;
  title: string;
  description?: string | null;
  status: PortalMilestoneStatus;
  progress: number; // 0..1
  tasksCount: number;
  tasksDoneCount: number;
  order: number;
  dueAt?: string | null;
}

export interface PortalTask {
  id: string;
  projectId: string;
  milestoneId: string;
  title: string;
  description?: string | null;
  status: PortalTaskStatus;
  progress: number; // 0..1
  assigneeName?: string | null;
  dueAt?: string | null;
  updatedAt: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: PortalTaskStatus;
  progress?: number;
  dueAt?: string | null;
}

export interface CreateTaskInput {
  projectId: string;
  milestoneId: string;
  title: string;
  description?: string | null;
  dueAt?: string | null;
}

export interface PortalClientApi {
  listClients(): Promise<PortalClient[]>;
  listProjects(opts?: { clientId?: string }): Promise<PortalProject[]>;
  getProject(projectId: string): Promise<PortalProject | null>;
  listMilestones(projectId: string): Promise<PortalMilestone[]>;
  listTasks(opts: { projectId: string; milestoneId?: string }): Promise<PortalTask[]>;
  updateTask(taskId: string, input: UpdateTaskInput): Promise<PortalTask>;
  createTask(input: CreateTaskInput): Promise<PortalTask>;
  archiveTask(taskId: string): Promise<void>;
}

// ---------- Mock implementation (Fase V2.0) ----------

const now = new Date().toISOString();

const MOCK_CLIENTS: PortalClient[] = [
  { id: "c-stop", name: "Stop Informática", activeProjectsCount: 1 },
  { id: "c-acme", name: "Acme Co.", activeProjectsCount: 1 },
];

const MOCK_PROJECTS: PortalProject[] = [
  {
    id: "p-stop-2026",
    clientId: "c-stop",
    clientName: "Stop Informática",
    name: "Estruturação Operacional Stop 2026",
    status: "active",
    progress: 0.32,
    currentMilestoneId: "m-stop-01",
    updatedAt: now,
  },
  {
    id: "p-acme-launch",
    clientId: "c-acme",
    clientName: "Acme Co.",
    name: "Lançamento Produto Q2",
    status: "active",
    progress: 0.1,
    currentMilestoneId: "m-acme-01",
    updatedAt: now,
  },
];

const MOCK_MILESTONES: PortalMilestone[] = [
  {
    id: "m-stop-01",
    projectId: "p-stop-2026",
    title: "Milestone 01 — E-mails corporativos",
    status: "in_progress",
    progress: 0.5,
    tasksCount: 6,
    tasksDoneCount: 3,
    order: 1,
  },
  {
    id: "m-stop-02",
    projectId: "p-stop-2026",
    title: "Milestone 02 — CRM básico",
    status: "planned",
    progress: 0,
    tasksCount: 4,
    tasksDoneCount: 0,
    order: 2,
  },
  {
    id: "m-acme-01",
    projectId: "p-acme-launch",
    title: "Milestone 01 — Discovery",
    status: "in_progress",
    progress: 0.25,
    tasksCount: 4,
    tasksDoneCount: 1,
    order: 1,
  },
];

const MOCK_TASKS: PortalTask[] = [
  { id: "t1", projectId: "p-stop-2026", milestoneId: "m-stop-01", title: "Criar contas @stop", status: "done", progress: 1, updatedAt: now },
  { id: "t2", projectId: "p-stop-2026", milestoneId: "m-stop-01", title: "Configurar DNS / SPF / DKIM", status: "done", progress: 1, updatedAt: now },
  { id: "t3", projectId: "p-stop-2026", milestoneId: "m-stop-01", title: "Migrar caixas existentes", status: "done", progress: 1, updatedAt: now },
  { id: "t4", projectId: "p-stop-2026", milestoneId: "m-stop-01", title: "Treinar equipe", status: "in_progress", progress: 0.4, updatedAt: now },
  { id: "t5", projectId: "p-stop-2026", milestoneId: "m-stop-01", title: "Padronizar assinaturas", status: "todo", progress: 0, updatedAt: now },
  { id: "t6", projectId: "p-stop-2026", milestoneId: "m-stop-01", title: "Revisar permissões", status: "todo", progress: 0, updatedAt: now },
  { id: "t7", projectId: "p-acme-launch", milestoneId: "m-acme-01", title: "Entrevistas com clientes", status: "done", progress: 1, updatedAt: now },
  { id: "t8", projectId: "p-acme-launch", milestoneId: "m-acme-01", title: "Mapa de jornada", status: "in_progress", progress: 0.5, updatedAt: now },
  { id: "t9", projectId: "p-acme-launch", milestoneId: "m-acme-01", title: "Definir KPIs", status: "todo", progress: 0, updatedAt: now },
  { id: "t10", projectId: "p-acme-launch", milestoneId: "m-acme-01", title: "Plano de comunicação", status: "todo", progress: 0, updatedAt: now },
];

const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

const mockClient: PortalClientApi = {
  async listClients() { await delay(); return [...MOCK_CLIENTS]; },
  async listProjects(opts) {
    await delay();
    return MOCK_PROJECTS.filter((p) => !opts?.clientId || p.clientId === opts.clientId);
  },
  async getProject(projectId) {
    await delay();
    return MOCK_PROJECTS.find((p) => p.id === projectId) ?? null;
  },
  async listMilestones(projectId) {
    await delay();
    return MOCK_MILESTONES.filter((m) => m.projectId === projectId).sort((a, b) => a.order - b.order);
  },
  async listTasks({ projectId, milestoneId }) {
    await delay();
    return MOCK_TASKS.filter((t) => t.projectId === projectId && (!milestoneId || t.milestoneId === milestoneId));
  },
  async updateTask(taskId, input) {
    await delay();
    const t = MOCK_TASKS.find((x) => x.id === taskId);
    if (!t) throw new Error(`Task ${taskId} not found`);
    Object.assign(t, input, { updatedAt: new Date().toISOString() });
    return { ...t };
  },
  async createTask(input) {
    await delay();
    const id = `t-mock-${Math.random().toString(36).slice(2, 8)}`;
    const task: PortalTask = {
      id, projectId: input.projectId, milestoneId: input.milestoneId,
      title: input.title, description: input.description ?? null,
      status: "todo", progress: 0,
      dueAt: input.dueAt ?? null,
      updatedAt: new Date().toISOString(),
    };
    MOCK_TASKS.push(task);
    return { ...task };
  },
  async archiveTask(taskId) {
    await delay();
    const t = MOCK_TASKS.find((x) => x.id === taskId);
    if (t) t.status = "archived";
  },
};

// Switch para implementação real assim que a bridge estiver aprovada.
export const portalClient: PortalClientApi = mockClient;

/** Indicador para a UI mostrar selo "Dados de demonstração" no piloto. */
export const PORTAL_CLIENT_IS_MOCK = true;