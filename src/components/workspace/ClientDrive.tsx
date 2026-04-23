/**
 * ClientDrive — pasta de arquivos estilo Drive dentro do workspace.
 * Espelha as 5 pastas do aceleriq.online (AdminFiles.tsx)
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  FolderOpen, Upload, ExternalLink, Trash2, FileText,
  FileImage, Film, Archive, Search, Link2, X, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const BUCKET = "canvas-attachments";
const MAX_SIZE = 50 * 1024 * 1024;
const ACCEPTED = ".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.pptx,.xlsx,.mp4,.zip,.fig,.csv";

const FOLDERS = [
  { id: "estrategicos", label: "Estrategicos",      icon: "📋", hint: "Planejamentos, briefings, estrategias" },
  { id: "contratos",    label: "Contratos",          icon: "📄", hint: "Contratos, propostas, termos" },
  { id: "materiais",    label: "Materiais Graficos", icon: "🎨", hint: "Criativos, artes, logos, fotos" },
  { id: "relatorios",   label: "Relatorios",         icon: "📊", hint: "Relatorios de resultado e metricas" },
  { id: "operacionais", label: "Operacionais",       icon: "⚙",  hint: "Documentos internos de operacao" },
];

const APPROVAL_META: Record<string, { label: string; color: string }> = {
  pending:  { label: "Aguardando", color: "text-amber-400 bg-amber-400/10 border-amber-400/30" },
  approved: { label: "Aprovado",   color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30" },
  revision: { label: "Em revisao", color: "text-blue-400 bg-blue-400/10 border-blue-400/30" },
  rejected: { label: "Rejeitado",  color: "text-red-400 bg-red-400/10 border-red-400/30" },
};

interface DriveFile {
  id: string;
  title: string;
  file_url: string | null;
  external_url: string | null;
  validation_status: string;
  description: string | null;
  folder: string;
  storage_path: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  synced_to_portal: boolean;
}

interface Props {
  workspaceId: string;
  clientId: string;
  clientName?: string;
}

function FileIcon({ name, type }: { name: string; type?: string | null }) {
  const ext = (name || "").split(".").pop()?.toLowerCase() || type || "";
  if (["jpg","jpeg","png","gif","webp","svg"].includes(ext)) return <FileImage className="h-4 w-4 text-pink-400" />;
  if (["mp4","mov","webm"].includes(ext)) return <Film className="h-4 w-4 text-purple-400" />;
  if (["zip","rar","7z"].includes(ext)) return <Archive className="h-4 w-4 text-amber-400" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function formatBytes(bytes?: number | null) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function relTime(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "agora";
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h";
  return Math.floor(h / 24) + "d";
}

export default function ClientDrive({ workspaceId, clientId, clientName }: Props) {
  const [folder, setFolder] = useState("estrategicos");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [addUrlLabel, setAddUrlLabel] = useState("");
  const [addUrlOpen, setAddUrlOpen] = useState(false);
  const [preview, setPreview] = useState<DriveFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetch = useCallback(async () => {
    const { data } = await supabase
      .from("assets")
      .select("id, title, external_url, validation_status, description, storage_path, created_at, metadata")
      .eq("workspace_id", workspaceId)
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });

    const mapped: DriveFile[] = (data ?? []).map((f: any) => {
      const m = (f.metadata as Record<string, unknown>) ?? {};
      return {
        id: f.id,
        title: f.title,
        file_url: (m.file_url as string) ?? f.external_url ?? null,
        external_url: f.external_url,
        validation_status: (m.approval_status as string) ?? f.validation_status ?? "pending",
        description: f.description,
        folder: (m.folder as string) ?? "estrategicos",
        storage_path: f.storage_path,
        file_type: (m.file_type as string) ?? null,
        file_size: (m.file_size as number) ?? null,
        synced_to_portal: Boolean(m.synced_to_portal),
        created_at: f.created_at,
      };
    });
    setFiles(mapped);
    setLoading(false);
  }, [workspaceId, clientId]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleUpload = useCallback(async (file: File) => {
    if (file.size > MAX_SIZE) { toast({ title: "Arquivo muito grande", description: "Limite: 50MB", variant: "destructive" }); return; }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = clientId + "/" + workspaceId + "/" + folder + "/" + Date.now() + "_" + file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
    if (upErr) { toast({ title: "Erro no upload", description: upErr.message, variant: "destructive" }); setUploading(false); return; }
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365 * 3);
    await supabase.from("assets").insert({
      workspace_id: workspaceId, client_id: clientId,
      asset_type: "deliverable_link", title: file.name, validation_status: "draft",
      storage_path: path,
      metadata: { folder, file_url: signed?.signedUrl ?? null, file_type: ext, file_size: file.size, approval_status: "pending", synced_to_portal: false },
      happened_at: new Date().toISOString(),
    });
    setUploading(false);
    toast({ title: "Arquivo enviado" });
    fetch();
  }, [workspaceId, clientId, folder, fetch]);

  const handleAddLink = useCallback(async () => {
    if (!addUrl.trim()) return;
    await supabase.from("assets").insert({
      workspace_id: workspaceId, client_id: clientId,
      asset_type: "deliverable_link", title: addUrlLabel.trim() || addUrl, external_url: addUrl.trim(),
      validation_status: "draft",
      metadata: { folder, approval_status: "pending", synced_to_portal: false },
      happened_at: new Date().toISOString(),
    });
    setAddUrl(""); setAddUrlLabel(""); setAddUrlOpen(false);
    toast({ title: "Link adicionado" });
    fetch();
  }, [workspaceId, clientId, folder, addUrl, addUrlLabel, fetch]);

  const handleMove = useCallback(async (id: string, newFolder: string) => {
    const { data: curr } = await supabase.from("assets").select("metadata").eq("id", id).single();
    const m = ((curr?.metadata as Record<string, unknown>) ?? {});
    await supabase.from("assets").update({ metadata: { ...m, folder: newFolder }, updated_at: new Date().toISOString() }).eq("id", id);
    toast({ title: "Movido para " + FOLDERS.find(f => f.id === newFolder)?.label });
    fetch();
  }, [fetch]);

  const handleApproval = useCallback(async (id: string, status: string) => {
    const { data: curr } = await supabase.from("assets").select("metadata").eq("id", id).single();
    const m = ((curr?.metadata as Record<string, unknown>) ?? {});
    const updated = { ...m, approval_status: status };
    if (status === "approved") {
      try {
        await supabase.functions.invoke("sync-to-portal", { body: { event: "file_approved", workspaceId, clientId, assetId: id } });
        updated.synced_to_portal = true;
      } catch { /* best effort */ }
    }
    await supabase.from("assets").update({ metadata: updated, updated_at: new Date().toISOString() }).eq("id", id);
    fetch();
  }, [workspaceId, clientId, fetch]);

  const handleDelete = useCallback(async (f: DriveFile) => {
    if (!confirm("Excluir \"" + f.title + "\"?")) return;
    if (f.storage_path) await supabase.storage.from(BUCKET).remove([f.storage_path]);
    await supabase.from("assets").delete().eq("id", f.id);
    toast({ title: "Removido" });
    if (preview?.id === f.id) setPreview(null);
    fetch();
  }, [preview, fetch]);

  const visible = files.filter(f => {
    if (f.folder !== folder) return false;
    const q = search.trim().toLowerCase();
    return !q || f.title.toLowerCase().includes(q);
  });

  return (
    <div className="flex h-full min-h-[500px] rounded-lg border border-border/60 bg-background overflow-hidden">
      {/* Sidebar */}
      <div className="w-52 shrink-0 border-r border-border/60 bg-card/40 flex flex-col">
        <div className="px-3 py-3 border-b border-border/40">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {clientName ?? "Pastas do cliente"}
          </p>
        </div>
        <nav className="flex-1 py-2 space-y-0.5 px-2">
          {FOLDERS.map((f) => {
            const count = files.filter(x => x.folder === f.id).length;
            const active = folder === f.id;
            return (
              <button key={f.id} type="button" onClick={() => setFolder(f.id)}
                className={cn("w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-left text-xs transition-colors",
                  active ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground")}>
                <span className="flex items-center gap-2 truncate"><span>{f.icon}</span><span className="truncate">{f.label}</span></span>
                {count > 0 && <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full shrink-0", active ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground")}>{count}</span>}
              </button>
            );
          })}
        </nav>
        <div className="p-2 border-t border-border/40 space-y-1.5">
          <input ref={fileRef} type="file" accept={ACCEPTED} multiple className="hidden"
            onChange={(e) => { Array.from(e.target.files ?? []).forEach(f => handleUpload(f)); e.target.value = ""; }} />
          <Button onClick={() => fileRef.current?.click()} disabled={uploading} size="sm" className="w-full h-7 text-xs gap-1.5"
            style={{ background: "hsl(var(--primary)/0.15)", color: "hsl(var(--primary))", border: "1px solid hsl(var(--primary)/0.3)" }}>
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            Upload
          </Button>
          <Button onClick={() => setAddUrlOpen(v => !v)} size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5">
            <Link2 className="h-3 w-3" /> Link externo
          </Button>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/40 bg-card/20">
          <FolderOpen className="h-4 w-4 shrink-0 text-primary/70" />
          <p className="text-sm font-medium">{FOLDERS.find(f => f.id === folder)?.label}</p>
          <p className="text-xs text-muted-foreground hidden sm:block">— {FOLDERS.find(f => f.id === folder)?.hint}</p>
          <div className="flex-1" />
          <div className="relative w-44">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="h-7 pl-7 text-xs" />
          </div>
        </div>

        {addUrlOpen && (
          <div className="flex items-center gap-2 px-4 py-2 border-b border-border/40 bg-secondary/20">
            <Input value={addUrlLabel} onChange={e => setAddUrlLabel(e.target.value)} placeholder="Nome" className="h-7 text-xs w-36" />
            <Input value={addUrl} onChange={e => setAddUrl(e.target.value)} placeholder="https://..." className="h-7 text-xs flex-1"
              onKeyDown={e => e.key === "Enter" && handleAddLink()} />
            <Button onClick={handleAddLink} size="sm" className="h-7 text-xs">OK</Button>
            <Button onClick={() => setAddUrlOpen(false)} size="sm" variant="ghost" className="h-7 w-7 p-0"><X className="h-3 w-3" /></Button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">Pasta vazia</p>
              <p className="text-xs mt-1">Arraste arquivos ou use Upload</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border/40 text-muted-foreground">
                  <th className="text-left font-normal px-4 py-2 w-8"></th>
                  <th className="text-left font-normal px-2 py-2">Nome</th>
                  <th className="text-left font-normal px-2 py-2 w-28">Aprovacao</th>
                  <th className="text-left font-normal px-2 py-2 w-20 hidden md:table-cell">Tamanho</th>
                  <th className="text-left font-normal px-2 py-2 w-20 hidden lg:table-cell">Data</th>
                  <th className="text-right font-normal px-4 py-2 w-24">Acoes</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((f) => {
                  const href = f.file_url ?? f.external_url ?? null;
                  const am = APPROVAL_META[f.validation_status] ?? APPROVAL_META.pending;
                  return (
                    <tr key={f.id} className="border-b border-border/20 hover:bg-secondary/20 group transition-colors">
                      <td className="px-4 py-2.5"><FileIcon name={f.title} type={f.file_type} /></td>
                      <td className="px-2 py-2.5 max-w-0">
                        <button type="button" onClick={() => setPreview(f)}
                          className="text-left text-foreground/90 hover:text-primary truncate max-w-full block font-medium transition-colors">{f.title}</button>
                        {f.description && <p className="text-muted-foreground/60 truncate text-[10px] mt-0.5">{f.description}</p>}
                      </td>
                      <td className="px-2 py-2.5">
                        <Select value={f.validation_status} onValueChange={v => handleApproval(f.id, v)}>
                          <SelectTrigger className="h-6 border-0 bg-transparent focus:ring-0 p-0 text-[10px] w-24">
                            <span className={cn("px-1.5 py-0.5 rounded-full border text-[10px]", am.color)}>
                              {f.synced_to_portal && "● "}{am.label}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending" className="text-xs">Aguardando</SelectItem>
                            <SelectItem value="revision" className="text-xs">Em revisao</SelectItem>
                            <SelectItem value="approved" className="text-xs">Aprovado</SelectItem>
                            <SelectItem value="rejected" className="text-xs">Rejeitado</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-2.5 text-muted-foreground hidden md:table-cell">{formatBytes(f.file_size)}</td>
                      <td className="px-2 py-2.5 text-muted-foreground hidden lg:table-cell">{relTime(f.created_at)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {href && (
                            <a href={href} target="_blank" rel="noreferrer">
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0"><ExternalLink className="h-3 w-3" /></Button>
                            </a>
                          )}
                          <Select onValueChange={v => handleMove(f.id, v)}>
                            <SelectTrigger className="h-6 w-6 p-0 border-0 bg-transparent focus:ring-0 [&>svg]:hidden">
                              <FolderOpen className="h-3 w-3 text-muted-foreground" />
                            </SelectTrigger>
                            <SelectContent>
                              {FOLDERS.filter(x => x.id !== folder).map(x => (
                                <SelectItem key={x.id} value={x.id} className="text-xs">{x.icon} {x.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button onClick={() => handleDelete(f)} size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive/60 hover:text-destructive">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div
          className="m-3 mt-0 rounded-md border border-dashed border-border/40 py-2 text-center text-[11px] text-muted-foreground cursor-pointer hover:border-primary/40 hover:text-primary/70 transition-colors"
          onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("border-primary/60"); }}
          onDragLeave={e => e.currentTarget.classList.remove("border-primary/60")}
          onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("border-primary/60"); Array.from(e.dataTransfer.files).forEach(f => handleUpload(f)); }}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="h-3 w-3 inline mr-1" />
          Arraste ou clique para fazer upload
        </div>
      </div>

      {/* Preview panel */}
      {preview && (
        <div className="w-56 shrink-0 border-l border-border/60 bg-card/40 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/40">
            <p className="text-xs font-semibold truncate">{preview.title}</p>
            <button type="button" onClick={() => setPreview(null)}><X className="h-3.5 w-3.5 text-muted-foreground" /></button>
          </div>
          <div className="p-3 space-y-2.5 flex-1 overflow-y-auto text-xs text-muted-foreground">
            {preview.file_url && ["jpg","jpeg","png","gif","webp"].some(e => preview.file_type === e) && (
              <img src={preview.file_url} alt={preview.title} className="w-full rounded border border-border/40 object-cover max-h-28" />
            )}
            <div><p className="text-[10px] uppercase tracking-wider text-foreground/50">Pasta</p><p>{FOLDERS.find(f => f.id === preview.folder)?.label}</p></div>
            {preview.description && <div><p className="text-[10px] uppercase tracking-wider text-foreground/50">Descricao</p><p>{preview.description}</p></div>}
            <div><p className="text-[10px] uppercase tracking-wider text-foreground/50">Adicionado</p><p>{new Date(preview.created_at).toLocaleDateString("pt-BR")}</p></div>
            {preview.file_size && <div><p className="text-[10px] uppercase tracking-wider text-foreground/50">Tamanho</p><p>{formatBytes(preview.file_size)}</p></div>}
            <div><p className="text-[10px] uppercase tracking-wider text-foreground/50">Portal</p>
              <p className={preview.synced_to_portal ? "text-emerald-400" : "text-amber-400/70"}>{preview.synced_to_portal ? "Sincronizado" : "Pendente"}</p>
            </div>
            {(preview.file_url ?? preview.external_url) && (
              <a href={preview.file_url ?? preview.external_url ?? ""} target="_blank" rel="noreferrer">
                <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1.5 mt-1">
                  <ExternalLink className="h-3 w-3" /> Abrir
                </Button>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
