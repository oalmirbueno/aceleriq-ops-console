/**
 * portalClient — camada de acesso do OPS V2 ao Portal Aceleriq.
 *
 * REGRA DE PRODUTO:
 *   - Cliente, projeto, milestone e task vivem APENAS no Portal.
 *   - O OPS V2 não duplica essas entidades.
 *   - Esta camada é a ÚNICA porta de entrada para dados do Portal no V2.
 *
 * STATUS ATUAL (Fase V2.0):
 *   Duas implementações disponíveis:
 *     - mockClient: dataset estático (default).
 *     - bridgeClient: chama a edge function `portal-bridge` (read-only)
 *       que reencaminha para os endpoints existentes do Portal
 *       (ops-full-export / ops-projects-list / ops-tasks-list).
 *   A escolha é controlada pelo flag local
 *   `localStorage["ops-v2:use-real-bridge"] === "1"`. Mock continua
 *   default até validarmos no piloto.
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

// ---------- Bridge implementation (read-only via edge `portal-bridge`) ----------

import { supabase } from "@/integrations/supabase/client";

const NOT_IMPLEMENTED = (op: string) => {
  throw new Error(
    `[portalClient.bridge] '${op}' não está implementado nesta fase. ` +
    `Fase V2.1 é apenas leitura.`,
  );
};

async function invokeBridge<T>(action: string, params?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("portal-bridge", {
    body: { action, params: params ?? {} },
  });
  if (error) throw new Error(`portal-bridge ${action}: ${error.message}`);
  if (!data || (data as { ok?: boolean }).ok === false) {
    const msg = (data as { error?: string })?.error ?? "resposta inválida";
    throw new Error(`portal-bridge ${action}: ${msg}`);
  }
  return data as T;
}

const bridgeClient: PortalClientApi = {
  async listClients() {
    const r = await invokeBridge<{ clients: PortalClient[] }>("listClients");
    return r.clients ?? [];
  },
  async listProjects(opts) {
    const r = await invokeBridge<{ projects: PortalProject[] }>(
      "listProjects", opts?.clientId ? { clientId: opts.clientId } : undefined,
    );
    return r.projects ?? [];
  },
  async getProject(projectId) {
    const r = await invokeBridge<{ project: PortalProject | null }>("getProject", { projectId });
    return r.project ?? null;
  },
  async listMilestones(projectId) {
    const r = await invokeBridge<{ milestones: PortalMilestone[] }>("listMilestones", { projectId });
    return r.milestones ?? [];
  },
  async listTasks({ projectId, milestoneId }) {
    const r = await invokeBridge<{ tasks: PortalTask[] }>(
      "listTasks", milestoneId ? { projectId, milestoneId } : { projectId },
    );
    return r.tasks ?? [];
  },
  async updateTask() { return NOT_IMPLEMENTED("updateTask"); },
  async createTask() { return NOT_IMPLEMENTED("createTask"); },
  async archiveTask() { return NOT_IMPLEMENTED("archiveTask"); },
};

// ---------- Selector ----------

const FLAG_KEY = "ops-v2:use-real-bridge";

function isBridgeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(FLAG_KEY) === "1"; } catch { return false; }
}

export function setUseRealBridge(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(FLAG_KEY, "1");
    else window.localStorage.removeItem(FLAG_KEY);
  } catch { /* noop */ }
}

export type PortalMode = "mock" | "bridge";

export const PORTAL_MODE: PortalMode = isBridgeEnabled() ? "bridge" : "mock";
export const PORTAL_CLIENT_IS_MOCK = PORTAL_MODE === "mock";

// ---------- Bridge error bus ----------
// Quando estamos em modo bridge e a chamada falha, NUNCA caímos para mock.
// O erro é propagado (rethrow) e também publicado num bus simples para que
// a UI consiga exibir um banner global de erro com retry.

export interface BridgeErrorState {
  message: string;
  action: string;
  at: number;
}

type Listener = (state: BridgeErrorState | null) => void;
const listeners = new Set<Listener>();
let currentError: BridgeErrorState | null = null;

export function getBridgeError(): BridgeErrorState | null {
  return currentError;
}
export function subscribeBridgeError(fn: Listener): () => void {
  listeners.add(fn);
  fn(currentError);
  return () => { listeners.delete(fn); };
}
function publishBridgeError(next: BridgeErrorState | null) {
  currentError = next;
  listeners.forEach((l) => { try { l(next); } catch { /* noop */ } });
}
export function clearBridgeError() { publishBridgeError(null); }

// Wrapper que registra erro no bus antes de rethrow (sem fallback p/ mock).
function withBridgeErrorReporting<T extends PortalClientApi>(client: T): T {
  const wrap = <Args extends unknown[], R>(name: string, fn: (...a: Args) => Promise<R>) =>
    async (...args: Args): Promise<R> => {
      try {
        const r = await fn(...args);
        if (currentError && currentError.action === name) clearBridgeError();
        return r;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        publishBridgeError({ message, action: name, at: Date.now() });
        throw e;
      }
    };
  return {
    listClients: wrap("listClients", client.listClients.bind(client)),
    listProjects: wrap("listProjects", client.listProjects.bind(client)),
    getProject: wrap("getProject", client.getProject.bind(client)),
    listMilestones: wrap("listMilestones", client.listMilestones.bind(client)),
    listTasks: wrap("listTasks", client.listTasks.bind(client)),
    updateTask: wrap("updateTask", client.updateTask.bind(client)),
    createTask: wrap("createTask", client.createTask.bind(client)),
    archiveTask: wrap("archiveTask", client.archiveTask.bind(client)),
  } as T;
}

/**
 * Cliente ativo.
 *   - Default: mockClient.
 *   - Quando localStorage["ops-v2:use-real-bridge"] === "1": bridgeClient
 *     ESTRITO. Erros NÃO caem para mock — são propagados e a UI mostra
 *     banner de erro + retry.
 *
 * Para alternar via console:
 *   localStorage.setItem("ops-v2:use-real-bridge", "1"); location.reload();
 *   localStorage.removeItem("ops-v2:use-real-bridge"); location.reload();
 */
export const portalClient: PortalClientApi =
  PORTAL_MODE === "bridge" ? withBridgeErrorReporting(bridgeClient) : mockClient;