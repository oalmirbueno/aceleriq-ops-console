export const featureFlags = {
  canvasOpsEnabled: true,
  canvasBottomDockEnabled: true,
  canvasOperationalOverlayEnabled: true,
  // Etapa 1 — modo "operação limpa": abrir telas não dispara
  // sync/materialização automáticos. Tudo manual.
  enableAutoPortalSync: false,
  enableCanvasAutoMaterialize: false,
  enableDevSyncTools: false,
  // Etapa 1B — bloqueia criação automática de project_group/milestone_group
  // dentro de materializePortalTimelineCanvas e qualquer outro caminho
  // que tente "garantir" a pasta de projeto ao abrir tela.
  enableAutoProjectGroupCreation: false,
  // Etapa 3 — Modo Operação no Canvas:
  //  - query do CanvasStudio busca somente nodes vinculados ao Portal
  //    (portal_task_id / portal_milestone_id / portal_project_id) +
  //    a pasta do cliente (node_type=client).
  //  - esconde botões dev/avançados do toolbar.
  //  - estado vazio simples, sem auto-criação.
  canvasOperationMode: true,
  // Ferramentas avançadas do canvas (Reorganizar, Fluxo Ops, Gerar esteira,
  // Templates, Playbook, Smoke test, Verificar realtime). OFF por padrão.
  enableCanvasDevTools: false,
};
