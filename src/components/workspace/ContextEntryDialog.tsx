import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CONTEXT_TYPES = [
  "briefing", "dor", "objetivo", "reuniao", "transcricao",
  "decisao", "acesso", "anotacao", "diagnostico",
] as const;

export type ContextType = (typeof CONTEXT_TYPES)[number];

export interface ContextFormData {
  context_type: ContextType;
  title: string;
  content: string;
  happened_at: string;
  source_label: string;
  source_url: string;
  tags: string;
  is_key_decision: boolean;
}

interface ContextEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: ContextFormData) => Promise<void>;
  initial?: Partial<ContextFormData>;
  mode: "create" | "edit";
}

const empty: ContextFormData = {
  context_type: "anotacao",
  title: "",
  content: "",
  happened_at: "",
  source_label: "",
  source_url: "",
  tags: "",
  is_key_decision: false,
};

export default function ContextEntryDialog({
  open, onOpenChange, onSubmit, initial, mode,
}: ContextEntryDialogProps) {
  const [form, setForm] = useState<ContextFormData>(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ ...empty, ...initial });
    }
  }, [open, initial]);

  const set = (k: keyof ContextFormData, v: string | boolean) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim()) return;
    setSaving(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Novo contexto" : "Editar contexto"}</DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Registre uma informação relevante para este workspace."
              : "Atualize os dados deste contexto."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.context_type} onValueChange={(v) => set("context_type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CONTEXT_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Título do contexto" />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <Label>Conteúdo *</Label>
            <Textarea value={form.content} onChange={(e) => set("content", e.target.value)} placeholder="Descreva o contexto..." rows={4} />
          </div>

          {/* Happened at */}
          <div className="space-y-1.5">
            <Label>Data do evento</Label>
            <Input type="datetime-local" value={form.happened_at} onChange={(e) => set("happened_at", e.target.value)} />
          </div>

          {/* Source */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Input value={form.source_label} onChange={(e) => set("source_label", e.target.value)} placeholder="Ex: Reunião Kick-off" />
            </div>
            <div className="space-y-1.5">
              <Label>Link</Label>
              <Input value={form.source_url} onChange={(e) => set("source_url", e.target.value)} placeholder="https://..." />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="branding, estratégia, ux (separadas por vírgula)" />
          </div>

          {/* Key decision */}
          <div className="flex items-center gap-3">
            <Switch checked={form.is_key_decision} onCheckedChange={(v) => set("is_key_decision", v)} />
            <Label className="cursor-pointer">Decisão-chave</Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.title.trim() || !form.content.trim()}>
            {saving ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
