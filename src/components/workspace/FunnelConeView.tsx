/**
 * FunnelConeView
 *
 * Visualização SVG clássica de funil: trapézios empilhados com largura
 * proporcional ao volume. Suporta cone fantasma de comparação (expected_volume
 * sobreposto ao actual_volume) via toggle "Comparar projeção".
 *
 * Volume priority: actual_volume → expected_volume → propagação → synthetic.
 * Ghost cone: usa expected_volume pra mostrar a projeção/meta como referência.
 */
import { useMemo, useRef, useState } from "react";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFunnelBlock } from "./funnelBlocks";
import type { FunnelStepRow } from "./FunnelStepCard";

interface Props {
  steps: FunnelStepRow[];
  highlightId?: string | null;
  onPickStep?: (id: string) => void;
  exportName?: string;
}

interface Slice {
  step: FunnelStepRow;
  volume: number;
  ratio: number;
  dropPct: number | null;
  synthetic: boolean;
}

const VIEW_W = 640;
const ROW_H = 38;
const PAD_X = 24;
const PAD_TOP = 12;
const MIN_RATIO = 0.12;

type VolumeSource = "actual" | "expected";

function computeSlices(steps: FunnelStepRow[], source: VolumeSource = "actual"): Slice[] {
  const linear = steps.filter((s) => !s.block_kind.startsWith("logic_"));
  if (linear.length === 0) return [];

  const raw: Array<{ step: FunnelStepRow; vol: number | null }> = linear.map((s) => {
    if (source === "expected") {
      // Ghost cone: only use expected_volume
      if (s.expected_volume != null && s.expected_volume > 0) return { step: s, vol: s.expected_volume };
      return { step: s, vol: null };
    }
    // Main cone: actual first, then expected
    if (s.actual_volume != null && s.actual_volume > 0) return { step: s, vol: s.actual_volume };
    if (s.expected_volume != null && s.expected_volume > 0) return { step: s, vol: s.expected_volume };
    return { step: s, vol: null };
  });

  let lastKnown: number | null = null;
  const filled: Array<{ step: FunnelStepRow; vol: number; synthetic: boolean }> = raw.map((r, i) => {
    if (r.vol != null) {
      lastKnown = r.vol;
      return { step: r.step, vol: r.vol, synthetic: false };
    }
    if (lastKnown != null) {
      const conv = r.step.conversion_rate ?? 0.5;
      const next = Math.max(1, Math.round(lastKnown * conv));
      lastKnown = next;
      return { step: r.step, vol: next, synthetic: true };
    }
    const synth = Math.max(1, Math.round(1000 * Math.pow(0.5, i)));
    return { step: r.step, vol: synth, synthetic: true };
  });

  for (let i = 1; i < filled.length; i++) {
    if (filled[i].vol > filled[i - 1].vol) {
      filled[i] = { ...filled[i], vol: filled[i - 1].vol };
    }
  }

  const top = filled[0].vol || 1;
  return filled.map((f, i) => {
    const ratio = Math.max(MIN_RATIO, f.vol / top);
    const prev = i === 0 ? null : filled[i - 1].vol;
    const drop = prev && prev > 0 ? f.vol / prev : null;
    return { step: f.step, volume: f.vol, ratio, dropPct: drop, synthetic: f.synthetic };
  });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return Math.round(n).toLocaleString("pt-BR");
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/* ─── Trapezoid path builder ─── */
function trapPath(cx: number, innerW: number, slice: Slice, nextSlice: Slice | undefined, yTop: number): string {
  const wTop = innerW * slice.ratio;
  const wBot = innerW * (nextSlice ? nextSlice.ratio : Math.max(MIN_RATIO * 0.5, slice.ratio * 0.85));
  const yBot = yTop + ROW_H - 2;
  return `M ${cx - wTop / 2} ${yTop} L ${cx + wTop / 2} ${yTop} L ${cx + wBot / 2} ${yBot} L ${cx - wBot / 2} ${yBot} Z`;
}

export default function FunnelConeView({ steps, highlightId, onPickStep }: Props) {
  const slices = useMemo(() => computeSlices(steps, "actual"), [steps]);
  const ghostSlices = useMemo(() => computeSlices(steps, "expected"), [steps]);
  const [showGhost, setShowGhost] = useState(false);

  if (slices.length === 0) return null;

  // Ghost cone only makes sense if there's at least one expected_volume defined
  const hasExpected = steps.some(
    (s) => !s.block_kind.startsWith("logic_") && s.expected_volume != null && s.expected_volume > 0,
  );

  const totalH = PAD_TOP + slices.length * ROW_H + 12;
  const cx = VIEW_W / 2;
  const innerW = VIEW_W - PAD_X * 2;
  const allSynthetic = slices.every((s) => s.synthetic);

  // Ghost needs to share the same vertical space as main slices,
  // but use its own widths based on expected volumes.
  // Re-scale ghost ratios relative to the main cone's max for visual alignment.
  const mainTop = slices[0].volume || 1;
  const ghostTop = ghostSlices[0]?.volume || 1;
  const ghostScale = ghostTop / mainTop; // how much wider/narrower ghost is vs main

  return (
    <div className="rounded-lg border border-border bg-card/30 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Funil — visão proporcional
          </span>
          {allSynthetic && (
            <span className="text-[9px] text-muted-foreground/60 italic">
              (estimativa — preencha volumes)
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {hasExpected && (
            <button
              type="button"
              onClick={() => setShowGhost((v) => !v)}
              className={cn(
                "text-[10px] font-medium transition-colors px-2 py-0.5 rounded-md border",
                showGhost
                  ? "border-primary/30 text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
              )}
            >
              {showGhost ? "✕ Ocultar projeção" : "Comparar projeção"}
            </button>
          )}
          <span className="text-[9px] text-muted-foreground/50 tabular-nums">
            {slices.length} etapa{slices.length === 1 ? "" : "s"} · topo {formatNumber(slices[0].volume)}
          </span>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${VIEW_W} ${totalH}`}
        className="w-full h-auto block"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Visualização em cone do funil"
      >
        <defs>
          <linearGradient id="funnel-cone-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.08" />
          </linearGradient>
          <linearGradient id="funnel-cone-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.5" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
          </linearGradient>
        </defs>

        {/* Ghost cone (expected/projection) — rendered first, behind main */}
        {showGhost && ghostSlices.length > 0 && ghostSlices.map((gs, i) => {
          const nextGs = ghostSlices[i + 1];
          // Scale ghost ratios relative to main cone's coordinate space
          const scaledSlice: Slice = { ...gs, ratio: gs.ratio * ghostScale };
          const scaledNext = nextGs ? { ...nextGs, ratio: nextGs.ratio * ghostScale } : undefined;
          const yTop = PAD_TOP + i * ROW_H;
          const path = trapPath(cx, innerW, scaledSlice, scaledNext, yTop);

          return (
            <g key={`ghost-${gs.step.id}`} className="opacity-40">
              <path
                d={path}
                fill="none"
                stroke="hsl(var(--foreground))"
                strokeWidth={1}
                strokeDasharray="4 3"
                className="transition-opacity"
              />
              {/* Ghost volume label on far left */}
              <text
                x={VIEW_W - PAD_X}
                y={yTop + ROW_H / 2 + 3}
                textAnchor="end"
                style={{ fontSize: 8, fontWeight: 500, fontFamily: "var(--font-mono, ui-monospace)" }}
                className="fill-muted-foreground/50"
              >
                proj. {formatNumber(gs.volume)}
              </text>
            </g>
          );
        })}

        {/* Main cone (actual) */}
        {slices.map((slice, i) => {
          const next = slices[i + 1];
          const yTop = PAD_TOP + i * ROW_H;
          const path = trapPath(cx, innerW, slice, next, yTop);
          const meta = getFunnelBlock(slice.step.block_kind);
          const isHighlight = highlightId === slice.step.id;
          const cyText = yTop + ROW_H / 2;

          // Delta vs ghost (expected)
          const ghostVol = ghostSlices[i]?.volume;
          const hasDelta = showGhost && ghostVol && ghostVol > 0 && !slice.synthetic;
          const deltaPct = hasDelta ? ((slice.volume - ghostVol) / ghostVol) * 100 : 0;

          return (
            <g
              key={slice.step.id}
              className={cn(
                "transition-opacity",
                onPickStep && "cursor-pointer",
                highlightId && !isHighlight && "opacity-60",
              )}
              onClick={onPickStep ? () => onPickStep(slice.step.id) : undefined}
            >
              <title>
                {`${slice.step.title || meta.label} · ${formatNumber(slice.volume)}${
                  slice.dropPct != null ? ` · ${(slice.dropPct * 100).toFixed(1)}% do anterior` : ""
                }${slice.synthetic ? " (estimado)" : ""}${hasDelta ? ` · ${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(1)}% vs projeção` : ""}`}
              </title>

              <path
                d={path}
                fill="url(#funnel-cone-fill)"
                stroke="url(#funnel-cone-stroke)"
                strokeWidth={isHighlight ? 2 : 1}
                className="transition-all"
              />

              {/* Drop % chip */}
              {slice.dropPct != null && (
                <g>
                  <rect
                    x={cx + innerW / 2 - 56}
                    y={yTop - 8}
                    width={52}
                    height={14}
                    rx={7}
                    className="fill-background stroke-border"
                    strokeWidth={0.75}
                  />
                  <text
                    x={cx + innerW / 2 - 30}
                    y={yTop + 2}
                    textAnchor="middle"
                    className="fill-muted-foreground"
                    style={{ fontSize: 8.5, fontWeight: 600 }}
                  >
                    ↓ {(slice.dropPct * 100).toFixed(1)}%
                  </text>
                </g>
              )}

              {/* Label */}
              <text
                x={cx}
                y={cyText - 2}
                textAnchor="middle"
                className="fill-foreground pointer-events-none"
                style={{ fontSize: 11, fontWeight: 600 }}
              >
                {truncate(slice.step.title || meta.label, 38)}
              </text>
              <text
                x={cx}
                y={cyText + 11}
                textAnchor="middle"
                className={cn(
                  "pointer-events-none tabular-nums",
                  slice.synthetic ? "fill-muted-foreground/60" : "fill-foreground/80",
                )}
                style={{ fontSize: 10, fontWeight: 500, fontFamily: "var(--font-mono, ui-monospace)" }}
              >
                {formatNumber(slice.volume)}
                {slice.synthetic ? " ~" : ""}
                {hasDelta && (
                  <tspan
                    className={deltaPct >= 0 ? "fill-primary" : "fill-destructive"}
                    style={{ fontSize: 8.5 }}
                  >
                    {` ${deltaPct > 0 ? "+" : ""}${deltaPct.toFixed(0)}%`}
                  </tspan>
                )}
              </text>

              {/* Left: stage type tag */}
              <text
                x={PAD_X}
                y={cyText + 3}
                textAnchor="start"
                className="fill-muted-foreground/50 pointer-events-none"
                style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}
              >
                {String(i + 1).padStart(2, "0")} · {meta.shortLabel}
              </text>
            </g>
          );
        })}

        {/* Legend when ghost is visible */}
        {showGhost && (
          <g>
            <line x1={PAD_X} y1={totalH - 6} x2={PAD_X + 20} y2={totalH - 6} stroke="hsl(var(--foreground))" strokeWidth={1} strokeDasharray="4 3" opacity={0.4} />
            <text x={PAD_X + 24} y={totalH - 3} className="fill-muted-foreground/50" style={{ fontSize: 8 }}>
              Projeção (expected)
            </text>
            <line x1={PAD_X + 140} y1={totalH - 6} x2={PAD_X + 160} y2={totalH - 6} stroke="hsl(var(--primary))" strokeWidth={1} opacity={0.5} />
            <text x={PAD_X + 164} y={totalH - 3} className="fill-muted-foreground/50" style={{ fontSize: 8 }}>
              Real (actual)
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
