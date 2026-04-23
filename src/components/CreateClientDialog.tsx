import { useRef, useState } from "react";
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
import { Upload, X, ImageIcon } from "lucide-react";
import ClientAvatar from "@/components/workspace/ClientAvatar";
import { getPlanConfig, getPlanOrder } from "@/lib/planConfig";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const SEGMENTS = ["SaaS", "E-commerce", "Serviços", "Indústria", "Educação", "Outro"];
const PLAN_KEYS = getPlanOrder();

export default function CreateClientDialog({ open, onOpenChange, onCreated }: Props) {
  const [loading, setLoading] = useState(false);
  const [createWorkspace, setCreateWorkspace] = useState(true);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    name: "",
    company_name: "",
    segment: "",
    plan_name: "growth",
    executive_summary: "",
  });

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const handleLogoSelect = (file: File | null) => {
    if (!file) {
      setLogoFile(null);
      setLogoPreview(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem.", variant: "destructive" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Limite 2MB.", variant: "destructive" });
      return;
    }
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (clientId: string): Promise<string | null> => {
    if (!logoFile) return null;
    const ext = logoFile.name.split(".").pop()?.toLowerCase() || "png";
    const path = `${clientId}/logo-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("client-logos")
      .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
    if (upErr) {
      console.error("logo upload failed", upErr);
      toast({
        title: "Logo não enviado",
        description: "Cliente foi criado, mas o logo falhou. Verifique o bucket 'client-logos'.",
        variant: "destructive",
      });
      return null;
    }
    const { data: pub } = supabase.storage.from("client-logos").getPublicUrl(path);
    return pub?.publicUrl ?? null;
  };

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

      // Upload logo (best-effort) and persist URL
      if (client && logoFile) {
        const url = await uploadLogo(client.id);
        if (url) {
          const { error: uErr } = await supabase
            .from("clients")
            .update({ logo_url: url } as any)
            .eq("id", client.id);
          if (uErr) console.warn("logo_url update failed (column missing?)", uErr);
        }
      }

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
      setLogoFile(null);
      setLogoPreview(null);
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
          {/* Logo + Nome side by side */}
          <div className="flex items-start gap-3">
            <div className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="relative group"
                aria-label="Upload de logo"
              >
                {logoPreview ? (
                  <div className="relative h-14 w-14 rounded-md overflow-hidden border-2 border-border hover:border-primary transition-colors">
                    <img src={logoPreview} alt="Preview do logo" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Upload className="h-4 w-4 text-foreground" />
                    </div>
                  </div>
                ) : form.name ? (
                  <div className="relative">
                    <ClientAvatar name={form.name} seed={form.name} size="lg" className="h-14 w-14 text-base" />
                    <div className="absolute inset-0 rounded-md bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center border-2 border-dashed border-primary">
                      <Upload className="h-4 w-4 text-foreground" />
                    </div>
                  </div>
                ) : (
                  <div className="h-14 w-14 rounded-md border-2 border-dashed border-border hover:border-primary transition-colors flex items-center justify-center bg-muted/30">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </button>
              {logoPreview && (
                <button
                  type="button"
                  onClick={() => handleLogoSelect(null)}
                  className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-0.5"
                >
                  <X className="h-2.5 w-2.5" /> remover
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleLogoSelect(e.target.files?.[0] ?? null)}
              />
            </div>

            <div className="flex-1 space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Nome do cliente" required />
              <p className="text-[10px] text-muted-foreground">Logo opcional · max 2MB</p>
            </div>
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
                  {PLAN_KEYS.map((p) => {
                    const cfg = getPlanConfig()[p];
                    return (
                      <SelectItem key={p} value={p}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{cfg.label}</span>
                          <span className="text-xs text-muted-foreground">R$ {cfg.monthly.toLocaleString("pt-BR")}/mês</span>
                        </div>
                      </SelectItem>
                    );
                  })}
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
