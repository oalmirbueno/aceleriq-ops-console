import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ASSET_TYPE_OPTIONS, VALIDATION_STATUS_OPTIONS } from "./assetConstants";

interface Front {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  onCreated: () => void;
  preselectedFrontId?: string | null;
}

export default function CreateAssetDialog({ open, onOpenChange, workspaceId, clientId, onCreated, preselectedFrontId }: Props) {
  const [fronts, setFronts] = useState<Front[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [saving, setSaving] = useState(false);

  const [assetType, setAssetType] = useState("deliverable_link");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [primaryUse, setPrimaryUse] = useState("");
  const [observation, setObservation] = useState("");
  const [validationStatus, setValidationStatus] = useState("draft");
  const [frontId, setFrontId] = useState<string>(preselectedFrontId ?? "");
  const [taskId, setTaskId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setAssetType("deliverable_link");
    setTitle("");
    setDescription("");
    setUrl("");
    setPrimaryUse("");
    setObservation("");
    setValidationStatus("draft");
    setFrontId(preselectedFrontId ?? "");
    setTaskId("");

    supabase.from("operational_fronts").select("id, name").eq("workspace_id", workspaceId).order("name").then(({ data }) => {
      setFronts((data ?? []) as Front[]);
    });
    supabase.from("tasks").select("id, title").eq("workspace_id", workspaceId).order("title").limit(100).then(({ data }) => {
      setTasks((data ?? []) as Task[]);
    });
  }, [open, workspaceId, preselectedFrontId]);

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);

    const payload = {
      workspace_id: workspaceId,
      client_id: clientId,
      asset_type: assetType,
      title: title.trim(),
      description: description.trim() || null,
      url: url.trim() || null,
      primary_use: primaryUse.trim() || null,
      observation: observation.trim() || null,
      validation_status: validationStatus,
      operational_front_id: frontId && frontId !== "__none__" ? frontId : null,
      task_id: taskId && taskId !== "__none__" ? taskId : null,
      happened_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("assets").insert(payload);

    if (error) {
      toast({
        title: "Erro ao criar asset",
        description: error.message.includes("url")
          ? "A tabela assets ainda não tem a coluna 'url'. Rode a migration pendente no banco e tente novamente."
          : error.message,
        variant: "destructive",
      });
      setSaving(false);
      return;
    }

    await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: "asset_created",
      title: `Asset criado: ${title.trim()}`,
      description: `Tipo: ${ASSET_TYPE_OPTIONS.find(o => o.value === assetType)?.label ?? assetType}`,
      happened_at: new Date().toISOString(),
    });

    if (frontId && frontId !== "__none__") {
      await supabase.from("timeline_events").insert({
        workspace_id: workspaceId,
        client_id: clientId,
        event_type: "asset_linked_front",
        title: `Asset vinculado à frente: ${title.trim()}`,
        happened_at: new Date().toISOString(),
      });
    }

    toast({ title: "Asset criado" });
    onCreated();
    onOpenChange(false);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Asset / Prova Operacional</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Tipo *</Label>
            <Select value={assetType} onValueChange={setAssetType}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ASSET_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>
                    <div>
                      <span>{o.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{o.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Título *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex: Landing page v2 — link final" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Descrição curta</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Breve contexto sobre este asset" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">URL / Link</Label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Utilidade principal</Label>
            <Input value={primaryUse} onChange={e => setPrimaryUse(e.target.value)} placeholder="Ex: Prova de entrega, before/after, métrica..." />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observação</Label>
            <Textarea value={observation} onChange={e => setObservation(e.target.value)} rows={2} placeholder="Nota adicional (opcional)" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Status de Validação</Label>
              <Select value={validationStatus} onValueChange={setValidationStatus}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALIDATION_STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Frente Operacional</Label>
              <Select value={frontId} onValueChange={setFrontId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhuma</SelectItem>
                  {fronts.map(f => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Task vinculada (opcional)</Label>
            <Select value={taskId} onValueChange={setTaskId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Nenhuma" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma</SelectItem>
                {tasks.map(t => (
                  <SelectItem key={t.id} value={t.id}>
                    <span className="truncate">{t.title}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!title.trim() || saving}>
              {saving ? "Salvando..." : "Criar Asset"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
