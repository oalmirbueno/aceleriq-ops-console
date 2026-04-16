import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/slugify";
import { toast } from "@/hooks/use-toast";
import {
  Target, ShoppingCart, Globe, Settings, Search, Scale,
  Lightbulb, Building2, Key, Megaphone,
} from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const SEGMENTS = ["SaaS", "E-commerce", "Serviços", "Indústria", "Educação", "Outro"];
const PLANS = ["starter", "growth", "enterprise"];

const FOCUS_AREAS = [
  { key: "marketing", label: "Marketing Digital", icon: Megaphone, description: "Redes sociais, tráfego pago, conteúdo" },
  { key: "commercial", label: "Comercial & Vendas", icon: ShoppingCart, description: "CRM, funil, processos de vendas" },
  { key: "website", label: "Site & Landing Pages", icon: Globe, description: "Criação, redesign, otimização" },
  { key: "systems", label: "Sistemas & Automação", icon: Settings, description: "ERP, integrações, automações" },
  { key: "branding", label: "Branding & Identidade", icon: Target, description: "Logo, identidade visual, posicionamento" },
  { key: "seo", label: "SEO & Tráfego Orgânico", icon: Search, description: "Otimização, conteúdo, autoridade" },
  { key: "ai", label: "Inteligência Artificial", icon: Lightbulb, description: "Chatbots, IA generativa, automação IA" },
  { key: "legal", label: "Jurídico & Compliance", icon: Scale, description: "LGPD, contratos, termos" },
  { key: "strategy", label: "Estratégia & Gestão", icon: Building2, description: "Planejamento, OKRs, processos" },
  { key: "security", label: "Segurança & Infra", icon: Key, description: "Servidores, domínios, e-mails" },
] as const;

export default function CreateClientDialog({ open, onOpenChange, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState(true);
  const [selectedFocus, setSelectedFocus] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: "",
    company_name: "",
    segment: "",
    plan_name: "growth",
    executive_summary: "",
  });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const toggleFocus = (key: string) => {
    setSelectedFocus((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);

    try {
      const slug = slugify(form.name) + "-" + Date.now().toString(36);
      const focusAreas = Array.from(selectedFocus);

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
          metadata: focusAreas.length > 0 ? { focus_areas: focusAreas } : null,
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
          const now = new Date().toISOString();
          await supabase.from("timeline_events").insert({
            workspace_id: ws.id,
            client_id: client.id,
            event_type: "workspace_created",
            title: "Workspace criado",
            description: `Workspace criado automaticamente para ${client.name}`,
            happened_at: now,
          });
        }
      }

      toast({ title: "Cliente criado", description: form.name });
      setForm({ name: "", company_name: "", segment: "", plan_name: "growth", executive_summary: "" });
      setSelectedFocus(new Set());
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
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo Cliente</DialogTitle>
          <DialogDescription>Preencha os dados e selecione as áreas de foco do projeto.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
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

          {/* Focus areas multi-select */}
          <div className="space-y-2.5">
            <Label className="text-sm font-semibold">Áreas de Foco do Projeto</Label>
            <p className="text-xs text-muted-foreground -mt-1">Marque o que vamos trabalhar com este cliente</p>
            <div className="grid grid-cols-2 gap-2">
              {FOCUS_AREAS.map((area) => {
                const Icon = area.icon;
                const selected = selectedFocus.has(area.key);
                return (
                  <button
                    key={area.key}
                    type="button"
                    onClick={() => toggleFocus(area.key)}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border text-left transition-all ${
                      selected
                        ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                        : "border-border hover:border-primary/30 hover:bg-muted/30"
                    }`}
                  >
                    <Checkbox checked={selected} className="mt-0.5 pointer-events-none" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span className="text-sm font-medium text-foreground">{area.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{area.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            {selectedFocus.size > 0 && (
              <p className="text-xs text-primary font-medium">{selectedFocus.size} área(s) selecionada(s)</p>
            )}
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
