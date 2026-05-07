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
};
