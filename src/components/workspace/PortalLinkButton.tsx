/**
 * PortalLinkButton — vincula workspace/cliente ao projeto no aceleriq.online.
 * 
 * 1 clique: abre modal → lista projetos do portal → seleciona → salva.
 * Salva portal_project_id no workspace e portal_client_id no client.
 */
import { useState, useEffect, useCallback } from "react";
import { Link2, Loader2, CheckCircle2, ExternalLink, Search, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PORTAL_PROJECTS_URL = "https://gicbrgagstyvbaaumprj.supabase.co/functions/v1/ops-projects-list";

interface PortalProject {
  id: string;
  name: string;
  status: string;
  project_type: string;
  client_id: string;
  client_name: string;
  client_company: string | null;
}

interface Props {
  workspaceId: string;
  clientId: string;
  /** Current linked portal_project_id if any */
  portalProjectId?: string | null;
  /** Current linked portal_client_id if any */
  portalClientId?: string | null;
  onLinked?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  active: "Ativo", planning: "Planejamento",
  review: "Revisao", paused: "Pausado", done: "Concluido",
};

export default function PortalLinkButton({
  workspaceId, clientId, portalProjectId, portalClientId, onLinked,
}: Props) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<PortalProject[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PortalProject | null>(null);

  const isLinked = !!portalProjectId;

  const fetchPortalProjects = useCallback(async () => {
    setLoading(true);
    try {
      // Call via Ops edge function to keep the secret server-side
      const { data, error } = await supabase.functions.invoke("portal-proxy", {
        body: { path: "ops-projects-list" },
      });
      if (error) throw error;
      setProjects((data?.projects ?? []) as PortalProject[]);
    } catch (err) {
      toast({
        title: "Nao foi possivel carregar projetos do portal",
        description: err instanceof Error ? err.message : "Verifique a conexao com o portal",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && projects.length === 0) fetchPortalProjects();
  }, [open, projects.length, fetchPortalProjects]);

  const handleLink = useCallback(async () => {
    if (!selected) return;
    setSaving(true);
    try {
      // Save portal_project_id to workspace
      const { error: wsErr } = await supabase
        .from("workspaces")
        .update({ portal_project_id: selected.id, updated_at: new Date().toISOString() })
        .eq("id", workspaceId);
      if (wsErr) throw wsErr;

      // Save portal_client_id to client
      const { error: cErr } = await supabase
        .from("clients")
        .update({ portal_client_id: selected.client_id, updated_at: new Date().toISOString() })
        .eq("id", clientId);
      if (cErr) throw cErr;

      toast({
        title: "Vinculado ao portal",
        description: selected.name + " — " + selected.client_name,
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
  }, [selected, workspaceId, clientId, onLinked]);

  const handleUnlink = useCallback(async () => {
    if (!confirm("Desvincular este workspace do portal?")) return;
    await Promise.all([
      supabase.from("workspaces").update({ portal_project_id: null }).eq("id", workspaceId),
      supabase.from("clients").update({ portal_client_id: null }).eq("id", clientId),
    ]);
    toast({ title: "Desvinculado" });
    onLinked?.();
  }, [workspaceId, clientId, onLinked]);

  const filtered = projects.filter((p) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.client_name.toLowerCase().includes(q) ||
      (p.client_company ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <>
      {isLinked ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Vinculado ao portal
          </span>
          <a
            href={"https://aceleriq.online"}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <button
            type="button"
            onClick={handleUnlink}
            className="text-xs text-muted-foreground/50 hover:text-destructive transition-colors"
            title="Desvincular"
          >
            <Unlink className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1.5 border-dashed hover:border-primary/50 hover:text-primary"
        >
          <Link2 className="h-3 w-3" />
          Vincular ao portal
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg p-0">
          <DialogHeader className="px-5 py-4 border-b border-border">
            <DialogTitle className="text-base flex items-center gap-2">
              <Link2 className="h-4 w-4 text-primary" />
              Vincular ao aceleriq.online
            </DialogTitle>
            <DialogDescription className="text-xs">
              Selecione o projeto correspondente no portal do cliente.
              Apos vincular, arquivos aprovados e atualizacoes de etapa aparecerao automaticamente la.
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 py-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar projeto ou cliente..."
                className="pl-8 h-8 text-sm"
                autoFocus
              />
            </div>
          </div>

          <div className="overflow-y-auto max-h-[360px] px-2 py-2">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando projetos do portal...
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                {projects.length === 0
                  ? "Nenhum projeto encontrado no portal"
                  : "Nenhum resultado para a busca"}
              </div>
            ) : (
              <div className="space-y-1">
                {filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelected(isSelected ? null : p)}
                      className={cn(
                        "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all",
                        isSelected
                          ? "bg-primary/10 border border-primary/40"
                          : "hover:bg-secondary/60 border border-transparent"
                      )}
                    >
                      <div className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md shrink-0 text-xs font-bold",
                        isSelected ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
                      )}>
                        {p.client_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {p.client_name}
                          {p.client_company ? " · " + p.client_company : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {p.project_type?.replace("_", " ")}
                        </Badge>
                        <span className={cn("text-[10px] font-medium",
                          p.status === "active" ? "text-emerald-400" :
                          p.status === "done" ? "text-muted-foreground" : "text-amber-400"
                        )}>
                          {STATUS_LABELS[p.status] ?? p.status}
                        </span>
                        {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {selected
                ? "Selecionado: " + selected.name
                : projects.length + " projetos no portal"}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setOpen(false)} variant="outline" size="sm" className="h-8 text-xs">
                Cancelar
              </Button>
              <Button
                onClick={handleLink}
                disabled={!selected || saving}
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
