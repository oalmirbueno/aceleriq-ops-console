import { memo } from "react";
import { useStore } from "@xyflow/react";
import { ACELERA_STAGES, STAGE_COLUMN_WIDTH } from "./canvasProjectTypes";

interface Props {
  height: number;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Monochrome stage lanes — vertical dividers follow the canvas,
 * while ACELERA headers stay pinned, readable, and complete at the viewport top.
 */
function StageLanesBgComp({ height, offsetX = 0, offsetY = 0 }: Props) {
  const totalWidth = STAGE_COLUMN_WIDTH * ACELERA_STAGES.length;
  const [x, y, zoom] = useStore((s) => s.transform);
  const safeZoom = Math.max(zoom, 0.0001);
  const viewportX = x + offsetX * safeZoom;
  const viewportY = y + offsetY * safeZoom;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute"
        style={{
          left: 0,
          top: 0,
          width: totalWidth,
          height,
          transform: `translate(${viewportX}px, ${viewportY}px) scale(${safeZoom})`,
          transformOrigin: "0 0",
        }}
      >
        <div className="flex h-full">
          {ACELERA_STAGES.map((s, idx) => (
            <div
              key={s.key}
              className={`relative h-full ${idx > 0 ? "border-l border-dashed border-border/20" : ""}`}
              style={{ width: STAGE_COLUMN_WIDTH }}
            />
          ))}
        </div>
      </div>

      <div className="absolute inset-x-0 top-0 z-20">
        <div className="grid h-16 border-b border-border/30 bg-background/90 shadow-lg shadow-background/40 backdrop-blur-md" style={{ gridTemplateColumns: `repeat(${ACELERA_STAGES.length}, minmax(0, 1fr))` }}>
          {ACELERA_STAGES.map((s, idx) => (
            <div
              key={s.key}
              className={`relative flex h-16 min-w-0 items-center gap-2.5 px-3.5 ${idx > 0 ? "border-l border-dashed border-border/25" : ""}`}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border font-mono text-base font-bold text-foreground/60">
                {s.letter}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-semibold leading-tight text-foreground/70">
                  {s.short}
                </p>
                <p className="mt-0.5 truncate text-[9px] uppercase leading-tight tracking-wider text-muted-foreground/65">
                  {s.label}
                </p>
              </div>
              <div className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/35">
                {String(idx + 1).padStart(2, "0")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(StageLanesBgComp);
