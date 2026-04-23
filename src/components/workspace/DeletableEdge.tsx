/**
 * DeletableEdge — edge customizada com botão de deletar visível.
 *
 * O parent (CanvasStudio) passa os callbacks via `data`:
 *   data.onDelete(id)          → remove do DB + atualiza dbEdges
 *   data.onEditLabel(id, val)  → atualiza label no DB + em dbEdges
 *
 * Isso garante que a deleção é instantânea e permanente — não volta
 * no próximo re-render do reactFlowEdges memo.
 */
import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { X, Pencil } from "lucide-react";

export interface DeletableEdgeData extends Record<string, unknown> {
  onDelete?: (edgeId: string) => void | Promise<void>;
  onEditLabel?: (edgeId: string, newLabel: string | null) => void | Promise<void>;
}

function DeletableEdgeComp(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, style, markerEnd,
    label, selected, data,
  } = props;
  const [hover, setHover] = useState(false);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  const show = hover || selected;
  const edgeData = (data ?? {}) as DeletableEdgeData;

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    edgeData.onDelete?.(id);
  };

  const handleEditLabel = (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = String(label ?? "");
    const next = window.prompt("Rótulo da conexão (vazio para remover):", current);
    if (next === null) return;
    const cleanLabel = next.trim() || null;
    edgeData.onEditLabel?.(id, cleanLabel);
  };

  return (
    <g
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />

      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 18}px)`,
              pointerEvents: "all",
              background: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "999px",
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.2px",
              color: "hsl(var(--foreground))",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
            }}
            className="nodrag nopan"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}

      {show && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 14}px)`,
              pointerEvents: "all",
              display: "flex",
              gap: "4px",
            }}
            className="nodrag nopan"
          >
            <button
              type="button"
              onClick={handleEditLabel}
              title="Editar rótulo"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary transition-all shadow-md hover:scale-110"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              title="Remover conexão"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-red-400 hover:border-red-400 hover:bg-red-400/10 transition-all shadow-md hover:scale-110"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  );
}

export default memo(DeletableEdgeComp);
