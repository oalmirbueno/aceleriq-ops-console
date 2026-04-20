import { memo } from "react";
import { ACELERA_STAGES, STAGE_COLUMN_WIDTH } from "./canvasProjectTypes";

interface Props {
  height: number;
  offsetX?: number;
  offsetY?: number;
}

/**
 * Monochrome stage lanes — clean vertical dividers with subtle headers.
 * Outline-only, no color fills.
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
              className={`relative h-full ${idx > 0 ? "border-l border-dashed border-border/20" : ""}`}
              style={{ width: STAGE_COLUMN_WIDTH }}
            >
              {/* Header bar */}
              <div className="absolute top-0 left-0 right-0 h-14 backdrop-blur-md bg-background/60 border-b border-border/30 flex items-center gap-2.5 px-3.5">
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
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default memo(StageLanesBgComp);
