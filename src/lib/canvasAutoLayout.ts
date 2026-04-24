/**
 * canvasAutoLayout — sistema de auto-layout inteligente para nodes e edges.
 *
 * Estratégia: colunas por etapa ACELERA + distribuição vertical que minimiza
 * cruzamentos de edges.
 *
 * Algoritmo:
 *  1. Agrupa nodes por etapa (stage) → colunas
 *  2. Dentro de cada coluna, ordena nodes baseado em conexões:
 *     - Nodes que recebem de mais cedo ficam acima
 *     - Nodes que alimentam muitos ficam no meio
 *  3. Calcula pos_x/pos_y com espaçamento adequado
 *  4. Evita sobreposição entre grupos de cliente (offset)
 */

import type { AceleraStageKey } from "./canvasProjectTypes";

export const LAYOUT_CONFIG = {
  COL_WIDTH: 360,        // largura de cada coluna de etapa
  ROW_HEIGHT: 200,       // altura entre rows
  NODE_WIDTH: 260,       // largura aproximada do node card
  NODE_HEIGHT: 140,      // altura aproximada do node card
  ORIGIN_X: 60,
  ORIGIN_Y: 80,
  STAGE_PADDING: 40,     // padding interno de cada coluna
  CLIENT_OFFSET_Y: 900,  // offset vertical entre clientes diferentes no canvas
};

const STAGE_ORDER: AceleraStageKey[] = [
  "entrada", "diagnostico", "estrutura_base", "planejamento",
  "producao", "ativacao", "otimizacao", "expansao",
];

export function stageToColumn(stage: AceleraStageKey): number {
  return STAGE_ORDER.indexOf(stage);
}

interface LayoutNode {
  ref: string;
  stage: AceleraStageKey;
  kind: string;
  // Conexões
  incoming: string[]; // refs que apontam pra este
  outgoing: string[]; // refs pra onde aponta
}

interface LayoutEdge {
  fromRef: string;
  toRef: string;
}

/**
 * Calcula posições ideais para nodes de um playbook
 * minimizando cruzamentos de edges.
 */
export function calculateLayout(
  nodes: Array<{ ref: string; stage: AceleraStageKey; kind: string }>,
  edges: LayoutEdge[],
  baseX = LAYOUT_CONFIG.ORIGIN_X,
  baseY = LAYOUT_CONFIG.ORIGIN_Y,
): Record<string, { pos_x: number; pos_y: number }> {
  // 1. Monta estrutura com conexões
  const layoutNodes: Record<string, LayoutNode> = {};
  for (const n of nodes) {
    layoutNodes[n.ref] = {
      ref: n.ref,
      stage: n.stage,
      kind: n.kind,
      incoming: [],
      outgoing: [],
    };
  }
  for (const e of edges) {
    if (layoutNodes[e.fromRef]) layoutNodes[e.fromRef].outgoing.push(e.toRef);
    if (layoutNodes[e.toRef]) layoutNodes[e.toRef].incoming.push(e.fromRef);
  }

  // 2. Agrupa por coluna (stage)
  const columns: Record<number, LayoutNode[]> = {};
  for (const n of Object.values(layoutNodes)) {
    const col = stageToColumn(n.stage);
    if (col < 0) continue;
    if (!columns[col]) columns[col] = [];
    columns[col].push(n);
  }

  // 3. Para cada coluna, calcula "peso vertical" de cada node:
  //    - Nodes com incoming de rows mais altas ficam mais altos
  //    - Usa barycenter heuristic
  const positions: Record<string, { pos_x: number; pos_y: number }> = {};
  const assignedRows: Record<string, number> = {}; // ref -> row index

  // Primeira passada: atribuição simples ordenada por incoming count
  const sortedCols = Object.keys(columns).map(Number).sort((a, b) => a - b);

  for (const col of sortedCols) {
    const colNodes = columns[col];

    // Ordena nodes da coluna priorizando:
    // 1. Nodes com incoming: posiciona perto da média dos pais
    // 2. Nodes sem incoming: mantém ordem original
    const withIncoming = colNodes.filter(n => n.incoming.length > 0);
    const withoutIncoming = colNodes.filter(n => n.incoming.length === 0);

    // Para nodes com incoming, calcula barycenter (média de rows dos pais)
    const barycenters: Record<string, number> = {};
    for (const n of withIncoming) {
      const parentRows = n.incoming
        .map(ref => assignedRows[ref])
        .filter(r => r !== undefined);
      barycenters[n.ref] = parentRows.length > 0
        ? parentRows.reduce((s, r) => s + r, 0) / parentRows.length
        : 0;
    }

    // Ordena com incoming pelo barycenter
    withIncoming.sort((a, b) => (barycenters[a.ref] ?? 0) - (barycenters[b.ref] ?? 0));

    // Combina: sem incoming primeiro (topo), depois com incoming ordenados
    const orderedNodes = [...withoutIncoming, ...withIncoming];

    // Atribui rows sequenciais
    orderedNodes.forEach((n, idx) => {
      assignedRows[n.ref] = idx;
      positions[n.ref] = {
        pos_x: baseX + col * LAYOUT_CONFIG.COL_WIDTH,
        pos_y: baseY + idx * LAYOUT_CONFIG.ROW_HEIGHT,
      };
    });
  }

  return positions;
}

/**
 * Detecta slot livre para colocar um cliente novo no canvas.
 * Usa offset vertical para separar clientes.
 */
export function findClientOffset(existingClients: number): { x: number; y: number } {
  return {
    x: 0,
    y: existingClients * LAYOUT_CONFIG.CLIENT_OFFSET_Y,
  };
}

/**
 * Distribui nodes de um cliente existente em layout organizado.
 * Útil pra botão "Reorganizar" do canvas.
 */
export function reorganizeClientNodes(
  nodes: Array<{ id: string; data: Record<string, unknown> | null; node_type: string }>,
  edges: Array<{ source_node_id: string; target_node_id: string }>,
): Record<string, { pos_x: number; pos_y: number }> {
  // Deriva stage de cada node
  const derivedNodes = nodes.map(n => {
    const d = n.data as any;
    const stage: AceleraStageKey = (d?.stage as AceleraStageKey) ?? "entrada";
    const kind = (d?.kind as string) ?? n.node_type;
    return { ref: n.id, stage, kind };
  });
  const derivedEdges = edges.map(e => ({ fromRef: e.source_node_id, toRef: e.target_node_id }));
  return calculateLayout(derivedNodes, derivedEdges);
}
