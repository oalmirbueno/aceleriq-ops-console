import { AlertTriangle, RefreshCw } from "lucide-react";
import LoadingState from "@/components/LoadingState";

export function QueryError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <div>
        <h3 className="text-sm font-medium text-foreground">Falha ao conectar com o Portal via portal-bridge</h3>
        <p className="mt-1 text-xs text-destructive/90 max-w-md">{error.message}</p>
      </div>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/20"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Tentar novamente
      </button>
    </div>
  );
}

export { LoadingState };
