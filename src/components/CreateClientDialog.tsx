import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slugify";
import { toast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const SEGMENTS = ["SaaS", "E-commerce", "Serviços", "Indústria", "Educação", "Outro"];
const PLANS = ["starter", "growth", "enterprise"];

export default function CreateClientDialog({ open, onOpenChange, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState(true);
  const [form, setForm] = useState({
    name: "",
    company_name: "",
    segment: "",
    plan_name: "growth",
    executive_summary: "",
  });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);

    try {
      const slug = slugify(form.name) + "-" + Date.now().toString(36);

      const { data: client, error: cErr } = await supabase
        .from("clients")
        .insert({
          name: form.name.trim(),
          slug,
          company_name: form.company_name.trim() || null,
          segment: form.segment || null,
          plan_name: form.plan_name || null,
          status: "active",
          executive_summary: form.executive_summary.trim() || null,
        })
        .select("id, name")
        .single();

      if (cErr) throw cErr;

      if (createWorkspace && client) {
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
            event_type: "workspace_created",
            title: "Workspace criado",
            description: `Workspace criado automaticamente para ${client.name}`,
          });
        }
      }

      toast({ title: "Cliente criado", description: form.name });
      setForm({ name: "", company_name: "", segment: "", plan_name: "growth", executive_summary: "" });
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      console.error(err);
      toast({ title: "Erro ao criar cliente", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>Preencha os dados mínimos para criar um novo cliente.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do cliente" required />
          </div>

          <div className="space-y-1.5">
            <Label>Empresa</Label>
            <Input value={form.company_name} onChange={(e) => set("company_name", e.target.value)} placeholder="Nome da empresa" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={form.segment} onValueChange={(v) => set("segment", v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {SEGMENTS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Plano</Label>
              <Select value={form.plan_name} onValueChange={(v) => set("plan_name", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Resumo executivo</Label>
            <Input value={form.executive_summary} onChange={(e) => set("executive_summary", e.target.value)} placeholder="Breve descrição" />
          </div>

          <div className="flex items-center gap-3 rounded-md border border-border bg-secondary/50 p-3">
            <Switch checked={createWorkspace} onCheckedChange={setCreateWorkspace} />
            <div>
              <p className="text-sm font-medium text-foreground">Criar workspace automaticamente</p>
              <p className="text-xs text-muted-foreground">Um workspace será criado com status "setup"</p>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={loading}>{loading ? "Criando..." : "Criar Cliente"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
