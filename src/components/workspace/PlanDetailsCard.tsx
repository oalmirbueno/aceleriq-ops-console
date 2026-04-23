/**
 * PlanDetailsCard — card visual bonito de um plano.
 * Mostra tagline, preço, target, etapas ACELERA cobertas, entregáveis e rituais.
 * Reutilizável em SettingsPage, dialogs de venda, portal do cliente.
 */
import {
  CheckCircle2, Users, Target, Calendar, Zap,
  TrendingUp, Shield, Sparkles, Rocket, Crown,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getPlanConfig, type PlanKey, type PlanConfig } from "@/lib/planConfig";
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGES_ORDERED } from "./aceleraConstants";
import { cn } from "@/lib/utils";

/**
 * Cores em HSL puro (sem `hsl()` wrapper) para permitir composição
 * via `hsl(var --token / alpha)` style quando necessário.
 * Mantemos uma paleta diferenciada por plano mas ancorada no design system.
 */
const PLAN_META: Record<PlanKey, { icon: React.ElementType; hsl: string; letter: string }> = {
  starter:    { icon: Shield, hsl: "145 60% 46%", letter: "F" }, // primary green
  growth:     { icon: Rocket, hsl: "200 70% 58%", letter: "A" }, // info blue
  enterprise: { icon: Crown,  hsl: "43 80% 58%",  letter: "E" }, // gold
};

interface Props {
  planKey: PlanKey;
  plan?: PlanConfig;
  highlighted?: boolean;
  showDeliverables?: boolean;
  showRituals?: boolean;
  compact?: boolean;
}

export default function PlanDetailsCard({
  planKey, plan: planProp, highlighted, showDeliverables = true, showRituals = true, compact,
}: Props) {
  const plan = planProp ?? getPlanConfig()[planKey];
  const meta = PLAN_META[planKey];
  const Icon = meta.icon;
  const accent = `hsl(${meta.hsl})`;
  const accentSoft = `hsl(${meta.hsl} / 0.12)`;
  const accentBorder = `hsl(${meta.hsl} / 0.35)`;
  const accentGlow = `hsl(${meta.hsl} / 0.25)`;

  const totalDeliverables = plan.deliverables.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden transition-all bg-card flex flex-col",
        highlighted
          ? "border-2 shadow-xl"
          : "border-border hover:border-foreground/20",
      )}
      style={highlighted ? {
        borderColor: accentBorder,
        boxShadow: `0 16px 50px -16px ${accentGlow}`,
      } : undefined}
    >
      {/* Top accent bar */}
      <div className="h-[3px] w-full" style={{ background: `linear-gradient(90deg, ${accent}, ${accent} 50%, transparent)` }} />

      {/* Header */}
      <div className="px-6 pt-6 pb-5 border-b border-border/60">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ background: accentSoft, border: `1px solid ${accentBorder}` }}>
              <Icon className="h-5 w-5" style={{ color: accent }} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
                  Plano {meta.letter}
                </p>
                {highlighted && (
                  <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 border" style={{ background: accentSoft, color: accent, borderColor: accentBorder }}>
                    Selecionado
                  </Badge>
                )}
              </div>
              <h3 className="text-xl font-bold text-foreground leading-tight">{plan.label}</h3>
            </div>
          </div>
        </div>
        <p className="text-sm font-semibold text-foreground/90 leading-snug mb-1.5">
          {plan.tagline}
        </p>
        {!compact && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
            {plan.description}
          </p>
        )}
      </div>

      {/* Price + target */}
      <div className="px-6 py-5 grid grid-cols-2 gap-4 border-b border-border/60">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Investimento</p>
          <p className="text-[26px] font-bold text-foreground tabular-nums leading-none">
            R$ {plan.monthly.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            /mês · contrato {plan.min_contract_months}m
          </p>
        </div>
        <div className="border-l border-border/60 pl-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Cliente ideal</p>
          <p className="text-sm font-semibold text-foreground leading-snug">{plan.target_revenue}</p>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            {plan.max_active_fronts === null ? "Frentes ilimitadas" : `Até ${plan.max_active_fronts} frentes`}
          </p>
        </div>
      </div>

      {/* ACELERA stages covered */}
      <div className="px-6 py-4 border-b border-border/60">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2.5 font-semibold">
          Etapas do método ACELERA cobertas
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE_STAGES_ORDERED.map((stage) => {
            const covered = plan.stages_covered.includes(stage);
            return (
              <span
                key={stage}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-md border inline-flex items-center gap-1 font-medium",
                  covered
                    ? "text-foreground"
                    : "border-dashed border-border/40 text-muted-foreground/40 bg-transparent"
                )}
                style={covered ? { background: accentSoft, borderColor: accentBorder, color: accent } : undefined}
              >
                {covered && <CheckCircle2 className="h-2.5 w-2.5" />}
                {PIPELINE_STAGE_LABELS[stage]?.split(" ")[0] ?? stage}
              </span>
            );
          })}
        </div>
      </div>

      {/* Deliverables */}
      {showDeliverables && (
        <div className="px-6 py-5 border-b border-border/60 flex-1">
          <div className="flex items-center gap-1.5 mb-4">
            <Sparkles className="h-3 w-3" style={{ color: accent }} />
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: accent }}>
              {totalDeliverables} entregáveis inclusos
            </p>
          </div>
          <div className="space-y-4">
            {plan.deliverables.map((group, gi) => (
              <div key={gi}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {group.category}
                </p>
                <ul className="space-y-1.5">
                  {group.items.map((item, ii) => (
                    <li key={ii} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 shrink-0 mt-[3px]" style={{ color: accent }} />
                      <span className="text-xs text-foreground/85 leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rituals + extras */}
      {(showRituals && plan.rituals.length > 0) && (
        <div className="px-6 py-4 border-b border-border/60">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Rituais operacionais
            </p>
          </div>
          <ul className="space-y-1.5">
            {plan.rituals.map((ritual, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-foreground/75">
                <span className="h-1 w-1 rounded-full shrink-0" style={{ background: accent }} />
                {ritual}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.extras.length > 0 && (
        <div className="px-6 py-4 bg-secondary/30">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Incluso também</p>
          <div className="flex flex-wrap gap-1.5">
            {plan.extras.map((e, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-normal bg-background/40">{e}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
