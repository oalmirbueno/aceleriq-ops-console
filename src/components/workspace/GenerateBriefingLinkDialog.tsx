import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, ExternalLink } from "lucide-react";
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

  const token = encodeBriefingToken(workspaceId, clientId);
  const url = generateBriefingUrl(token);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    toast({ title: "Link copiado!" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link do Briefing para o Cliente</DialogTitle>
          <DialogDescription>
            Envie este link para <strong>{clientName}</strong> preencher o Briefing de Estruturação Empresarial.
            O progresso do cliente é salvo automaticamente — se ele sair e voltar, não perde nada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex gap-2">
            <Input value={url} readOnly className="text-xs font-mono" />
            <Button size="icon" variant="outline" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <div className="text-[11px] text-muted-foreground space-y-1">
            <p>✓ O cliente pode preencher sem criar conta</p>
            <p>✓ Progresso salvo automaticamente no navegador</p>
            <p>✓ O cliente pode baixar o briefing em PDF</p>
            <p>✓ Ao enviar, o briefing aparece automaticamente na aba Contexto</p>
            <p>✓ Um evento é registrado na Timeline quando o cliente enviar</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <a href={url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-1" /> Pré-visualizar
            </Button>
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
