/**
 * NodeUniversalSections — bloco de seções universais injetado em TODOS
 * os drawers especializados via NodeDrawerShell.
 *
 * Inclui:
 *  1. Preencher com IA (chama prefill-node com kind e mescla os campos)
 *  2. Acessos do Cliente (abre AccessVaultDrawer empilhado)
 *  3. Prompts (campo livre + copiar)
 *  4. Notas operacionais (responsável, prazo, notas)
 *  5. Histórico (created_at / updated_at + últimas alterações conhecidas)
 *
 * Não duplica status (já está no header do shell).
 */
import { useState, useCallback, useEffect } from "react";
import { Sparkles, Loader2, KeyRound, Copy, History, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { NodeSection, NodeField } from "./NodeDrawerBase";
import AccessVaultDrawer from "./AccessVaultDrawer";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  workspaceId: string;
  clientId: string;
  clientName?: string;
  /** kind do node (ex: "landing_page", "crm", "conteudo") — passado pra prefill-node */
  kind: string;
  /** Cor de destaque do drawer pai */
  accent: string;
  /** Callback chamado quando o prefill traz dados — drawer pai mescla nos próprios fields */
  onPrefillResult?: (sections: Record<string, unknown>) => void;
  /** Callback após salvar campos universais — drawer pai recarrega */
  onUpdated?: () => Promise<void> | void;
}

type UniversalData = {
  prompts?: string;
  responsible?: string;
  deadline?: string;
  notes?: string;
  lastEditedAt?: string;
};

export default function NodeUniversalSections({
  node, workspaceId, clientId, clientName, kind, accent, onPrefillResult, onUpdated,
}: Props) {
  const raw = (node.data as Record<string, unknown> | null) ?? {};
  const initial: UniversalData = {
    prompts: typeof raw.prompts === "string" ? (raw.prompts as string) : "",
    responsible: typeof raw.responsible === "string" ? (raw.responsible as string) : "",
    deadline: typeof raw.deadline === "string" ? (raw.deadline as string) : "",
    notes: typeof raw.notes === "string" ? (raw.notes as string) : "",
    lastEditedAt: typeof raw.lastEditedAt === "string" ? (raw.lastEditedAt as string) : "",
  };

  const [vals, setVals] = useState<UniversalData>(initial);
  const [prefilling, setPrefilling] = useState(false);
  const [savingOps, setSavingOps] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);

  useEffect(() => {
    setVals({
      prompts: typeof raw.prompts === "string" ? (raw.prompts as string) : "",
      responsible: typeof raw.responsible === "string" ? (raw.responsible as string) : "",
      deadline: typeof raw.deadline === "string" ? (raw.deadline as string) : "",
      notes: typeof raw.notes === "string" ? (raw.notes as string) : "",
      lastEditedAt: typeof raw.lastEditedAt === "string" ? (raw.lastEditedAt as string) : "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  const patch = useCallback((p: Partial<UniversalData>) => setVals(v => ({ ...v, ...p })), []);

  const prefill = async () => {
    if (!clientId) {
      toast({ title: "Cliente não vinculado", description: "Vincule a um cliente para gerar com IA.", variant: "destructive" });
      return;
    }
    setPrefilling(true);
    try {
      const { data, error } = await supabase.functions.invoke("prefill-node", {
        body: { nodeId: node.id, workspaceId, clientId, kind },
      });
      if (error) throw error;
      if (data?.sections && onPrefillResult) {
        onPrefillResult(data.sections as Record<string, unknown>);
      }
      toast({ title: "Preenchido com IA" });
      await onUpdated?.();
    } catch (e) {
      toast({ title: "Falha no preenchimento", description: e instanceof Error ? e.message : "Tente novamente", variant: "destructive" });
    }
    setPrefilling(false);
  };

  const saveOps = async () => {
    setSavingOps(true);
    const now = new Date().toISOString();
    const currentData = (node.data as Record<string, unknown>) ?? {};
    const { error } = await supabase
      .from("canvas_nodes")
      .update({
        data: {
          ...currentData,
          prompts: vals.prompts ?? "",
          responsible: vals.responsible ?? "",
          deadline: vals.deadline ?? "",
          notes: vals.notes ?? "",
          lastEditedAt: now,
        },
        updated_at: now,
      })
      .eq("id", node.id);
    setSavingOps(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }
    patch({ lastEditedAt: now });
    toast({ title: "Operacional salvo" });
    await onUpdated?.();
  };

  const fmt = (iso?: string) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleString("pt-BR"); } catch { return iso; }
  };

  return (
    <>
      {/* ─── Preencher com IA + Acessos (linha de ações universais) ─── */}
      <div className="rounded-xl border p-3 flex flex-wrap items-center gap-2"
        style={{ background: `${accent}08`, borderColor: `${accent}25` }}>
        <div className="flex items-center gap-1.5 mr-auto">
          <Sparkles className="h-3.5 w-3.5" style={{ color: accent }} />
          <span className="text-[11px] font-semibold" style={{ color: `${accent}cc` }}>
            Ações universais
          </span>
        </div>
        <Button size="sm" disabled={prefilling} onClick={prefill}
          className="h-7 text-xs gap-1.5"
          style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}50` }}>
          {prefilling ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          {prefilling ? "Preenchendo..." : "Preencher com IA"}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setVaultOpen(true)}
          className="h-7 text-xs gap-1.5 bg-white/5 border-white/10 text-white/70">
          <KeyRound className="h-3 w-3" />
          Acessos do cliente
        </Button>
      </div>

      {/* ─── Prompts ─── */}
      <NodeSection title="Prompts" accent={accent} defaultOpen={false}>
        <NodeField label="Prompts vinculados ao node" hint="System prompt, prompt de IA, instruções avulsas">
          <Textarea
            value={vals.prompts ?? ""}
            onChange={(e) => patch({ prompts: e.target.value })}
            placeholder="Cole aqui prompts, instruções e contextos pra IA usar nesse entregável..."
            rows={4}
            className="text-sm bg-white/5 border-white/10 text-white/80 placeholder:text-white/25 resize-none focus-visible:ring-0 focus-visible:border-white/20"
          />
        </NodeField>
        {(vals.prompts ?? "").trim() && (
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1.5 text-white/60"
            onClick={() => { navigator.clipboard.writeText(vals.prompts ?? ""); toast({ title: "Prompt copiado" }); }}>
            <Copy className="h-3 w-3" /> Copiar prompt
          </Button>
        )}
      </NodeSection>

      {/* ─── Notas operacionais ─── */}
      <NodeSection title="Notas operacionais" accent={accent} defaultOpen={false}>
        <div className="grid grid-cols-2 gap-3">
          <NodeField label="Responsável">
            <Input value={vals.responsible ?? ""} onChange={(e) => patch({ responsible: e.target.value })}
              placeholder="Quem toca esse entregável"
              className="h-8 text-sm bg-white/5 border-white/10 text-white/80 placeholder:text-white/25 focus-visible:ring-0 focus-visible:border-white/20" />
          </NodeField>
          <NodeField label="Prazo">
            <Input value={vals.deadline ?? ""} onChange={(e) => patch({ deadline: e.target.value })}
              placeholder="dd/mm/aaaa"
              className="h-8 text-sm bg-white/5 border-white/10 text-white/80 placeholder:text-white/25 focus-visible:ring-0 focus-visible:border-white/20" />
          </NodeField>
        </div>
        <NodeField label="Notas internas">
          <Textarea value={vals.notes ?? ""} onChange={(e) => patch({ notes: e.target.value })}
            placeholder="Bloqueios, decisões, links extras, próximos passos..."
            rows={3}
            className="text-sm bg-white/5 border-white/10 text-white/80 placeholder:text-white/25 resize-none focus-visible:ring-0 focus-visible:border-white/20" />
        </NodeField>
        <Button size="sm" disabled={savingOps} onClick={saveOps}
          className="h-7 text-xs gap-1.5"
          style={{ background: `${accent}20`, color: accent, border: `1px solid ${accent}50` }}>
          {savingOps ? <Loader2 className="h-3 w-3 animate-spin" /> : <ClipboardList className="h-3 w-3" />}
          Salvar operacional
        </Button>
      </NodeSection>

      {/* ─── Histórico ─── */}
      <NodeSection title="Histórico" accent={accent} defaultOpen={false}>
        <div className="rounded-lg border border-white/8 bg-white/4 p-3 space-y-1.5 text-[11px] text-white/60">
          <div className="flex items-center gap-2">
            <History className="h-3 w-3 text-white/40" />
            <span className="text-white/40">Criado em:</span>
            <span className="text-white/80">{fmt(node.created_at)}</span>
          </div>
          <div className="flex items-center gap-2">
            <History className="h-3 w-3 text-white/40" />
            <span className="text-white/40">Última atualização:</span>
            <span className="text-white/80">{fmt(node.updated_at)}</span>
          </div>
          {vals.lastEditedAt && (
            <div className="flex items-center gap-2">
              <History className="h-3 w-3 text-white/40" />
              <span className="text-white/40">Última edição operacional:</span>
              <span className="text-white/80">{fmt(vals.lastEditedAt)}</span>
            </div>
          )}
        </div>
      </NodeSection>

      <AccessVaultDrawer
        node={node}
        open={vaultOpen}
        onOpenChange={setVaultOpen}
        workspaceId={workspaceId}
        clientId={clientId}
        clientName={clientName ?? "Cliente"}
      />
    </>
  );
}