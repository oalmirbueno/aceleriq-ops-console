/**
 * CanvasStageNavigator — horizontal scrubber do canvas.
 *
 * Mantém a leitura das etapas A.C.E.L.E.R.A de forma discreta, mas sem virar
 * um controle de zoom: aqui o comportamento é somente navegação horizontal.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { ACELERA_STAGES, STAGE_COLUMN_WIDTH } from "./canvasProjectTypes";

interface Props {
  counts?: Record<string, number>;
  doneCounts?: Record<string, number>;
}

/* Track total content width = soma das colunas das etapas */
const TOTAL_CONTENT_WIDTH = STAGE_COLUMN_WIDTH * ACELERA_STAGES.length;

export default function CanvasStageNavigator({ counts = {}, doneCounts = {} }: Props) {
  const rf = useReactFlow();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  /* Lê viewport ao vivo sem subscrever via prop drilling */
  const tx = useStore((s) => s.transform[0]);
  const ty = useStore((s) => s.transform[1]);
  const zoom = useStore((s) => s.transform[2]);
  const containerWidth = useStore((s) => s.width);

  /* Janela visível no espaço do conteúdo */
  const viewLeft = -tx / Math.max(zoom, 0.0001);
  const viewWidth = containerWidth / Math.max(zoom, 0.0001);
  const maxViewLeft = Math.max(0, TOTAL_CONTENT_WIDTH - viewWidth);
  const viewWidthPct = Math.max(0.04, Math.min(1, viewWidth / TOTAL_CONTENT_WIDTH));
  const viewLeftPct = maxViewLeft > 0
    ? (Math.max(0, Math.min(maxViewLeft, viewLeft)) / maxViewLeft) * (1 - viewWidthPct)
    : 0;

  const centerOnRatio = useCallback(
    (ratio: number, animate = true) => {
      const clampedRatio = Math.max(0, Math.min(1, ratio));
      const nextLeft = maxViewLeft * clampedRatio;
      rf.setViewport(
        { x: -nextLeft * zoom, y: ty, zoom },
        { duration: animate ? 220 : 0 },
      );
    },
    [maxViewLeft, rf, ty, zoom],
  );

  /* Pointer events — clique posiciona, drag desliza */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDragging(true);
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    centerOnRatio(ratio, false);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    centerOnRatio(ratio, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  };

  /* Stage markers — posição relativa ao trilho */
  const markers = useMemo(
    () =>
      ACELERA_STAGES.map((s, idx) => {
        const count = counts[s.key] ?? 0;
        const done = doneCounts[s.key] ?? 0;
        const pct = count > 0 ? done / count : 0;
        const center = (idx + 0.5) / ACELERA_STAGES.length;
        return { stage: s, idx, count, done, pct, center };
      }),
    [counts, doneCounts],
  );

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 pointer-events-auto w-[min(720px,80%)]">
      <div
        ref={trackRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`relative h-9 px-3 rounded-full border border-border/60 bg-card/90 backdrop-blur-md shadow-lg transition-colors select-none touch-none ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        role="slider"
        aria-label="Navegar etapas A.C.E.L.E.R.A"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(viewLeftPct * 100)}
      >
        {/* Trilho fino */}
        <div className="absolute inset-x-3 top-1/2 -translate-y-1/2 h-px bg-border/50" />

        {/* Marcadores de etapa */}
        {markers.map((m) => (
          <button
            key={m.stage.key}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              centerOnRatio(m.center, true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            title={
              m.count > 0
                ? `${m.stage.short} — ${m.stage.label} · ${Math.round(m.pct * 100)}% (${m.done}/${m.count})`
                : `${m.stage.short} — ${m.stage.label}`
            }
            className="group absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-1"
            style={{ left: `${m.center * 100}%` }}
          >
            <span className="text-[9px] font-mono font-semibold tracking-[0.18em] text-muted-foreground/55 transition-colors group-hover:text-foreground/80">
              {m.stage.letter}
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full transition-all ${
                m.count > 0
                  ? "bg-foreground/60 group-hover:bg-foreground"
                  : "bg-border group-hover:bg-foreground/40"
              }`}
            />
            {m.pct > 0 && (
              <span
                className="absolute -bottom-1 h-px bg-primary"
                style={{ width: `${Math.max(8, m.pct * 18)}px` }}
              />
            )}
          </button>
        ))}

        {/* Janela visível (thumb) */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2.5 rounded-full bg-foreground/15 border border-foreground/20 backdrop-blur-sm pointer-events-none transition-[left,width] duration-75 ease-out"
          style={{
            left: `calc(${viewLeftPct * 100}% + 12px - ${viewLeftPct * 24}px)`,
            width: `calc(${viewWidthPct * 100}% - 4px)`,
            minWidth: 24,
          }}
        />
      </div>
    </div>
  );
}
