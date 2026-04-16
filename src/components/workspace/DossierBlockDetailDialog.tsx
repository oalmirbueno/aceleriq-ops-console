import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Plus, Save, Lightbulb, FileText, Pencil, X, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getContextLabel, CONTEXT_TYPES, type ContextType } from "./contextTypes";
import type { ScopeClassification } from "./aceleraConstants";
import ScopeBadge from "./ScopeBadge";

interface Signal {
  key: string;
  label: string;
  summary: string;
}

interface ContextEntry {
  id: string;
  context_type: string;
  title: string;
  content: string;
  is_key_decision: boolean;
  metadata: Record<string, unknown> | null;
  tags: string[];
}

interface BlockDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  contextTypes: readonly string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  block: BlockDef;
  signals: Signal[];
  contexts: ContextEntry[];
  workspaceId: string;
  clientId: string;
  onDataChanged: () => void;
}

// Recommendations per block type
const BLOCK_RECOMMENDATIONS: Record<string, string[]> = {
  identity: [
    "Definir proposta de valor clara e diferenciada",
    "Criar brand guidelines (cores, fontes, tom de voz)",
    "Documentar história da empresa e marcos principais",
    "Validar posicionamento com clientes atuais",
  ],
  offer: [
    "Mapear todos os produtos/serviços com margens",
    "Definir ICP e persona documentados",
    "Criar tabela de preços e política comercial",
    "Estruturar upsell e cross-sell por produto",
  ],
  commercial: [
    "Implementar CRM com funil de vendas definido",
    "Criar scripts e playbooks de vendas",
    "Definir métricas de conversão por etapa do funil",
    "Automatizar follow-ups e nutrição de leads",
  ],
  operational: [
    "Documentar SOPs para cada etapa de entrega",
    "Criar onboarding estruturado para novos clientes",
    "Definir SLAs internos e para o cliente",
    "Implementar controle de qualidade nos entregáveis",
  ],
  digital: [
    "Auditar presença digital em todos os canais",
    "Implementar tracking e analytics unificados",
    "Otimizar site para conversão (CRO)",
    "Estruturar calendário editorial de conteúdo",
  ],
  access: [
    "Centralizar credenciais em gerenciador de senhas",
    "Documentar todos os acessos e responsáveis",
    "Verificar domínios e hospedagem sob controle",
    "Criar processo de onboarding/offboarding de acessos",
  ],
  diagnostic: [
    "Priorizar gargalos por impacto financeiro",
    "Criar plano de ação para cada gargalo identificado",
    "Medir tempo perdido em processos manuais",
    "Mapear retrabalho e suas causas raíz",
  ],
  decisions: [
    "Documentar decisões pendentes com deadline",
    "Criar framework de priorização (impacto x esforço)",
    "Alinhar prioridades com metas de faturamento",
    "Revisar decisões mensalmente com stakeholders",
  ],
};

export default function DossierBlockDetailDialog({
  open, onOpenChange, block, signals, contexts, workspaceId, clientId, onDataChanged,
}: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingContextId, setEditingContextId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  // New context form
  const [newType, setNewType] = useState<ContextType>("anotacao");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const Icon = block.icon;
  const recommendations = BLOCK_RECOMMENDATIONS[block.key] ?? [];

  const handleAddContext = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    setSaving(true);
    const { error } = await supabase.from("context_entries").insert({
      workspace_id: workspaceId,
      client_id: clientId,
      context_type: newType,
      title: newTitle.trim(),
      content: newContent.trim(),
      happened_at: new Date().toISOString(),
      metadata: { dossier_block: block.key },
    });
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao adicionar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Contexto adicionado", description: `Adicionado ao bloco "${block.label}"` });
    setNewTitle("");
    setNewContent("");
    setNewType("anotacao");
    setShowAddForm(false);
    onDataChanged();
  };

  const handleUpdateContext = async (id: string) => {
    if (!editContent.trim()) return;
    setSaving(true);
    const { error } = await supabase
      .from("context_entries")
      .update({ content: editContent.trim() })
      .eq("id", id);
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Contexto atualizado" });
    setEditingContextId(null);
    onDataChanged();
  };

  const startEditing = (ctx: ContextEntry) => {
    setEditingContextId(ctx.id);
    setEditContent(ctx.content);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-lg">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            {block.label}
          </DialogTitle>
          <DialogDescription className="text-sm">
            {block.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-2">
          {/* ─── Sinais Estruturados ─── */}
          {signals.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Sinais Estruturados ({signals.length})
              </h3>
              <div className="space-y-3">
                {signals.map((sig, idx) => (
                  <div key={idx} className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-emerald-400 text-sm">✦</span>
                      <span className="text-sm font-semibold text-foreground">{sig.label}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {sig.summary}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ─── Entradas de Contexto ─── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Entradas de Contexto ({contexts.length})
              </h3>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {showAddForm ? "Cancelar" : "Adicionar contexto"}
              </Button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="rounded-lg border border-primary/20 bg-card p-4 mb-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={newType} onValueChange={(v) => setNewType(v as ContextType)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CONTEXT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>{getContextLabel(t)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Título *</Label>
                    <Input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Título do contexto"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Conteúdo *</Label>
                  <Textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Descreva o contexto relevante para este bloco..."
                    className="min-h-[120px]"
                  />
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={handleAddContext}
                    disabled={saving || !newTitle.trim() || !newContent.trim()}
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {saving ? "Salvando..." : "Salvar"}
                  </Button>
                </div>
              </div>
            )}

            {/* Context list */}
            {contexts.length === 0 && !showAddForm ? (
              <p className="text-sm text-muted-foreground py-4">
                Nenhuma entrada de contexto neste bloco. Clique em "Adicionar contexto" para registrar informações.
              </p>
            ) : (
              <div className="space-y-3">
                {contexts.map((ctx) => {
                  const isEditing = editingContextId === ctx.id;
                  const scope = ctx.metadata?.scope_classification as ScopeClassification | undefined;

                  return (
                    <div
                      key={ctx.id}
                      className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/20"
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[11px] px-2 py-0.5">
                            {getContextLabel(ctx.context_type)}
                          </Badge>
                          <span className="text-sm font-medium text-foreground">{ctx.title}</span>
                          {ctx.is_key_decision && (
                            <Badge className="text-[11px] px-1.5 py-0.5 bg-amber-500/15 text-amber-400 border-amber-500/25">
                              Decisão-chave
                            </Badge>
                          )}
                          {scope && <ScopeBadge scope={scope} className="text-[11px] px-1.5 py-0.5" />}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 shrink-0"
                          onClick={() => isEditing ? setEditingContextId(null) : startEditing(ctx)}
                        >
                          {isEditing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </Button>
                      </div>

                      {isEditing ? (
                        <div className="space-y-2">
                          <Textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="min-h-[120px]"
                          />
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditingContextId(null)}>
                              Cancelar
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateContext(ctx.id)}
                              disabled={saving}
                              className="gap-1.5"
                            >
                              <Save className="h-3.5 w-3.5" />
                              {saving ? "Salvando..." : "Salvar"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                          {ctx.content}
                        </p>
                      )}

                      {ctx.tags?.length > 0 && (
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {ctx.tags.map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          {/* ─── Recomendações ─── */}
          <section>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-400" />
              Recomendações para este bloco
            </h3>
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div key={idx} className="flex items-start gap-3 py-2">
                  <span className="text-amber-400/70 mt-0.5 shrink-0 text-xs font-semibold">{idx + 1}.</span>
                  <p className="text-sm text-muted-foreground leading-relaxed">{rec}</p>
                </div>
              ))}
              {recommendations.length === 0 && (
                <p className="text-sm text-muted-foreground">Nenhuma recomendação disponível para este bloco.</p>
              )}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
