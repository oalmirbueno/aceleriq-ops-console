import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Search, ExternalLink } from "lucide-react";
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
  { value: "active", label: "Ativo" },
  { value: "inactive", label: "Inativo" },
  { value: "onboarding", label: "Onboarding" },
  { value: "churned", label: "Churned" },
];

const STAGE_OPTIONS = [
  { value: "__all__", label: "Todas as etapas" },
  { value: "entrada", label: "Entrada" },
  { value: "diagnostico", label: "Diagnóstico" },
  { value: "estrategia", label: "Estratégia" },
  { value: "execucao", label: "Execução" },
  { value: "entrega", label: "Entrega" },
];

const statusColor: Record<string, string> = {
  active: "bg-primary/15 text-primary border-primary/30",
  inactive: "bg-muted text-muted-foreground border-border",
  onboarding: "bg-info/15 text-info border-info/30",
  churned: "bg-destructive/15 text-destructive border-destructive/30",
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
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => openWorkspace(c)}>
                      <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                      <TableCell className="text-muted-foreground">{c.company_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor[c.status] ?? ""}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">{stage ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{c.plan_name ?? "—"}</TableCell>
                      <TableCell>
                        {c.workspaces[0] && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); openWorkspace(c); }}
                          >
                            <ExternalLink className="h-4 w-4" />
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
