/**
 * CanvasViewport — wrapper memoizado do ReactFlow.
 *
 * Isolamento de re-renders: este componente só re-renderiza quando suas props
 * de fato mudam. O CanvasStudio (parent) tem 12+ useStates que causam
 * re-renders frequentes, mas este componente filho ignora essas mudanças
 * a não ser que afetem nodes, edges ou callbacks.
 *
 * Estratégia:
 *  - Todos callbacks recebidos são REFERÊNCIAS ESTÁVEIS (criadas via useRef no pai)
 *  - rfNodes e rfEdges são memoizados via Object.is no array reference
 *  - Outros props (gridVisible, lockedNodes, interactionConfig) são primitivos
 */
import { memo } from "react";
import {
  ReactFlow, Background, BackgroundVariant, ConnectionLineType, ConnectionMode, MarkerType,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  type ReactFlowInstance, type Viewport, SelectionMode,
} from "@xyflow/react";

interface CanvasViewportProps {
  nodes: Node[];
  edges: Edge[];
  nodeTypes: Record<string, React.ComponentType<any>>;
  edgeTypes: Record<string, React.ComponentType<any>>;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (conn: Connection) => void;
  onConnectStart: () => void;
  onConnectEnd: () => void;
  onEdgeContextMenu: (event: React.MouseEvent, edge: Edge) => void;
  onEdgeDoubleClick: (event: React.MouseEvent, edge: Edge) => void;
  isValidConnection: (conn: Connection | Edge) => boolean;
  onNodeClick: (e: React.MouseEvent, node: Node) => void;
  onInit: (inst: ReactFlowInstance) => void;
  onMoveEnd: (e: unknown, vp: Viewport) => void;
  onReconnect?: (oldEdge: Edge, newConn: Connection) => void;
  panOnDrag: boolean | number[];
  selectionOnDrag: boolean;
  gridVisible: boolean;
  lockedNodes: boolean;
}

const FIT_VIEW_OPTIONS = { padding: 0.4 };
const SELECTION_KEY_CODE = ["Shift"];
const MULTI_SELECTION_KEY_CODE = ["Meta", "Control"];
const PRO_OPTIONS = { hideAttribution: true };
const DEFAULT_EDGE_OPTIONS = {
  type: "deletable",
  markerEnd: { type: MarkerType.ArrowClosed, color: "#737373", width: 18, height: 18 },
  style: { stroke: "#737373", strokeWidth: 1.5 },
};
const CONNECTION_LINE_STYLE = { stroke: "hsl(var(--primary))", strokeWidth: 3, opacity: 1 };

function CanvasViewportComp({
  nodes, edges, nodeTypes, edgeTypes,
  onNodesChange, onEdgesChange, onConnect, onConnectStart, onConnectEnd,
  onEdgeContextMenu, onEdgeDoubleClick, isValidConnection, onNodeClick,
  onInit, onMoveEnd, onReconnect, panOnDrag, selectionOnDrag,
  gridVisible, lockedNodes,
}: CanvasViewportProps) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onConnectStart={onConnectStart}
      onConnectEnd={onConnectEnd}
      onEdgeContextMenu={onEdgeContextMenu}
      onEdgeDoubleClick={onEdgeDoubleClick}
      isValidConnection={isValidConnection}
      onNodeClick={onNodeClick}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onInit={onInit}
      onMoveEnd={onMoveEnd}
      fitViewOptions={FIT_VIEW_OPTIONS}
      minZoom={0.1}
      maxZoom={2}
      panOnDrag={panOnDrag}
      panOnScroll={false}
      zoomOnScroll
      zoomOnPinch
      zoomOnDoubleClick={false}
      noWheelClassName="nowheel"
      noPanClassName="nopan"
      noDragClassName="nodrag"
      selectionOnDrag={selectionOnDrag}
      selectionKeyCode={SELECTION_KEY_CODE}
      multiSelectionKeyCode={MULTI_SELECTION_KEY_CODE}
      selectionMode={SelectionMode.Partial}
      proOptions={PRO_OPTIONS}
      className="bg-background canvas-flow acelera-ops-flow"
      defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
      connectionLineStyle={CONNECTION_LINE_STYLE}
      connectionLineType={ConnectionLineType.Bezier}
      connectionRadius={34}
      connectionMode={ConnectionMode.Loose}
      onlyRenderVisibleElements
      nodesDraggable={!lockedNodes}
      edgesFocusable
      edgesReconnectable
      onReconnect={onReconnect}
      deleteKeyCode={["Backspace", "Delete"]}
      nodesConnectable
      onPaneContextMenu={(event) => event.preventDefault()}
      nodeDragThreshold={2}
      snapToGrid={false}
      elementsSelectable
    >
      {gridVisible && (
        <Background
          variant={BackgroundVariant.Dots}
          gap={32}
          size={1.4}
          color="hsl(var(--foreground) / 0.18)"
        />
      )}
    </ReactFlow>
  );
}

/**
 * Comparator customizado: re-renderiza apenas se nodes, edges ou primitivos críticos mudaram.
 */
function arePropsEqual(prev: CanvasViewportProps, next: CanvasViewportProps): boolean {
  if (prev.nodes !== next.nodes) return false;
  if (prev.edges !== next.edges) return false;
  if (prev.gridVisible !== next.gridVisible) return false;
  if (prev.lockedNodes !== next.lockedNodes) return false;
  if (prev.panOnDrag !== next.panOnDrag) return false;
  if (prev.selectionOnDrag !== next.selectionOnDrag) return false;
  // Callbacks são todos refs estáveis — não comparamos
  return true;
}

export const CanvasViewport = memo(CanvasViewportComp, arePropsEqual);
