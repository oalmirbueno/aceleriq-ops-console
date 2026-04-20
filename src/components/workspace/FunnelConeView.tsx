/**
 * FunnelConeView
 *
 * Visualização SVG clássica de funil: trapézios empilhados, cada um com largura
 * proporcional ao volume da etapa correspondente. Calcula o volume de cada step
 * com fallback inteligente:
 *   1) actual_volume se preenchido
 *   2) expected_volume
 *   3) propagação por conversion_rate a partir do primeiro step com volume
 *   4) fallback monotônico decrescente sintético (apenas pra ter forma de cone)
 *
 * Ignora steps de lógica (block_kind começa com "logic_"), pois não compõem o
 * funil de conversão linear.
 *
 * Premium: gradiente vertical do indigo→primary, hover destaca a etapa,
 * tooltip nativo via <title>, drop conv. % entre etapas, números tabulares.
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getFunnelBlock } from "./funnelBlocks";
import type { FunnelStepRow } from "./FunnelStepCard";

interface Props {
  steps: FunnelStepRow[];
  /** highlight one step (e.g. expanded one) */
  highlightId?: string | null;
  onPickStep?: (id: string) => void;
}

interface Slice {
  step: FunnelStepRow;
  volume: number;
  /** width ratio 0..1 relative to top of funnel */
  ratio: number;
  /** % conversion from previous slice (null for first) */
  dropPct: number | null;
  synthetic: boolean;
}

const VIEW_W = 640;
const ROW_H = 38;
const PAD_X = 24;
const PAD_TOP = 12;
const MIN_RATIO = 0.12; // never narrower than this so labels fit

function computeSlices(steps: FunnelStepRow[]): Slice[] {
  // Filter out logic/branching blocks
  const linear = steps.filter((s) => !s.block_kind.startsWith("logic_"));
  if (linear.length === 0) return [];

  // 1st pass: pick best volume per step
  const raw: Array<{ step: FunnelStepRow; vol: number | null }> = linear.map((s) => {
    if (s.actual_volume != null && s.actual_volume > 0) return { step: s, vol: s.actual_volume };
    if (s.expected_volume != null && s.expected_volume > 0) return { step: s, vol: s.expected_volume };
    return { step: s, vol: null };
  });

  // 2nd pass: forward-fill via conversion_rate from the closest preceding known volume
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
    // No preceding volume yet: synthetic cone (decay from 1000 by 0.5^idx)
    const synth = Math.max(1, Math.round(1000 * Math.pow(0.5, i)));
    return { step: r.step, vol: synth, synthetic: true };
  });

  // 3rd pass: enforce monotonic non-increasing volume so cone never widens downward
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
    return {
      step: f.step,
      volume: f.vol,
      ratio,
      dropPct: drop,
      synthetic: f.synthetic,
    };
  });
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`;
  return Math.round(n).toLocaleString("pt-BR");
}

export default function FunnelConeView({ steps, highlightId, onPickStep }: Props) {
  const slices = useMemo(() => computeSlices(steps), [steps]);

  if (slices.length === 0) return null;

  const totalH = PAD_TOP + slices.length * ROW_H + 12;
  const cx = VIEW_W / 2;
  const innerW = VIEW_W - PAD_X * 2;
  const allSynthetic = slices.every((s) => s.synthetic);

  return (
    <div className="rounded-lg border border-border bg-gradient-to-b from-indigo-500/5 via-background/40 to-background/0 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Funil — visão proporcional
          </span>
          {allSynthetic && (
            <span className="text-[9px] text-amber-400/80 italic">
              (estimativa — preencha volumes pra ver real)
            </span>
          )}
        </div>
        <span className="text-[9px] text-muted-foreground/60 tabular-nums">
          {slices.length} etapa{slices.length === 1 ? "" : "s"} · topo {formatNumber(slices[0].volume)}
        </span>
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
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.10" />
          </linearGradient>
          <linearGradient id="funnel-cone-stroke" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
          </linearGradient>
        </defs>

        {slices.map((slice, i) => {
          const next = slices[i + 1];
          const wTop = innerW * slice.ratio;
          const wBot = innerW * (next ? next.ratio : Math.max(MIN_RATIO * 0.5, slice.ratio * 0.85));
          const yTop = PAD_TOP + i * ROW_H;
          const yBot = yTop + ROW_H - 2;
          const x1 = cx - wTop / 2;
          const x2 = cx + wTop / 2;
          const x3 = cx + wBot / 2;
          const x4 = cx - wBot / 2;
          const path = `M ${x1} ${yTop} L ${x2} ${yTop} L ${x3} ${yBot} L ${x4} ${yBot} Z`;
          const meta = getFunnelBlock(slice.step.block_kind);
          const isHighlight = highlightId === slice.step.id;
          const cyText = yTop + ROW_H / 2;

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
                }${slice.synthetic ? " (estimado)" : ""}`}
              </title>

              <path
                d={path}
                fill="url(#funnel-cone-fill)"
                stroke="url(#funnel-cone-stroke)"
                strokeWidth={isHighlight ? 2 : 1}
                className={cn(
                  "transition-all",
                  isHighlight && "drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)]",
                )}
              />

              {/* Drop % chip on right (between this and previous) */}
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

              {/* Label inside slice */}
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
                  slice.synthetic ? "fill-muted-foreground/60" : "fill-primary",
                )}
                style={{ fontSize: 10, fontWeight: 500, fontFamily: "var(--font-mono, ui-monospace)" }}
              >
                {formatNumber(slice.volume)}
                {slice.synthetic ? " ~" : ""}
              </text>

              {/* Left side: stage type tag */}
              <text
                x={PAD_X}
                y={cyText + 3}
                textAnchor="start"
                className="fill-muted-foreground/70 pointer-events-none"
                style={{ fontSize: 8.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase" }}
              >
                {String(i + 1).padStart(2, "0")} · {meta.shortLabel}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
