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

const PLAN_META: Record<PlanKey, { icon: React.ElementType; color: string; letter: string }> = {
  starter:    { icon: Shield,  color: "#10B981", letter: "F" },
  growth:     { icon: Rocket,  color: "#60A5FA", letter: "A" },
  enterprise: { icon: Crown,   color: "#FBBF24", letter: "E" },
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
  const color = meta.color;

  const totalDeliverables = plan.deliverables.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div
      className={cn(
        "rounded-2xl border overflow-hidden transition-all",
        highlighted
          ? "border-2 shadow-lg"
          : "border-border bg-card",
      )}
      style={highlighted ? {
        borderColor: `${color}50`,
        boxShadow: `0 12px 40px -12px ${color}40`,
      } : undefined}
    >
      {/* Top accent bar */}
      <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}80)` }} />

      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border/50">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ background: `${color}15`, border: `1.5px solid ${color}40` }}>
              <Icon className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color }}>
                  Plano {meta.letter}
                </p>
                {highlighted && (
                  <Badge className="text-[9px] px-1.5 py-0 h-4" style={{ background: `${color}15`, color, borderColor: `${color}30` }}>
                    Destaque
                  </Badge>
                )}
              </div>
              <h3 className="text-xl font-bold text-foreground">{plan.label}</h3>
            </div>
          </div>
        </div>
        <p className="text-sm font-semibold text-foreground/90 leading-relaxed mb-1">
          {plan.tagline}
        </p>
        {!compact && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            {plan.description}
          </p>
        )}
      </div>

      {/* Price + target */}
      <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-border/50">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Investimento mensal</p>
          <p className="text-2xl font-bold text-foreground tabular-nums">
            R$ {plan.monthly.toLocaleString("pt-BR", { minimumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-muted-foreground">
            Contrato mínimo: {plan.min_contract_months} meses
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Cliente ideal</p>
          <p className="text-sm font-semibold text-foreground">{plan.target_revenue}</p>
          <p className="text-[10px] text-muted-foreground">
            {plan.max_active_fronts === null ? "Frentes ilimitadas" : `Até ${plan.max_active_fronts} frentes simultâneas`}
          </p>
        </div>
      </div>

      {/* ACELERA stages covered */}
      <div className="px-5 py-4 border-b border-border/50">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
          Etapas do método ACELERA cobertas
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE_STAGES_ORDERED.map((stage) => {
            const covered = plan.stages_covered.includes(stage);
            return (
              <span
                key={stage}
                className={cn(
                  "text-[10px] px-2 py-1 rounded-full border inline-flex items-center gap-1",
                  covered
                    ? "border-border/50 text-foreground"
                    : "border-dashed border-border/30 text-muted-foreground/40"
                )}
                style={covered ? { background: `${color}10`, borderColor: `${color}30`, color } : undefined}
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
        <div className="px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-1.5 mb-3">
            <Sparkles className="h-3 w-3" style={{ color }} />
            <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color }}>
              {totalDeliverables} entregáveis inclusos
            </p>
          </div>
          <div className="space-y-3">
            {plan.deliverables.map((group, gi) => (
              <div key={gi}>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  {group.category}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item, ii) => (
                    <li key={ii} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5" style={{ color }} />
                      <span className="text-xs text-foreground/80 leading-snug">{item}</span>
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
        <div className="px-5 py-4 border-b border-border/50">
          <div className="flex items-center gap-1.5 mb-2">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Rituais operacionais
            </p>
          </div>
          <ul className="space-y-1">
            {plan.rituals.map((ritual, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-foreground/70">
                <span className="h-1 w-1 rounded-full shrink-0" style={{ background: color }} />
                {ritual}
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.extras.length > 0 && (
        <div className="px-5 py-3 bg-secondary/20">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Incluso também</p>
          <div className="flex flex-wrap gap-1">
            {plan.extras.map((e, i) => (
              <Badge key={i} variant="outline" className="text-[10px] font-normal">{e}</Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
