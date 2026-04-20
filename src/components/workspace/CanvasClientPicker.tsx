import { useEffect, useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Search, Building2, Plus, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CreateClientDialog from "@/components/CreateClientDialog";

interface ClientRow {
  id: string;
  name: string;
  company_name: string | null;
  segment: string | null;
  plan_name: string | null;
  status: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** clients already on canvas (so we mark them as added) */
  existingClientIds: string[];
  onPick: (client: ClientRow) => Promise<void> | void;
  /** When more than one client exists on canvas, prompt user about grouping */
  hasOtherClients: boolean;
}

export default function CanvasClientPicker({
  open, onOpenChange, existingClientIds, onPick, hasOtherClients,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("id, name, company_name, segment, plan_name, status")
      .order("name", { ascending: true });
    setClients((data ?? []) as ClientRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) {
      setSearch("");
      fetchClients();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.company_name ?? "").toLowerCase().includes(q) ||
      (c.segment ?? "").toLowerCase().includes(q),
    );
  }, [clients, search]);

  const handlePick = async (c: ClientRow) => {
    setPicking(c.id);
    await onPick(c);
    setPicking(null);
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-amber-400" />
              Adicionar cliente ao Canvas
            </DialogTitle>
            <DialogDescription className="text-xs">
              Escolha um cliente já cadastrado{hasOtherClients ? " — será criada uma pasta separada para ele." : "."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 pt-3 pb-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome, empresa ou segmento..."
                className="h-9 pl-8 text-sm"
                autoFocus
              />
            </div>
          </div>

          <ScrollArea className="max-h-80 px-3 pb-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">
                Nenhum cliente encontrado.
              </p>
            ) : (
              <div className="space-y-1 px-2">
                {filtered.map((c) => {
                  const already = existingClientIds.includes(c.id);
                  const isPicking = picking === c.id;
                  return (
                    <button
                      key={c.id}
                      onClick={() => !already && !isPicking && handlePick(c)}
                      disabled={already || isPicking}
                      className={`w-full text-left rounded-md border p-2.5 transition-colors flex items-center gap-3 ${
                        already
                          ? "border-border bg-muted/30 opacity-60 cursor-not-allowed"
                          : "border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}
                    >
                      <div className="h-8 w-8 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {c.company_name && (
                            <span className="text-[11px] text-muted-foreground truncate">{c.company_name}</span>
                          )}
                          {c.segment && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{c.segment}</Badge>
                          )}
                          {c.plan_name && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 capitalize">{c.plan_name}</Badge>
                          )}
                        </div>
                      </div>
                      {already ? (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      ) : isPicking ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2 bg-muted/20">
            <p className="text-[11px] text-muted-foreground">
              Não encontrou? Cadastre um novo cliente.
            </p>
            <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo cliente
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <CreateClientDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => { fetchClients(); }}
      />
    </>
  );
}
