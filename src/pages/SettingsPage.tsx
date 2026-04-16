import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Settings, Save, RotateCcw, Plus, X, Shield } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/adminCheck";
import { getPlanConfig, savePlanConfig, getDefaultConfig, type PlanKey, type PlanConfig } from "@/lib/planConfig";

const PLAN_KEYS: PlanKey[] = ["starter", "growth", "enterprise"];

export default function SettingsPage() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<Record<PlanKey, PlanConfig>>(getPlanConfig);
  const [newExtras, setNewExtras] = useState<Record<PlanKey, string>>({ starter: "", growth: "", enterprise: "" });

  useEffect(() => {
    if (!isAdmin(userRole)) navigate("/ops", { replace: true });
  }, [userRole, navigate]);

  if (!isAdmin(userRole)) return null;

  const updateField = (plan: PlanKey, field: keyof PlanConfig, value: string | number) => {
    setConfig((prev) => ({
      ...prev,
      [plan]: { ...prev[plan], [field]: value },
    }));
  };

  const addExtra = (plan: PlanKey) => {
    const val = newExtras[plan].trim();
    if (!val) return;
    setConfig((prev) => ({
      ...prev,
      [plan]: { ...prev[plan], extras: [...prev[plan].extras, val] },
    }));
    setNewExtras((prev) => ({ ...prev, [plan]: "" }));
  };

  const removeExtra = (plan: PlanKey, index: number) => {
    setConfig((prev) => ({
      ...prev,
      [plan]: { ...prev[plan], extras: prev[plan].extras.filter((_, i) => i !== index) },
    }));
  };

  const handleSave = () => {
    savePlanConfig(config);
    toast({ title: "Configurações salvas", description: "Os valores dos planos foram atualizados." });
  };

  const handleReset = () => {
    const defaults = getDefaultConfig();
    setConfig(defaults);
    savePlanConfig(defaults);
    toast({ title: "Restaurado", description: "Valores padrão restaurados." });
  };

  return (
    <>
      <AppHeader title="Configurações" subtitle="Gerenciamento do sistema" />

      <div className="p-6 animate-fade-in space-y-6 max-w-4xl">
        {/* Admin badge */}
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <span className="text-sm text-muted-foreground">Acesso restrito — admin</span>
          <Badge variant="outline" className="text-xs">{user?.email}</Badge>
        </div>

        {/* Plan pricing */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Valores dos Planos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {PLAN_KEYS.map((planKey) => {
              const plan = config[planKey];
              return (
                <div key={planKey} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-semibold text-foreground capitalize">{plan.label}</h3>
                    <Badge variant="outline" className="text-xs">{planKey}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm">Nome do Plano</Label>
                      <Input
                        value={plan.label}
                        onChange={(e) => updateField(planKey, "label", e.target.value)}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm">Valor Mensal (R$)</Label>
                      <Input
                        type="number"
                        value={plan.monthly}
                        onChange={(e) => updateField(planKey, "monthly", parseFloat(e.target.value) || 0)}
                        className="text-sm"
                      />
                    </div>
                  </div>

                  {/* Extras */}
                  <div className="space-y-2">
                    <Label className="text-sm">Adicionais inclusos no plano</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {plan.extras.map((extra, i) => (
                        <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1">
                          {extra}
                          <button onClick={() => removeExtra(planKey, i)} className="hover:text-destructive transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                      {plan.extras.length === 0 && (
                        <span className="text-xs text-muted-foreground">Nenhum adicional</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={newExtras[planKey]}
                        onChange={(e) => setNewExtras((prev) => ({ ...prev, [planKey]: e.target.value }))}
                        onKeyDown={(e) => e.key === "Enter" && addExtra(planKey)}
                        placeholder="Novo adicional..."
                        className="h-8 text-xs max-w-xs"
                      />
                      <Button size="sm" variant="outline" onClick={() => addExtra(planKey)} className="h-8 text-xs">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
                      </Button>
                    </div>
                  </div>

                  {planKey !== "enterprise" && <Separator />}
                </div>
              );
            })}

            {/* Actions */}
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSave}>
                <Save className="h-4 w-4 mr-1.5" /> Salvar Configurações
              </Button>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> Restaurar Padrão
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
