/**
 * DeletableEdge v3 — edge com reconexão visual intuitiva.
 *
 * Melhorias v3:
 *  - Endpoints arrastáveis visíveis ao selecionar (indica que pode reconectar)
 *  - Linha mais grossa e colorida ao hover/select
 *  - Área clicável precisa para não bloquear edges sobrepostas
 *  - Tooltip "Arraste as pontas para reconectar"
 *  - Comparador customizado mantido para performance
 */
import { memo, useMemo, useCallback } from "react";
import {
  EdgeLabelRenderer, getBezierPath, type EdgeProps,
} from "@xyflow/react";
import { X, Pencil, MoveHorizontal } from "lucide-react";

export interface DeletableEdgeData extends Record<string, unknown> {
  onDelete?: (edgeId: string) => void | Promise<void>;
  onEditLabel?: (edgeId: string, newLabel: string | null) => void | Promise<void>;
  onSelect?: (edgeId: string) => void;
}

function DeletableEdgeComp(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, style, markerEnd,
    label, selected, data,
  } = props;
  if (![sourceX, sourceY, targetX, targetY].every(Number.isFinite)) return null;

  const [edgePath, labelX, labelY] = useMemo(
    () => getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }),
    [sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition]
  );

  const show = selected;
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

  const handleSelectEndpoint = useCallback((e: React.MouseEvent<SVGCircleElement>) => {
    e.stopPropagation();
    edgeData.onSelect?.(id);
  }, [id, edgeData]);

  const edgeStyle = useMemo(() => {
    const baseStroke = typeof style?.stroke === "string" ? style.stroke : "hsl(var(--foreground) / 0.82)";
    const parsedWidth = Number.parseFloat(String(style?.strokeWidth ?? 2.8));
    const baseWidth = Number.isFinite(parsedWidth) ? parsedWidth : 2.8;
    return {
      stroke: selected ? "hsl(var(--primary))" : baseStroke,
      strokeWidth: selected ? Math.max(baseWidth + 0.8, 3.6) : Math.max(baseWidth, 2.8),
    };
  }, [style, selected]);

  return (
    <>
      <g className="canvas-edge-layer">
       {/* Halo leve + linha visual acima do grid e sem capturar drag dos nodes. */}
      <path
        d={edgePath}
        fill="none"
        stroke="hsl(var(--background) / 0.82)"
        strokeWidth={edgeStyle.strokeWidth + 4}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="react-flow__edge-visibility-halo"
        pointerEvents="none"
      />
      <path
        d={edgePath}
        fill="none"
        stroke={edgeStyle.stroke}
        strokeWidth={edgeStyle.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        markerEnd={markerEnd}
        vectorEffect="non-scaling-stroke"
        className="react-flow__edge-path canvas-edge-path"
        pointerEvents="none"
      />

      {/* Área clicável estreita — permite selecionar edges sobrepostas individualmente.
          Usamos stroke fino (6px) para que cada linha tenha sua própria zona de hit
          e não bloqueie cliques nas edges de trás. */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        className="react-flow__edge-interaction"
        style={{ cursor: "pointer" }}
      />

      {!selected && (
        <>
          <circle
            cx={sourceX}
            cy={sourceY}
            r={5.5}
            fill={edgeStyle.stroke}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            className="canvas-edge-endpoint-picker"
            onClick={handleSelectEndpoint}
          />
          <circle
            cx={targetX}
            cy={targetY}
            r={5.5}
            fill={edgeStyle.stroke}
            stroke="hsl(var(--background))"
            strokeWidth={2}
            className="canvas-edge-endpoint-picker"
            onClick={handleSelectEndpoint}
          />
        </>
      )}
      </g>

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

      {/* Endpoints arrastáveis nativos: o React Flow renderiza os
          .react-flow__edgeupdater (círculos SVG) automaticamente nas
          extremidades. Estilizamos via CSS em index.css para que sejam
          visíveis e clicáveis ao selecionar a edge. Não desenhamos
          decorações próprias aqui para não bloquear o drag nativo. */}

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
    </>
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
