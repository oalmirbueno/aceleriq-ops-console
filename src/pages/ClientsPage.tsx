import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Search, ExternalLink, FolderPlus } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import CreateClientDialog from "@/components/CreateClientDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getStagePremiumLabel } from "@/components/workspace/aceleraConstants";

interface Client {
  id: string;
  name: string;
  company_name: string | null;
  status: string;
  segment: string | null;
  plan_name: string | null;
  workspaces: { id: string; current_stage: string }[];
}

const STATUS_OPTIONS = [
  { value: "__all__", label: "Todos os status" },
  { value: "lead_imported", label: "Lead importado" },
  { value: "onboarding", label: "Onboarding" },
  { value: "active", label: "Ativo" },
  { value: "paused", label: "Pausado" },
  { value: "completed", label: "Concluído" },
  { value: "archived", label: "Arquivado" },
];

const STAGE_OPTIONS = [
  { value: "__all__", label: "Todas as etapas" },
  { value: "entrada", label: "Abertura Estratégica" },
  { value: "diagnostico", label: "Diagnóstico Estrutural" },
  { value: "estrutura_base", label: "Arquitetura Base da Operação" },
  { value: "planejamento", label: "Plano Diretor de Implantação" },
  { value: "producao", label: "Implantação e Construção" },
  { value: "ativacao", label: "Ativação Assistida" },
  { value: "otimizacao", label: "Otimização Guiada por Evidência" },
  { value: "expansao", label: "Escala e Alavancagem" },
];

const statusColor: Record<string, string> = {
  lead_imported: "bg-muted text-muted-foreground border-border",
  onboarding: "bg-accent/15 text-accent-foreground border-accent/30",
  active: "bg-primary/15 text-primary border-primary/30",
  paused: "bg-muted text-muted-foreground border-border",
  completed: "bg-primary/10 text-primary/80 border-primary/20",
  archived: "bg-muted text-muted-foreground border-border",
};

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [stageFilter, setStageFilter] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, company_name, status, segment, plan_name, workspaces(id, current_stage)")
      .order("created_at", { ascending: false });

    if (!error && data) setClients(data as Client[]);
    setLoading(false);
  };

  useEffect(() => { fetchClients(); }, []);

  const filtered = useMemo(() => {
    let list = clients;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || c.company_name?.toLowerCase().includes(q));
    }
    if (statusFilter !== "__all__") {
      list = list.filter((c) => c.status === statusFilter);
    }
    if (stageFilter !== "__all__") {
      list = list.filter((c) => c.workspaces.some((w) => w.current_stage === stageFilter));
    }
    return list;
  }, [clients, search, statusFilter, stageFilter]);

  const openWorkspace = (client: Client) => {
    const ws = client.workspaces[0];
    if (ws) navigate(`/ops/workspaces/${ws.id}`);
  };

  const createWorkspaceForClient = async (client: Client) => {
    try {
      const { data: ws, error: wErr } = await supabase
        .from("workspaces")
        .insert({
          client_id: client.id,
          name: `${client.name} — Workspace`,
          status: "setup",
          current_stage: "entrada",
        })
        .select("id")
        .single();

      if (wErr) throw wErr;

      if (ws) {
        await supabase.from("timeline_events").insert({
          workspace_id: ws.id,
          client_id: client.id,
          event_type: "workspace_created",
          title: "Workspace criado",
          description: `Workspace criado para ${client.name}`,
          happened_at: new Date().toISOString(),
        });

        toast({ title: "Workspace criado", description: client.name });
        await fetchClients();
        navigate(`/ops/workspaces/${ws.id}`);
      }
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao criar workspace", description: err.message, variant: "destructive" });
    }
  };

  return (
    <>
      <AppHeader title="Clientes" subtitle="Gestão de clientes da operação" />

      <div className="p-6 animate-fade-in">
        {/* Toolbar */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="pl-9"
            />
          </div>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-[170px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button onClick={() => setDialogOpen(true)} className="ml-auto gap-2">
            <Plus className="h-4 w-4" /> Novo Cliente
          </Button>
        </div>

        {/* Content */}
        {loading ? (
          <LoadingState />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={clients.length === 0 ? "Nenhum cliente cadastrado" : "Nenhum resultado"}
            description={clients.length === 0 ? "Crie o primeiro cliente para começar." : "Tente alterar os filtros."}
          />
        ) : (
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const stage = c.workspaces[0]?.current_stage;
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => c.workspaces[0] ? openWorkspace(c) : undefined}>
                      <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.company_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor[c.status] ?? ""}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{stage ? getStagePremiumLabel(stage) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{c.plan_name ?? "—"}</TableCell>
                      <TableCell>
                        {c.workspaces[0] ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); openWorkspace(c); }}
                            title="Abrir workspace"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); createWorkspaceForClient(c); }}
                            title="Criar workspace"
                          >
                            <FolderPlus className="h-4 w-4 text-primary" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <CreateClientDialog open={dialogOpen} onOpenChange={setDialogOpen} onCreated={fetchClients} />
    </>
  );
}
