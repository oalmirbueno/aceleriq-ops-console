import { useMemo, useState } from "react";
import { Copy, ExternalLink, Link2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { encodeBriefingToken, generateBriefingUrl } from "@/lib/briefingToken";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName: string;
}

export default function GenerateBriefingLinkDialog({ open, onOpenChange, workspaceId, clientId, clientName }: Props) {
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    const token = encodeBriefingToken(workspaceId, clientId);
    return generateBriefingUrl(token);
  }, [workspaceId, clientId, open]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copiado" });
    window.setTimeout(() => setCopied(false), 1600);
  };

  const handlePreview = () => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            Link oficial do briefing
          </DialogTitle>
          <DialogDescription>
            Envie este link para {clientName}. Ele abre direto no briefing, sem login e no mesmo domínio publicado do sistema.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input readOnly value={url} className="text-xs" />
            <Button type="button" variant="outline" onClick={handleCopy}>
              <Copy className="h-4 w-4" /> {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <p>• Link curto no domínio publicado do app</p>
            <p>• Cliente responde sem entrar no sistema</p>
            <p>• Progresso fica salvo automaticamente se ele sair e voltar</p>
            <p>• Ao confirmar, o briefing entra no Contexto como documento mestre único</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handlePreview}>
            <ExternalLink className="h-4 w-4" /> Abrir link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
