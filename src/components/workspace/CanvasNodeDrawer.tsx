import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Link2, ListPlus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  CANVAS_STATUS_OPTIONS, getCanvasTypeConfig, getCanvasStatusConfig,
  LINKABLE_TYPES, ENTITY_TAB_HINT,
} from "./canvasConstants";
import { CANVAS_TIMELINE_EVENT_TYPE, buildCanvasTitle, buildCanvasDescription } from "./canvasTimeline";

export interface CanvasNodeRecord {
  id: string;
  workspace_id: string;
  node_type: string;
  title: string;
  status: string;
  description: string | null;
  pos_x: number;
  pos_y: number;
  data: Record<string, unknown> | null;
  linked_entity_type: string | null;
  linked_entity_id: string | null;
  created_at: string;
  updated_at: string;
}

interface LinkableEntity { id: string; label: string }

interface Props {
  node: CanvasNodeRecord | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  onUpdated: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
}

export default function CanvasNodeDrawer({
  node, open, onOpenChange, workspaceId, clientId, onUpdated, onDelete,
}: Props) {
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("draft");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [entities, setEntities] = useState<LinkableEntity[]>([]);
  const [loadingEntities, setLoadingEntities] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<string>("");

  const [linkedLabel, setLinkedLabel] = useState<string | null>(null);

  const [taskTitle, setTaskTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);

  useEffect(() => {
    if (!node) return;
    setTitle(node.title);
    setStatus(node.status);
    setDescription(node.description ?? "");
    setSelectedEntity(node.linked_entity_id ?? "");
    setTaskTitle("");
  }, [node]);

  const typeCfg = node ? getCanvasTypeConfig(node.node_type) : null;
  const statusCfg = node ? getCanvasStatusConfig(node.status) : null;
  const linkableEntityTable = typeCfg?.linkedEntity ?? null;
  const isLinkable = node && LINKABLE_TYPES.includes(node.node_type as typeof LINKABLE_TYPES[number]) && linkableEntityTable;

  /* ─── Load linkable entities for this node type ─── */
  const loadEntities = useCallback(async () => {
    if (!isLinkable || !linkableEntityTable) return;
    setLoadingEntities(true);

    const titleField =
      linkableEntityTable === "metric_snapshots" ? "metric_name" :
      linkableEntityTable === "context_entries" ? "title" : "title";

    const { data } = await supabase
      .from(linkableEntityTable as never)
      .select(`id, ${titleField}`)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(50);

    const list: LinkableEntity[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
      id: String(r.id),
      label: String(r[titleField] ?? r.id),
    }));
    setEntities(list);
    setLoadingEntities(false);
  }, [isLinkable, linkableEntityTable, workspaceId]);

  useEffect(() => { if (open) loadEntities(); }, [open, loadEntities]);

  /* ─── Resolve linked label ─── */
  useEffect(() => {
    if (!node?.linked_entity_id || !node.linked_entity_type) {
      setLinkedLabel(null);
      return;
    }
    const found = entities.find((e) => e.id === node.linked_entity_id);
    if (found) setLinkedLabel(found.label);
  }, [node, entities]);

  if (!node || !typeCfg || !statusCfg) return null;
  const Icon = typeCfg.icon;

  /* ─── Save edits ─── */
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("canvas_nodes")
      .update({
        title: title.trim() || node.title,
        status,
        description: description.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Node atualizado" });
      await onUpdated();
    }
    setSaving(false);
  };

  /* ─── Link/unlink entity ─── */
  const handleLink = async () => {
    if (!isLinkable) return;
    const entityId = selectedEntity && selectedEntity !== "__none__" ? selectedEntity : null;
    const { error } = await supabase
      .from("canvas_nodes")
      .update({
        linked_entity_type: entityId ? linkableEntityTable : null,
        linked_entity_id: entityId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);

    if (error) {
      toast({ title: "Erro ao vincular", description: error.message, variant: "destructive" });
    } else {
      toast({ title: entityId ? "Entidade vinculada" : "Vínculo removido" });
      await onUpdated();
    }
  };

  /* ─── Generate task from node ─── */
  const handleCreateTask = async () => {
    const finalTitle = taskTitle.trim() || `Task: ${node.title}`;
    setCreatingTask(true);

    const { error } = await supabase.from("tasks").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      title: finalTitle,
      status: "pending",
      priority: "medium",
      stage: "execucao",
      source_type: "canvas",
      source_id: node.id,
    });

    if (error) {
      toast({ title: "Erro ao criar task", description: error.message, variant: "destructive" });
      setCreatingTask(false);
      return;
    }

    await supabase.from("timeline_events").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      event_type: CANVAS_TIMELINE_EVENT_TYPE,
      title: buildCanvasTitle({ action: "task_from_node", nodeTitle: node.title, taskTitle: finalTitle }),
      description: buildCanvasDescription({ action: "task_from_node", nodeTitle: node.title, nodeType: node.node_type, taskTitle: finalTitle }),
      happened_at: new Date().toISOString(),
    });

    toast({ title: "Task criada", description: `Origem: Canvas → ${node.title}` });
    setTaskTitle("");
    setCreatingTask(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Remover node "${node.title}" do Canvas?`)) return;
    await onDelete(node.id);
    onOpenChange(false);
  };

  const tabHint = node.linked_entity_type ? ENTITY_TAB_HINT[node.linked_entity_type] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-6 gap-0 border border-white/10 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-y-auto overscroll-contain sm:rounded-2xl pr-12"
        style={{
          background: "rgba(9,17,10,0.92)",
          backdropFilter: "blur(32px) saturate(200%)",
          WebkitBackdropFilter: "blur(32px) saturate(200%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)",
        }}
      >
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <Badge variant="outline" className={`text-[10px] ${typeCfg.color}`}>{typeCfg.label}</Badge>
            <Badge variant="outline" className={`text-[10px] ${statusCfg.color}`}>{statusCfg.label}</Badge>
          </div>
          <DialogTitle className="text-left">{node.title}</DialogTitle>
          <DialogDescription className="text-left">Node operacional do Canvas</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-5">
          {/* Edit fields */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
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
              <Label className="text-xs">Descrição</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
            </div>
            <Button onClick={handleSave} disabled={saving} size="sm" className="w-full">
              <Save className="h-3.5 w-3.5 mr-1" />
              {saving ? "Salvando..." : "Salvar alterações"}
            </Button>
          </div>

          {/* Linked entity */}
          {isLinkable && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  <Label className="text-sm font-medium">Entidade vinculada</Label>
                </div>

                {node.linked_entity_id && linkedLabel && (
                  <Card className="border-primary/30">
                    <CardContent className="p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground uppercase">{node.linked_entity_type}</p>
                        <p className="text-sm font-medium truncate">{linkedLabel}</p>
                      </div>
                      {tabHint && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => toast({ title: "Abra a aba", description: `Veja em "${tabHint}"` })}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}

                <div className="flex gap-2">
                  <Select value={selectedEntity} onValueChange={setSelectedEntity}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={loadingEntities ? "Carregando..." : `Selecionar ${typeCfg.label.toLowerCase()}...`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {entities.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          <span className="truncate">{e.label}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" onClick={handleLink}>Vincular</Button>
                </div>
              </div>
            </>
          )}

          {/* Generate task */}
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ListPlus className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Gerar task a partir do node</Label>
            </div>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder={`Task: ${node.title}`}
              className="text-sm"
            />
            <Button size="sm" onClick={handleCreateTask} disabled={creatingTask} className="w-full">
              {creatingTask ? "Criando..." : "Criar task (origem: canvas)"}
            </Button>
          </div>

          {/* Delete */}
          <Separator />
          <Button variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover node
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
