/**
 * ClientVaultPage — /ops/clients/:id/vault
 *
 * View dedicada das credenciais de UM cliente. Pra quando você só precisa
 * dos acessos sem entrar no canvas/workspace.
 *
 * Features:
 *  - Header com nome do cliente, empresa, breadcrumb e botão "Abrir workspace"
 *  - Busca textual (service_name, label, username, notes)
 *  - Filtro por categoria (chips multiseleção)
 *  - Toggle de visualização: agrupado por categoria | flat list
 *  - CRUD via mesma edge function `credential-vault` usada no AccessVaultDrawer
 *  - Reveal mascarado: só admin, registra audit log no banco
 *  - Botão "Adicionar acesso" cria credencial NOVA não-vinculada a node
 *    (workspace_id e node_id ficam null — o vault aceita isso)
 *
 * Não usa AccessVaultDrawer pra evitar acoplamento ao node — credenciais
 * podem existir sem node de origem (ex: acessos cadastrados antes de criar
 * node "acessos" no canvas).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  KeyRound, Search, Eye, EyeOff, Copy, ExternalLink, Pencil, Trash2,
  Loader2, Lock, ShieldCheck, Plus, ArrowLeft, LayoutGrid, List as ListIcon,
  AlertCircle,
} from "lucide-react";
import AppHeader from "@/components/AppHeader";
import LoadingState from "@/components/LoadingState";
import EmptyState from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import {
  CREDENTIAL_CATEGORIES, getCategoryMeta, type CredentialCategory,
} from "@/components/workspace/credentialCategories";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────

interface CredentialRow {
  id: string;
  workspace_id: string | null;
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

interface ClientLite {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
  workspaces: { id: string }[];
}

type ViewMode = "grouped" | "flat";

// ═════════════════════════════════════════════════════════════════════════
// Page principal
// ═════════════════════════════════════════════════════════════════════════

export default function ClientVaultPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const isAdmin = userRole === "admin";

  const [client, setClient] = useState<ClientLite | null>(null);
  const [credentials, setCredentials] = useState<CredentialRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [activeCategories, setActiveCategories] = useState<Set<CredentialCategory>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingCategory, setCreatingCategory] = useState<CredentialCategory | null>(null);
  const [revealedSecrets, setRevealedSecrets] = useState<Record<string, string>>({});
  const [revealingId, setRevealingId] = useState<string | null>(null);

  // ── Fetch cliente + credenciais
  const fetchAll = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [clientRes, credsRes] = await Promise.all([
      supabase
        .from("clients")
        .select("id, name, company_name, status, workspaces(id)")
        .eq("id", id)
        .maybeSingle(),
      supabase.functions.invoke("credential-vault", {
        body: { action: "list", clientId: id },
      }),
    ]);

    if (clientRes.error || !clientRes.data) {
      toast({
        title: "Cliente não encontrado",
        description: clientRes.error?.message ?? "Verifique o ID na URL",
        variant: "destructive",
      });
      setLoading(false);
      return;
    }
    setClient(clientRes.data as ClientLite);

    if (credsRes.error || credsRes.data?.error) {
      toast({
        title: "Falha ao carregar credenciais",
        description: credsRes.error?.message ?? credsRes.data?.error,
        variant: "destructive",
      });
    } else {
      setCredentials((credsRes.data?.credentials ?? []) as CredentialRow[]);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { fetchAll(); setRevealedSecrets({}); }, [fetchAll]);

  // ── Filtro: busca + categorias
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return credentials.filter((c) => {
      if (activeCategories.size > 0 && !activeCategories.has(c.category)) return false;
      if (!q) return true;
      const hay = [
        c.service_name, c.label ?? "", c.username ?? "", c.notes ?? "", c.login_url ?? "",
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [credentials, search, activeCategories]);

  const grouped = useMemo(() => {
    const map: Record<CredentialCategory, CredentialRow[]> = {
      platform: [], hosting_dns: [], cms: [], social_email: [], other: [],
    };
    filtered.forEach((c) => { map[c.category]?.push(c); });
    return map;
  }, [filtered]);

  // ── Contagem total por categoria (independente de filtro de busca, pra chips)
  const countByCategory = useMemo(() => {
    const map: Record<CredentialCategory, number> = {
      platform: 0, hosting_dns: 0, cms: 0, social_email: 0, other: 0,
    };
    credentials.forEach((c) => { map[c.category] = (map[c.category] ?? 0) + 1; });
    return map;
  }, [credentials]);

  // ── Toggle filtro categoria
  const toggleCategory = (cat: CredentialCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // ── Reveal / copy / delete (mesma lógica do AccessVaultDrawer)
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
    fetchAll();
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
    fetchAll();
  };

  if (loading) {
    return (
      <>
        <AppHeader title="Cofre de acessos" subtitle="Carregando..." />
        <div className="p-6"><LoadingState /></div>
      </>
    );
  }

  if (!client) {
    return (
      <>
        <AppHeader title="Cofre de acessos" />
        <div className="p-6">
          <EmptyState
            icon={KeyRound}
            title="Cliente não encontrado"
            description="O ID da URL não corresponde a nenhum cliente."
          />
        </div>
      </>
    );
  }

  const workspaceId = client.workspaces[0]?.id;
  const totalCreds = credentials.length;
  const filteredCount = filtered.length;

  return (
    <>
      <AppHeader
        title={`Cofre · ${client.name}`}
        subtitle={client.company_name ?? "Acessos criptografados do cliente"}
      />

      <div className="p-6 space-y-5 animate-fade-in">
        {/* ─── Breadcrumb + ações ─── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Link to="/ops/clients" className="hover:text-foreground inline-flex items-center gap-1">
              <ArrowLeft className="h-3 w-3" /> Clientes
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">{client.name}</span>
            <span>/</span>
            <span>Cofre</span>
          </div>
          <div className="flex items-center gap-2">
            {workspaceId && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate(`/ops/workspaces/${workspaceId}`)}
              >
                <ExternalLink className="h-3.5 w-3.5" /> Abrir workspace
              </Button>
            )}
            <Button size="sm" className="gap-1.5" onClick={() => setCreatingCategory("platform")}>
              <Plus className="h-3.5 w-3.5" /> Adicionar acesso
            </Button>
          </div>
        </div>

        {/* ─── Banner de segurança ─── */}
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="h-9 w-9 rounded-md border border-amber-500/40 bg-amber-500/10 flex items-center justify-center">
            <Lock className="h-4 w-4 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-foreground">Cofre criptografado · {totalCreds} acesso{totalCreds === 1 ? "" : "s"}</p>
            <p className="text-[10px] text-muted-foreground">
              AES (pgp_sym), master key fora do banco. Cada revelação é registrada no audit log.
            </p>
          </div>
          {isAdmin ? (
            <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400 gap-1">
              <ShieldCheck className="h-2.5 w-2.5" /> Admin · pode revelar
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-400">
              Você não é admin — não pode revelar
            </Badge>
          )}
        </div>

        {/* ─── Toolbar: busca + view mode ─── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por serviço, login, observação..."
              className="pl-9"
            />
          </div>

          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as ViewMode)}
            className="border border-border rounded-md"
          >
            <ToggleGroupItem value="grouped" size="sm" className="h-9 px-3 gap-1.5 text-xs">
              <LayoutGrid className="h-3.5 w-3.5" /> Agrupado
            </ToggleGroupItem>
            <ToggleGroupItem value="flat" size="sm" className="h-9 px-3 gap-1.5 text-xs">
              <ListIcon className="h-3.5 w-3.5" /> Lista
            </ToggleGroupItem>
          </ToggleGroup>

          {(search || activeCategories.size > 0) && (
            <span className="text-[11px] text-muted-foreground ml-auto">
              {filteredCount} de {totalCreds} acesso{totalCreds === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {/* ─── Chips de categoria ─── */}
        <div className="flex flex-wrap gap-2">
          {CREDENTIAL_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = activeCategories.has(cat.id);
            const count = countByCategory[cat.id] ?? 0;
            return (
              <button
                key={cat.id}
                onClick={() => toggleCategory(cat.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? `${cat.color} ${cat.bg} font-medium`
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/40",
                )}
              >
                <Icon className="h-3 w-3" />
                {cat.label}
                <span className={cn(
                  "ml-1 rounded-full px-1.5 py-0 text-[9px] font-mono",
                  active ? "bg-background/40" : "bg-muted/60",
                )}>
                  {count}
                </span>
              </button>
            );
          })}
          {activeCategories.size > 0 && (
            <button
              onClick={() => setActiveCategories(new Set())}
              className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>

        {/* ─── Conteúdo ─── */}
        {totalCreds === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Nenhum acesso cadastrado"
            description="Adicione a primeira credencial deste cliente."
            actionLabel="Adicionar acesso"
            onAction={() => setCreatingCategory("platform")}
          />
        ) : filteredCount === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center">
            <Search className="h-6 w-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhum acesso bate com os filtros atuais.
            </p>
          </div>
        ) : viewMode === "grouped" ? (
          <div className="space-y-5">
            {CREDENTIAL_CATEGORIES.map((cat) => {
              const list = grouped[cat.id] ?? [];
              if (list.length === 0) return null;
              return (
                <CategorySection
                  key={cat.id}
                  category={cat.id}
                  list={list}
                  isAdmin={isAdmin}
                  revealedSecrets={revealedSecrets}
                  revealingId={revealingId}
                  onReveal={handleReveal}
                  onCopy={handleCopy}
                  onEdit={(c) => setEditingId(c.id)}
                  onDelete={handleDelete}
                  onAdd={() => setCreatingCategory(cat.id)}
                />
              );
            })}
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((cred) => (
              <CredentialCard
                key={cred.id}
                cred={cred}
                isAdmin={isAdmin}
                revealed={revealedSecrets[cred.id]}
                isRevealing={revealingId === cred.id}
                onReveal={() => handleReveal(cred)}
                onCopy={handleCopy}
                onEdit={() => setEditingId(cred.id)}
                onDelete={() => handleDelete(cred)}
                showCategoryBadge
              />
            ))}
          </ul>
        )}
      </div>

      {/* ─── Form dialog ─── */}
      <CredentialFormDialog
        open={creatingCategory !== null || editingId !== null}
        onOpenChange={(v) => { if (!v) { setCreatingCategory(null); setEditingId(null); } }}
        mode={editingId ? "edit" : "create"}
        initialCategory={creatingCategory ?? undefined}
        existing={editingId ? credentials.find((c) => c.id === editingId) ?? null : null}
        clientId={client.id}
        workspaceId={workspaceId ?? null}
        onSaved={() => { setCreatingCategory(null); setEditingId(null); fetchAll(); }}
      />
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// CategorySection — bloco agrupado por categoria
// ═════════════════════════════════════════════════════════════════════════

interface CategorySectionProps {
  category: CredentialCategory;
  list: CredentialRow[];
  isAdmin: boolean;
  revealedSecrets: Record<string, string>;
  revealingId: string | null;
  onReveal: (c: CredentialRow) => void;
  onCopy: (text: string) => void;
  onEdit: (c: CredentialRow) => void;
  onDelete: (c: CredentialRow) => void;
  onAdd: () => void;
}

function CategorySection({
  category, list, isAdmin, revealedSecrets, revealingId,
  onReveal, onCopy, onEdit, onDelete, onAdd,
}: CategorySectionProps) {
  const meta = getCategoryMeta(category);
  const Icon = meta.icon;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("h-8 w-8 rounded-md border flex items-center justify-center shrink-0", meta.color, meta.bg)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground">
              {meta.label} <span className="text-muted-foreground font-normal normal-case">· {list.length}</span>
            </h3>
            <p className="text-[10px] text-muted-foreground truncate">{meta.description}</p>
          </div>
        </div>
        <Button size="sm" variant="ghost" className="h-7 text-[11px] gap-1 shrink-0" onClick={onAdd}>
          <Plus className="h-3 w-3" /> Adicionar
        </Button>
      </div>

      <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
        {list.map((cred) => (
          <CredentialCard
            key={cred.id}
            cred={cred}
            isAdmin={isAdmin}
            revealed={revealedSecrets[cred.id]}
            isRevealing={revealingId === cred.id}
            onReveal={() => onReveal(cred)}
            onCopy={onCopy}
            onEdit={() => onEdit(cred)}
            onDelete={() => onDelete(cred)}
          />
        ))}
      </ul>
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// CredentialCard — card individual
// ═════════════════════════════════════════════════════════════════════════

interface CredentialCardProps {
  cred: CredentialRow;
  isAdmin: boolean;
  revealed?: string;
  isRevealing: boolean;
  onReveal: () => void;
  onCopy: (text: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  showCategoryBadge?: boolean;
}

function CredentialCard({
  cred, isAdmin, revealed, isRevealing, onReveal, onCopy, onEdit, onDelete, showCategoryBadge,
}: CredentialCardProps) {
  const meta = getCategoryMeta(cred.category);

  return (
    <li className="rounded-md border border-border bg-card/40 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{cred.service_name}</span>
            {cred.label && (
              <span className="text-[10px] text-muted-foreground truncate">· {cred.label}</span>
            )}
            {showCategoryBadge && (
              <Badge variant="outline" className={cn("text-[9px] ml-auto", meta.color)}>
                {meta.label}
              </Badge>
            )}
          </div>
          {cred.username && (
            <div className="flex items-center gap-1 mt-1">
              <span className="text-[11px] text-muted-foreground font-mono truncate">{cred.username}</span>
              <Button size="icon" variant="ghost" className="h-4 w-4 shrink-0"
                onClick={() => onCopy(cred.username!)}>
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
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 bg-muted/30 rounded px-2 py-1.5">
        <Lock className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="text-xs font-mono flex-1 truncate select-all">
          {revealed ?? "••••••••••••"}
        </span>
        {revealed && (
          <Button size="icon" variant="ghost" className="h-5 w-5 shrink-0" onClick={() => onCopy(revealed)}>
            <Copy className="h-2.5 w-2.5" />
          </Button>
        )}
        <Button
          size="icon" variant="ghost" className="h-5 w-5 shrink-0"
          onClick={onReveal}
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
        <p className="text-[10px] text-muted-foreground italic line-clamp-2">{cred.notes}</p>
      )}
      {cred.last_revealed_at && (
        <p className="text-[9px] text-muted-foreground/70 flex items-center gap-1">
          <AlertCircle className="h-2.5 w-2.5" />
          Última revelação: {new Date(cred.last_revealed_at).toLocaleString("pt-BR")}
        </p>
      )}
    </li>
  );
}

// ═════════════════════════════════════════════════════════════════════════
// CredentialFormDialog — versão local que aceita workspaceId nullable
// ═════════════════════════════════════════════════════════════════════════

interface FormProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "create" | "edit";
  initialCategory?: CredentialCategory;
  existing: CredentialRow | null;
  clientId: string;
  workspaceId: string | null;
  onSaved: () => void;
}

function CredentialFormDialog({
  open, onOpenChange, mode, initialCategory, existing, clientId, workspaceId, onSaved,
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
        ? { workspaceId, clientId, nodeId: null }
        : { id: existing!.id }),
      category,
      service_name: serviceName.trim(),
      label: label.trim() || null,
      login_url: loginUrl.trim() || null,
      username: username.trim() || null,
      notes: notes.trim() || null,
    };
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
            <KeyRound className="h-4 w-4 text-amber-400" />
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
              placeholder="Ex: 2FA via SMS no celular X, papel: admin..."
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
