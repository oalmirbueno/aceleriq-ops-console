import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

/** Auto-layout determinístico: agrupa por node_type em colunas. */
export function computeAutoLayout(nodes: CanvasNodeRecord[]): Array<{ id: string; x: number; y: number }> {
  const order = ["client", "dossier", "context", "front", "task", "asset", "metric", "before_after", "case"];
  const cols: Record<string, CanvasNodeRecord[]> = {};
  nodes.forEach((n) => {
    (cols[n.node_type] ??= []).push(n);
  });

  const result: Array<{ id: string; x: number; y: number }> = [];
  const colW = 260;
  const rowH = 130;
  const padX = 80;
  const padY = 60;

  let colIdx = 0;
  for (const t of order) {
    const list = cols[t];
    if (!list || list.length === 0) continue;
    list.forEach((n, i) => {
      result.push({ id: n.id, x: padX + colIdx * colW, y: padY + i * rowH });
    });
    colIdx++;
  }
  // include any unknown types at the end
  Object.entries(cols).forEach(([t, list]) => {
    if (order.includes(t)) return;
    list.forEach((n, i) => {
      result.push({ id: n.id, x: padX + colIdx * colW, y: padY + i * rowH });
    });
    colIdx++;
  });
  return result;
}

/** Posição central inteligente para um novo node */
export function nextNodePosition(existing: CanvasNodeRecord[]): { x: number; y: number } {
  if (existing.length === 0) return { x: 200, y: 200 };
  const maxX = Math.max(...existing.map((n) => Number(n.pos_x ?? 0)));
  const maxY = Math.max(...existing.map((n) => Number(n.pos_y ?? 0)));
  return { x: maxX + 80, y: maxY + 60 };
}
