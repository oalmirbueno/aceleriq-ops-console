import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Target, ListChecks, MapPin, Lightbulb, Package } from "lucide-react";
import { TASK_STATUS_OPTIONS, TASK_PRIORITY_OPTIONS, PIPELINE_STAGE_OPTIONS } from "./taskConstants";

export interface TaskFormData {
  title: string;
  description: string;
  status: string;
  priority: string;
  stage: string;
  due_date: string;
  action_plan?: {
    what: string;
    how: string;
    where: string;
    recommendations: string;
    deliverables: string;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: TaskFormData) => Promise<void>;
  initial?: Partial<TaskFormData> | null;
  mode: "create" | "edit";
}

const EMPTY_PLAN = { what: "", how: "", where: "", recommendations: "", deliverables: "" };

const DEFAULTS: TaskFormData = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  stage: "",
  due_date: "",
  action_plan: { ...EMPTY_PLAN },
};

export default function TaskFormDialog({ open, onOpenChange, onSubmit, initial, mode }: Props) {
  const [form, setForm] = useState<TaskFormData>(DEFAULTS);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");

  useEffect(() => {
    if (open) {
      setForm({ ...DEFAULTS, ...initial, action_plan: { ...EMPTY_PLAN, ...initial?.action_plan } });
      setActiveTab("general");
    }
  }, [open, initial]);

  const updatePlan = (field: string, value: string) => {
    setForm((prev) => ({
      ...prev,
      action_plan: { ...(prev.action_plan ?? EMPTY_PLAN), [field]: value },
    }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const hasPlan = form.action_plan && Object.values(form.action_plan).some((v) => v.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">{mode === "create" ? "Nova Task" : "Editar Task"}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="general">Dados Gerais</TabsTrigger>
            <TabsTrigger value="plan" className="relative">
              Plano de Ação
              {hasPlan && <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary inline-block" />}
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 pr-1" style={{ maxHeight: "calc(90vh - 200px)" }}>
            <TabsContent value="general" className="mt-4 space-y-4 pb-2">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Título *</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Título claro e objetivo da task"
                  className="text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Descrição</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Contexto, objetivo e detalhes operacionais da task..."
                  rows={8}
                  className="text-sm leading-relaxed resize-y min-h-[120px]"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Prioridade</Label>
                  <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITY_OPTIONS.map((p) => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Etapa</Label>
                  <Select value={form.stage || "_none"} onValueChange={(v) => setForm({ ...form, stage: v === "_none" ? "" : v })}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Nenhuma</SelectItem>
                      {PIPELINE_STAGE_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Prazo</Label>
                  <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="text-sm" />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="plan" className="mt-4 space-y-5 pb-2">
              <p className="text-xs text-muted-foreground">
                Estruture o plano de ação desta task. O sistema preenche automaticamente ao gerar tasks — você pode editar e refinar.
              </p>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Target className="h-3.5 w-3.5 text-primary" />
                  O que fazer
                </Label>
                <Textarea
                  value={form.action_plan?.what ?? ""}
                  onChange={(e) => updatePlan("what", e.target.value)}
                  placeholder="Descreva o objetivo concreto e o escopo da ação..."
                  rows={4}
                  className="text-sm leading-relaxed resize-y min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5 text-primary" />
                  Como fazer
                </Label>
                <Textarea
                  value={form.action_plan?.how ?? ""}
                  onChange={(e) => updatePlan("how", e.target.value)}
                  placeholder="Passo a passo detalhado para execução..."
                  rows={6}
                  className="text-sm leading-relaxed resize-y min-h-[100px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  Onde executar
                </Label>
                <Textarea
                  value={form.action_plan?.where ?? ""}
                  onChange={(e) => updatePlan("where", e.target.value)}
                  placeholder="Ferramentas, plataformas, ambientes, links..."
                  rows={3}
                  className="text-sm leading-relaxed resize-y min-h-[60px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" />
                  Recomendações
                </Label>
                <Textarea
                  value={form.action_plan?.recommendations ?? ""}
                  onChange={(e) => updatePlan("recommendations", e.target.value)}
                  placeholder="Boas práticas, cuidados, prioridades..."
                  rows={4}
                  className="text-sm leading-relaxed resize-y min-h-[80px]"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-emerald-400" />
                  Entregáveis esperados
                </Label>
                <Textarea
                  value={form.action_plan?.deliverables ?? ""}
                  onChange={(e) => updatePlan("deliverables", e.target.value)}
                  placeholder="O que deve ser entregue ao final desta task..."
                  rows={4}
                  className="text-sm leading-relaxed resize-y min-h-[80px]"
                />
              </div>
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.title.trim()}>
            {saving ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
