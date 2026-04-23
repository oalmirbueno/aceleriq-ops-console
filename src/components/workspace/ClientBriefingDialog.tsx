/**
 * ClientBriefingDialog — wrapper em Dialog do ClientEssentialBriefing.
 * Permite editar o briefing perene de um cliente sem sair do ClientsPage.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import ClientEssentialBriefing from "./ClientEssentialBriefing";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  clientName: string;
  initialMetadata?: Record<string, unknown> | null;
  onSaved?: () => void;
}

export default function ClientBriefingDialog({ open, onOpenChange, clientId, clientName, initialMetadata, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base">Briefing de {clientName}</DialogTitle>
          <DialogDescription className="text-xs">
            Informações perenes de identidade. Usadas em todos os workspaces deste cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          <ClientEssentialBriefing
            clientId={clientId}
            initialMetadata={initialMetadata}
            onSaved={onSaved}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
