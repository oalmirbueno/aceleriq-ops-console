# OPS V2 — Contrato Portal-native

Documento vivo. Fase V2.0.

## Princípio

OPS V2 não duplica entidades. Cliente, projeto, milestone e task vivem
no Portal. O OPS V2 lê e opera via uma camada única:
`src/v2/data/portalClient.ts`.

## O que NÃO é usado pelo OPS V2

- `pull-portal-tasks` (legacy)
- `sync-to-portal` (legacy)
- `sync-milestones-to-portal` (legacy)
- `backfill-from-portal` / `backfill-nodes-to-portal` (legacy)
- `receive-portal-sync` (legacy, lado servidor)
- Qualquer caminho que materialize `canvas_nodes` automaticamente

Essas funções continuam vivas para o OPS legacy e Modo Dev. Não entram
no fluxo operacional V2.

## Camada esperada

Bridge server-side dedicada no projeto OPS (a criar quando o contrato
for aprovado), provisoriamente nomeada `portal-bridge`, que chama
endpoints novos no Portal — read por padrão e mutations explícitas. O
Portal não terá UI alterada por isso.

```
 OPS V2 (browser)
    |
    v  fetch
 portal-bridge (edge function OPS)   <- a criar na Fase V2.1
    |
    v  HTTPS + secret
 Portal endpoints novos              <- a criar/expor pelo time Portal
    |
    v
 Tabelas reais do Portal
```

## Endpoints necessários (a confirmar com Portal)

Read:

| Operação            | Método | Path sugerido                | Resposta              |
|---------------------|--------|------------------------------|-----------------------|
| Listar clientes     | POST   | `/ops/v1/clients/list`       | `PortalClient[]`      |
| Listar projetos     | POST   | `/ops/v1/projects/list`      | `PortalProject[]`     |
| Detalhe de projeto  | POST   | `/ops/v1/projects/get`       | `PortalProject`       |
| Listar milestones   | POST   | `/ops/v1/milestones/list`    | `PortalMilestone[]`   |
| Listar tasks        | POST   | `/ops/v1/tasks/list`         | `PortalTask[]`        |

Write (Fase V2.3+, sob aprovação):

| Operação            | Método | Path sugerido                | Body                  |
|---------------------|--------|------------------------------|-----------------------|
| Atualizar task      | POST   | `/ops/v1/tasks/update`       | `UpdateTaskInput`     |
| Criar task          | POST   | `/ops/v1/tasks/create`       | `CreateTaskInput`     |
| Arquivar task       | POST   | `/ops/v1/tasks/archive`      | `{ taskId }`          |

Autenticação: header compartilhado `x-ops-bridge-secret`, idêntico ao
padrão de `portal-proxy`. Identidade do operador via JWT do OPS
propagado no body (`actorEmail`).

## Tipos

Ver `src/v2/data/portalClient.ts` — fonte da verdade tipada. Mudanças
de contrato precisam atualizar essa interface antes das telas.

## Estado atual

- `portalClient` exporta implementação **mock** (`PORTAL_CLIENT_IS_MOCK = true`).
- Telas V2 mostram selo "demo" no header enquanto o mock estiver ativo.
- Trocar para implementação real só depois que:
  1. Endpoints do Portal estiverem definidos e aprovados.
  2. `portal-bridge` estiver implantada no projeto OPS.
  3. Smoke test passar em ambiente piloto.

## Não fazer nesta fase

- Não criar migrations.
- Não criar `ops_canvas_layout` nem `ops_context_entries` ainda.
- Não tocar em edge functions legacy.
- Não redirecionar `/ops` para `/ops-v2`.
- Não desligar o OPS antigo.