
# Reorganização da entrada do canvas (projeto → milestone → esteira)

Objetivo: fluxo limpo, sem precisar apertar nada. Workspace lista os projetos vindos do Portal, cada projeto abre seu próprio canvas, milestones aparecem como pastas/abas no topo da esteira, tasks são os nodes. Tudo bidirecional em tempo real.

Sem mudanças de SQL. Sem novas edge functions. Apenas frontend + ajustes pontuais nas funções existentes (`pull-portal-tasks` já lida com isso).

---

## 1. Workspace agora lista projetos (em vez de "Abrir Canvas" cego)

**Arquivo:** `src/pages/WorkspaceDetailPage.tsx`

- Remover o botão único "Abrir Canvas" que ia para `/ops/canvas/open?...` (que confunde quando há mais de um projeto e abre um canvas vazio quando não há nenhum).
- Adicionar um pequeno seletor "Projetos do Portal" no header (ou aba `canvas`):
  - Lê `canvas_nodes` com `data.kind = project_group` do workspace.
  - Mostra cada projeto como cartão; click → `navigate("/ops/projects/:portalProjectId")` (rota que já existe).
  - Se a lista estiver vazia, mostra um estado neutro "Aguardando projeto do Portal — sincronizando…" e dispara `pull-portal-tasks` automaticamente em background (nada de botão).
- Remover botões redundantes "Sync portal" / "Atualizar progresso" do header. Manter um único "Sincronizar" discreto (ícone refresh) escondido num menu, só como fallback.

## 2. Auto-pull ao abrir um projeto (sem clicar em sync)

**Arquivo:** `src/pages/ProjectCanvasPage.tsx`

- Antes de montar o `CanvasStudio`, invocar `supabase.functions.invoke("pull-portal-tasks", { body: { workspaceId, portalProjectId } })` uma vez (silencioso, sem toast). Mostrar `Loader` até resolver.
- Depois disso, o realtime em `canvas_nodes` mantém tudo atualizado. O `usePortalAutoSync` global continua cobrindo deleções.
- Resultado: ao entrar no projeto, milestones e tasks já chegam puxados sem nenhum clique.

## 3. Seletor de milestone (pasta) no topo do canvas

Já existe `CanvasMilestoneTabs` — vamos torná-lo a entrada principal:

**Arquivo:** `src/components/workspace/CanvasStudio.tsx`

- Quando `portalProjectIdProp` está definido (rota `/ops/projects/:id`):
  - Se `selectedMilestoneId` for `null`, NÃO mostrar a esteira completa: mostrar uma tela "Escolha o milestone" com cards grandes (uma pasta por milestone, com contador done/total) + opção "Visão geral" pra ver tudo.
  - Ao escolher uma pasta, ativa `selectedMilestoneId` e o canvas entra em modo esteira fordista (esse modo já existe — `FordismoLaneNode`).
  - As outras pastas continuam visíveis como abas no topo (já é o comportamento atual do `CanvasMilestoneTabs`), permitindo trocar sem sair.
- Quando criar um node novo no canvas com milestone selecionado, propagar `portal_milestone_id` no payload de `sync-to-portal` (já feito), garantindo que aparece no kanban do Portal dentro da coluna/milestone certa.

## 4. Limpeza de botões confusos

- `WorkspaceTabCanvas`: remover o botão "Abrir canvas completo" duplicado e usar apenas o seletor de projetos.
- `WorkspaceDetailPage` header: tirar "Abrir Canvas" genérico; deixar só ações relevantes (Chat IA, Prompts IA).
- `CanvasFullscreenPage`: simplificar — se `workspaceId` tem 0 projetos, redireciona pro WorkspaceDetailPage com aviso "Nenhum projeto ainda — crie um no Portal"; se tem 1, abre direto; se tem N, mostra escolha (já faz isso, ok).

## 5. Realtime bidirecional (já funcionando, manter)

Não mexer em:
- `receive-portal-sync` (Portal → Ops)
- `sync-to-portal` (Ops → Portal)
- `usePortalAutoSync` (reconciliação 60s)
- Triggers do canvas_nodes

Apenas garantir que ao criar um node no modo esteira de um milestone selecionado, o payload Ops→Portal carregue `milestone_id` (verificar `syncToPortalEvents.ts`; ajuste pontual se faltar).

---

## Diagrama do fluxo final

```text
/ops/workspaces/:wsId
  └── [Projeto A] [Projeto B]   ← cards (project_group do Portal)
         │
         ▼ click
/ops/projects/:portalProjectId   ← auto-pull dispara
  └── "Escolha o milestone"
       [Discovery] [Estratégia] [Produção] [Lançamento]
              │
              ▼ click
       Canvas em modo esteira fordista do milestone
       ── tabs no topo permitem trocar sem sair ──
       Tasks = nodes, criados/editados ↔ Portal kanban em tempo real
```

---

## Detalhes técnicos

- Nenhum SQL novo. Schema atual (`canvas_nodes` com `data.kind` em `project_group`/`milestone_group`, `portal_project_id`, `portal_milestone_id`) já cobre tudo.
- Nenhuma edge function nova. `pull-portal-tasks` já cria os groups de projeto/milestone idempotentemente (visto em `ensureProjectGroupNode` / `ensureMilestoneGroupNode`).
- Mudanças isoladas em 4 arquivos React: `WorkspaceDetailPage.tsx`, `ProjectCanvasPage.tsx`, `CanvasStudio.tsx`, `WorkspaceTabCanvas.tsx`. Não toca em sync, realtime, drawers, IA, métricas.
- Risco: baixo. Removemos apenas botões e adicionamos um gate visual antes da esteira. Se o usuário não escolher milestone, ainda há "Visão geral" para o comportamento legado.

## Como você verifica depois

1. Apaga um milestone no Portal → some da barra e da tela de escolha em ≤60s.
2. Cria task no Portal dentro de um milestone → aparece como node já no milestone certo (sem refresh).
3. Cria node no Ops com um milestone selecionado → vira task no kanban do Portal naquele milestone.
4. Workspace sem projeto: mostra "aguardando projeto do Portal", sem botão Sync visível.

Aprova para eu aplicar?
