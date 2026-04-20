/**
 * CanvasStageNavigator — minimal horizontal carousel scrubber.
 *
 * Substitui o pill antigo "A.C.E.L.E.R.A" por uma trilha fininha no rodapé do
 * canvas. A barra mostra a posição atual da viewport sobre o conteúdo total
 * das etapas e permite arrastar (clique e segura) ou clicar pra deslizar
 * lateralmente — comportamento estilo carrossel.
 *
 * - Sem letras visíveis (pedido do usuário).
 * - Marcadores discretos por etapa, com tooltip identificando A.C.E.L.E.R.A.
 * - Indicador de progresso (% done) substitui badge gigante por uma barrinha
 *   sob o marcador, mantendo a leitura sem poluir o canvas.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow, useStore } from "@xyflow/react";
import { ACELERA_STAGES, STAGE_COLUMN_WIDTH } from "./canvasProjectTypes";

interface Props {
  counts?: Record<string, number>;
  doneCounts?: Record<string, number>;
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 28;
  const stroke = 1.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, pct));

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden
    >
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none"
        stroke="hsl(var(--border))"
        strokeWidth={stroke}
      />
      {pct > 0 && (
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 400ms ease-out" }}
        />
      )}
    </svg>
  );
}

/* Track total content width = soma das colunas das etapas */
const TOTAL_CONTENT_WIDTH = STAGE_COLUMN_WIDTH * ACELERA_STAGES.length;

export default function CanvasStageNavigator({ counts = {}, doneCounts = {} }: Props) {
  const rf = useReactFlow();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [trackWidth, setTrackWidth] = useState(0);
  const [dragging, setDragging] = useState(false);

  /* Lê viewport ao vivo sem subscrever via prop drilling */
  const tx = useStore((s) => s.transform[0]);
  const ty = useStore((s) => s.transform[1]);
  const zoom = useStore((s) => s.transform[2]);
  const containerWidth = useStore((s) => s.width);

  /* Janela visível no espaço do conteúdo */
  const viewLeft = -tx / Math.max(zoom, 0.0001);
  const viewWidth = containerWidth / Math.max(zoom, 0.0001);
  const viewLeftPct = Math.max(0, Math.min(1, viewLeft / TOTAL_CONTENT_WIDTH));
  const viewWidthPct = Math.max(0.04, Math.min(1, viewWidth / TOTAL_CONTENT_WIDTH));

  /* Mede largura real do trilho pra projetar drag → posição */
  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    const update = () => setTrackWidth(node.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  const centerOnRatio = useCallback(
    (ratio: number, animate = true) => {
      const x = Math.max(0, Math.min(1, ratio)) * TOTAL_CONTENT_WIDTH;
      const y = ty ? -ty / Math.max(zoom, 0.0001) + 200 : 320;
      rf.setCenter(x, y, { zoom, duration: animate ? 360 : 0 });
    },
    [rf, ty, zoom],
  );

  /* Pointer events — clique posiciona, drag desliza */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDragging(true);
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    centerOnRatio(ratio, true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || !trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / Math.max(1, rect.width);
    centerOnRatio(ratio, false);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false);
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  /* Wheel horizontal sobre a barra: rola lateralmente o canvas */
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (Math.abs(e.deltaY) < 1 && Math.abs(e.deltaX) < 1) return;
    const dx = (e.deltaY + e.deltaX) * (1 / Math.max(zoom, 0.0001));
    const newRatio = (viewLeft + viewWidth / 2 + dx) / TOTAL_CONTENT_WIDTH;
    centerOnRatio(newRatio, false);
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
        onWheel={handleWheel}
        className={`relative h-7 px-2 rounded-full border border-border/60 bg-card/85 backdrop-blur-md shadow-lg transition-colors ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
        role="slider"
        aria-label="Navegar etapas A.C.E.L.E.R.A"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(viewLeftPct * 100)}
      >
        {/* Trilho fino */}
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-px bg-border/50" />

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
            className="group absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center gap-0.5"
            style={{ left: `${m.center * 100}%` }}
          >
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
          className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full bg-foreground/15 border border-foreground/25 backdrop-blur-sm pointer-events-none transition-[left,width] duration-150 ease-out"
          style={{
            left: `calc(${viewLeftPct * 100}% + 8px - ${viewLeftPct * 16}px)`,
            width: `calc(${viewWidthPct * 100}% - 4px)`,
            minWidth: 24,
          }}
        />
      </div>
    </div>
  );
}
