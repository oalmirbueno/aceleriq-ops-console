/**
 * EsteiraTemplatePreview
 *
 * Mini diagrama SVG mostrando os nodes do template agrupados por etapa ACELERA,
 * com setas conectando-os conforme as edges. Usado dentro do GenerateEsteiraDialog
 * para dar uma visão visual da esteira antes de gerar.
 */
import { useMemo } from "react";
import { ACELERA_STAGES, getProjectTypeMeta, getStageMeta } from "./canvasProjectTypes";
import type { EsteiraTemplate } from "./esteiraTemplates";

interface Props {
  template: EsteiraTemplate;
  active?: boolean;
}

const NODE_W = 54;
const NODE_H = 28;
const COL_GAP = 14;
const ROW_GAP = 8;
const PAD_X = 10;
const PAD_Y = 22; // espaço pro label da etapa

export default function EsteiraTemplatePreview({ template, active = false }: Props) {
  const layout = useMemo(() => {
    // Agrupa nodes por stage, preservando ordem do template
    const byStage = new Map<string, typeof template.nodes>();
    template.nodes.forEach((n) => {
      const arr = byStage.get(n.stage) ?? [];
      arr.push(n);
      byStage.set(n.stage, arr);
    });

    // Ordena stages conforme ACELERA_STAGES, ignorando vazias
    const stagesUsed = ACELERA_STAGES.filter((s) => byStage.has(s.key));
    const maxRows = Math.max(1, ...stagesUsed.map((s) => byStage.get(s.key)!.length));

    const positions = new Map<string, { x: number; y: number; cx: number; cy: number }>();
    stagesUsed.forEach((stage, colIdx) => {
      const x = PAD_X + colIdx * (NODE_W + COL_GAP);
      const items = byStage.get(stage.key)!;
      items.forEach((n, rowIdx) => {
        const y = PAD_Y + rowIdx * (NODE_H + ROW_GAP);
        positions.set(n.ref, {
          x,
          y,
          cx: x + NODE_W / 2,
          cy: y + NODE_H / 2,
        });
      });
    });

    const width = PAD_X * 2 + stagesUsed.length * NODE_W + (stagesUsed.length - 1) * COL_GAP;
    const height = PAD_Y + maxRows * NODE_H + (maxRows - 1) * ROW_GAP + 6;

    return { stagesUsed, positions, width, height };
  }, [template]);

  return (
    <div
      className={`rounded-md border bg-background/40 overflow-hidden transition-colors ${
        active ? "border-primary/40" : "border-border/60"
      }`}
    >
      <svg
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        className="w-full h-auto block"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`Preview da esteira ${template.label}`}
      >
        <defs>
          <marker
            id={`arrow-${template.key}`}
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
          </marker>
        </defs>

        {/* Stage column labels */}
        {layout.stagesUsed.map((stage, idx) => {
          const x = PAD_X + idx * (NODE_W + COL_GAP) + NODE_W / 2;
          return (
            <g key={`label-${stage.key}`}>
              <text
                x={x}
                y={12}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: 8, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}
              >
                {stage.letter} · {stage.short}
              </text>
            </g>
          );
        })}

        {/* Edges */}
        {template.edges.map((e, idx) => {
          const from = layout.positions.get(e.fromRef);
          const to = layout.positions.get(e.toRef);
          if (!from || !to) return null;
          // start at right side of "from", end at left side of "to"
          const x1 = from.x + NODE_W;
          const y1 = from.cy;
          const x2 = to.x;
          const y2 = to.cy;
          const midX = (x1 + x2) / 2;
          const path = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
          return (
            <path
              key={`edge-${idx}`}
              d={path}
              fill="none"
              className="stroke-muted-foreground/50"
              strokeWidth={1}
              markerEnd={`url(#arrow-${template.key})`}
            />
          );
        })}

        {/* Nodes */}
        {template.nodes.map((n) => {
          const pos = layout.positions.get(n.ref);
          if (!pos) return null;
          const stage = getStageMeta(n.stage);
          const meta = getProjectTypeMeta(n.kind);
          const label = meta?.shortLabel ?? meta?.label ?? n.kind;
          // Map stage badge classes → solid svg colors via tailwind classes on rect/text
          return (
            <g key={n.ref}>
              <title>{`${stage.short} · ${meta?.label ?? n.kind}\n${n.title}`}</title>
              <rect
                x={pos.x}
                y={pos.y}
                width={NODE_W}
                height={NODE_H}
                rx={5}
                ry={5}
                className={`${stageRectClass(n.stage)} transition-colors`}
              />
              <text
                x={pos.cx}
                y={pos.cy + 3}
                textAnchor="middle"
                className={stageTextClass(n.stage)}
                style={{ fontSize: 7.5, fontWeight: 600 }}
              >
                {truncate(label, 10)}
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

/** Classes SVG por stage (fill + stroke). Mantemos coerência com badge das etapas. */
function stageRectClass(stage: string): string {
  switch (stage) {
    case "entrada":        return "fill-amber-500/20 stroke-amber-500/50";
    case "diagnostico":    return "fill-sky-500/20 stroke-sky-500/50";
    case "estrutura_base": return "fill-cyan-500/20 stroke-cyan-500/50";
    case "planejamento":   return "fill-indigo-500/20 stroke-indigo-500/50";
    case "producao":       return "fill-violet-500/20 stroke-violet-500/50";
    case "ativacao":       return "fill-pink-500/20 stroke-pink-500/50";
    case "otimizacao":     return "fill-orange-500/20 stroke-orange-500/50";
    case "expansao":       return "fill-primary/20 stroke-primary/50";
    default:               return "fill-muted stroke-border";
  }
}

function stageTextClass(stage: string): string {
  switch (stage) {
    case "entrada":        return "fill-amber-200";
    case "diagnostico":    return "fill-sky-200";
    case "estrutura_base": return "fill-cyan-200";
    case "planejamento":   return "fill-indigo-200";
    case "producao":       return "fill-violet-200";
    case "ativacao":       return "fill-pink-200";
    case "otimizacao":     return "fill-orange-200";
    case "expansao":       return "fill-primary";
    default:               return "fill-foreground";
  }
}
