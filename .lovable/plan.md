## Hierarquia oficial do produto

```text
Cliente
  └── Projeto / Workspace
        └── Milestone        ← frente/tema/missão de execução
              └── Task        ← ação executável (node no canvas)
```

Portal é fonte da verdade. OPS espelha e opera. Milestone é a **camada central** de organização — nada de node solto, nada de "Sem milestone", nada de `project_group`/`front` legado, nada de milestone criado automaticamente ao abrir tela.

---

## A) Diagnóstico das telas atuais (revisado com foco em milestone)

| Tela | Problema |
|---|---|
| Dashboard | Não menciona milestones. Cards focam em workspaces e eventos crus. |
| Clientes | Não mostra milestone atual nem próxima ação. |
| Workspace | Não tem aba Milestones. Milestones só existem como abas dentro do canvas. |
| Canvas | Já filtra server-side, mas pode entrar sem milestone selecionado e tentar renderizar tudo. |
| Tarefas | Não existe como aba dedicada. Tasks só vivem dentro do canvas. |
| Histórico/Feed | Sem filtro por milestone, mistura eventos técnicos. |
| Settings | Modo Dev existe mas não centraliza ferramentas técnicas. |
| Sidebar | ADMIN sempre visível, polui modo operação. |

---

## B) Arquitetura de navegação (milestone-first)

```text
/ops (Modo Operação — padrão)
├── Dashboard
│     KPIs: projetos ativos · milestones em andamento ·
│            tasks abertas · tasks vencidas · progresso por milestone
├── Clientes
│     Linha: cliente · projeto ativo · milestone atual · progresso · próxima ação
│     └── Cliente
├── Workspaces
│     └── Workspace (abas fixas)
│           ├── Visão geral     KPIs do projeto + milestone atual + próximas tasks
│           ├── Milestones       lista visual (status, progresso, #tasks, abrir Canvas/Portal)
│           ├── Tarefas          agrupadas por milestone, filtros por status
│           ├── Canvas           inicia com seleção de milestone obrigatória
│           ├── Contexto         memória/decisões/observações/próximos passos
│           ├── Arquivos         drive/assets
│           └── Histórico        feed útil, filtrável por milestone
└── Configurações
      └── [Modo Dev ON revela]
            ├── IA / Agentes
            ├── Sync logs
            ├── Sync manual / Smoke test / Verify realtime
            ├── Templates / Playbook / Repair legacy
            └── Toggles "mostrar internos / legados / sem vínculo"
```

Sidebar: seção ADMIN (IA, Sync logs, Configurações avançadas) só aparece com Modo Dev ON.

---

## C) Componentes a criar / simplificar

Novos (frontend only):
- `src/lib/milestoneModel.ts` — derivar projetos/milestones/tasks a partir de `canvas_nodes` Portal-bound (já bound pela query server-side da Etapa 3). Funções: `listMilestones(projectId)`, `listTasksByMilestone(milestoneId)`, `milestoneProgress(milestone, tasks)`.
- `src/lib/operationalEvents.ts` — predicado para esconder `sync_*`/`e2e_*`/`smoke_*`/`fake_*` no feed.
- `src/components/workspace/MilestonesTab.tsx` — aba dedicada.
- `src/components/workspace/TasksTab.tsx` — aba dedicada, agrupada por milestone.
- `src/components/workspace/ContextTab.tsx` — consolidar leitura/edição de memória/decisões/próximos passos.
- `src/components/workspace/HistoryTab.tsx` — feed filtrado + filtro por milestone.
- `src/components/DevOnly.tsx` — wrapper de renderização condicional.

Simplificar:
- `DashboardPage` → KPIs milestone-aware (projetos ativos, milestones em andamento, tasks abertas/vencidas, progresso médio por milestone).
- `WorkspacesPage` → cards com milestone atual + progresso. Toggles dev movem-se para Settings.
- `ClientsPage` → colunas: cliente · projeto · milestone atual · progresso · próxima ação · CTAs.
- `WorkspaceDetailPage` → 7 abas fixas (acima); resto (Briefing, Funis, Playbook, Templates) só em Modo Dev.
- `CanvasStudio` → exigir milestone selecionado. Sem milestone = tela "Escolha um milestone" (cards grandes com progresso). Render carrega apenas tasks do milestone ativo.
- `AppSidebar` → esconder ADMIN sem Modo Dev.
- `SettingsPage` → hub Modo Dev com cards para cada ferramenta técnica.
- `EmptyState` → variantes "sem milestone", "sem tasks neste milestone".

---

## D) Plano de implementação — 3 etapas

### Etapa 4 — Shell, Modo Dev e gating de Canvas por milestone
Alvo: experiência de operação consistente sem mudar o conteúdo das telas grandes ainda.
- `AppSidebar`: ocultar ADMIN quando Modo Dev OFF.
- `<DevOnly>` wrapper.
- `SettingsPage`: virar hub Modo Dev (toggle em destaque + cards para IA, Sync logs, Sync manual, Smoke test, Verify realtime, Templates, Playbook, toggles de visibilidade).
- `CanvasStudio`: gate obrigatório de milestone. Se nenhum milestone selecionado, mostrar tela "Escolha um milestone" (cards: título, status, #tasks, progresso). "Visão geral" só em Modo Dev. Render carrega apenas tasks do milestone selecionado.
- `AppHeader`: respiro/tipografia.
- Sem mudanças em dados/edge/sync.

### Etapa 5 — Workspace com abas milestone-first
Alvo: introduzir Milestones e Tarefas como cidadãos de primeira classe.
- `milestoneModel.ts` (helpers de derivação).
- `WorkspaceDetailPage`: reorganizar para 7 abas (Visão geral · Milestones · Tarefas · Canvas · Contexto · Arquivos · Histórico).
- Aba **Milestones**: lista visual, status, progresso, #tasks, [Abrir no Canvas] [Abrir no Portal].
- Aba **Tarefas**: agrupadas por milestone, filtro por status, ações rápidas (abrir, marcar concluída via Portal).
- Aba **Visão geral**: KPIs do projeto + milestone atual + próximas tasks.
- Aba **Contexto**: leitura/edição consolidada (reuso de `ContextEntryDialog`).
- Aba **Histórico**: feed filtrado por `isOperationalEvent` + filtro por milestone.
- Briefing/Funis/Playbook/Templates só em Modo Dev.

### Etapa 6 — Dashboard, Clientes e Feed milestone-aware
Alvo: KPIs e listas espelham milestones.
- `DashboardPage`: stats reescritos (projetos ativos, milestones em andamento, tasks abertas, tasks vencidas). Feed filtrado.
- `WorkspacesPage`: cards mostram milestone atual + progresso; toggles dev removidos da toolbar.
- `ClientsPage`: linha enxuta (cliente · projeto · milestone atual · progresso · próxima ação · CTAs Abrir/Portal).
- `operationalEvents.ts` em uso global no feed.

Cada etapa entrega: arquivos alterados, typecheck verde, checklist visual. Zero impacto em banco/edge/sync/migrations.

---

## E) Próximo passo

Aguardo aprovação da **Etapa 4** para começar. Nada será refatorado antes.