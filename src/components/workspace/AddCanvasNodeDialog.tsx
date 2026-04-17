import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CANVAS_NODE_TYPES, CANVAS_STATUS_OPTIONS, type CanvasNodeType } from "./canvasConstants";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (data: {
    node_type: CanvasNodeType;
    title: string;
    status: string;
    description: string | null;
  }) => Promise<void> | void;
}

export default function AddCanvasNodeDialog({ open, onOpenChange, onCreate }: Props) {
  const [type, setType] = useState<CanvasNodeType>("front");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("draft");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setType("front");
      setTitle("");
      setStatus("draft");
      setDescription("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await onCreate({
      node_type: type,
      title: title.trim(),
      status,
      description: description.trim() || null,
    });
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo node no Canvas</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo *</Label>
            <Select value={type} onValueChange={(v) => setType(v as CanvasNodeType)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANVAS_NODE_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Título *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Frente de Tráfego, Dossiê Cliente X..." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CANVAS_STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? "Criando..." : "Criar Node"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
