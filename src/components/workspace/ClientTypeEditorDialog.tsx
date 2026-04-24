/**
 * ClientTypeEditorDialog — editar tipo do cliente e valor customizado via UI.
 *
 * Substitui a necessidade de rodar SQL manual pra cada cliente.
 * Mostra preview do impacto (quais scores vão aparecer, se tem playbook, etc).
 */
import { useState, useEffect } from "react";
import {
  Save, Loader2, Sparkles, Megaphone, Archive, Globe, Workflow, Bot,
  Info, CheckCircle2, EyeOff, Eye,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { PROJECT_TYPE_OPTIONS, getProjectTypeMeta, type ProjectType } from "@/lib/projectTypes";
import { getPlanConfig, type PlanKey } from "@/lib/planConfig";
import { cn } from "@/lib/utils";

const ICON_MAP = { Sparkles, Megaphone, Archive, Globe, Workflow, Bot };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  initialType?: string | null;
  initialCustomValue?: number | null;
  initialPlan?: string | null;
  onSaved?: () => void;
}

export default function ClientTypeEditorDialog({
  open, onOpenChange, clientId, clientName,
  initialType, initialCustomValue, initialPlan, onSaved,
}: Props) {
  const [projectType, setProjectType] = useState<ProjectType>((initialType as ProjectType) ?? "ai_first");
  const [planName, setPlanName] = useState<string>(initialPlan ?? "growth");
  const [customValue, setCustomValue] = useState<string>(
    initialCustomValue != null ? String(initialCustomValue) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setProjectType((initialType as ProjectType) ?? "ai_first");
      setPlanName(initialPlan ?? "growth");
      setCustomValue(initialCustomValue != null ? String(initialCustomValue) : "");
    }
  }, [open, initialType, initialCustomValue, initialPlan]);

  const typeMeta = getProjectTypeMeta(projectType);
  const planCfg = getPlanConfig()[planName as PlanKey];
  const Icon = ICON_MAP[typeMeta.icon as keyof typeof ICON_MAP] ?? Sparkles;

  const effectiveValue = customValue && parseFloat(customValue) > 0
    ? parseFloat(customValue)
    : planCfg?.monthly ?? 0;

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        project_type: projectType,
        plan_name: planName,
        custom_monthly_value: customValue ? parseFloat(customValue) : null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
      if (error) throw error;
      toast({ title: "Cliente atualizado", description: `Tipo: ${typeMeta.label}` });
      onSaved?.();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: "Erro ao salvar",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base">Configurar {clientName}</DialogTitle>
          <DialogDescription className="text-xs">
            Define tipo de projeto, plano e valor mensal. Impacta quais scores aparecem e qual playbook é usado.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4 space-y-5">
          {/* Tipo de projeto — cards visuais */}
          <div>
            <Label className="text-xs mb-2 block">Tipo de projeto</Label>
            <div className="grid grid-cols-2 gap-2">
              {PROJECT_TYPE_OPTIONS.map((t) => {
                const TIcon = ICON_MAP[t.icon as keyof typeof ICON_MAP] ?? Sparkles;
                const selected = projectType === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setProjectType(t.key)}
                    className={cn(
                      "text-left rounded-lg border-2 p-3 transition-all",
                      selected ? "bg-opacity-10" : "border-border hover:border-primary/30 hover:bg-secondary/30"
                    )}
                    style={selected ? {
                      borderColor: t.color,
                      background: `${t.color}10`,
                    } : undefined}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex h-7 w-7 items-center justify-center rounded-md shrink-0"
                        style={{ background: `${t.color}20`, border: `1px solid ${t.color}40` }}>
                        <TIcon className="h-3.5 w-3.5" style={{ color: t.color }} />
                      </div>
                      <span className="text-xs font-semibold" style={{ color: selected ? t.color : undefined }}>
                        {t.shortLabel}
                      </span>
                      {t.recurring ? (
                        <Badge variant="outline" className="text-[9px] ml-auto">Recorrente</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[9px] ml-auto">One-shot</Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      {t.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Plano e valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block">Plano</Label>
              <select
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                className="w-full h-9 text-sm rounded-md border border-border bg-background px-3"
              >
                <option value="starter">Fundação — R$ 1.497/mês</option>
                <option value="growth">Aceleração — R$ 3.497/mês</option>
                <option value="enterprise">Escala IA-First — R$ 6.997/mês</option>
                <option value="marketing">Marketing — R$ 1.997/mês</option>
              </select>
              {!typeMeta.recurring && (
                <p className="text-[10px] text-amber-400 mt-1">
                  Tipo "{typeMeta.shortLabel}" é one-shot. Plano pode ficar como referência de preço.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">
                Valor mensal customizado
                <span className="text-[10px] text-muted-foreground ml-1">(opcional)</span>
              </Label>
              <Input
                type="number"
                step="0.01"
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                placeholder={`Padrão: R$ ${planCfg?.monthly.toLocaleString("pt-BR") ?? "0"}`}
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Só preencha se o cliente paga valor diferente (ex: legados).
              </p>
            </div>
          </div>

          {/* Preview de impacto */}
          <div className="rounded-xl border p-4" style={{
            borderColor: `${typeMeta.color}30`,
            background: `${typeMeta.color}06`,
          }}>
            <div className="flex items-center gap-2 mb-3">
              <Icon className="h-4 w-4" style={{ color: typeMeta.color }} />
              <p className="text-xs font-bold uppercase tracking-widest" style={{ color: typeMeta.color }}>
                Preview de impacto
              </p>
            </div>

            <div className="space-y-2.5">
              {/* Valor */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Valor mensal efetivo:</span>
                <span className="font-bold text-foreground tabular-nums">
                  R$ {effectiveValue.toLocaleString("pt-BR")}/mês
                  {customValue && parseFloat(customValue) > 0 && (
                    <span className="text-[10px] text-amber-400 ml-2">customizado</span>
                  )}
                </span>
              </div>

              {/* Scores */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Scores visíveis no workspace:</span>
                <div className="flex items-center gap-1.5">
                  <ScoreIndicator visible={typeMeta.showAiFirstScore} label="AI-First" />
                  <ScoreIndicator visible={typeMeta.showHealthScore} label="Health" />
                  <ScoreIndicator visible={typeMeta.showIcpFitScore} label="ICP" />
                </div>
              </div>

              {/* Playbook */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Playbook automático no canvas:</span>
                {typeMeta.hasAutoPlaybook ? (
                  <span className="flex items-center gap-1 text-emerald-400 font-medium">
                    <CheckCircle2 className="h-3 w-3" /> Sim
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <EyeOff className="h-3 w-3" /> Não (canvas livre)
                  </span>
                )}
              </div>

              {/* Recorrência */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Modelo de cobrança:</span>
                <span className="font-medium" style={{ color: typeMeta.recurring ? "#10B981" : "#FB923C" }}>
                  {typeMeta.recurring ? "Recorrente mensal" : "Cobrança única"}
                </span>
              </div>
            </div>
          </div>

          {/* Info adicional */}
          <div className="rounded-lg border border-blue-400/20 bg-blue-400/5 p-3 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 text-blue-400 mt-0.5 shrink-0" />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Alterar o tipo não apaga nodes do canvas que já existem. Se você quiser aplicar o playbook do novo tipo,
              entre no workspace, clique em "Aplicar Playbook" na toolbar do canvas.
            </p>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-end gap-2 shrink-0">
          <Button onClick={() => onOpenChange(false)} variant="ghost" size="sm" className="h-8 text-xs">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm" className="h-8 text-xs gap-1.5">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar alterações
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScoreIndicator({ visible, label }: { visible: boolean; label: string }) {
  return (
    <span
      className={cn(
        "text-[9px] px-1.5 py-0.5 rounded",
        visible
          ? "bg-emerald-400/15 text-emerald-400 border border-emerald-400/30"
          : "bg-secondary text-muted-foreground/50 border border-border"
      )}
    >
      {visible ? <Eye className="h-2 w-2 inline mr-0.5" /> : <EyeOff className="h-2 w-2 inline mr-0.5" />}
      {label}
    </span>
  );
}
