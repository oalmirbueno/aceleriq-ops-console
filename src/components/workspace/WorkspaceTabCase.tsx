import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, FileText, Sparkles, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import CaseRecordDialog, { type CaseRecord } from "./CaseRecordDialog";
import {
  CASE_STATUS_OPTIONS, getCaseStatusColor, getCaseStatusLabel,
  seedCaseFromBeforeAfter, type CaseStatus, type BeforeAfterSeed,
} from "./caseConstants";

interface Props {
  workspaceId: string;
  clientId: string;
  onTimelineRefresh?: () => Promise<void> | void;
}

interface BARecordLite {
  id: string;
  title: string;
  status: string;
}

export default function WorkspaceTabCase({ workspaceId, clientId, onTimelineRefresh }: Props) {
  const [records, setRecords] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<CaseRecord | null>(null);
  const [seed, setSeed] = useState<Partial<CaseRecord> | null>(null);

  const [generateOpen, setGenerateOpen] = useState(false);
  const [baOptions, setBaOptions] = useState<BARecordLite[]>([]);
  const [selectedBaId, setSelectedBaId] = useState<string>("");
  const [generating, setGenerating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("case_records")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (statusFilter !== "all") q = q.eq("status", statusFilter);

    const { data, error } = await q;
    if (error) toast({ title: "Erro ao carregar cases", description: error.message, variant: "destructive" });
    setRecords((data ?? []) as CaseRecord[]);
    setLoading(false);
  }, [workspaceId, statusFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of records) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [records]);

  const openCreate = () => { setEditing(null); setSeed(null); setEditorOpen(true); };
  const openEdit = (r: CaseRecord) => { setEditing(r); setSeed(null); setEditorOpen(true); };

  const openGenerate = async () => {
    setSelectedBaId("");
    const { data, error } = await supabase
      .from("before_after_records")
      .select("id, title, status")
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false, nullsFirst: false });
    if (error) {
      toast({ title: "Erro ao carregar Before/After", description: error.message, variant: "destructive" });
      return;
    }
    setBaOptions((data ?? []) as BARecordLite[]);
    setGenerateOpen(true);
  };

  const handleGenerate = async () => {
    if (!selectedBaId) return;
    setGenerating(true);
    const { data, error } = await supabase
      .from("before_after_records")
      .select("*")
      .eq("id", selectedBaId)
      .single();
    if (error || !data) {
      toast({ title: "Erro ao carregar registro base", description: error?.message ?? "", variant: "destructive" });
      setGenerating(false);
      return;
    }
    const seedRecord = seedCaseFromBeforeAfter(data as unknown as BeforeAfterSeed);
    setSeed(seedRecord as unknown as Partial<CaseRecord>);
    setEditing(null);
    setGenerating(false);
    setGenerateOpen(false);
    setEditorOpen(true);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!confirm(`Apagar case "${title}"?`)) return;
    const { error } = await supabase.from("case_records").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao apagar", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Case apagado" });
    await fetchData();
    await onTimelineRefresh?.();
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-8 text-center animate-fade-in">Carregando cases...</p>;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-medium text-foreground">Cases consolidados</p>
          <p className="text-xs text-muted-foreground">
            {records.length} {records.length === 1 ? "case" : "cases"} · camada legível e editável de prova consolidada
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={openGenerate}>
            <Sparkles className="h-4 w-4 mr-1" /> Gerar de Before/After
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Novo case
          </Button>
        </div>
      </div>

      {/* Status counts + filter */}
      <div className="flex items-center gap-2 flex-wrap border-t border-border pt-3">
        <Layers className="h-4 w-4 text-muted-foreground" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {CASE_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5 ml-auto">
          {CASE_STATUS_OPTIONS.map((o) => (
            <Badge key={o.value} variant="outline" className={`text-[10px] ${getCaseStatusColor(o.value)}`}>
              {o.label}: {counts[o.value] ?? 0}
            </Badge>
          ))}
        </div>
      </div>

      {/* List */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 animate-fade-in">
          <FileText className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhum case ainda</p>
          <p className="text-xs text-muted-foreground max-w-md text-center">
            Gere um case a partir de um Before/After existente ou crie manualmente. Cases consolidam prova de transformação em material legível e reaproveitável.
          </p>
          <div className="flex gap-2 mt-4">
            <Button size="sm" variant="outline" onClick={openGenerate}>
              <Sparkles className="h-4 w-4 mr-1" /> Gerar de Before/After
            </Button>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" /> Criar manualmente
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {records.map((r) => {
            const md = (r.metadata ?? {}) as Record<string, unknown>;
            const baTitle = (md.before_after_title_snapshot as string | undefined) ?? null;
            const assetCount = Array.isArray(md.asset_ids) ? (md.asset_ids as string[]).length : 0;
            const metricCount = Array.isArray(md.metric_snapshot_ids) ? (md.metric_snapshot_ids as string[]).length : 0;
            const updated = r.updated_at ?? r.created_at;
            return (
              <Card
                key={r.id}
                className="hover:border-primary/40 transition-colors cursor-pointer"
                onClick={() => openEdit(r)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{r.title}</span>
                        <Badge variant="outline" className={`text-[10px] ${getCaseStatusColor(r.status)}`}>
                          {getCaseStatusLabel(r.status)}
                        </Badge>
                        {baTitle && (
                          <Badge variant="outline" className="text-[10px] bg-secondary text-secondary-foreground border-border">
                            Base: {baTitle}
                          </Badge>
                        )}
                      </div>
                      {r.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.summary}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                        <span>{assetCount} {assetCount === 1 ? "evidência" : "evidências"}</span>
                        <span>• {metricCount} {metricCount === 1 ? "métrica" : "métricas"}</span>
                        {r.results && <span className="truncate max-w-[200px]">• {r.results.split("\n")[0]}</span>}
                        <span className="ml-auto">Atualizado em {new Date(updated).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleDelete(r.id, r.title); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <CaseRecordDialog
        open={editorOpen}
        onOpenChange={(o) => { setEditorOpen(o); if (!o) { setEditing(null); setSeed(null); } }}
        workspaceId={workspaceId}
        clientId={clientId}
        record={editing}
        seed={seed}
        onSaved={fetchData}
        onTimelineRefresh={onTimelineRefresh}
      />

      {/* Generate from Before/After picker */}
      <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Gerar case de Before/After</DialogTitle>
            <DialogDescription>
              Pré-preenchimento determinístico, sem IA. Você poderá editar todos os blocos depois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Select value={selectedBaId} onValueChange={setSelectedBaId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecionar Before/After" /></SelectTrigger>
              <SelectContent>
                {baOptions.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum Before/After disponível</div>
                ) : baOptions.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="truncate">{b.title}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">({b.status})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateOpen(false)} disabled={generating}>Cancelar</Button>
            <Button onClick={handleGenerate} disabled={!selectedBaId || generating}>
              {generating ? "Gerando..." : "Gerar rascunho"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
