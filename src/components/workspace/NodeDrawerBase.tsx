/**
 * NodeDrawerBase — shell compartilhado por todos os drawers específicos.
 * Fornece Dialog glassmorphism, header com identidade visual do node,
 * scroll nativo, footer de ações e estrutura consistente.
 */
import { useState, useCallback } from "react";
import { Loader2, Save, Trash2, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";
import { syncNodeCompletedWhenDone } from "./syncToPortalEvents";
import NodeUniversalSections from "./NodeUniversalSections";

// ─── Types ───────────────────────────────────────────────────

export interface NodeDrawerProps {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  onDelete?: (id: string) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
  onOpenChat?: (nodeId: string) => void;
}

export interface NodeDrawerConfig {
  title: string;
  subtitle: string;
  accent: string;
  icon: React.ElementType;
  statusOptions?: Array<[string, string]>;
}

// ─── Status options ───────────────────────────────────────────

export const DEFAULT_STATUS_OPTIONS: Array<[string, string]> = [
  ["draft",   "Rascunho"],
  ["active",  "Em produção"],
  ["blocked", "Bloqueado"],
  ["done",    "Concluído"],
];

// ─── useSaveNode hook ─────────────────────────────────────────

export function useSaveNode(node: CanvasNodeRecord, workspaceId: string, onUpdated?: () => Promise<void> | void) {
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState(node.title ?? "");
  const [status, setStatus] = useState(node.status ?? "draft");

  const save = useCallback(async (extraData?: Record<string, unknown>) => {
    setSaving(true);
    const { error } = await supabase.from("canvas_nodes").update({
      title: title.trim() || node.title,
      status,
      ...(extraData ? { data: { ...(node.data as Record<string, unknown> ?? {}), ...extraData } } : {}),
      updated_at: new Date().toISOString(),
    }).eq("id", node.id);
    setSaving(false);
    if (error) { toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" }); return false; }
    syncNodeCompletedWhenDone({
      previousStatus: node.status,
      nextStatus: status,
      workspaceId,
      clientId: node.client_id,
      nodeId: node.id,
      nodeTitle: title.trim() || node.title,
    });
    toast({ title: "Salvo" });
    await onUpdated?.();
    return true;
  }, [title, status, node, workspaceId, onUpdated]);

  return { title, setTitle, status, setStatus, saving, save };
}

// ─── Section component ────────────────────────────────────────

export function NodeSection({ title, accent, children, defaultOpen = true }: {
  title: string; accent: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full text-left group">
        <div className="h-px flex-1" style={{ background: `${accent}25` }} />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] shrink-0 flex items-center gap-1"
          style={{ color: `${accent}90` }}>
          {title}
          <ChevronDown className={cn("h-2.5 w-2.5 transition-transform", !open && "-rotate-90")} />
        </span>
        <div className="h-px flex-1" style={{ background: `${accent}25` }} />
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

// ─── Field component ──────────────────────────────────────────

export function NodeField({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-semibold text-white/60">{label}</label>
        {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────

export function NodeAction({ label, icon: Icon, onClick, accent, disabled }: {
  label: string; icon: React.ElementType; onClick: () => void;
  accent?: string; disabled?: boolean;
}) {
  return (
    <Button onClick={onClick} disabled={disabled} size="sm"
      className="h-7 text-xs gap-1.5 rounded-full px-3"
      style={accent
        ? { background: `${accent}15`, color: accent, border: `1px solid ${accent}35` }
        : undefined
      }
      variant={accent ? undefined : "outline"}
    >
      <Icon className="h-3 w-3" />{label}
    </Button>
  );
}

// ─── NodeDrawerShell ──────────────────────────────────────────

export function NodeDrawerShell({ node, open, onOpenChange, workspaceId, config, onDelete, onUpdated, onOpenChat, statusOptions = DEFAULT_STATUS_OPTIONS, children, actions, onSave, extraData, clientId, clientName, kind, onPrefillResult }: {
  node: CanvasNodeRecord;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  config: NodeDrawerConfig;
  onDelete?: (id: string) => Promise<void> | void;
  onUpdated?: () => Promise<void> | void;
  onOpenChat?: (nodeId: string) => void;
  statusOptions?: Array<[string, string]>;
  children: React.ReactNode;
  actions?: React.ReactNode;
  onSave?: () => Promise<boolean>;
  extraData?: Record<string, unknown>;
  /** Identificadores universais — quando presentes, ativam o NodeUniversalSections (IA/Acessos/Prompts/Notas/Histórico). */
  clientId?: string;
  clientName?: string;
  /** Kind do node usado pra prefill-node (ex: "landing_page", "crm"). Sem isso, "Preencher com IA" fica oculto. */
  kind?: string;
  /** Callback chamado quando "Preencher com IA" universal traz dados — drawer pai mescla nos próprios fields. */
  onPrefillResult?: (sections: Record<string, unknown>) => void;
}) {
  const { title, setTitle, status, setStatus, saving, save } = useSaveNode(node, workspaceId, onUpdated);
  const Icon = config.icon;
  const accent = config.accent;

  const handleSave = async () => {
    if (onSave) { await onSave(); }
    else { await save(extraData); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden sm:rounded-2xl border"
        style={{
          background: "rgba(9,17,10,0.94)",
          backdropFilter: "blur(36px) saturate(180%)",
          WebkitBackdropFilter: "blur(36px) saturate(180%)",
          borderColor: `${accent}22`,
          boxShadow: `0 0 0 1px ${accent}10, 0 32px 80px rgba(0,0,0,0.8)`,
        }}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        {/* Header */}
        <div className="px-5 pt-5 pb-4 border-b shrink-0 pr-12"
          style={{ borderColor: `${accent}18`, background: `linear-gradient(135deg, ${accent}08, transparent 60%)` }}>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl shrink-0"
              style={{ background: `${accent}15`, border: `1.5px solid ${accent}40` }}>
              <Icon className="h-5 w-5" style={{ color: accent }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: `${accent}80` }}>
                {config.subtitle}
              </p>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="h-8 text-base font-semibold bg-transparent border-0 px-0 focus-visible:ring-0 text-white placeholder:text-white/30"
                placeholder={config.title}
              />
            </div>
          </div>

          {/* Quick actions + status */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            {actions}
            <div className="flex-1" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-7 w-32 text-[11px] bg-white/5 border-white/10 text-white/70 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(([v, l]) => (
                  <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Body — native scroll, garantido */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          <div className="px-5 py-5 space-y-6">
            {children}
            {/* ─── Seções universais (IA prefill, Acessos, Prompts, Notas operacionais, Histórico) ─── */}
            {clientId && kind && (
              <NodeUniversalSections
                node={node as CanvasNodeRecord & { parent_node_id?: string | null }}
                workspaceId={workspaceId}
                clientId={clientId}
                clientName={clientName}
                kind={kind}
                accent={accent}
                onPrefillResult={onPrefillResult}
                onUpdated={onUpdated}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t flex items-center gap-2 shrink-0"
          style={{ borderColor: `${accent}15`, background: `${accent}06` }}>
          {onDelete && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-red-400 hover:text-red-400 hover:bg-red-400/10 gap-1.5"
              onClick={async () => {
                if (!window.confirm(`Excluir "${title}"?`)) return;
                await onDelete(node.id);
                onOpenChange(false);
              }}>
              <Trash2 className="h-3 w-3" /> Excluir
            </Button>
          )}
          {onOpenChat && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-white/40 hover:text-white gap-1.5"
              onClick={() => onOpenChat(node.id)}>
              Chat IA
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" className="h-7 text-xs text-white/30 hover:text-white"
            onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button size="sm" disabled={saving} className="h-7 text-xs gap-1.5 font-semibold"
            style={{ background: accent, color: "#09110A" }}
            onClick={handleSave}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
