/**
 * CanvasStageNavigator — monochrome, outline-only.
 * Progress ring uses primary color (only splash of color).
 */
import { useReactFlow } from "@xyflow/react";
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

export default function CanvasStageNavigator({ counts = {}, doneCounts = {} }: Props) {
  const rf = useReactFlow();

  const goTo = (idx: number) => {
    const x = idx * STAGE_COLUMN_WIDTH + STAGE_COLUMN_WIDTH / 2;
    rf.setCenter(x, 320, { zoom: 0.9, duration: 600 });
  };

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/90 backdrop-blur-md shadow-lg px-1.5 py-1">
        <span className="px-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/50">
          ACELERA
        </span>
        <div className="h-4 w-px bg-border/40 mx-0.5" />
        {ACELERA_STAGES.map((s, idx) => {
          const count = counts[s.key] ?? 0;
          const done = doneCounts[s.key] ?? 0;
          const pct = count > 0 ? done / count : 0;
          const pctLabel = count > 0 ? ` · ${Math.round(pct * 100)}% concluído (${done}/${count})` : "";
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => goTo(idx)}
              title={`${s.short} — ${s.label}${pctLabel}`}
              className="group relative h-7 w-7 rounded-full flex items-center justify-center font-mono font-bold text-[11px] transition-all text-foreground/50 hover:text-foreground hover:bg-muted/40 active:scale-90"
            >
              {count > 0 && <ProgressRing pct={pct} />}
              <span className="relative">{s.letter}</span>
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3 min-w-3 px-1 rounded-full bg-muted text-[8px] font-sans font-semibold text-muted-foreground flex items-center justify-center leading-none tabular-nums border border-border">
                  {count > 9 ? "9+" : count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
