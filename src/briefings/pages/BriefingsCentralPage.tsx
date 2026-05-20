import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, FileText, Plus, Search, Send, CheckCircle2, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { useBriefingClients, useCreateClient } from "@/briefings/data/useBriefings";

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function BriefingsCentralPage() {
  const { data, isLoading } = useBriefingClients();
  const createClient = useCreateClient();
  const [q, setQ] = useState("");
  const [openNew, setOpenNew] = useState(false);
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return data ?? [];
    return (data ?? []).filter(
      (c) => c.name.toLowerCase().includes(s) || (c.company_name ?? "").toLowerCase().includes(s),
    );
  }, [data, q]);

  const totals = useMemo(() => {
    const all = data ?? [];
    return {
      clients: all.length,
      submitted: all.reduce((a, c) => a + c.totals.submitted, 0),
      drafts: all.reduce((a, c) => a + c.totals.drafts, 0),
    };
  }, [data]);

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      await createClient.mutateAsync({ name, company_name: company });
      toast({ title: "Cliente criado" });
      setOpenNew(false);
      setName(""); setCompany("");
    } catch (e) {
      toast({ title: "Erro ao criar cliente", description: (e as Error).message, variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-end justify-between gap-6 mb-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Briefings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Gere e acompanhe briefings preenchidos pelos clientes.
          </p>
        </div>
        <Button onClick={() => setOpenNew(true)} className="gap-1.5">
          <Plus className="h-4 w-4" /> Novo cliente
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Metric label="Clientes" value={totals.clients} />
        <Metric label="Respondidos" value={totals.submitted} icon={CheckCircle2} />
        <Metric label="Em preenchimento" value={totals.drafts} icon={Clock} />
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-10 text-center">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-16 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/60 mb-3" />
          <p className="text-sm font-medium">Nenhum cliente ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Crie um cliente para começar a enviar briefings.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => (
            <Link
              key={c.id}
              to={`/briefings/${c.id}`}
              className="group rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-card/80 transition-colors p-4 flex flex-col gap-3"
            >
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted/40 border border-border/60 grid place-items-center overflow-hidden shrink-0">
                  {c.logo_url ? (
                    <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">
                      {c.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{c.name}</p>
                  {c.company_name && (
                    <p className="text-xs text-muted-foreground truncate">{c.company_name}</p>
                  )}
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5" /> {c.totals.submitted} resp.
                </span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" /> {c.totals.drafts} rasc.
                </span>
                <span className="ml-auto text-muted-foreground/80">{formatRelative(c.lastActivity)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={openNew} onOpenChange={setOpenNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>Cadastre um cliente para enviar briefings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="cl-name">Nome do cliente</Label>
              <Input id="cl-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cl-co">Empresa (opcional)</Label>
              <Input id="cl-co" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex: Acme Ltda" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenNew(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!name.trim() || createClient.isPending}>
              {createClient.isPending ? "Criando…" : (<><Send className="h-4 w-4 mr-1" /> Criar</>)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: number; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-lg border border-border bg-card/60 px-4 py-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}