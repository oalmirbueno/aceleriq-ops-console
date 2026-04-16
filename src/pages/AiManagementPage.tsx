import { useEffect, useState, useCallback } from "react";
import { Brain, Plus, Trash2, RefreshCw, Eye } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { AiProvider, AiModel, AiRoute, AiLogRow, RouteResponseFormat } from "@/lib/aiTypes";

export default function AiManagementPage() {
  return (
    <>
      <AppHeader title="Inteligência Artificial" subtitle="Providers, models, routes e logs" />
      <div className="p-6 animate-fade-in max-w-6xl">
        <Tabs defaultValue="routes" className="space-y-4">
          <TabsList>
            <TabsTrigger value="routes">Rotas</TabsTrigger>
            <TabsTrigger value="models">Modelos</TabsTrigger>
            <TabsTrigger value="providers">Providers</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          <TabsContent value="routes"><RoutesTab /></TabsContent>
          <TabsContent value="models"><ModelsTab /></TabsContent>
          <TabsContent value="providers"><ProvidersTab /></TabsContent>
          <TabsContent value="logs"><LogsTab /></TabsContent>
        </Tabs>
      </div>
    </>
  );
}

/* ──────────────── Providers ──────────────── */
function ProvidersTab() {
  const [items, setItems] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ slug: "", label: "", secret_env_name: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_providers" as never)
      .select("*")
      .order("created_at", { ascending: true });
    if (error) toast({ title: "Erro carregando providers", description: error.message, variant: "destructive" });
    setItems((data ?? []) as unknown as AiProvider[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.slug.trim() || !form.label.trim()) {
      toast({ title: "slug e label obrigatórios", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("ai_providers" as never).insert({
      slug: form.slug.trim(),
      label: form.label.trim(),
      secret_env_name: form.secret_env_name.trim() || null,
      enabled: true,
    } as never);
    if (error) {
      toast({ title: "Erro criando provider", description: error.message, variant: "destructive" });
      return;
    }
    setForm({ slug: "", label: "", secret_env_name: "" });
    load();
  };

  const toggle = async (id: string, enabled: boolean) => {
    await supabase.from("ai_providers" as never).update({ enabled } as never).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover provider? Modelos vinculados serão removidos em cascade.")) return;
    const { error } = await supabase.from("ai_providers" as never).delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" /> Providers de IA
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">slug</Label>
            <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="lovable" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">label</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Lovable AI Gateway" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">secret_env_name (referência)</Label>
            <Input value={form.secret_env_name} onChange={(e) => setForm({ ...form, secret_env_name: e.target.value })} placeholder="LOVABLE_API_KEY" className="h-9 text-sm font-mono" />
          </div>
          <Button onClick={create} size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Slug</TableHead>
              <TableHead>Label</TableHead>
              <TableHead>Secret ENV</TableHead>
              <TableHead className="w-24">Ativo</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Carregando...</TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Nenhum provider</TableCell></TableRow>}
            {items.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-xs">{p.slug}</TableCell>
                <TableCell className="text-sm">{p.label}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{p.secret_env_name ?? "—"}</TableCell>
                <TableCell><Switch checked={p.enabled} onCheckedChange={(v) => toggle(p.id, v)} /></TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          O nome em <code className="font-mono">secret_env_name</code> é apenas referência administrativa. Nenhum valor de secret é armazenado no banco.
        </p>
      </CardContent>
    </Card>
  );
}

/* ──────────────── Models ──────────────── */
function ModelsTab() {
  const [items, setItems] = useState<AiModel[]>([]);
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ provider_id: "", model_id: "", label: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const [m, p] = await Promise.all([
      supabase.from("ai_models" as never).select("*, ai_providers(slug,label)").order("created_at", { ascending: true }),
      supabase.from("ai_providers" as never).select("*").eq("enabled", true).order("label"),
    ]);
    if (m.error) toast({ title: "Erro models", description: m.error.message, variant: "destructive" });
    setItems((m.data ?? []) as unknown as AiModel[]);
    setProviders((p.data ?? []) as unknown as AiProvider[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!form.provider_id || !form.model_id.trim() || !form.label.trim()) {
      toast({ title: "Preencha provider, model_id e label", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("ai_models" as never).insert({
      provider_id: form.provider_id,
      model_id: form.model_id.trim(),
      label: form.label.trim(),
      enabled: true,
    } as never);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setForm({ provider_id: "", model_id: "", label: "" });
    load();
  };

  const toggle = async (id: string, enabled: boolean) => {
    await supabase.from("ai_models" as never).update({ enabled } as never).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover model? Rotas que apontam para ele ficarão sem destino.")) return;
    const { error } = await supabase.from("ai_models" as never).delete().eq("id", id);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" /> Modelos de Texto/LLM
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-4 gap-2 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Provider</Label>
            <Select value={form.provider_id} onValueChange={(v) => setForm({ ...form, provider_id: v })}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {providers.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">model_id (gateway)</Label>
            <Input value={form.model_id} onChange={(e) => setForm({ ...form, model_id: e.target.value })} placeholder="google/gemini-2.5-flash" className="h-9 text-sm font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Label</Label>
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Gemini 2.5 Flash" className="h-9 text-sm" />
          </div>
          <Button onClick={create} size="sm"><Plus className="h-4 w-4 mr-1" /> Adicionar</Button>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>model_id</TableHead>
              <TableHead>Label</TableHead>
              <TableHead className="w-24">Ativo</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Carregando...</TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-xs text-muted-foreground py-6">Nenhum modelo</TableCell></TableRow>}
            {items.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-xs"><Badge variant="outline">{m.ai_providers?.slug ?? "—"}</Badge></TableCell>
                <TableCell className="font-mono text-xs">{m.model_id}</TableCell>
                <TableCell className="text-sm">{m.label}</TableCell>
                <TableCell><Switch checked={m.enabled} onCheckedChange={(v) => toggle(m.id, v)} /></TableCell>
                <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(m.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/* ──────────────── Routes ──────────────── */
function RoutesTab() {
  const [items, setItems] = useState<AiRoute[]>([]);
  const [models, setModels] = useState<AiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AiRoute | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, m] = await Promise.all([
      supabase.from("ai_routes" as never).select("*, ai_models(model_id,label,ai_providers(slug,label))").order("route_key"),
      supabase.from("ai_models" as never).select("*, ai_providers(slug,label)").eq("enabled", true).order("label"),
    ]);
    if (r.error) toast({ title: "Erro routes", description: r.error.message, variant: "destructive" });
    setItems((r.data ?? []) as unknown as AiRoute[]);
    setModels((m.data ?? []) as unknown as AiModel[]);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (id: string, enabled: boolean) => {
    await supabase.from("ai_routes" as never).update({ enabled } as never).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta rota?")) return;
    await supabase.from("ai_routes" as never).delete().eq("id", id);
    load();
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" /> Rotas Funcionais
        </CardTitle>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4 mr-1" /> Nova rota</Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>route_key</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Temp</TableHead>
              <TableHead className="w-24">Ativa</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Carregando...</TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Nenhuma rota</TableCell></TableRow>}
            {items.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.route_key}</TableCell>
                <TableCell className="text-xs">
                  <Badge variant="outline">{r.ai_models?.ai_providers?.slug}</Badge>{" "}
                  <span className="font-mono">{r.ai_models?.model_id}</span>
                </TableCell>
                <TableCell className="text-xs">{r.response_format}</TableCell>
                <TableCell className="text-xs font-mono">{r.default_temperature}</TableCell>
                <TableCell><Switch checked={r.enabled} onCheckedChange={(v) => toggle(r.id, v)} /></TableCell>
                <TableCell className="space-x-1">
                  <Button variant="ghost" size="sm" onClick={() => setEditing(r)}>Editar</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>

      <RouteFormDialog
        open={creating || !!editing}
        route={editing}
        models={models}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); load(); }}
      />
    </Card>
  );
}

function RouteFormDialog({
  open, route, models, onClose, onSaved,
}: {
  open: boolean;
  route: AiRoute | null;
  models: AiModel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    route_key: "",
    description: "",
    model_id: "",
    system_prompt: "",
    default_temperature: 0.2,
    response_format: "text" as RouteResponseFormat,
    enabled: true,
  });

  useEffect(() => {
    if (route) {
      setForm({
        route_key: route.route_key,
        description: route.description ?? "",
        model_id: route.model_id,
        system_prompt: route.system_prompt ?? "",
        default_temperature: route.default_temperature,
        response_format: route.response_format,
        enabled: route.enabled,
      });
    } else {
      setForm({ route_key: "", description: "", model_id: "", system_prompt: "", default_temperature: 0.2, response_format: "text", enabled: true });
    }
  }, [route, open]);

  const save = async () => {
    if (!form.route_key.trim() || !form.model_id) {
      toast({ title: "route_key e model são obrigatórios", variant: "destructive" });
      return;
    }
    const payload = {
      route_key: form.route_key.trim(),
      description: form.description.trim() || null,
      model_id: form.model_id,
      system_prompt: form.system_prompt.trim() || null,
      default_temperature: form.default_temperature,
      response_format: form.response_format,
      enabled: form.enabled,
    };
    const op = route
      ? supabase.from("ai_routes" as never).update(payload as never).eq("id", route.id)
      : supabase.from("ai_routes" as never).insert(payload as never);
    const { error } = await op;
    if (error) {
      toast({ title: "Erro salvando rota", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: route ? "Rota atualizada" : "Rota criada" });
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{route ? "Editar rota" : "Nova rota"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">route_key</Label>
              <Input value={form.route_key} onChange={(e) => setForm({ ...form, route_key: e.target.value })} placeholder="parse_briefing" className="h-9 text-sm font-mono" disabled={!!route} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Modelo</Label>
              <Select value={form.model_id} onValueChange={(v) => setForm({ ...form, model_id: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {models.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.ai_providers?.slug}/{m.model_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Descrição</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">System prompt</Label>
            <Textarea value={form.system_prompt} onChange={(e) => setForm({ ...form, system_prompt: e.target.value })} rows={6} className="text-sm font-mono" />
          </div>
          <div className="grid grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">Temperature</Label>
              <Input type="number" step="0.1" min="0" max="2" value={form.default_temperature} onChange={(e) => setForm({ ...form, default_temperature: parseFloat(e.target.value) || 0 })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">response_format</Label>
              <Select value={form.response_format} onValueChange={(v: RouteResponseFormat) => setForm({ ...form, response_format: v })}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">text</SelectItem>
                  <SelectItem value="json_object">json_object</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })} />
              <Label className="text-xs">Ativa</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ──────────────── Logs ──────────────── */
function LogsTab() {
  const [items, setItems] = useState<AiLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<AiLogRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("ai_logs").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter.trim()) q = q.ilike("action_key", `%${filter.trim()}%`);
    const { data, error } = await q;
    if (error) toast({ title: "Erro logs", description: error.message, variant: "destructive" });
    setItems((data ?? []) as unknown as AiLogRow[]);
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <Brain className="h-5 w-5 text-primary" /> Logs (ai_logs) — últimos 100
        </CardTitle>
        <div className="flex items-center gap-2">
          <Input placeholder="filtrar action_key..." value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 text-xs w-48" />
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">Quando</TableHead>
              <TableHead>action_key</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-20">Latência</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Carregando...</TableCell></TableRow>}
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-xs text-muted-foreground py-6">Nenhum log</TableCell></TableRow>}
            {items.map((l) => {
              const lat = (l.metadata as { latency_ms?: number })?.latency_ms;
              return (
                <TableRow key={l.id}>
                  <TableCell className="text-xs font-mono">{new Date(l.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell className="font-mono text-xs">{l.action_key}</TableCell>
                  <TableCell className="font-mono text-xs">{l.model_label ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={l.status === "success" ? "default" : "destructive"} className="text-xs">{l.status}</Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono">{lat ? `${lat}ms` : "—"}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelected(l)}><Eye className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>Log {selected?.action_key}</DialogTitle></DialogHeader>
          {selected && (
            <div className="space-y-3 text-xs">
              <div><span className="text-muted-foreground">Status: </span><Badge variant={selected.status === "success" ? "default" : "destructive"}>{selected.status}</Badge></div>
              <div><span className="text-muted-foreground">Modelo: </span><span className="font-mono">{selected.model_label ?? "—"}</span></div>
              {selected.error_message && <div><span className="text-muted-foreground">Erro: </span><span className="text-destructive">{selected.error_message}</span></div>}
              <div>
                <p className="text-muted-foreground mb-1">Input</p>
                <pre className="bg-muted p-2 rounded max-h-32 overflow-auto whitespace-pre-wrap">{selected.input_summary ?? "—"}</pre>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Output</p>
                <pre className="bg-muted p-2 rounded max-h-48 overflow-auto whitespace-pre-wrap">{selected.output_summary ?? "—"}</pre>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Metadata</p>
                <pre className="bg-muted p-2 rounded max-h-32 overflow-auto">{JSON.stringify(selected.metadata, null, 2)}</pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
