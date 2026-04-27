/**
 * DeletableEdge v3 — edge com reconexão visual intuitiva.
 *
 * Melhorias v3:
 *  - Endpoints arrastáveis visíveis ao selecionar (indica que pode reconectar)
 *  - Linha mais grossa e colorida ao hover/select
 *  - Área clicável mais larga (20px) para facilitar seleção
 *  - Tooltip "Arraste as pontas para reconectar"
 *  - Comparador customizado mantido para performance
 */
import { memo, useState, useMemo, useCallback } from "react";
import {
  BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps,
} from "@xyflow/react";
import { X, Pencil, MoveHorizontal } from "lucide-react";

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

  const [edgePath, labelX, labelY] = useMemo(
    () => getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]
  );

  const show = hover || selected;
  const edgeData = (data ?? {}) as DeletableEdgeData;

  const handleDelete = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    edgeData.onDelete?.(id);
  }, [id, edgeData]);

  const handleEditLabel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const current = String(label ?? "");
    const next = window.prompt("Rótulo da conexão (vazio para remover):", current);
    if (next === null) return;
    edgeData.onEditLabel?.(id, next.trim() || null);
  }, [id, label, edgeData]);

  const onEnter = useCallback(() => setHover(true), []);
  const onLeave = useCallback(() => setHover(false), []);

  const edgeStyle = useMemo(() => ({
    ...style,
    stroke: selected ? "#00FF88" : hover ? "#A0A0A0" : (style?.stroke ?? "#737373"),
    strokeWidth: selected ? 2.5 : hover ? 2 : 1.5,
    transition: "stroke 0.15s, stroke-width 0.15s",
  }), [style, hover, selected]);

  return (
    <g onMouseEnter={onEnter} onMouseLeave={onLeave}>
      {/* Linha visual */}
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={edgeStyle} />

      {/* Área clicável mais larga (20px) — muito mais fácil de selecionar */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        strokeLinecap="round"
        style={{ cursor: "pointer" }}
      />

      {/* Label do rótulo */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY - 18}px)`,
              pointerEvents: "all",
              background: "hsl(var(--card))",
              border: `1px solid ${selected ? "#00FF8860" : "hsl(var(--border))"}`,
              borderRadius: "999px",
              padding: "2px 8px",
              fontSize: "10px",
              fontWeight: 600,
              color: "hsl(var(--foreground))",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              transition: "border-color 0.15s",
            }}
            className="nodrag nopan"
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      )}

      {/* Endpoints arrastáveis — só aparecem ao selecionar — indicam que pode reconectar */}
      {selected && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${sourceX}px, ${sourceY}px)`,
              width: 14, height: 14, borderRadius: "50%",
              background: "#00FF88", border: "2.5px solid #0E1009",
              boxShadow: "0 0 0 3px #00FF8830",
              pointerEvents: "none", zIndex: 10,
            }}
            title="Arraste para reconectar a origem"
          />
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${targetX}px, ${targetY}px)`,
              width: 14, height: 14, borderRadius: "50%",
              background: "#00FF88", border: "2.5px solid #0E1009",
              boxShadow: "0 0 0 3px #00FF8830",
              pointerEvents: "none", zIndex: 10,
            }}
            title="Arraste para reconectar o destino"
          />
        </EdgeLabelRenderer>
      )}

      {/* Botões de ação */}
      {show && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY + 14}px)`,
              pointerEvents: "all",
              display: "flex",
              gap: "4px",
              alignItems: "center",
            }}
            className="nodrag nopan"
          >
            {/* Dica de reconexão ao selecionar */}
            {selected && (
              <div style={{
                display: "flex", alignItems: "center", gap: "3px",
                background: "hsl(var(--card))", border: "1px solid #00FF8840",
                borderRadius: "999px", padding: "2px 8px",
                fontSize: "9px", color: "#00FF88", marginRight: 2,
                whiteSpace: "nowrap",
              }}>
                <MoveHorizontal style={{ width: 10, height: 10 }} />
                Arraste as pontas para reconectar
              </div>
            )}

            <button
              type="button" onClick={handleEditLabel}
              title="Editar rótulo da conexão"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary transition-all shadow-md hover:scale-110"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button" onClick={handleDelete}
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

function areEdgePropsEqual(prev: EdgeProps, next: EdgeProps): boolean {
  if (prev.selected !== next.selected) return false;
  if (prev.label !== next.label) return false;
  if (prev.sourceX !== next.sourceX || prev.sourceY !== next.sourceY) return false;
  if (prev.targetX !== next.targetX || prev.targetY !== next.targetY) return false;
  if (prev.data !== next.data) return false;
  return true;
}

export default memo(DeletableEdgeComp, areEdgePropsEqual);
