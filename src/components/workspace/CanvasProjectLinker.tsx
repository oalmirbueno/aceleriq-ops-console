/**
 * CanvasProjectLinker — seletor de projeto do portal vinculado ao workspace.
 *
 * - Lê portal_client_id do cliente; busca projetos do portal filtrando por esse client.
 * - Se já houver portal_project_id no workspace, mostra "vinculado" + opção de trocar.
 * - Se houver apenas 1 projeto disponível e nenhum vínculo, auto-seleciona.
 * - Quando vincular ou trocar, dispara onLinked() para o canvas refazer sync.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { Link2, Loader2, CheckCircle2, ChevronDown, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface PortalProject {
  id: string;
  name: string;
  status: string;
  project_type: string;
  client_id: string;
  client_name: string;
  client_company: string | null;
}

interface ClientLookup {
  id: string;
  name: string | null;
  company_name: string | null;
  portal_client_id: string | null;
}

const normalizeText = (value?: string | null) =>
  (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function normalizePortalProject(raw: Record<string, any>): PortalProject | null {
  const id = String(raw.id ?? raw.project_id ?? raw.uuid ?? "").trim();
  if (!id) return null;
  const client = raw.client ?? raw.profile ?? raw.customer ?? {};
  const clientId = String(raw.client_id ?? raw.profile_id ?? raw.customer_id ?? raw.user_id ?? client.id ?? "").trim();
  const clientName = String(raw.client_name ?? raw.profile_name ?? raw.customer_name ?? client.full_name ?? client.name ?? raw.full_name ?? "Cliente do portal");
  const clientCompany = (raw.client_company ?? raw.company_name ?? client.company_name ?? client.company ?? null) as string | null;
  return {
    id,
    name: String(raw.name ?? raw.title ?? raw.project_name ?? "Projeto do portal"),
    status: String(raw.status ?? raw.state ?? "active"),
    project_type: String(raw.project_type ?? raw.type ?? raw.kind ?? "projeto"),
    client_id: clientId,
    client_name: clientName,
    client_company: clientCompany,
  };
}

function projectMatchesClient(project: PortalProject, client: ClientLookup | null) {
  if (!client) return true;
  if (client.portal_client_id && project.client_id && project.client_id === client.portal_client_id) return true;
  const clientTerms = [client.name, client.company_name].map(normalizeText).filter(Boolean);
  if (clientTerms.length === 0) return !client.portal_client_id;
  const portalTerms = [project.client_name, project.client_company].map(normalizeText).filter(Boolean).join(" ");
  return clientTerms.some((term) => portalTerms.includes(term) || term.includes(portalTerms));
}

async function callPortalProxy(path: string, reqBody?: unknown) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ path, body: reqBody ?? {} }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) throw new Error(data?.hint ?? data?.error ?? `Portal ${response.status}`);
  return data;
}

interface Props {
  workspaceId: string;
  clientId: string;
  onLinked?: (portalProjectId: string) => void;
}

export default function CanvasProjectLinker({ workspaceId, clientId, onLinked }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [portalProjectId, setPortalProjectId] = useState<string | null>(null);
  const [client, setClient] = useState<ClientLookup | null>(null);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [autoSelected, setAutoSelected] = useState(false);

  const linked = useMemo(
    () => projects.find((p) => p.id === portalProjectId) ?? null,
    [projects, portalProjectId],
  );

  const filtered = useMemo(() => {
    const matched = projects.filter((p) => projectMatchesClient(p, client));
    return matched.length > 0 ? matched : projects;
  }, [projects, client]);

  // Carrega vínculos atuais e lista de projetos do portal
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wsRes, clientRes] = await Promise.all([
        supabase.from("workspaces").select("portal_project_id").eq("id", workspaceId).maybeSingle(),
        supabase.from("clients").select("portal_client_id").eq("id", clientId).maybeSingle(),
      ]);
      const ppid = (wsRes.data?.portal_project_id as string | null) ?? null;
      const pcid = (clientRes.data?.portal_client_id as string | null) ?? null;
      setPortalProjectId(ppid);
      setPortalClientId(pcid);

      const { data, error: fnErr } = await supabase.functions.invoke("sync-to-portal", {
        body: { event: "list_portal_projects", workspaceId, clientId },
      });
      if (fnErr) throw fnErr;
      if ((data as any)?.ok === false) {
        throw new Error((data as any)?.error ?? "Falha ao listar projetos");
      }
      const list = ((data as any)?.projects ?? []) as PortalProject[];
      setProjects(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar projetos do portal");
    } finally {
      setLoading(false);
    }
  }, [workspaceId, clientId]);

  useEffect(() => { load(); }, [load]);

  const link = useCallback(async (project: PortalProject) => {
    setSaving(true);
    try {
      const { error: wsErr } = await supabase
        .from("workspaces")
        .update({ portal_project_id: project.id, updated_at: new Date().toISOString() })
        .eq("id", workspaceId);
      if (wsErr) throw wsErr;

      // Garante portal_client_id no cliente Ops (caso ainda nao tenha)
      if (!portalClientId && project.client_id) {
        await supabase
          .from("clients")
          .update({ portal_client_id: project.client_id, updated_at: new Date().toISOString() })
          .eq("id", clientId);
        setPortalClientId(project.client_id);
      }

      setPortalProjectId(project.id);
      toast({ title: "Projeto vinculado", description: `${project.name} · ${project.client_name}` });
      onLinked?.(project.id);
    } catch (err) {
      toast({
        title: "Erro ao vincular",
        description: err instanceof Error ? err.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }, [workspaceId, clientId, portalClientId, onLinked]);

  // Auto-seleciona quando ha exatamente 1 projeto disponivel e nenhum vinculo ativo
  useEffect(() => {
    if (loading || saving || autoSelected || portalProjectId) return;
    if (filtered.length === 1) {
      setAutoSelected(true);
      void link(filtered[0]);
    }
  }, [loading, saving, autoSelected, portalProjectId, filtered, link]);

  if (loading) {
    return (
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled>
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Projeto…
      </Button>
    );
  }

  if (error) {
    return (
      <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5 text-destructive" onClick={load}>
        <AlertCircle className="h-3.5 w-3.5" />
        Reconectar portal
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5">
          {linked ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
              <span className="max-w-[160px] truncate">{linked.name}</span>
            </>
          ) : (
            <>
              <Link2 className="h-3.5 w-3.5" />
              Vincular projeto
            </>
          )}
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel className="text-xs">
          {portalClientId
            ? `Projetos deste cliente (${filtered.length})`
            : `Todos os projetos do portal (${filtered.length})`}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-muted-foreground">
            {portalClientId
              ? "Nenhum projeto deste cliente no portal."
              : "Nenhum projeto encontrado no portal."}
          </div>
        ) : (
          filtered.map((p) => {
            const isCurrent = p.id === portalProjectId;
            return (
              <DropdownMenuItem
                key={p.id}
                disabled={saving || isCurrent}
                onClick={() => link(p)}
                className="flex flex-col items-start gap-0.5 cursor-pointer"
              >
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-medium truncate flex-1">{p.name}</span>
                  {isCurrent && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                </div>
                <span className="text-[10px] text-muted-foreground truncate">
                  {p.client_name}{p.client_company ? ` · ${p.client_company}` : ""} · {p.status}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
        {!portalClientId && filtered.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-3 py-2 text-[10px] text-muted-foreground">
              Cliente sem vínculo no portal — selecione qualquer projeto para vincular agora.
            </div>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}