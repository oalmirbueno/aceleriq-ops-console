/**
 * FunnelBranchDiagram
 *
 * Mini-diagrama SVG mostrando como branches conectam steps do funil:
 *  - Steps em coluna vertical (mesma ordem da pipeline real)
 *  - Linha-tronco fina (sequência principal: step i → step i+1)
 *  - Linhas curvas (Bezier C) para CADA branch, partindo do lado direito
 *    do `from_step` e chegando no lado esquerdo do `to_step`
 *  - Cor por condição (yes/no/variant_a/variant_b/default)
 *  - Label da condição posicionada no meio da curva
 *  - Auto-altura proporcional ao número de steps (mín. 180, máx. 520)
 *  - Tudo em tokens semânticos (HSL via Tailwind classes — stroke usa currentColor)
 *
 * Uso:
 *  <FunnelBranchDiagram steps={steps} branches={branches} highlightId={...} />
 */
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { GitBranch } from "lucide-react";
import type { FunnelStepRow, FunnelBranchRow } from "./FunnelStepCard";

interface Props {
  steps: FunnelStepRow[];
  branches: FunnelBranchRow[];
  highlightId?: string | null;
  onPickStep?: (id: string) => void;
  className?: string;
}

/** Visual config */
const NODE_W = 168;        // largura do retângulo do step
const NODE_H = 34;         // altura
const ROW_GAP = 22;        // espaço vertical entre steps
const LEFT_PAD = 28;       // padding esquerdo (espaço pra curvas)
const RIGHT_PAD = 96;      // padding direito (espaço pra curvas largas)
const TOP_PAD = 18;
const BOTTOM_PAD = 18;

/** Cor semântica por tipo de condição (classes Tailwind aplicadas no <g>) */
const CONDITION_TONE: Record<FunnelBranchRow["condition"], { className: string; label: string }> = {
  yes:       { className: "text-primary",                 label: "Sim" },
  no:        { className: "text-destructive",             label: "Não" },
  variant_a: { className: "text-foreground",              label: "Variante A" },
  variant_b: { className: "text-muted-foreground",        label: "Variante B" },
  default:   { className: "text-muted-foreground",        label: "Padrão" },
};

export default function FunnelBranchDiagram({
  steps, branches, highlightId, onPickStep, className,
}: Props) {
  const layout = useMemo(() => buildLayout(steps), [steps]);

  if (steps.length < 2) {
    return (
      <div className={cn(
        "rounded-lg border border-dashed border-border bg-card/30 px-3 py-2.5 text-[11px] text-muted-foreground flex items-center gap-2",
        className,
      )}>
        <GitBranch className="h-3.5 w-3.5 shrink-0" />
        Adicione ao menos 2 etapas pra visualizar conexões e ramificações.
      </div>
    );
  }

  const { width, height, nodes } = layout;
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className={cn(
      "rounded-lg border border-border bg-card/40 overflow-hidden",
      className,
    )}>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <GitBranch className="h-3 w-3" />
          <span className="font-medium text-foreground/80">Mapa de ramificações</span>
          <span>·</span>
          <span>{branches.length} conexõe{branches.length === 1 ? "" : "s"}</span>
        </div>
        <Legend />
      </div>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="xMidYMin meet"
          className="block"
          role="img"
          aria-label="Diagrama de ramificações do funil"
        >
          {/* Defs: marcador de seta */}
          <defs>
            <marker
              id="funnel-arrow"
              viewBox="0 0 10 10"
              refX="8" refY="5"
              markerWidth="6" markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="currentColor" />
            </marker>
            <marker
              id="funnel-arrow-muted"
              viewBox="0 0 10 10"
              refX="8" refY="5"
              markerWidth="5" markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="currentColor" opacity="0.55" />
            </marker>
          </defs>

          {/* Linha-tronco: sequência principal step i → step i+1 */}
          <g className="text-muted-foreground/40">
            {nodes.map((n, i) => {
              if (i === nodes.length - 1) return null;
              const next = nodes[i + 1];
              const x = n.x + NODE_W / 2;
              return (
                <line
                  key={`trunk-${n.id}`}
                  x1={x} y1={n.y + NODE_H}
                  x2={x} y2={next.y}
                  stroke="currentColor"
                  strokeWidth={1.25}
                  strokeDasharray="3 3"
                />
              );
            })}
          </g>

          {/* Branches: curva Bezier de fromRight → toLeft com label */}
          {branches.map((b) => {
            const from = nodeById.get(b.from_step_id);
            const to = nodeById.get(b.to_step_id);
            if (!from || !to) return null;
            const tone = CONDITION_TONE[b.condition] ?? CONDITION_TONE.default;
            const isActive = highlightId && (highlightId === b.from_step_id || highlightId === b.to_step_id);

            // Pontos de saída/entrada
            const x1 = from.x + NODE_W;          // direita do from
            const y1 = from.y + NODE_H / 2;
            const x2 = to.x + NODE_W;            // entrada pelo lado direito também (curva externa)
            const y2 = to.y + NODE_H / 2;

            // Distância vertical define o "bulge" horizontal pra fora
            const dy = Math.abs(y2 - y1);
            const bulge = Math.min(74, 28 + dy * 0.18);
            const cx1 = x1 + bulge;
            const cy1 = y1 + (y2 > y1 ? dy * 0.25 : -dy * 0.25);
            const cx2 = x2 + bulge;
            const cy2 = y2 - (y2 > y1 ? dy * 0.25 : -dy * 0.25);

            // Label point (~meio da curva) — aproximação por ponto de Bezier em t=0.5
            const t = 0.5;
            const lx =
              (1 - t) ** 3 * x1 +
              3 * (1 - t) ** 2 * t * cx1 +
              3 * (1 - t) * t ** 2 * cx2 +
              t ** 3 * x2;
            const ly =
              (1 - t) ** 3 * y1 +
              3 * (1 - t) ** 2 * t * cy1 +
              3 * (1 - t) * t ** 2 * cy2 +
              t ** 3 * y2;

            const path = `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`;

            return (
              <g key={b.id} className={cn(tone.className, isActive ? "opacity-100" : "opacity-90")}>
                {/* Linha de fundo grossa (halo) — só quando ativa */}
                {isActive && (
                  <path
                    d={path}
                    fill="none"
                    stroke="currentColor"
                    strokeOpacity={0.18}
                    strokeWidth={6}
                    strokeLinecap="round"
                  />
                )}
                {/* Curva principal */}
                <path
                  d={path}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={isActive ? 1.75 : 1.25}
                  strokeLinecap="round"
                  markerEnd={isActive ? "url(#funnel-arrow)" : "url(#funnel-arrow-muted)"}
                />
                {/* Label da condição */}
                <ConditionLabel x={lx} y={ly} text={tone.label} />
              </g>
            );
          })}

          {/* Steps (nodes) */}
          {nodes.map((n) => {
            const isHi = highlightId === n.id;
            return (
              <g
                key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                onClick={() => onPickStep?.(n.id)}
                className={cn(onPickStep && "cursor-pointer")}
              >
                <rect
                  width={NODE_W} height={NODE_H} rx={6} ry={6}
                  className={cn(
                    "transition-colors",
                    isHi
                      ? "fill-primary/10 stroke-primary"
                      : "fill-background stroke-border",
                  )}
                  strokeWidth={isHi ? 1.5 : 1}
                />
                {/* Index pill */}
                <circle cx={12} cy={NODE_H / 2} r={8}
                  className={cn(isHi ? "fill-primary/20 stroke-primary" : "fill-muted stroke-border")}
                  strokeWidth={1}
                />
                <text
                  x={12} y={NODE_H / 2 + 3}
                  textAnchor="middle"
                  className={cn("text-[9px] font-mono", isHi ? "fill-primary" : "fill-muted-foreground")}
                >
                  {n.idx + 1}
                </text>
                {/* Title */}
                <text
                  x={26} y={NODE_H / 2 + 3.5}
                  className={cn(
                    "text-[11px] font-medium",
                    isHi ? "fill-foreground" : "fill-foreground/85",
                  )}
                >
                  {truncate(n.title, 22)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

interface LaidNode { id: string; idx: number; title: string; x: number; y: number }

function buildLayout(steps: FunnelStepRow[]): {
  width: number; height: number; nodes: LaidNode[];
} {
  const nodes: LaidNode[] = steps.map((s, i) => ({
    id: s.id,
    idx: i,
    title: s.title || `Etapa ${i + 1}`,
    x: LEFT_PAD,
    y: TOP_PAD + i * (NODE_H + ROW_GAP),
  }));
  const height = TOP_PAD + steps.length * NODE_H + (steps.length - 1) * ROW_GAP + BOTTOM_PAD;
  const width = LEFT_PAD + NODE_W + RIGHT_PAD;
  return { width, height: Math.min(Math.max(height, 180), 720), nodes };
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function ConditionLabel({ x, y, text }: { x: number; y: number; text: string }) {
  // Largura aproximada (8px por caractere + padding)
  const padX = 6;
  const w = text.length * 6.2 + padX * 2;
  const h = 14;
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`}>
      <rect
        width={w} height={h} rx={3} ry={3}
        className="fill-background stroke-border"
        strokeWidth={0.75}
      />
      <text
        x={w / 2} y={h / 2 + 3}
        textAnchor="middle"
        className="text-[9px] font-medium fill-current"
      >
        {text}
      </text>
    </g>
  );
}

function Legend() {
  const items: Array<{ key: FunnelBranchRow["condition"] }> = [
    { key: "yes" }, { key: "no" }, { key: "variant_a" }, { key: "variant_b" },
  ];
  return (
    <div className="hidden sm:flex items-center gap-2.5 text-[9px] text-muted-foreground">
      {items.map(({ key }) => (
        <div key={key} className={cn("flex items-center gap-1", CONDITION_TONE[key].className)}>
          <span className="inline-block h-[2px] w-3 rounded-full bg-current" />
          <span>{CONDITION_TONE[key].label}</span>
        </div>
      ))}
    </div>
  );
}