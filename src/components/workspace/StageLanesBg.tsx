import { memo } from "react";
import { ACELERA_STAGES, STAGE_COLUMN_WIDTH } from "./canvasProjectTypes";

interface Props {
  /** Total height in pixels for the band background (matches canvas content height) */
  height: number;
  /** X offset where the first column starts */
  offsetX?: number;
  offsetY?: number;
}

/**
 * Static SVG-like background that paints 8 vertical bands (one per ACELERA stage)
 * with subtle column tints + sticky-looking header strip with letter + label.
 * Renders behind ReactFlow nodes via a fixed positioned div inside the canvas area.
 */
function StageLanesBgComp({ height, offsetX = 0, offsetY = 0 }: Props) {
  const totalWidth = STAGE_COLUMN_WIDTH * ACELERA_STAGES.length;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        className="absolute"
        style={{
          left: offsetX,
          top: offsetY,
          width: totalWidth,
          height,
        }}
      >
        <div className="flex h-full">
          {ACELERA_STAGES.map((s, idx) => (
            <div
              key={s.key}
              className={`relative h-full ${s.bg} ${idx > 0 ? "border-l border-dashed border-border/30" : ""}`}
              style={{ width: STAGE_COLUMN_WIDTH }}
            >
              {/* Header bar */}
              <div className="absolute top-0 left-0 right-0 h-14 backdrop-blur-md bg-background/60 border-b border-border/40 flex items-center gap-2.5 px-3.5 shadow-sm">
                <div className={`h-9 w-9 rounded-lg border ${s.color} flex items-center justify-center font-bold text-base font-mono ${s.bg} shadow-inner`}>
                  {s.letter}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] font-semibold leading-tight tracking-tight ${s.color.split(" ")[0]}`}>
                    {s.short}
                  </p>
                  <p className="text-[9px] text-muted-foreground/80 truncate leading-tight uppercase tracking-wider mt-0.5">
                    {s.label}
                  </p>
                </div>
                <div className="text-[9px] font-mono text-muted-foreground/40 tabular-nums">
                  {String(idx + 1).padStart(2, "0")}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(StageLanesBgComp);
