import { FileText, Shield, Zap, Package, AlertTriangle, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ScopeBadge from "./ScopeBadge";
import { getPlanDefinition, type ScopeClassification } from "./aceleraConstants";

interface ContractData {
  plan_name?: string | null;
  enabled_fronts?: string[];
  active_addons?: string[];
  standalone_services?: string[];
  extra_costs?: string[];
  future_opportunities?: string[];
}

interface ContractBlockProps {
  clientMetadata?: Record<string, unknown> | null;
  workspaceMetadata?: Record<string, unknown> | null;
  planName?: string | null;
}

export default function ContractBlock({ clientMetadata, workspaceMetadata, planName }: ContractBlockProps) {
  const contract = (clientMetadata?.contract ?? workspaceMetadata?.contract ?? {}) as ContractData;
  const plan = getPlanDefinition(planName ?? contract.plan_name);

  const enabledFronts = contract.enabled_fronts ?? [];
  const activeAddons = contract.active_addons ?? [];
  const standaloneServices = contract.standalone_services ?? [];
  const extraCosts = contract.extra_costs ?? [];
  const futureOpportunities = contract.future_opportunities ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Contrato Operacional
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Plan */}
        <div className="space-y-1">
          <span className="label-sm">Plano Contratado</span>
          {plan ? (
            <div className="space-y-1 mt-1">
              <div className="flex items-center gap-2">
                <Badge className="bg-primary/15 text-primary border-primary/30">{plan.label}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{plan.description}</p>
              <p className="text-xs text-muted-foreground"><strong className="text-foreground/70">Objetivo:</strong> {plan.objective}</p>
              <p className="text-xs text-muted-foreground"><strong className="text-foreground/70">Profundidade:</strong> {plan.depth}</p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Nenhum plano definido.</p>
          )}
        </div>

        {/* Enabled fronts */}
        <Section icon={Zap} label="Frentes Habilitadas" items={enabledFronts} scope="in_plan" emptyText="Nenhuma frente definida." />

        {/* Add-ons */}
        <Section icon={Package} label="Add-ons Ativos" items={activeAddons} scope="addon" emptyText="Nenhum add-on ativo." />

        {/* Standalone */}
        <Section icon={FileText} label="Serviços Avulsos" items={standaloneServices} scope="standalone" emptyText="Nenhum serviço avulso." />

        {/* Extra costs */}
        <Section icon={AlertTriangle} label="Custos Extras Operacionais" items={extraCosts} scope="extra_cost" emptyText="Nenhum custo extra previsto." />

        {/* Future opportunities */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="h-3 w-3 text-muted-foreground" />
            <span className="label-sm">Oportunidades Futuras</span>
          </div>
          {futureOpportunities.length > 0 ? (
            <ul className="space-y-0.5 mt-1">
              {futureOpportunities.map((item, i) => (
                <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <span className="text-primary/40 mt-0.5">•</span>{item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground mt-1">Nenhuma oportunidade mapeada.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Section({ icon: Icon, label, items, scope, emptyText }: {
  icon: React.ElementType;
  label: string;
  items: string[];
  scope: ScopeClassification;
  emptyText: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 text-muted-foreground" />
        <span className="label-sm">{label}</span>
        <ScopeBadge scope={scope} />
      </div>
      {items.length > 0 ? (
        <ul className="space-y-0.5 mt-1">
          {items.map((item, i) => (
            <li key={i} className="text-xs text-foreground/80 flex items-start gap-1.5">
              <span className="text-primary/40 mt-0.5">•</span>{item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground mt-1">{emptyText}</p>
      )}
    </div>
  );
}
