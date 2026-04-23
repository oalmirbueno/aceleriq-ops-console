/**
 * DeletableEdge — edge customizada com botão de deletar visível.
 *
 * Substitui o edge padrão para ganhar:
 *  - Label editável (mantém do ReactFlow default)
 *  - Botão "×" flutuante no meio da edge, aparece no hover/seleção
 *  - Botão de editar rótulo (ícone de lápis) ao lado do delete
 *
 * Uso: registra em nodeTypes/edgeTypes do ReactFlow como type="deletable".
 */
import { memo, useState } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { X, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

function DeletableEdgeComp(props: EdgeProps) {
  const {
    id, sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition, style, markerEnd,
    label, selected, data,
  } = props;
  const [hover, setHover] = useState(false);
  const { setEdges } = useReactFlow();

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  const show = hover || selected;

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase.from("canvas_edges").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao remover", description: error.message, variant: "destructive" });
      return;
    }
    // Remove localmente via setEdges do ReactFlow
    setEdges((edges) => edges.filter((ed) => ed.id !== id));
    toast({ title: "Conexão removida" });
  };

  const handleEditLabel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = String(label ?? "");
    const next = window.prompt("Rótulo da conexão (vazio para remover):", current);
    if (next === null) return;
    const cleanLabel = next.trim() || null;
    const { error } = await supabase
      .from("canvas_edges")
      .update({ label: cleanLabel, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      toast({ title: "Erro ao editar", description: error.message, variant: "destructive" });
      return;
    }
    setEdges((edges) => edges.map((ed) => ed.id === id ? { ...ed, label: cleanLabel ?? undefined } : ed));
    toast({ title: cleanLabel ? "Rótulo atualizado" : "Rótulo removido" });
  };

  return (
    <g
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />

      {/* Label — rendered via ReactFlow's default label system using data */}
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

      {/* Action buttons — float at center of edge when hovered/selected */}
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
