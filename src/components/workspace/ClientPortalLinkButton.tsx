/**
 * ClientPortalLinkButton — vincula um CLIENTE do Ops a um profile/projeto do aceleriq.online.
 *
 * Diferente do PortalLinkButton antigo (que era por workspace):
 *  - Vincula a nível CLIENTE (tabela clients.portal_client_id)
 *  - Uma vez vinculado, TODOS os workspaces daquele cliente herdam o vínculo
 *  - Mostra clientes/profiles disponíveis no portal (via portal-proxy)
 *
 * O portal deve ter a edge function `ops-clients-list` que retorna
 * os profiles de clientes. Se não tiver, cai num fallback de input manual.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Link2, Loader2, CheckCircle2, ExternalLink, Search, Unlink,
  AlertCircle, Building2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PortalClient {
  id: string;              // profile.id no portal
  full_name: string;
  company_name: string | null;
  email: string | null;
  active_projects: number;
}

interface Props {
  clientId: string;
  clientName: string;
  /** Valor atual salvo em clients.portal_client_id */
  portalClientId?: string | null;
  onLinked?: () => void;
  /** Variant pequeno pra usar em tabelas */
  compact?: boolean;
}

export default function ClientPortalLinkButton({
  clientId, clientName, portalClientId, onLinked, compact,
}: Props) {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<PortalClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PortalClient | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualId, setManualId] = useState("");
  const [showManual, setShowManual] = useState(false);

  const isLinked = !!portalClientId;

  const fetchPortalClients = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("portal-proxy", {
        body: { path: "ops-clients-list" },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        setErrorMsg(data.hint ?? data.error);
        setShowManual(true);
        return;
      }
      setClients((data?.clients ?? []) as PortalClient[]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Erro desconhecido");
      setShowManual(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && clients.length === 0 && !errorMsg) fetchPortalClients();
  }, [open, clients.length, errorMsg, fetchPortalClients]);

  const linkClient = useCallback(async (portalId: string, displayName?: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clients")
        .update({ portal_client_id: portalId, updated_at: new Date().toISOString() })
        .eq("id", clientId);
      if (error) throw error;

      toast({
        title: "Cliente vinculado ao portal",
        description: displayName ?? `ID: ${portalId.slice(0, 12)}…`,
      });
      setOpen(false);
      onLinked?.();
    } catch (err) {
      toast({
        title: "Erro ao vincular",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [clientId, onLinked]);

  const handleSelect = () => {
    if (!selected) return;
    linkClient(selected.id, selected.full_name);
  };

  const handleManual = () => {
    const id = manualId.trim();
    if (!id) return;
    linkClient(id);
  };

  const handleUnlink = useCallback(async () => {
    if (!window.confirm("Desvincular este cliente do portal?")) return;
    await supabase.from("clients").update({ portal_client_id: null }).eq("id", clientId);
    toast({ title: "Desvinculado" });
    onLinked?.();
  }, [clientId, onLinked]);

  const filtered = clients.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.full_name.toLowerCase().includes(q) ||
      (c.company_name ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q)
    );
  });

  // ═══ Linked state ═══
  if (isLinked) {
    return (
      <div className={cn("flex items-center gap-2", compact && "text-xs")}>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400">
          <CheckCircle2 className={cn("shrink-0", compact ? "h-3 w-3" : "h-3.5 w-3.5")} />
          {compact ? "Portal" : "Vinculado ao portal"}
        </span>
        <a href="https://aceleriq.online" target="_blank" rel="noreferrer"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ExternalLink className="h-3 w-3" />
        </a>
        {!compact && (
          <button type="button" onClick={handleUnlink}
            className="text-xs text-muted-foreground/40 hover:text-destructive transition-colors"
            title="Desvincular">
            <Unlink className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  // ═══ Unlinked — button that opens picker ═══
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
        className={cn(
          "text-xs gap-1.5 border-dashed hover:border-primary/50 hover:text-primary",
          compact ? "h-6 px-2" : "h-7"
        )}
      >
        <Link2 className="h-3 w-3" />
        {compact ? "Vincular" : "Vincular ao portal"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg p-0 gap-0">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Vincular {clientName} ao portal
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione o perfil correspondente no aceleriq.online. Todos os workspaces deste cliente usarão este vínculo.
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          {!showManual && (
            <div className="px-5 py-3 border-b border-border">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar cliente ou empresa..."
                  className="pl-8 h-8 text-sm"
                  autoFocus
                />
              </div>
            </div>
          )}

          {/* Error state */}
          {errorMsg && (
            <div className="px-5 py-3 border-b border-border bg-amber-400/5">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-amber-400 mb-0.5">Não consegui buscar do portal automaticamente</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{errorMsg}</p>
                </div>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="max-h-[360px] overflow-y-auto px-2 py-2">
            {!showManual && loading && (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Buscando no portal...
              </div>
            )}

            {!showManual && !loading && filtered.length === 0 && !errorMsg && (
              <div className="py-10 text-center text-sm text-muted-foreground">Nenhum cliente no portal</div>
            )}

            {!showManual && !loading && filtered.length > 0 && (
              <div className="space-y-1">
                {filtered.map((c) => {
                  const isSel = selected?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(isSel ? null : c)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                        isSel ? "bg-primary/10 border border-primary/40"
                              : "hover:bg-secondary/60 border border-transparent"
                      )}
                    >
                      <div className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-md shrink-0 text-xs font-bold",
                        isSel ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      )}>
                        {c.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.company_name ?? c.email ?? "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {c.active_projects > 0 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {c.active_projects} projeto{c.active_projects > 1 ? "s" : ""}
                          </Badge>
                        )}
                        {isSel && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Manual entry fallback */}
            {showManual && (
              <div className="px-3 py-4 space-y-3">
                <div>
                  <p className="text-xs font-semibold text-foreground mb-1">Inserir ID manualmente</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                    Vá em <span className="text-foreground">aceleriq.online → Supabase → Table Editor → profiles</span>,
                    localize o cliente, copie o valor da coluna <code className="bg-muted px-1 rounded">id</code> e cole abaixo.
                  </p>
                </div>
                <Input
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value)}
                  placeholder="Ex: 8f3a0e4b-..."
                  className="text-sm font-mono"
                  autoFocus
                />
              </div>
            )}
          </div>

          {/* Toggle manual mode */}
          {!showManual && !loading && (
            <div className="px-5 py-2 border-t border-border">
              <button type="button" onClick={() => setShowManual(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Preferir inserir ID manualmente
              </button>
            </div>
          )}
          {showManual && (
            <div className="px-5 py-2 border-t border-border">
              <button type="button" onClick={() => { setShowManual(false); setErrorMsg(null); fetchPortalClients(); }}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                Tentar buscar do portal novamente
              </button>
            </div>
          )}

          {/* Footer */}
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {showManual
                ? (manualId ? "Pronto para vincular" : "Cole o ID acima")
                : selected
                  ? `Selecionado: ${selected.full_name}`
                  : `${clients.length} clientes no portal`}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)} variant="outline" size="sm" className="h-8 text-xs">
                Cancelar
              </Button>
              <Button
                onClick={showManual ? handleManual : handleSelect}
                disabled={saving || (showManual ? !manualId.trim() : !selected)}
                size="sm"
                className="h-8 text-xs gap-1.5"
              >
                {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2 className="h-3 w-3" />}
                Vincular
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
