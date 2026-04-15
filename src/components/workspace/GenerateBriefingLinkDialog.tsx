import { useState, useMemo } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Check, ExternalLink, Building2, Bot } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { encodeBriefingToken, generateBriefingUrl, type BriefingKind, BRIEFING_KIND_LABELS, BRIEFING_KIND_DESCRIPTIONS } from "@/lib/briefingToken";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  clientId: string;
  clientName: string;
  /** Pre-select a briefing type */
  defaultBriefingType?: BriefingKind;
}

const BRIEFING_OPTIONS: { key: BriefingKind; icon: typeof Building2 }[] = [
  { key: "enterprise_structuring", icon: Building2 },
  { key: "ai_automation", icon: Bot },
];

export default function GenerateBriefingLinkDialog({ open, onOpenChange, workspaceId, clientId, clientName, defaultBriefingType }: Props) {
  const [copied, setCopied] = useState(false);
  const [selectedType, setSelectedType] = useState<BriefingKind>(defaultBriefingType ?? "enterprise_structuring");

  // Stable token — only changes when workspaceId, clientId or selectedType change
  const token = useMemo(
    () => encodeBriefingToken(workspaceId, clientId, selectedType),
    [workspaceId, clientId, selectedType]
  );
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
          <DialogTitle>Enviar Briefing ao Cliente</DialogTitle>
          <DialogDescription>
            Escolha o tipo de briefing e envie o link para <strong>{clientName}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type selector */}
          <div className="grid grid-cols-2 gap-2">
            {BRIEFING_OPTIONS.map(({ key, icon: Icon }) => (
              <button
                key={key}
                onClick={() => { setSelectedType(key); setCopied(false); }}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  selectedType === key
                    ? "border-primary bg-primary/10"
                    : "border-border/50 bg-muted/20 hover:border-border"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-4 w-4 ${selectedType === key ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-medium ${selectedType === key ? "text-foreground" : "text-muted-foreground"}`}>
                    {BRIEFING_KIND_LABELS[key]}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  {BRIEFING_KIND_DESCRIPTIONS[key]}
                </p>
              </button>
            ))}
          </div>

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
