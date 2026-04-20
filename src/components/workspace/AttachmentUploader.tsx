import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Upload, ExternalLink, X, Loader2, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import AttachmentPreview from "./AttachmentPreview";

export interface AttachmentItem {
  label: string;
  url: string;
  type?: string;
  storage_path?: string;
  size?: number;
}

interface Props {
  workspaceId: string;
  nodeId: string;
  attachments: AttachmentItem[];
  onChange: (next: AttachmentItem[]) => void;
}

const BUCKET = "canvas-attachments";
const MAX_SIZE = 25 * 1024 * 1024; // 25MB

function inferTypeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg","jpeg","png","webp","gif","svg"].includes(ext)) return "image";
  if (["mp4","mov","webm"].includes(ext)) return "video";
  if (["pdf"].includes(ext)) return "pdf";
  if (["doc","docx"].includes(ext)) return "doc";
  if (["xls","xlsx","csv"].includes(ext)) return "sheet";
  if (["fig"].includes(ext)) return "figma";
  return ext || "file";
}

function formatSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentUploader({ workspaceId, nodeId, attachments, onChange }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress(0);

    const newAttachments: AttachmentItem[] = [];
    let i = 0;
    for (const file of Array.from(files)) {
      i++;
      if (file.size > MAX_SIZE) {
        toast({ title: "Arquivo muito grande", description: `${file.name} excede 25MB`, variant: "destructive" });
        continue;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${workspaceId}/${nodeId}/${Date.now()}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type || undefined });

      if (upErr) {
        toast({ title: "Erro no upload", description: `${file.name}: ${upErr.message}`, variant: "destructive" });
        continue;
      }

      const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);

      newAttachments.push({
        label: file.name,
        url: signed?.signedUrl ?? "",
        type: inferTypeFromName(file.name),
        storage_path: path,
        size: file.size,
      });

      setProgress(Math.round((i / files.length) * 100));
    }

    if (newAttachments.length > 0) {
      onChange([...attachments, ...newAttachments]);
      toast({ title: "Upload concluído", description: `${newAttachments.length} arquivo(s) enviado(s)` });
    }

    setUploading(false);
    setProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = async (idx: number) => {
    const att = attachments[idx];
    if (att.storage_path) {
      await supabase.storage.from(BUCKET).remove([att.storage_path]);
    }
    onChange(attachments.filter((_, i) => i !== idx));
  };

  const updateLabel = (idx: number, label: string) => {
    onChange(attachments.map((a, i) => (i === idx ? { ...a, label } : a)));
  };

  // Refresh signed URL if expired (client clicks → regenerate)
  const refreshUrl = async (idx: number) => {
    const att = attachments[idx];
    if (!att.storage_path) return att.url;
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(att.storage_path, 60 * 60 * 24 * 365);
    if (data?.signedUrl) {
      onChange(attachments.map((a, i) => (i === idx ? { ...a, url: data.signedUrl } : a)));
      return data.signedUrl;
    }
    return att.url;
  };

  return (
    <div className="space-y-2">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {attachments.length === 0 && !uploading && (
        <div
          className="border-2 border-dashed border-border rounded-md p-6 text-center cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        >
          <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Arraste arquivos aqui ou <span className="text-primary font-medium">clique para escolher</span>
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">Até 25MB por arquivo</p>
        </div>
      )}

      {attachments.map((a, i) => (
        <div key={i} className="rounded-md border border-border p-2 space-y-1.5 bg-card/40">
          <div className="flex items-center gap-1.5">
            <FileIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              value={a.label}
              onChange={(e) => updateLabel(i, e.target.value)}
              className="h-7 text-xs flex-1 border-0 px-1 focus-visible:ring-0 bg-transparent font-medium"
            />
            {a.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground uppercase">
                {a.type}
              </span>
            )}
            {a.url && (
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={async () => {
                  const url = await refreshUrl(i);
                  if (url) window.open(url, "_blank", "noopener,noreferrer");
                }}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeAttachment(i)}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          {a.size != null && (
            <p className="text-[10px] text-muted-foreground pl-5">{formatSize(a.size)}</p>
          )}
        </div>
      ))}

      {uploading && (
        <div className="space-y-1.5 rounded-md border border-border p-3 bg-muted/30">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Enviando arquivos…
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {attachments.length > 0 && !uploading && (
        <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
          <Paperclip className="h-3.5 w-3.5 mr-1" /> Adicionar mais arquivos
        </Button>
      )}
    </div>
  );
}
