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
 * while ACELERA headers stay pinned to the viewport top.
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

      <div
        className="absolute left-0 top-0 z-20"
        style={{
          width: totalWidth,
          transform: `translateX(${viewportX}px) scale(${safeZoom})`,
          transformOrigin: "0 0",
        }}
      >
        <div className="flex h-14 border-b border-border/30 bg-background/85 shadow-lg shadow-background/40 backdrop-blur-md">
          {ACELERA_STAGES.map((s, idx) => (
            <div
              key={s.key}
              className={`relative flex h-14 items-center gap-2.5 px-3.5 ${idx > 0 ? "border-l border-dashed border-border/25" : ""}`}
              style={{ width: STAGE_COLUMN_WIDTH }}
            >
                <div className="h-9 w-9 rounded-lg border border-border flex items-center justify-center font-bold text-base font-mono text-foreground/50">
                  {s.letter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold leading-tight tracking-tight text-foreground/60">
                    {s.short}
                  </p>
                  <p className="text-[9px] text-muted-foreground/60 truncate leading-tight uppercase tracking-wider mt-0.5">
                    {s.label}
                  </p>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground/30 tabular-nums">
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
