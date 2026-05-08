# OPS V2 — Contrato Portal-native

Documento vivo. Fase V2.1 (read-only).

## ⚠️ Bloqueio atual — task→milestone não resolvível pela bridge

Diagnóstico (v2.2.7, `inspectPortalPayload`):

`ops-full-export` retorna tasks **flat**, com apenas:

- `id`
- `project_id`
- `title`
- `description`
- `status`
- `priority`
- `assigned_to`
- `created_at`

Não existe nenhum dos campos:

- `milestone_id` / `portal_milestone_id`
- `folder_id` / `portal_folder_id`
- `parent_id` / `parent_node_id`
- container / nesting (tasks **não** vêm aninhadas dentro de milestones).

Conclusão: **não é problema de alias na bridge**. É problema de
contrato do Portal/export. A bridge não tem como resolver
task→milestone de forma determinística enquanto o Portal não expor
esse vínculo.

### O que a bridge NÃO deve fazer

- Não inventar fallback baseado em título, ordem, autor, data.
- Não usar `canvas_nodes` legacy do OPS como fonte.
- Não criar bucket "Sem milestone" para acomodar tasks órfãs.
- Não tentar adivinhar relação por heurística.
- A bridge fica em estado **aguardando contrato** até o Portal
  expor `milestone_id` real nas tasks.

### Contrato obrigatório (a ser implementado no Portal)

Cada task em `ops-full-export` (e em `ops-tasks-list`) precisa vir
com pelo menos um destes campos, em ordem de preferência:

1. `milestone_id` (preferencial)
2. `portal_milestone_id`
3. `folder_id` (se for o nome real usado pelo Portal)

Formato ideal de task:

```json
{
  "id": "task_id",
  "project_id": "project_id",
  "milestone_id": "milestone_id",
  "title": "...",
  "description": "...",
  "status": "...",
  "priority": "...",
  "assigned_to": "...",
  "created_at": "..."
}
```

Enquanto esse contrato não estiver vigente, o Canvas V2 do OPS
permanece sem listar tasks por milestone — por design, não por bug.
Fase 2 (CanvasStudio adapter) **não** começa antes disso.

## Princípio

OPS V2 não duplica entidades. Cliente, projeto, milestone e task vivem
no Portal. O OPS V2 lê via uma camada única: `src/v2/data/portalClient.ts`.

## O que NÃO é usado pelo OPS V2

- `pull-portal-tasks` (legacy)
- `sync-to-portal` (legacy)
- `sync-milestones-to-portal` (legacy)
- `backfill-from-portal` / `backfill-nodes-to-portal` (legacy)
- `receive-portal-sync` (legacy, lado servidor)
- Qualquer caminho que materialize `canvas_nodes` automaticamente

## Endpoints do Portal usados pelo OPS V2 (read-only)

Já existem no projeto Portal (`gicbrgagstyvbaaumprj`) e são chamados a
partir da edge `portal-bridge` do OPS, com header `x-webhook-secret`:

| Endpoint              | Uso                                                  |
|-----------------------|------------------------------------------------------|
| `ops-full-export`     | Fonte primária. Retorna `{ projects, tasks, milestones }`. |
| `ops-projects-list`   | Fallback se `ops-full-export` indisponível.         |
| `ops-tasks-list`      | Fallback se `ops-full-export` indisponível.         |

Nenhum endpoint novo no Portal foi necessário. Nenhum endpoint do
Portal foi alterado.

## Edge function nova no OPS: `portal-bridge`

`supabase/functions/portal-bridge/index.ts`

Aceita POST com `{ action, params }`. Apenas leitura.

| action          | params                              | resposta                  |
|-----------------|-------------------------------------|---------------------------|
| `listClients`   | —                                   | `{ ok, clients }`         |
| `listProjects`  | `{ clientId? }`                     | `{ ok, projects }`        |
| `getProject`    | `{ projectId }`                     | `{ ok, project }`         |
| `listMilestones`| `{ projectId }`                     | `{ ok, milestones }`      |
| `listTasks`     | `{ projectId, milestoneId? }`       | `{ ok, tasks }`           |

A bridge:

- normaliza status (`todo|in_progress|blocked|done|archived` para tasks;
  `planned|in_progress|done|paused` para milestones).
- normaliza progresso para 0..1 (aceita 0..1 ou 0..100).
- deriva `tasksCount` / `tasksDoneCount` por milestone.
- deriva `currentMilestoneId` por projeto (primeiro `in_progress`,
  depois `planned`).
- não escreve em nada. Não faz INSERT / UPDATE / DELETE.
- não chama Supabase do OPS. Apenas `fetch` para o Portal.

`verify_jwt = true` em `supabase/config.toml` — só usuários
autenticados do OPS podem chamar.

## Secrets

Já existentes no projeto OPS (sem novos secrets para esta fase):

- `PORTAL_WEBHOOK_SECRET` — autenticação compartilhada com o Portal.
- `PORTAL_ANON_KEY` — anon key do Supabase do Portal.

## Frontend

- Mock continua **default**.
- Para ligar a bridge real no piloto:
  `localStorage.setItem("ops-v2:use-real-bridge", "1")` e recarregar.
- Header V2 mostra selo `demo` enquanto o mock estiver ativo.

## Fase V2.1 — Read-only

Implementado:

- `listClients`
- `listProjects`
- `getProject`
- `listMilestones`
- `listTasks`

Explicitamente NÃO implementado nesta fase:

- `updateTask` / `createTask` / `archiveTask`
- qualquer mutation
- backfill, sync automático, materialização

## Confirmação

- Zero mudança no frontend / banco / edge functions do Portal.
- Zero mutation server-side a partir do OPS V2.
- Zero tabela nova.
