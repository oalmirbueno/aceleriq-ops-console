import { useState, useEffect } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Save, Trash2, Link2, Plus, ExternalLink, GripVertical,
  FileText, ListChecks, BarChart3, MessageSquare, Paperclip,
  Sparkles, Loader2, X, FolderInput, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { ACELERA_STAGES, getProjectTypeMeta, getStageMeta, type AceleraStageKey, type ProjectNodeKind } from "./canvasProjectTypes";
import { ESTEIRA_STATUSES, getEsteiraStatus, mapLegacyStatus, premiumStatusToDb } from "./canvasEsteiraStatus";
import AttachmentUploader, { type AttachmentItem } from "./AttachmentUploader";
import ClientAvatar from "./ClientAvatar";
import BriefingConsolidatedView from "./BriefingConsolidatedView";
import CanvasNodeOperationalFields from "./CanvasNodeOperationalFields";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

export interface ClientFolderOption {
  id: string;             // canvas_nodes.id of the client group
  name: string;
  linkedClientId: string | null;
  logoUrl?: string | null;
}

interface Props {
  node: (CanvasNodeRecord & { parent_node_id?: string | null }) | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  onUpdated: () => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  /** Available client folders to move this node to */
  clientFolders?: ClientFolderOption[];
  /** Move the node to another client folder (or null to detach). */
  onMoveToFolder?: (nodeId: string, targetFolderId: string | null) => Promise<void> | void;
  availableNodes?: Array<CanvasNodeRecord & { parent_node_id?: string | null }>;
}

type LinkItem = { label: string; url: string };
type ChecklistItem = { id: string; text: string; done: boolean };

interface RichData {
  kind?: ProjectNodeKind;
  stage?: AceleraStageKey;
  copy?: string;
  notes?: string;
  links?: LinkItem[];
  checklist?: ChecklistItem[];
  attachments?: AttachmentItem[];
  metrics?: Array<{ label: string; value: string }>;
}

function parseData(d: Record<string, unknown> | null): RichData {
  return (d ?? {}) as RichData;
}

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function ProjectNodeDrawer({
  node, open, onOpenChange, workspaceId, onUpdated, onDelete,
  clientFolders = [], onMoveToFolder, availableNodes = [],
}: Props) {
  const [title, setTitle] = useState("");
  const [statusPremium, setStatusPremium] = useState("ideia");
  const [stage, setStage] = useState<AceleraStageKey>("producao");
  const [description, setDescription] = useState("");
  const [copy, setCopy] = useState("");
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [metrics, setMetrics] = useState<Array<{ label: string; value: string }>>([]);
  const [saving, setSaving] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moving, setMoving] = useState(false);

  useEffect(() => {
    if (!node) return;
    const rich = parseData(node.data);
    setTitle(node.title);
    setStatusPremium(mapLegacyStatus(node.status));
    setStage((rich.stage ?? "producao") as AceleraStageKey);
    setDescription(node.description ?? "");
    setCopy(rich.copy ?? "");
    setNotes(rich.notes ?? "");
    setLinks(rich.links ?? []);
    setChecklist(rich.checklist ?? []);
    setAttachments(rich.attachments ?? []);
    setMetrics(rich.metrics ?? []);
  }, [node]);

  if (!node) return null;

  const richNow = parseData(node.data);
  const kind = (richNow.kind ?? node.node_type) as string;
  const meta = getProjectTypeMeta(kind);
  const stageMeta = getStageMeta(stage);
  const Icon = meta?.icon ?? FileText;
  const sections = meta?.sections ?? ["overview","links","copy","checklist","attachments","notes","metrics"];
  const parentFolder = clientFolders.find((f) => f.id === node.parent_node_id);
  const clientId = parentFolder?.linkedClientId ?? null;

  const handleSave = async () => {
    setSaving(true);
    const newData: Record<string, unknown> = {
      ...richNow,
      kind,
      stage,
      copy,
      notes,
      links,
      checklist,
      attachments,
      metrics,
    };
    const { error } = await supabase
      .from("canvas_nodes")
      .update({
        title: title.trim() || node.title,
        status: premiumStatusToDb(statusPremium),
        description: description.trim() || null,
        data: newData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", node.id);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Salvo", description: meta?.label ?? "Node atualizado" });
      await onUpdated();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Remover "${node.title}"?`)) return;
    await onDelete(node.id);
    onOpenChange(false);
  };

  /* ─── Links ─── */
  const addLink = () => setLinks((l) => [...l, { label: "", url: "" }]);
  const updateLink = (i: number, patch: Partial<LinkItem>) => setLinks((l) => l.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeLink = (i: number) => setLinks((l) => l.filter((_, idx) => idx !== i));

  /* ─── Checklist ─── */
  const addCheck = () => setChecklist((l) => [...l, { id: uid(), text: "", done: false }]);
  const updateCheck = (id: string, patch: Partial<ChecklistItem>) => setChecklist((l) => l.map((x) => x.id === id ? { ...x, ...patch } : x));
  const removeCheck = (id: string) => setChecklist((l) => l.filter((x) => x.id !== id));

  /* ─── Attachments handled by AttachmentUploader ─── */

  /* ─── Metrics ─── */
  const addMetric = () => setMetrics((l) => [...l, { label: "", value: "" }]);
  const updateMetric = (i: number, patch: Partial<{ label: string; value: string }>) => setMetrics((l) => l.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const removeMetric = (i: number) => setMetrics((l) => l.filter((_, idx) => idx !== i));

  const checklistDone = checklist.filter((c) => c.done).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="center" className="canvas-node-popup p-0 flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`px-5 py-4 border-b border-border ${meta?.bg ?? ""}`}>
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-lg border-2 ${meta?.color ?? "border-border"} bg-background flex items-center justify-center shrink-0`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                <Badge variant="outline" className={`text-[10px] ${meta?.color ?? ""}`}>{meta?.label ?? kind}</Badge>
                <Badge variant="outline" className={`text-[10px] ${stageMeta.badge}`}>{stageMeta.letter} · {stageMeta.short}</Badge>
                <Badge variant="outline" className={`text-[10px] ${getEsteiraStatus(statusPremium).color}`}>
                  {getEsteiraStatus(statusPremium).label}
                </Badge>
                {onMoveToFolder && (() => {
                  const current = clientFolders.find((f) => f.id === node.parent_node_id);
                  return (
                    <Popover open={moveOpen} onOpenChange={setMoveOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-background/60 hover:bg-muted/70 hover:border-primary/50 transition-colors px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                          aria-label="Mover para outra pasta"
                          disabled={moving}
                        >
                          {moving ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : current ? (
                            <ClientAvatar
                              name={current.name}
                              seed={current.linkedClientId ?? current.id}
                              logoUrl={current.logoUrl}
                              size="xs"
                            />
                          ) : (
                            <FolderInput className="h-3 w-3" />
                          )}
                          <span className="max-w-[120px] truncate">
                            {current?.name ?? "Sem pasta"}
                          </span>
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-72 p-0">
                        <div className="px-3 py-2 border-b border-border">
                          <p className="text-xs font-semibold text-foreground">Mover para outra pasta</p>
                          <p className="text-[10px] text-muted-foreground">
                            Escolha o cliente que será o novo dono deste node.
                          </p>
                        </div>
                        <ScrollArea className="max-h-64">
                          <div className="p-1">
                            {clientFolders.length === 0 && (
                              <p className="text-[11px] text-muted-foreground text-center py-4 px-2">
                                Nenhuma pasta de cliente disponível.
                              </p>
                            )}
                            {clientFolders.map((f) => {
                              const active = f.id === node.parent_node_id;
                              return (
                                <button
                                  key={f.id}
                                  type="button"
                                  disabled={active || moving}
                                  onClick={async () => {
                                    if (!onMoveToFolder || active) return;
                                    setMoving(true);
                                    try {
                                      await onMoveToFolder(node.id, f.id);
                                      setMoveOpen(false);
                                    } finally {
                                      setMoving(false);
                                    }
                                  }}
                                  className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                    active
                                      ? "bg-primary/10 text-primary cursor-default"
                                      : "hover:bg-muted/60 text-foreground"
                                  }`}
                                >
                                  <ClientAvatar
                                    name={f.name}
                                    seed={f.linkedClientId ?? f.id}
                                    logoUrl={f.logoUrl}
                                    size="sm"
                                  />
                                  <span className="flex-1 truncate">{f.name}</span>
                                  {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </ScrollArea>
                        {node.parent_node_id && (
                          <div className="border-t border-border p-1">
                            <button
                              type="button"
                              disabled={moving}
                              onClick={async () => {
                                if (!onMoveToFolder) return;
                                setMoving(true);
                                try {
                                  await onMoveToFolder(node.id, null);
                                  setMoveOpen(false);
                                } finally {
                                  setMoving(false);
                                }
                              }}
                              className="w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                            >
                              <X className="h-3.5 w-3.5" />
                              Remover de qualquer pasta
                            </button>
                          </div>
                        )}
                      </PopoverContent>
                    </Popover>
                  );
                })()}
              </div>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base font-semibold border-0 px-0 h-auto focus-visible:ring-0 bg-transparent"
                placeholder="Título do projeto"
              />
            </div>
            <Button size="sm" onClick={handleSave} disabled={saving} className="shrink-0">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Salvar
            </Button>
          </div>

          {/* Quick controls */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Etapa ACELERA</Label>
              <Select value={stage} onValueChange={(v) => setStage(v as AceleraStageKey)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACELERA_STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key} className="text-xs">
                      <span className="font-bold mr-1">{s.letter}</span> {s.short}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</Label>
              <Select value={statusPremium} onValueChange={setStatusPremium}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTEIRA_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview" className="flex-1 flex flex-col min-h-0">
          <TabsList className="rounded-none w-full justify-start px-3 border-b border-border bg-card/40 h-9 overflow-x-auto">
            {sections.includes("overview") && <TabsTrigger value="overview" className="text-xs"><FileText className="h-3 w-3 mr-1" />Visão geral</TabsTrigger>}
            {sections.includes("links") && <TabsTrigger value="links" className="text-xs"><Link2 className="h-3 w-3 mr-1" />Links {links.length > 0 && <span className="ml-1 opacity-60">({links.length})</span>}</TabsTrigger>}
            {sections.includes("copy") && <TabsTrigger value="copy" className="text-xs"><Sparkles className="h-3 w-3 mr-1" />Copy</TabsTrigger>}
            {sections.includes("checklist") && <TabsTrigger value="checklist" className="text-xs"><ListChecks className="h-3 w-3 mr-1" />Checklist {checklist.length > 0 && <span className="ml-1 opacity-60">({checklistDone}/{checklist.length})</span>}</TabsTrigger>}
            {sections.includes("attachments") && <TabsTrigger value="attachments" className="text-xs"><Paperclip className="h-3 w-3 mr-1" />Anexos {attachments.length > 0 && <span className="ml-1 opacity-60">({attachments.length})</span>}</TabsTrigger>}
            {sections.includes("metrics") && <TabsTrigger value="metrics" className="text-xs"><BarChart3 className="h-3 w-3 mr-1" />Métricas</TabsTrigger>}
            {sections.includes("notes") && <TabsTrigger value="notes" className="text-xs"><MessageSquare className="h-3 w-3 mr-1" />Notas</TabsTrigger>}
            <TabsTrigger value="operational" className="text-xs"><ListChecks className="h-3 w-3 mr-1" />Operação</TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1">
            <div className="p-5">
              <TabsContent value="overview" className="m-0 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição curta</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={4}
                    placeholder={`Descreva o ${meta?.label.toLowerCase() ?? "projeto"}: objetivo, escopo, contexto…`}
                  />
                </div>
                {meta && (
                  <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
                    <p><strong className="text-foreground">Tipo:</strong> {meta.label}</p>
                    <p><strong className="text-foreground">Etapa sugerida:</strong> {getStageMeta(meta.defaultStage).short}</p>
                    <p><strong className="text-foreground">Seções ativas:</strong> {sections.join(" · ")}</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="links" className="m-0 space-y-2">
                {links.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Nenhum link. Adicione referências, ferramentas, painéis…</p>
                )}
                {links.map((l, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input value={l.label} onChange={(e) => updateLink(i, { label: e.target.value })} placeholder="Rótulo" className="h-8 text-xs flex-1" />
                    <Input value={l.url} onChange={(e) => updateLink(i, { url: e.target.value })} placeholder="https://…" className="h-8 text-xs flex-[2]" />
                    {l.url && (
                      <Button size="icon" variant="ghost" className="h-8 w-8" asChild>
                        <a href={l.url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeLink(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addLink} className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar link
                </Button>
              </TabsContent>

              <TabsContent value="copy" className="m-0 space-y-2">
                <Label className="text-xs">Copy / Conteúdo</Label>
                <Textarea
                  value={copy}
                  onChange={(e) => setCopy(e.target.value)}
                  rows={14}
                  placeholder="Cole aqui o conteúdo, headlines, scripts, copys…"
                  className="font-mono text-xs"
                />
              </TabsContent>

              <TabsContent value="checklist" className="m-0 space-y-1.5">
                {checklist.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Sem itens. Quebre o entregável em passos verificáveis.</p>
                )}
                {checklist.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 rounded-md border border-border p-1.5">
                    <GripVertical className="h-3 w-3 text-muted-foreground shrink-0" />
                    <Checkbox checked={c.done} onCheckedChange={(v) => updateCheck(c.id, { done: !!v })} />
                    <Input
                      value={c.text}
                      onChange={(e) => updateCheck(c.id, { text: e.target.value })}
                      placeholder="Tarefa…"
                      className={`h-7 text-xs border-0 focus-visible:ring-0 px-1 ${c.done ? "line-through text-muted-foreground" : ""}`}
                    />
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeCheck(c.id)}>
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addCheck} className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar item
                </Button>
              </TabsContent>

              <TabsContent value="attachments" className="m-0 space-y-2">
                <AttachmentUploader
                  workspaceId={workspaceId}
                  nodeId={node.id}
                  attachments={attachments}
                  onChange={setAttachments}
                />
              </TabsContent>

              <TabsContent value="metrics" className="m-0 space-y-2">
                {metrics.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Sem métricas. Adicione KPIs, números acompanhados…</p>
                )}
                {metrics.map((m, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input value={m.label} onChange={(e) => updateMetric(i, { label: e.target.value })} placeholder="Métrica" className="h-8 text-xs flex-1" />
                    <Input value={m.value} onChange={(e) => updateMetric(i, { value: e.target.value })} placeholder="Valor" className="h-8 text-xs w-28" />
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => removeMetric(i)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={addMetric} className="w-full">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar métrica
                </Button>
              </TabsContent>

              <TabsContent value="notes" className="m-0 space-y-2">
                <Label className="text-xs">Notas internas</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={12}
                  placeholder="Notas, decisões, links de contexto, comentários internos…"
                />
              </TabsContent>

              <TabsContent value="operational" className="m-0">
                <CanvasNodeOperationalFields
                  node={node}
                  workspaceId={workspaceId}
                  clientId={clientId}
                  availableNodes={availableNodes}
                  onUpdated={onUpdated}
                />
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border flex items-center justify-between bg-card/30">
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={handleDelete}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Remover
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Salvar alterações
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
