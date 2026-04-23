/**
 * SettingsPage — Configurações administrativas do Aceleriq Ops.
 *
 * Gerencia:
 *  - Planos (preço, tagline, entregáveis, rituais) — editor + preview lado a lado
 *  - Restaurar configurações padrão ancoradas no método ACELERA
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Settings, Save, RotateCcw, Plus, X, Shield, Eye, Edit3,
  DollarSign, Calendar, Users, Target,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { isAdmin } from "@/lib/adminCheck";
import {
  getPlanConfig, savePlanConfig, getDefaultConfig, getPlanOrder,
  type PlanKey, type PlanConfig, type DeliverableGroup,
} from "@/lib/planConfig";
import PlanDetailsCard from "@/components/workspace/PlanDetailsCard";
import { PIPELINE_STAGE_LABELS, PIPELINE_STAGES_ORDERED } from "@/components/workspace/aceleraConstants";
import { cn } from "@/lib/utils";

const PLAN_KEYS = getPlanOrder();

export default function SettingsPage() {
  const { user, userRole } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<Record<PlanKey, PlanConfig>>(getPlanConfig);
  const [activePlan, setActivePlan] = useState<PlanKey>("starter");
  const [mode, setMode] = useState<"preview" | "edit">("preview");

  useEffect(() => {
    if (!isAdmin(userRole)) navigate("/ops", { replace: true });
  }, [userRole, navigate]);

  if (!isAdmin(userRole)) return null;

  const plan = config[activePlan];

  const updateField = <K extends keyof PlanConfig>(field: K, value: PlanConfig[K]) => {
    setConfig(prev => ({ ...prev, [activePlan]: { ...prev[activePlan], [field]: value } }));
  };

  const toggleStage = (stage: string) => {
    const current = plan.stages_covered;
    const next = current.includes(stage)
      ? current.filter(s => s !== stage)
      : [...current, stage];
    // Sort by canonical order
    const sorted = PIPELINE_STAGES_ORDERED.filter(s => next.includes(s));
    updateField("stages_covered", sorted);
  };

  const updateDeliverableGroup = (idx: number, group: DeliverableGroup) => {
    const next = [...plan.deliverables];
    next[idx] = group;
    updateField("deliverables", next);
  };

  const addDeliverableGroup = () => {
    updateField("deliverables", [...plan.deliverables, { category: "Nova categoria", items: [] }]);
  };

  const removeDeliverableGroup = (idx: number) => {
    updateField("deliverables", plan.deliverables.filter((_, i) => i !== idx));
  };

  const addStringTo = (field: "extras" | "rituals", value: string) => {
    if (!value.trim()) return;
    updateField(field, [...plan[field], value.trim()]);
  };

  const removeStringFrom = (field: "extras" | "rituals", idx: number) => {
    updateField(field, plan[field].filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    savePlanConfig(config);
    toast({ title: "Planos atualizados", description: "As alterações foram salvas." });
  };

  const handleReset = () => {
    if (!window.confirm("Restaurar TODOS os planos para o padrão ACELERA? Isso sobrescreve customizações atuais.")) return;
    const defaults = getDefaultConfig();
    setConfig(defaults);
    savePlanConfig(defaults);
    toast({ title: "Restaurado", description: "Planos restaurados ao padrão ACELERA." });
  };

  return (
    <>
      <AppHeader title="Configurações" subtitle="Gerenciamento dos planos Aceleriq" />

      <div className="p-6 animate-fade-in space-y-6 w-full">
        {/* Admin banner */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 border border-primary/30">
              <Shield className="h-4 w-4 text-primary" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-foreground">Área restrita — administrador</span>
              <span className="text-[10px] text-muted-foreground font-mono">{user?.email}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleReset} variant="ghost" size="sm" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar padrão
            </Button>
            <Button onClick={handleSave} size="sm" className="h-8 gap-1.5 text-xs">
              <Save className="h-3.5 w-3.5" /> Salvar alterações
            </Button>
          </div>
        </div>

        {/* Section title */}
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Planos comerciais</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Edite preço, entregáveis, etapas ACELERA cobertas e rituais de cada plano.
            </p>
          </div>
          <div className="flex items-center gap-1 bg-secondary/60 rounded-md p-0.5 border border-border/60">
            <button type="button" onClick={() => setMode("preview")}
              className={cn("text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1.5",
                mode === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Eye className="h-3 w-3" /> Preview
            </button>
            <button type="button" onClick={() => setMode("edit")}
              className={cn("text-xs px-3 py-1.5 rounded transition-colors flex items-center gap-1.5",
                mode === "edit" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
              <Edit3 className="h-3 w-3" /> Editar
            </button>
          </div>
        </div>

        {/* Plan tabs */}
        <div className="flex items-center gap-1 border-b border-border/60 -mt-2">
          {PLAN_KEYS.map(key => {
            const p = config[key];
            const active = activePlan === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActivePlan(key)}
                className={cn(
                  "flex items-center gap-2.5 px-4 py-3 text-sm font-medium border-b-2 transition-all -mb-px",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground/80 hover:border-border",
                )}
              >
                <span>{p.label}</span>
                <span className={cn(
                  "text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded",
                  active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground/70",
                )}>
                  R$ {p.monthly.toLocaleString("pt-BR")}
                </span>
              </button>
            );
          })}
        </div>

        {mode === "preview" ? (
          /* ══ PREVIEW ══ */
          <div className="grid gap-5 lg:grid-cols-3">
            {PLAN_KEYS.map(key => (
              <PlanDetailsCard
                key={key}
                planKey={key}
                plan={config[key]}
                highlighted={activePlan === key}
              />
            ))}
          </div>
        ) : (
          /* ══ EDIT ══ */
          <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
            {/* Form */}
            <div className="space-y-4">
              {/* Identity */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4 text-primary" /> Identidade do plano
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome comercial</Label>
                      <Input value={plan.label} onChange={e => updateField("label", e.target.value)} className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Chave interna (não editável)</Label>
                      <Input value={activePlan} disabled className="h-9 text-sm font-mono opacity-50" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tagline — promessa em 1 frase</Label>
                    <Input value={plan.tagline} onChange={e => updateField("tagline", e.target.value)} className="h-9 text-sm" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição expandida</Label>
                    <Textarea value={plan.description} onChange={e => updateField("description", e.target.value)}
                      rows={3} className="text-sm resize-none" />
                  </div>
                </CardContent>
              </Card>

              {/* Pricing + target */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" /> Preço e público-alvo
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Valor mensal (R$)</Label>
                      <Input type="number" value={plan.monthly}
                        onChange={e => updateField("monthly", parseFloat(e.target.value) || 0)}
                        className="h-9 text-sm tabular-nums" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Contrato mínimo (meses)</Label>
                      <Input type="number" value={plan.min_contract_months}
                        onChange={e => updateField("min_contract_months", parseInt(e.target.value) || 1)}
                        className="h-9 text-sm tabular-nums" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Faturamento do cliente ideal</Label>
                      <Input value={plan.target_revenue} onChange={e => updateField("target_revenue", e.target.value)}
                        placeholder="Ex: R$ 200k-1M/mês" className="h-9 text-sm" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Frentes simultâneas</Label>
                      <Select
                        value={plan.max_active_fronts === null ? "unlimited" : String(plan.max_active_fronts)}
                        onValueChange={(v) => updateField("max_active_fronts", v === "unlimited" ? null : parseInt(v))}
                      >
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[1,2,3,4,5,6,8,10].map(n => <SelectItem key={n} value={String(n)}>{n} frentes</SelectItem>)}
                          <SelectItem value="unlimited">Ilimitado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ACELERA stages */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" /> Etapas ACELERA cobertas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1.5">
                    {PIPELINE_STAGES_ORDERED.map(stage => {
                      const covered = plan.stages_covered.includes(stage);
                      return (
                        <label key={stage} className="flex items-center gap-2 p-2 rounded hover:bg-secondary/50 cursor-pointer">
                          <input type="checkbox" checked={covered} onChange={() => toggleStage(stage)}
                            className="h-3.5 w-3.5 accent-primary" />
                          <span className={cn("text-sm", covered ? "text-foreground font-medium" : "text-muted-foreground")}>
                            {PIPELINE_STAGE_LABELS[stage]}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Deliverables */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" /> Entregáveis do plano
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {plan.deliverables.map((group, gi) => (
                    <DeliverableGroupEditor
                      key={gi}
                      group={group}
                      onChange={(g) => updateDeliverableGroup(gi, g)}
                      onRemove={() => removeDeliverableGroup(gi)}
                    />
                  ))}
                  <Button onClick={addDeliverableGroup} variant="outline" size="sm" className="h-8 text-xs gap-1.5 w-full">
                    <Plus className="h-3 w-3" /> Nova categoria de entregáveis
                  </Button>
                </CardContent>
              </Card>

              {/* Extras + rituais */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">Extras e rituais operacionais</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <StringListEditor
                    label="Extras inclusos"
                    items={plan.extras}
                    onAdd={(v) => addStringTo("extras", v)}
                    onRemove={(i) => removeStringFrom("extras", i)}
                    placeholder="Ex: Portal do cliente"
                  />
                  <StringListEditor
                    label="Rituais de reunião"
                    items={plan.rituals}
                    onAdd={(v) => addStringTo("rituals", v)}
                    onRemove={(i) => removeStringFrom("rituals", i)}
                    placeholder="Ex: Alignment semanal (45min)"
                  />
                </CardContent>
              </Card>
            </div>

            {/* Side preview */}
            <div className="lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Preview em tempo real
              </p>
              <PlanDetailsCard planKey={activePlan} plan={plan} highlighted />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function DeliverableGroupEditor({ group, onChange, onRemove }: {
  group: DeliverableGroup;
  onChange: (g: DeliverableGroup) => void;
  onRemove: () => void;
}) {
  const [newItem, setNewItem] = useState("");

  const addItem = () => {
    if (!newItem.trim()) return;
    onChange({ ...group, items: [...group.items, newItem.trim()] });
    setNewItem("");
  };

  return (
    <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={group.category}
          onChange={e => onChange({ ...group, category: e.target.value })}
          className="h-7 text-xs font-semibold flex-1"
        />
        <Button onClick={onRemove} size="icon" variant="ghost" className="h-7 w-7 text-destructive/60 hover:text-destructive">
          <X className="h-3 w-3" />
        </Button>
      </div>
      <ul className="space-y-1">
        {group.items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 group">
            <span className="h-1 w-1 rounded-full bg-primary shrink-0" />
            <span className="text-xs text-foreground/80 flex-1">{item}</span>
            <button type="button"
              onClick={() => onChange({ ...group, items: group.items.filter((_, j) => j !== i) })}
              className="opacity-0 group-hover:opacity-100 text-destructive/50 hover:text-destructive">
              <X className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-1.5 pt-1">
        <Input
          value={newItem} onChange={e => setNewItem(e.target.value)}
          onKeyDown={e => e.key === "Enter" && addItem()}
          placeholder="Novo entregável..." className="h-7 text-xs" />
        <Button onClick={addItem} size="icon" variant="outline" className="h-7 w-7">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function StringListEditor({ label, items, onAdd, onRemove, placeholder }: {
  label: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (i: number) => void;
  placeholder?: string;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, i) => (
          <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1 pr-1">
            {item}
            <button onClick={() => onRemove(i)} className="hover:text-destructive transition-colors">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        {items.length === 0 && <span className="text-xs text-muted-foreground">Nenhum item</span>}
      </div>
      <div className="flex items-center gap-1.5">
        <Input value={val} onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && val.trim()) { onAdd(val); setVal(""); } }}
          placeholder={placeholder} className="h-8 text-xs flex-1" />
        <Button onClick={() => { if (val.trim()) { onAdd(val); setVal(""); } }}
          size="sm" variant="outline" className="h-8 text-xs">
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
