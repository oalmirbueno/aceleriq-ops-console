import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Plus, Search, ExternalLink, FolderPlus, KeyRound, FileText, Sparkles } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import EmptyState from "@/components/EmptyState";
import LoadingState from "@/components/LoadingState";
import CreateClientDialog from "@/components/CreateClientDialog";
import ClientBriefingDialog from "@/components/workspace/ClientBriefingDialog";
import ClientPortalLinkButton from "@/components/workspace/ClientPortalLinkButton";
import AIFirstScoreCard from "@/components/workspace/AIFirstScoreCard";
import HealthScoreCard from "@/components/workspace/HealthScoreCard";
import ICPFitScoreCard from "@/components/workspace/ICPFitScoreCard";
import DiagnosticQuizDialog from "@/components/workspace/DiagnosticQuizDialog";
import ImportLeadsDialog from "@/components/workspace/ImportLeadsDialog";
import ProjectTypeBadge from "@/components/workspace/ProjectTypeBadge";
import ClientTypeEditorDialog from "@/components/workspace/ClientTypeEditorDialog";
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
  portal_client_id: string | null;
  project_type: string | null;
  custom_monthly_value: number | null;
  metadata: Record<string, unknown> | null;
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

/** Completude percentage of essential_briefing — used to show health signal */
function briefingCompleteness(metadata: Record<string, unknown> | null): number {
  const eb = (metadata?.essential_briefing as Record<string, string> | undefined);
  if (!eb) return 0;
  const fields = ["positioning","differential","icp","main_pains","goals_12m","success_metric","revenue_range","team_size"];
  const filled = fields.filter((f) => (eb[f] ?? "").toString().trim().length > 0).length;
  return Math.round((filled / fields.length) * 100);
}

export default function ClientsPage() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__");
  const [stageFilter, setStageFilter] = useState("__all__");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [briefingClient, setBriefingClient] = useState<Client | null>(null);
  const [quizClient, setQuizClient] = useState<Client | null>(null);
  const [importLeadsOpen, setImportLeadsOpen] = useState(false);
  const [typeEditorClient, setTypeEditorClient] = useState<Client | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("id, name, company_name, status, segment, plan_name, portal_client_id, project_type, custom_monthly_value, metadata, workspaces(id, current_stage)")
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

  const openClientOrWorkspace = (client: Client) => {
    // Se tem mais de 1 workspace, vai pra página do cliente (lista projetos)
    if (client.workspaces.length > 1) {
      navigate(`/ops/clients/${client.id}`);
      return;
    }
    // Se tem 1 workspace, abre direto
    if (client.workspaces.length === 1) {
      navigate(`/ops/workspaces/${client.workspaces[0].id}`);
      return;
    }
    // Sem workspace → vai pra página do cliente (lá cria o primeiro projeto)
    navigate(`/ops/clients/${client.id}`);
  };

  const openClientDetail = (clientId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/ops/clients/${clientId}`);
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
      toast({ title: "Erro ao criar workspace", description: err?.message ?? "Tente novamente.", variant: "destructive" });
    }
  };

  return (
    <>
      <AppHeader title="Clientes" subtitle="Gestão de clientes da operação" />
      <div className="p-5 space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou empresa..."
              className="pl-9 h-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAGE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setImportLeadsOpen(true)} size="sm" variant="outline" className="h-9 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" /> Importar do portal
          </Button>
          <Button onClick={() => setDialogOpen(true)} size="sm" className="h-9 gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Novo cliente
          </Button>
        </div>

        {/* List */}
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Briefing</TableHead>
                  <TableHead>AI-First</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>ICP</TableHead>
                  <TableHead>Etapa</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Portal</TableHead>
                  <TableHead className="w-28 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const stage = c.workspaces[0]?.current_stage;
                  const brPct = briefingCompleteness(c.metadata);
                  const brColor = brPct === 100 ? "text-emerald-400"
                              : brPct > 50 ? "text-primary"
                              : brPct > 0 ? "text-amber-400"
                              : "text-muted-foreground/50";
                  return (
                    <TableRow key={c.id} className="cursor-pointer" onClick={() => openClientOrWorkspace(c)}>
                      <TableCell className="font-medium text-foreground">{c.name}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setTypeEditorClient(c); }}
                          className="hover:opacity-80 transition-opacity"
                          title="Editar tipo, plano e valor customizado"
                        >
                          <ProjectTypeBadge type={c.project_type} variant="compact" />
                        </button>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.company_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusColor[c.status] ?? ""}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell onClick={(e) => { e.stopPropagation(); setBriefingClient(c); }}>
                        <button type="button" className={`text-xs font-semibold tabular-nums ${brColor} hover:underline`}>
                          {brPct > 0 ? `${brPct}%` : "Preencher"}
                        </button>
                      </TableCell>
                      <TableCell>
                        <AIFirstScoreCard clientId={c.id} planName={c.plan_name} variant="compact" />
                      </TableCell>
                      <TableCell>
                        <HealthScoreCard clientId={c.id} clientMetadata={c.metadata} currentStage={stage} variant="compact" />
                      </TableCell>
                      <TableCell>
                        <ICPFitScoreCard clientMetadata={c.metadata} currentPlan={c.plan_name as any} variant="compact" />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{stage ? getStagePremiumLabel(stage) : "—"}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{c.plan_name ?? "—"}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <ClientPortalLinkButton
                          clientId={c.id}
                          clientName={c.name}
                          portalClientId={c.portal_client_id}
                          onLinked={fetchClients}
                          compact
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-0.5 justify-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setQuizClient(c); }}
                            title="Fazer diagnóstico guiado (quiz)"
                          >
                            <Sparkles className="h-4 w-4 text-primary/70" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setBriefingClient(c); }}
                            title="Editar briefing essencial"
                          >
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); navigate(`/ops/clients/${c.id}/vault`); }}
                            title="Ver acessos do cliente"
                          >
                            <KeyRound className="h-4 w-4 text-muted-foreground" />
                          </Button>
                          {c.workspaces[0] ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); openClientOrWorkspace(c); }}
                              title={c.workspaces.length > 1 ? `${c.workspaces.length} projetos — clique pra ver` : "Abrir workspace"}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => { e.stopPropagation(); navigate(`/ops/clients/${c.id}`); }}
                              title="Ver cliente e criar projeto"
                            >
                              <FolderPlus className="h-4 w-4 text-primary" />
                            </Button>
                          )}
                        </div>
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
      {briefingClient && (
        <ClientBriefingDialog
          open={!!briefingClient}
          onOpenChange={(open) => !open && setBriefingClient(null)}
          clientId={briefingClient.id}
          clientName={briefingClient.name}
          initialMetadata={briefingClient.metadata}
          onSaved={fetchClients}
        />
      )}
      {quizClient && (
        <DiagnosticQuizDialog
          open={!!quizClient}
          onOpenChange={(open) => !open && setQuizClient(null)}
          clientId={quizClient.id}
          clientName={quizClient.name}
          onCompleted={fetchClients}
        />
      )}
      <ImportLeadsDialog
        open={importLeadsOpen}
        onOpenChange={setImportLeadsOpen}
        onImported={fetchClients}
      />
      {typeEditorClient && (
        <ClientTypeEditorDialog
          open={!!typeEditorClient}
          onOpenChange={(open) => !open && setTypeEditorClient(null)}
          clientId={typeEditorClient.id}
          clientName={typeEditorClient.name}
          initialType={typeEditorClient.project_type}
          initialCustomValue={typeEditorClient.custom_monthly_value}
          initialPlan={typeEditorClient.plan_name}
          onSaved={fetchClients}
        />
      )}
    </>
  );
}
