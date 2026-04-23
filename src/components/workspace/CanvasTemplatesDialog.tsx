/**
 * CanvasTemplatesDialog — salvar e aplicar templates de canvas.
 * Captura todos os nodes + edges do cliente ativo e permite reutilizar.
 */
import { useState, useEffect, useCallback } from "react";
import {
  LayoutTemplate, Save, Play, Loader2, Trash2, Clock,
  Search, Tag, Package, Copy, Check, Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

export interface CanvasTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  metadata: Record<string, unknown>;
  is_public: boolean;
  used_count: number;
  created_at: string;
}

export interface NodeSnapshot {
  id: string;
  node_type: string;
  title: string;
  description: string | null;
  status: string;
  pos_x: number | null;
  pos_y: number | null;
  data: Record<string, unknown> | null;
  parent_node_id: string | null;
}

export interface EdgeSnapshot {
  id: string;
  source_node_id: string;
  target_node_id: string;
  edge_type: string | null;
  label: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  activeClientId: string | null;
  /** All current canvas nodes (already scoped to client in parent) */
  currentNodes: NodeSnapshot[];
  currentEdges: EdgeSnapshot[];
  /** Called with template to apply — parent creates the nodes */
  onApply: (template: CanvasTemplate, targetClientId: string) => Promise<void>;
}

// ─── Category options ────────────────────────────────────────

const CATEGORIES = [
  { value: "custom",         label: "Personalizado",      icon: Package },
  { value: "landing_page",   label: "Landing Page",       icon: Package },
  { value: "lancamento",     label: "Lançamento",          icon: Sparkles },
  { value: "consultoria",    label: "Consultoria",         icon: Package },
  { value: "ecommerce",      label: "E-commerce",          icon: Package },
  { value: "infoproduto",    label: "Infoproduto",         icon: Package },
  { value: "servico_local",  label: "Serviço local",       icon: Package },
  { value: "saas",           label: "SaaS",                icon: Package },
] as const;

// ─── Component ────────────────────────────────────────────────

export default function CanvasTemplatesDialog({
  open, onOpenChange, workspaceId, activeClientId,
  currentNodes, currentEdges, onApply,
}: Props) {
  const [mode, setMode] = useState<"list" | "save">("list");
  const [templates, setTemplates] = useState<CanvasTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Save form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCategory, setNewCategory] = useState<string>("custom");
  const [newPublic, setNewPublic] = useState(false);

  // Filter out client-folder parent nodes from snapshot
  const exportableNodes = currentNodes.filter(n => n.node_type !== "client" && n.parent_node_id === activeClientId);
  const exportableNodeIds = new Set(exportableNodes.map(n => n.id));
  const exportableEdges = currentEdges.filter(e => exportableNodeIds.has(e.source_node_id) && exportableNodeIds.has(e.target_node_id));

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from("canvas_templates")
      .select("*")
      .order("used_count", { ascending: false })
      .limit(50);
    if (error) {
      toast({ title: "Erro ao carregar templates", description: error.message, variant: "destructive" });
    } else {
      setTemplates((data as CanvasTemplate[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { if (open) load(); }, [open, load]);

  const saveTemplate = async () => {
    if (!newName.trim()) { toast({ title: "Nome obrigatório", variant: "destructive" }); return; }
    if (exportableNodes.length === 0) { toast({ title: "Nenhum node para exportar", variant: "destructive" }); return; }
    setSaving(true);

    // Normalize: remove DB ids from nodes, use ref keys for edges
    const refMap = new Map<string, string>();
    exportableNodes.forEach((n, i) => refMap.set(n.id, `node_${i}`));

    const normalizedNodes = exportableNodes.map((n, i) => ({
      ref: `node_${i}`,
      node_type: n.node_type,
      title: n.title,
      description: n.description,
      status: n.status,
      pos_x_rel: (n.pos_x ?? 0) - (exportableNodes[0].pos_x ?? 0),
      pos_y_rel: (n.pos_y ?? 0) - (exportableNodes[0].pos_y ?? 0),
      data: n.data,
    }));

    const normalizedEdges = exportableEdges.map(e => ({
      source_ref: refMap.get(e.source_node_id),
      target_ref: refMap.get(e.target_node_id),
      edge_type: e.edge_type,
      label: e.label,
    })).filter(e => e.source_ref && e.target_ref);

    const { error } = await supabase.from("canvas_templates").insert({
      name: newName.trim(),
      description: newDesc.trim() || null,
      category: newCategory,
      nodes: normalizedNodes,
      edges: normalizedEdges,
      is_public: newPublic,
      metadata: { source_workspace_id: workspaceId, node_count: exportableNodes.length, edge_count: exportableEdges.length },
    });

    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar template", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Template salvo", description: `${exportableNodes.length} nodes + ${exportableEdges.length} conexões` });
    setNewName(""); setNewDesc(""); setNewCategory("custom"); setNewPublic(false);
    setMode("list");
    await load();
  };

  const applyTemplate = async (template: CanvasTemplate) => {
    if (!activeClientId) { toast({ title: "Selecione um cliente primeiro", variant: "destructive" }); return; }
    if (!window.confirm(`Aplicar template "${template.name}"? Isso criará ${template.nodes.length} nodes no canvas do cliente atual.`)) return;
    setApplying(template.id);
    try {
      await onApply(template, activeClientId);
      // Increment used_count
      await supabase.from("canvas_templates")
        .update({ used_count: (template.used_count ?? 0) + 1 })
        .eq("id", template.id);
      toast({ title: "Template aplicado", description: `${template.nodes.length} nodes criados` });
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Erro ao aplicar template", description: err instanceof Error ? err.message : "Tente novamente", variant: "destructive" });
    } finally {
      setApplying(null);
    }
  };

  const deleteTemplate = async (template: CanvasTemplate) => {
    if (!window.confirm(`Excluir template "${template.name}"? Essa ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("canvas_templates").delete().eq("id", template.id);
    if (error) { toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Template removido" });
    setTemplates(prev => prev.filter(t => t.id !== template.id));
  };

  const filteredTemplates = templates.filter(t => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return t.name.toLowerCase().includes(q) || (t.description ?? "").toLowerCase().includes(q);
  });

  const byCategory = filteredTemplates.reduce<Record<string, CanvasTemplate[]>>((acc, t) => {
    const cat = t.category || "custom";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 border border-white/10 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden sm:rounded-2xl"
        style={{
          background: "rgba(9,17,10,0.94)",
          backdropFilter: "blur(32px) saturate(180%)",
          WebkitBackdropFilter: "blur(32px) saturate(180%)",
          boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)",
        }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b border-white/8 shrink-0 pr-12">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
              style={{ background: "rgba(0,255,136,0.12)", border: "1.5px solid rgba(0,255,136,0.35)" }}>
              <LayoutTemplate className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-primary/70 mb-1">
                Templates de canvas
              </p>
              <DialogTitle asChild>
                <h2 className="text-lg font-semibold text-white leading-tight">
                  {mode === "list" ? "Biblioteca de modelos" : "Salvar canvas como template"}
                </h2>
              </DialogTitle>
              <DialogDescription className="text-xs text-white/40 mt-1">
                {mode === "list"
                  ? "Reutilize estruturas prontas ou salve o canvas atual para usar em outros clientes"
                  : `${exportableNodes.length} nodes e ${exportableEdges.length} conexões serão salvos`}
              </DialogDescription>
            </div>
          </div>

          {/* Mode tabs */}
          <div className="flex items-center gap-1 mt-4 rounded-lg bg-white/5 border border-white/8 p-1 w-fit">
            <button type="button" onClick={() => setMode("list")}
              className={cn("text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
                mode === "list" ? "bg-primary/15 text-primary" : "text-white/40 hover:text-white/70")}>
              <Package className="h-3 w-3 inline mr-1.5" /> Aplicar template
            </button>
            <button type="button" onClick={() => setMode("save")}
              disabled={exportableNodes.length === 0}
              className={cn("text-xs font-medium px-3 py-1.5 rounded-md transition-colors",
                mode === "save" ? "bg-primary/15 text-primary" : "text-white/40 hover:text-white/70",
                exportableNodes.length === 0 && "opacity-30 cursor-not-allowed")}>
              <Save className="h-3 w-3 inline mr-1.5" /> Salvar atual
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-5">
            {mode === "save" ? (
              // ═══ SAVE FORM ═══
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-white/60 mb-1.5 block">Nome do template *</label>
                  <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ex: Esteira Lançamento Digital"
                    className="h-9 text-sm bg-white/5 border-white/10 text-white/80 focus-visible:ring-0 focus-visible:border-primary/40" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/60 mb-1.5 block">Descrição</label>
                  <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Quando usar este template, o que ele cobre..." rows={3}
                    className="text-sm bg-white/5 border-white/10 text-white/80 focus-visible:ring-0 focus-visible:border-primary/40 resize-none" />
                </div>

                <div>
                  <label className="text-xs font-semibold text-white/60 mb-1.5 block">Categoria</label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="h-9 text-sm bg-white/5 border-white/10 text-white/80 focus:ring-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value} className="text-xs">{c.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-white/8 bg-white/4 px-3 py-2.5 hover:bg-white/6 transition-colors">
                  <input type="checkbox" checked={newPublic} onChange={e => setNewPublic(e.target.checked)}
                    className="h-3.5 w-3.5 accent-primary" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white/80">Compartilhar com toda a equipe</p>
                    <p className="text-[11px] text-white/40">Outros workspaces poderão usar este template</p>
                  </div>
                </label>

                {/* Preview */}
                <div className="rounded-lg border border-white/8 bg-white/4 p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-primary/60 mb-2">Preview</p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="text-2xl font-bold text-white tabular-nums">{exportableNodes.length}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Nodes</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-2xl font-bold text-white tabular-nums">{exportableEdges.length}</p>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Conexões</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-2xl font-bold text-white tabular-nums">
                        {new Set(exportableNodes.map(n => n.node_type)).size}
                      </p>
                      <p className="text-[10px] text-white/40 uppercase tracking-wider">Tipos</p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              // ═══ LIST ═══
              <div className="space-y-4">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/30" />
                  <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar templates..."
                    className="h-9 pl-9 text-sm bg-white/5 border-white/10 text-white/80 focus-visible:ring-0 placeholder:text-white/25" />
                </div>

                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-white/25" />
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-white/40">
                    <LayoutTemplate className="h-8 w-8 mb-3 opacity-30" />
                    <p className="text-sm">
                      {search ? "Nenhum template encontrado" : "Nenhum template salvo ainda"}
                    </p>
                    {!search && exportableNodes.length > 0 && (
                      <Button size="sm" onClick={() => setMode("save")}
                        className="h-7 text-xs gap-1.5 mt-4 bg-primary/15 text-primary border border-primary/30 rounded-full px-3">
                        <Save className="h-3 w-3" /> Salvar canvas atual
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(byCategory).map(([cat, items]) => {
                      const catMeta = CATEGORIES.find(c => c.value === cat);
                      return (
                        <div key={cat}>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-2 flex items-center gap-1.5">
                            <Tag className="h-2.5 w-2.5" />
                            {catMeta?.label ?? cat}
                          </p>
                          <div className="space-y-1.5">
                            {items.map(template => (
                              <div key={template.id} className="rounded-lg border border-white/8 bg-white/4 hover:bg-white/6 transition-colors group">
                                <div className="flex items-center gap-3 p-3">
                                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/25 shrink-0">
                                    <Package className="h-4 w-4 text-primary" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <p className="text-sm font-semibold text-white truncate">{template.name}</p>
                                      {template.is_public && (
                                        <Badge className="text-[9px] px-1.5 py-0 h-4 bg-blue-400/15 text-blue-400 border-blue-400/25">Equipe</Badge>
                                      )}
                                      {template.used_count > 0 && (
                                        <span className="text-[10px] text-white/40 tabular-nums">
                                          {template.used_count}× usado
                                        </span>
                                      )}
                                    </div>
                                    {template.description && (
                                      <p className="text-xs text-white/45 line-clamp-1 mt-0.5">{template.description}</p>
                                    )}
                                    <div className="flex items-center gap-2 mt-1 text-[10px] text-white/30">
                                      <span>{template.nodes.length} nodes</span>
                                      <span>·</span>
                                      <span>{template.edges.length} conexões</span>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                    <Button onClick={() => applyTemplate(template)}
                                      disabled={!!applying || !activeClientId}
                                      size="sm" className="h-7 text-xs gap-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 rounded-full px-3">
                                      {applying === template.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                      Aplicar
                                    </Button>
                                    <button type="button" onClick={() => deleteTemplate(template)}
                                      className="h-7 w-7 flex items-center justify-center rounded-md text-white/30 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all">
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/8 flex items-center justify-between gap-2 shrink-0">
          {mode === "save" ? (
            <>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-white/40 hover:text-white" onClick={() => setMode("list")}>
                Cancelar
              </Button>
              <Button onClick={saveTemplate} disabled={saving || !newName.trim()} size="sm"
                className="h-7 text-xs gap-1.5 bg-primary text-[#09110A] font-semibold">
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                Salvar template
              </Button>
            </>
          ) : (
            <>
              <p className="text-[10px] text-white/30">{filteredTemplates.length} templates</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-white/40 hover:text-white" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
