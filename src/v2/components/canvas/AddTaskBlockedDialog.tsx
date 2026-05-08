import { Lock, ExternalLink } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export default function AddTaskBlockedDialog({
  open, onOpenChange, portalUrl, milestoneTitle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  portalUrl: string;
  milestoneTitle?: string | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/15 grid place-items-center">
              <Lock className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-base">Adicionar task</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed pt-2">
            Na <span className="text-foreground font-medium">Fase 3</span>, este botão criará uma task real no Portal
            {milestoneTitle ? <> dentro do milestone <span className="text-foreground font-medium">{milestoneTitle}</span></> : null}.
            <br /><br />
            Hoje o OPS V2 está em modo <span className="text-foreground font-medium">read-only</span>: nenhuma escrita é feita no Portal.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex items-center justify-end gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="rounded-md border border-border bg-background px-3 h-8 text-xs text-muted-foreground hover:text-foreground"
          >
            Entendi
          </button>
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-3 h-8 text-xs text-primary hover:bg-primary/15"
          >
            <ExternalLink className="h-3 w-3" /> Criar no Portal
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}