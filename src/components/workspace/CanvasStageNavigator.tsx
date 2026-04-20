/**
 * CanvasStageNavigator
 *
 * Mini-mapa horizontal scrollável fininho com as 8 iniciais do método ACELERA.
 * Permite navegar a esteira clicando na etapa. Sticky no topo do canvas.
 *
 * UX premium: barra slim, scrollbar custom invisível, hover/active states
 * combinando com cor de cada etapa.
 */
import { useReactFlow } from "@xyflow/react";
import { ACELERA_STAGES, STAGE_COLUMN_WIDTH } from "./canvasProjectTypes";

interface Props {
  /** count of nodes in each stage (key = stage key) */
  counts?: Record<string, number>;
}

export default function CanvasStageNavigator({ counts = {} }: Props) {
  const rf = useReactFlow();

  const goTo = (idx: number) => {
    // Center the viewport horizontally on the column for that stage
    const x = idx * STAGE_COLUMN_WIDTH + STAGE_COLUMN_WIDTH / 2;
    rf.setCenter(x, 320, { zoom: 0.9, duration: 600 });
  };

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
      <div className="flex items-center gap-0.5 rounded-full border border-border/60 bg-card/90 backdrop-blur-md shadow-lg px-1.5 py-1">
        <span className="px-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
          ACELERA
        </span>
        <div className="h-4 w-px bg-border/50 mx-0.5" />
        {ACELERA_STAGES.map((s, idx) => {
          const count = counts[s.key] ?? 0;
          const accent = s.color.split(" ")[0]; // e.g. "text-amber-400"
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => goTo(idx)}
              title={`${s.short} — ${s.label}${count > 0 ? ` (${count} item${count === 1 ? "" : "s"})` : ""}`}
              className={`group relative h-7 w-7 rounded-full flex items-center justify-center font-mono font-bold text-[11px] transition-all ${accent} hover:bg-muted/60 active:scale-90`}
            >
              {s.letter}
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-3 min-w-3 px-1 rounded-full bg-primary text-[8px] font-sans font-semibold text-primary-foreground flex items-center justify-center leading-none tabular-nums">
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
