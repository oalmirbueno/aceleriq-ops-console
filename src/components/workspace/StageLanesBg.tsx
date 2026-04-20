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
              className={`relative h-full ${s.bg} ${idx > 0 ? "border-l border-border/40" : ""}`}
              style={{ width: STAGE_COLUMN_WIDTH }}
            >
              {/* Header bar */}
              <div className="absolute top-0 left-0 right-0 h-12 backdrop-blur-sm bg-background/40 border-b border-border/50 flex items-center gap-2 px-3">
                <div className={`h-7 w-7 rounded-md border-2 ${s.color} flex items-center justify-center font-bold text-sm`}>
                  {s.letter}
                </div>
                <div className="min-w-0">
                  <p className={`text-[11px] font-semibold leading-tight ${s.color.split(" ")[0]}`}>
                    {s.short}
                  </p>
                  <p className="text-[9px] text-muted-foreground truncate leading-tight">
                    {s.label}
                  </p>
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
