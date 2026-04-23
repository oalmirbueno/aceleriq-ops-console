/**
 * AccessVaultDrawer
 *
 * Drawer especializado pro node tipo "acessos":
 *  - Lista todas as credenciais do cliente agrupadas por categoria
 *  - CRUD via edge function `credential-vault` (criptografia server-side)
 *  - Reveal mascarado: senha aparece como ••••••••, botão "revelar" só
 *    funciona pra admin, registra audit log e mostra quem revelou por último
 *  - Sem auto-preenchimento por IA (decisão de segurança travada)
 *
 * Também roda o checklist do método (do CHECKLIST_TEMPLATES.acessos) via
 * SpecializedNodeDrawer? Não — esse drawer é totalmente custom porque
 * credenciais não cabem no fluxo blueprint genérico.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  KeyRound, Plus, Eye, EyeOff, Pencil, Trash2, Copy, ExternalLink,
  Loader2, Lock, ShieldCheck, X, AlertCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { CREDENTIAL_CATEGORIES, getCategoryMeta, type CredentialCategory } from "./credentialCategories";
import type { CanvasNodeRecord } from "./CanvasNodeDrawer";

interface CredentialRow {
  id: string;
  workspace_id: string;
  client_id: string;
  node_id: string | null;
  category: CredentialCategory;
  service_name: string;
  label: string | null;
  login_url: string | null;
  username: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_revealed_at: string | null;
  last_revealed_by: string | null;
}

interface Props {
  node: CanvasNodeRecord & { parent_node_id?: string | null };
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName: string;
  onDelete?: (id: string) => Promise<void> | void;
}

export default function AccessVaultDrawer({
  node, open, onOpenChange, workspaceId, clientId, clientName, onDelete,
}: Props) {
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState<CredentialCategory | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("credential-vault", {
      body: { action: "list", clientId },
    });
    setLoading(false);
    if (error || data?.error) {
      toast({
        title: "Não foi possível carregar credenciais",
        description: error?.message ?? data?.error,
        variant: "destructive",
      });
      return;
    }
    setCredentials((data?.credentials ?? []) as CredentialRow[]);
  }, [clientId]);

  useEffect(() => { if (open) { fetchList(); setRevealedSecrets({}); } }, [open, fetchList]);

  const grouped = useMemo(() => {
    const map: Record<CredentialCategory, CredentialRow[]> = {
      platform: [], hosting_dns: [], cms: [], social_email: [], other: [],
    };
    credentials.forEach((c) => { map[c.category]?.push(c); });
    return map;
  }, [credentials]);

  const handleReveal = async (cred: CredentialRow) => {
    if (!isAdmin) {
      toast({
        title: "Apenas admins podem revelar senhas",
        description: "Peça pra um admin do workspace revelar essa credencial.",
        variant: "destructive",
      });
      return;
    }
    if (revealedSecrets[cred.id]) {
      // toggle hide
      setRevealedSecrets((prev) => {
        const { [cred.id]: _, ...rest } = prev;
        return rest;
      });
      return;
    }
    setRevealingId(cred.id);
    const { data, error } = await supabase.functions.invoke("credential-vault", {
      body: { action: "reveal", id: cred.id },
    });
    setRevealingId(null);
    if (error || data?.error) {
      toast({ title: "Falha ao revelar", description: error?.message ?? data?.error, variant: "destructive" });
      return;
    }
    if (data?.secret == null) {
      toast({ title: "Sem senha cadastrada", description: "Edite a credencial pra adicionar uma senha." });
      return;
    }
    setRevealedSecrets((prev) => ({ ...prev, [cred.id]: data.secret as string }));
    fetchList(); // refresh last_revealed_at
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Copiado" });
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  };

  const handleDelete = async (cred: CredentialRow) => {
    if (!confirm(`Apagar credencial "${cred.service_name}"? Não dá pra recuperar.`)) return;
    const { error, data } = await supabase.functions.invoke("credential-vault", {
      body: { action: "delete", id: cred.id },
    });
    if (error || data?.error) {
      toast({ title: "Falha ao apagar", description: error?.message ?? data?.error, variant: "destructive" });
      return;
    }
    toast({ title: "Credencial removida" });
    fetchList();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="p-0 gap-0 border border-white/10 max-w-3xl w-full max-h-[88vh] flex flex-col overflow-hidden sm:rounded-2xl"
          style={{
            background: "rgba(9,17,10,0.92)",
            backdropFilter: "blur(32px) saturate(200%)",
            WebkitBackdropFilter: "blur(32px) saturate(200%)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.06), 0 32px 72px rgba(0,0,0,0.75)",
          }}
        >
          <DialogTitle className="sr-only">Cofre de acessos</DialogTitle>
          {/* ─── Header (pr-12 to leave room for built-in X) ─── */}
          <div className="px-5 pt-5 pb-3 border-b border-white/8 space-y-3 pr-12">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-lg border-2 border-border bg-muted/10 flex items-center justify-center shrink-0">
                  <KeyRound className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold truncate">{node.title}</h2>
                    <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">
                      A · Entrada
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                    Cofre criptografado de credenciais de <span className="text-foreground/80">{clientName}</span>.
                    Senhas mascaradas — só admins podem revelar.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {onDelete && (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground"
                    onClick={() => { onDelete(node.id); onOpenChange(false); }}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>Criptografia AES (pgp_sym) · master key fora do banco</span>
              {!isAdmin && (
                <Badge variant="outline" className="ml-auto text-[9px] border-border text-muted-foreground">
                  Você não é admin — não pode revelar
                </Badge>
              )}
              {isAdmin && (
                <Badge variant="outline" className="ml-auto text-[9px] border-border text-muted-foreground flex items-center gap-1">
                  <ShieldCheck className="h-2.5 w-2.5" /> Admin
                </Badge>
              )}
            </div>
          </div>

          {/* ─── Body ─── */}
          <ScrollArea className="flex-1">
            <div className="px-5 py-4 space-y-5">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                CREDENTIAL_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const list = grouped[cat.id] ?? [];
                  return (
                    <section key={cat.id} className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`h-7 w-7 rounded-md border ${cat.color} ${cat.bg} flex items-center justify-center shrink-0`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground">
                              {cat.label}
                            </h3>
                            <p className="text-[10px] text-muted-foreground truncate">{cat.description}</p>
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 shrink-0"
                          onClick={() => setCreatingCategory(cat.id)}>
                          <Plus className="h-3 w-3" /> Adicionar
                        </Button>
                      </div>

                      {list.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic px-1 py-2 border border-dashed border-border rounded-md text-center">
                          Nenhum acesso cadastrado nesta categoria.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {list.map((cred) => {
                            const revealed = revealedSecrets[cred.id];
                            const isRevealing = revealingId === cred.id;
                            return (
                              <li key={cred.id} className="rounded-md border border-border bg-card/40 p-2.5 space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-xs font-medium text-foreground truncate">{cred.service_name}</span>
                                      {cred.label && (
                                        <span className="text-[10px] text-muted-foreground truncate">· {cred.label}</span>
                                      )}
                                    </div>
                                    {cred.username && (
                                      <div className="flex items-center gap-1 mt-0.5">
                                        <span className="text-[10px] text-muted-foreground font-mono truncate">{cred.username}</span>
                                        <Button size="icon" variant="ghost" className="h-4 w-4 shrink-0"
                                          onClick={() => handleCopy(cred.username!)}>
                                          <Copy className="h-2.5 w-2.5" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {cred.login_url && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button size="icon" variant="ghost" className="h-6 w-6" asChild>
                                            <a href={cred.login_url} target="_blank" rel="noopener noreferrer">
                                              <ExternalLink className="h-3 w-3" />
                                            </a>
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="left">Abrir painel</TooltipContent>
                                      </Tooltip>
                                    )}
                                    <Button size="icon" variant="ghost" className="h-6 w-6"
                                      onClick={() => setEditingId(cred.id)}>
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground"
                                      onClick={() => handleDelete(cred)}>
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>

                                {/* Senha mascarada / revelada */}
                                <div className="flex items-center gap-1.5 bg-muted/30 rounded px-2 py-1.5">
                                  <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
                                  <span className="text-xs font-mono flex-1 truncate select-all">
                                    {revealed ?? "••••••••••••"}
                                  </span>
                                  {revealed && (
                                    <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0"
                                      onClick={() => handleCopy(revealed)}>
                                      <Copy className="h-2.5 w-2.5" />
                                    </Button>
                                  )}
                                  <Button
                                    size="icon" variant="ghost" className="h-5 w-5 shrink-0"
                                    onClick={() => handleReveal(cred)}
                                    disabled={isRevealing || !isAdmin}
                                    title={isAdmin ? (revealed ? "Esconder" : "Revelar") : "Apenas admin"}
                                  >
                                    {isRevealing ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : revealed ? (
                                      <EyeOff className="h-3 w-3" />
                                    ) : (
                                      <Eye className="h-3 w-3" />
                                    )}
                                  </Button>
                                </div>

                                {cred.notes && (
                                  <p className="text-[10px] text-muted-foreground italic">{cred.notes}</p>
                                )}
                                {cred.last_revealed_at && (
                                  <p className="text-[9px] text-muted-foreground/70 flex items-center gap-1">
                                    <AlertCircle className="h-2.5 w-2.5" />
                                    Última revelação: {new Date(cred.last_revealed_at).toLocaleString("pt-BR")}
                                  </p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Create / edit dialog */}
      <CredentialFormDialog
        open={creatingCategory !== null || editingId !== null}
        onOpenChange={(v) => { if (!v) { setCreatingCategory(null); setEditingId(null); } }}
        mode={editingId ? "edit" : "create"}
        initialCategory={creatingCategory ?? undefined}
        existing={editingId ? credentials.find((c) => c.id === editingId) ?? null : null}
        workspaceId={workspaceId}
        clientId={clientId}
        nodeId={node.id}
        onSaved={() => { setCreatingCategory(null); setEditingId(null); fetchList(); }}
      />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// Form dialog (create/edit)
// ═══════════════════════════════════════════════════════════════════════

interface FormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initialCategory?: CredentialCategory;
  existing: CredentialRow | null;
  workspaceId: string;
  clientId: string;
  nodeId: string;
  onSaved: () => void;
}

function CredentialFormDialog({
  open, onOpenChange, mode, initialCategory, existing, workspaceId, clientId, nodeId, onSaved,
}: FormProps) {
  const [category, setCategory] = useState<CredentialCategory>("platform");
  const [serviceName, setServiceName] = useState("");
  const [label, setLabel] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [username, setUsername] = useState("");
  const [secret, setSecret] = useState("");
  const [notes, setNotes] = useState("");
  const [keepExistingSecret, setKeepExistingSecret] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setCategory(existing.category);
      setServiceName(existing.service_name);
      setLabel(existing.label ?? "");
      setLoginUrl(existing.login_url ?? "");
      setUsername(existing.username ?? "");
      setSecret("");
      setKeepExistingSecret(true);
      setNotes(existing.notes ?? "");
    } else {
      setCategory(initialCategory ?? "platform");
      setServiceName("");
      setLabel("");
      setLoginUrl("");
      setUsername("");
      setSecret("");
      setKeepExistingSecret(false);
      setNotes("");
    }
  }, [open, existing, initialCategory]);

  const catMeta = getCategoryMeta(category);

  const handleSubmit = async () => {
    if (!serviceName.trim()) {
      toast({ title: "Nome do serviço é obrigatório", variant: "destructive" });
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      action: mode === "create" ? "create" : "update",
      ...(mode === "create"
        ? { workspaceId, clientId, nodeId }
        : { id: existing!.id }),
      category,
      service_name: serviceName.trim(),
      label: label.trim() || null,
      login_url: loginUrl.trim() || null,
      username: username.trim() || null,
      notes: notes.trim() || null,
    };
    // só envia secret se: criando (sempre), ou editando e usuário desmarcou "manter"
    if (mode === "create") {
      body.secret = secret || null;
    } else if (!keepExistingSecret) {
      body.secret = secret || null;
    }
    const { error, data } = await supabase.functions.invoke("credential-vault", { body });
    setSaving(false);
    if (error || data?.error) {
      toast({ title: "Falha ao salvar", description: error?.message ?? data?.error, variant: "destructive" });
      return;
    }
    toast({ title: mode === "create" ? "Credencial cadastrada" : "Credencial atualizada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {mode === "create" ? "Nova credencial" : "Editar credencial"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            A senha é criptografada antes de ir pro banco. Só admins conseguem revelar depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as CredentialCategory)}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {CREDENTIAL_CATEGORIES.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Serviço *</Label>
            <Input
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              placeholder="Ex: Meta Business Manager"
              list="credential-service-presets"
              className="h-9 text-sm"
            />
            {catMeta.presets.length > 0 && (
              <datalist id="credential-service-presets">
                {catMeta.presets.map((p) => <option key={p} value={p} />)}
              </datalist>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Identificador interno (opcional)</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Conta principal Brasil"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">URL do painel</Label>
            <Input
              value={loginUrl}
              onChange={(e) => setLoginUrl(e.target.value)}
              placeholder="https://..."
              type="url"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Usuário / e-mail</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="login@cliente.com"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Senha</Label>
              {mode === "edit" && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
                  onClick={() => setKeepExistingSecret((v) => !v)}
                >
                  {keepExistingSecret ? "Trocar senha" : "Manter senha atual"}
                </button>
              )}
            </div>
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={keepExistingSecret && mode === "edit" ? "•••••••• (mantida)" : "Cole a senha aqui"}
              disabled={mode === "edit" && keepExistingSecret}
              className="h-9 text-sm font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              Criptografada server-side com pgp_sym. Não fica em log nem em texto plano no banco.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Observações</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ex: 2FA via SMS no celular X, papel: admin, conta vinculada Y..."
              rows={2}
              className="text-sm resize-y"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !serviceName.trim()}>
            {saving ? "Salvando..." : mode === "create" ? "Cadastrar" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
