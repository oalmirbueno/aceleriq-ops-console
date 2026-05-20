# Central de Briefings — reset do app

Reduzir o app a uma única função: gerenciar briefings (Estruturação Empresarial e Automação/IA) por cliente. Tudo que é canvas, projetos, tarefas, milestones, dashboard ops, IA hub e configurações operacionais sai do caminho do usuário.

## O que fica

- **Login** (`/login`) e auth atual.
- **Página pública do cliente** (`/briefing/:token`) — `ClientBriefingPage`, fluxo de preenchimento, salvar progresso, submeter. Nada muda aqui.
- **Edge functions de briefing**: `issue-briefing-token`, `public-briefing`, `consolidate-briefing`, `parse-briefing`. Continuam como estão.
- **Tabelas existentes no Supabase**: `clients`, `workspaces`, `context_entries`. Sem migration.
- **Blocos/sinais**: `enterpriseStructuringBlocks.ts`, `automationBlocks.ts`, `briefingSignals.ts`, `briefingToken.ts`, `briefingPersistence.ts`, `briefingExport.ts`.

## O que sai do caminho

Rotas removidas do `App.tsx` (arquivos podem ficar no repo por ora, sem link):
- Tudo de `/ops/*` (legacy): clients, workspaces, canvas, settings, ai, sync-logs.
- Tudo de `/ops-v2/*`: dashboard, clientes, projetos, canvas v2, configurações, tabs.
- `/ops/canvas/open`, `/ops/projects/:portalProjectId`.

`/` passa a redirecionar para `/briefings`.

## Nova estrutura

Rotas novas:
- `/` → redirect `/briefings`
- `/briefings` → **Central de Briefings** (lista agrupada por cliente)
- `/briefings/:clientId` → **Detalhe do cliente** (briefings enviados + ação "novo link")
- `/briefings/:clientId/:entryId` → **Visualização da resposta** (consolidado + export PDF/MD)
- `/briefing/:token` → mantida (página pública do cliente)
- `/login` → mantida

Layout novo e enxuto: header simples com logo + email do usuário + logout. Sem sidebar.

## Componentes a criar

`src/briefings/`
- `layout/BriefingsLayout.tsx` — shell com header minimalista.
- `pages/BriefingsCentralPage.tsx` — lista de clientes com contagem de briefings (enviados/respondidos), busca, "Novo cliente".
- `pages/BriefingsClientPage.tsx` — cards dos briefings desse cliente, status (rascunho aberto / respondido / nunca enviado), botão "Gerar link" (reusa `GenerateBriefingLinkDialog`), botão "Ver resposta".
- `pages/BriefingsAnswerPage.tsx` — usa `BriefingConsolidatedView` num wrapper limpo, com export.
- `data/useBriefings.ts` — react-query hooks: `useClientsWithBriefings`, `useClientBriefings(clientId)`, lendo `clients`, `workspaces`, `context_entries` direto pelo client supabase (já é o padrão atual).

## Limpeza no `App.tsx`

Remove imports e rotas dos blocos OPS legacy e OPS V2. Mantém `BrowserRouter`, `AuthProvider`, `ProtectedRoute`, toasts, `QueryClientProvider`. Rota `*` continua `NotFound`.

## Detalhes técnicos

- **Workspace por cliente**: o token de briefing exige `workspaceId`. A central garante um workspace "default" por cliente (já existe na base; se faltar, cria via insert simples na hora de gerar o link). Sem migration.
- **Status dos briefings**: derivado de `context_entries` (kind = `briefing_draft` / `briefing_submitted`) filtrado por `metadata.briefing_type`. Lista mostra o mais recente de cada tipo.
- **Sem mexer em**: portal-bridge, portalClient, sync legacy, canvas_nodes, edge functions de sync.
- **Memória**: atualizar `mem://index.md` para refletir o novo escopo (app = central de briefings).

## Plano de execução

1. Criar `src/briefings/data/useBriefings.ts`.
2. Criar `BriefingsLayout`, `BriefingsCentralPage`, `BriefingsClientPage`, `BriefingsAnswerPage`.
3. Reescrever `src/App.tsx` com as 5 rotas finais.
4. Atualizar `mem://index.md`.
5. Typecheck.

Arquivos legados ficam no repo mas sem rota; podem ser deletados num passo 2 se você quiser limpeza física.
