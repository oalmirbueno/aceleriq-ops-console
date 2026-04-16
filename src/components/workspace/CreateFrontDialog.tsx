import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BUCKET_STATUS_OPTIONS, PRIORITY_OPTIONS } from "./frontConstants";

export interface FrontFormData {
  name: string;
  objective: string;
  expected_outcome: string;
  priority: string;
  bucket_status: string;
  scope_classification: string;
  front_key?: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (data: FrontFormData) => Promise<void>;
  initial?: FrontFormData | null;
  mode?: "create" | "edit";
}

export default function CreateFrontDialog({ open, onOpenChange, onSubmit, initial, mode = "create" }: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [objective, setObjective] = useState(initial?.objective ?? "");
  const [expectedOutcome, setExpectedOutcome] = useState(initial?.expected_outcome ?? "");
  const [priority, setPriority] = useState(initial?.priority ?? "medium");
  const [bucket, setBucket] = useState(initial?.bucket_status ?? "active");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName(initial?.name ?? "");
    setObjective(initial?.objective ?? "");
    setExpectedOutcome(initial?.expected_outcome ?? "");
    setPriority(initial?.priority ?? "medium");
    setBucket(initial?.bucket_status ?? "active");
  };

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        objective: objective.trim(),
        expected_outcome: expectedOutcome.trim(),
        priority,
        bucket_status: bucket,
        scope_classification: initial?.scope_classification ?? "in_plan",
        front_key: initial?.front_key,
        metadata: initial?.metadata,
      });
      if (mode === "create") reset();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Nova Frente Operacional" : "Editar Frente"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Estrutura Comercial" />
          </div>
          <div className="space-y-1.5">
            <Label>Objetivo</Label>
            <Textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} placeholder="O que essa frente resolve" />
          </div>
          <div className="space-y-1.5">
            <Label>Resultado Esperado</Label>
            <Textarea value={expectedOutcome} onChange={(e) => setExpectedOutcome(e.target.value)} rows={2} placeholder="O que será entregue quando concluída" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bucket</Label>
              <Select value={bucket} onValueChange={setBucket}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUCKET_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || saving}>
            {saving ? "Salvando..." : mode === "create" ? "Criar Frente" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
