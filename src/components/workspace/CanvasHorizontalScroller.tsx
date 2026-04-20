import { useCallback, useRef, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { ACELERA_STAGES, STAGE_COLUMN_WIDTH } from "./canvasProjectTypes";

/**
 * Scrollbar horizontal minimalista para o canvas.
 * - Lê os bounds dos nodes via useStore e calcula o range de pan necessário.
 * - Permite arrastar o "thumb" para mover o viewport horizontalmente.
 * - Visual: barra fininha translúcida ancorada no rodapé.
 */
export default function CanvasHorizontalScroller() {
  const rf = useReactFlow();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const tx = useStore((s) => s.transform[0]);
  const zoom = useStore((s) => s.transform[2]);
  const containerWidth = useStore((s) => s.width);
  // Espaço de conteúdo FIXO baseado nas etapas A.C.E.L.E.R.A.
  // Não depende dos nodes — assim a barra é estável e sempre visível,
  // representando a faixa horizontal completa do método.
  const STAGE_TOTAL = STAGE_COLUMN_WIDTH * ACELERA_STAGES.length;
  const SIDE_PAD = 600;
  const contentMinX = -SIDE_PAD;
  const contentMaxX = STAGE_TOTAL + SIDE_PAD;
  const contentWidth = Math.max(contentMaxX - contentMinX, 1);
  const viewWidth = containerWidth / Math.max(zoom, 0.0001);
  const viewLeft = -tx / Math.max(zoom, 0.0001);

  // Posição relativa (0..1) do início e tamanho do thumb
  const thumbWidthPct = Math.max(0.06, Math.min(1, viewWidth / contentWidth));
  const rawLeftPct = (viewLeft - contentMinX) / contentWidth;
  const thumbLeftPct = Math.max(0, Math.min(1 - thumbWidthPct, rawLeftPct));

  const setViewportFromRatio = useCallback(
    (ratio: number) => {
      const clamped = Math.max(0, Math.min(1 - thumbWidthPct, ratio));
      const targetViewLeft = contentMinX + clamped * contentWidth;
      rf.setViewport(
        { x: -targetViewLeft * zoom, y: rf.getViewport().y, zoom },
        { duration: 0 },
      );
    },
    [contentMinX, contentWidth, rf, thumbWidthPct, zoom],
  );

  const ratioFromEvent = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    // posiciona o início do thumb sob o cursor (centralizado)
    const local = clientX - rect.left - (rect.width * thumbWidthPct) / 2;
    return local / Math.max(1, rect.width);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    setViewportFromRatio(ratioFromEvent(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setViewportFromRatio(ratioFromEvent(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  // Sempre visível — é o "carrossel" das etapas ACELERA

  return (
    <div
      className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 pointer-events-auto"
      style={{ width: "min(70%, 640px)" }}
    >
      <div
        ref={trackRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className={`relative h-1.5 rounded-full bg-foreground/5 hover:bg-foreground/10 transition-colors select-none touch-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        role="scrollbar"
        aria-orientation="horizontal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(thumbLeftPct * 100)}
      >
        <div
          className={`absolute top-0 h-full rounded-full transition-colors ${
            dragging ? "bg-foreground/60" : "bg-foreground/30 hover:bg-foreground/50"
          }`}
          style={{
            left: `${thumbLeftPct * 100}%`,
            width: `${thumbWidthPct * 100}%`,
            minWidth: 28,
          }}
        />
      </div>
    </div>
  );
}