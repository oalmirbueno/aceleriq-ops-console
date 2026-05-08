import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import {
  PORTAL_MODE,
  subscribeBridgeError,
  clearBridgeError,
  type BridgeErrorState,
} from "@/v2/data/portalClient";

export default function BridgeErrorBanner() {
  const [err, setErr] = useState<BridgeErrorState | null>(null);

  useEffect(() => subscribeBridgeError(setErr), []);

  if (PORTAL_MODE !== "bridge" || !err) return null;

  return (
    <div className="border-b border-destructive/40 bg-destructive/10 px-8 py-2.5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-destructive">
              Falha ao consultar Portal ({err.action})
            </p>
            <p className="text-[11px] text-destructive/80 truncate">
              {err.message} — exibindo nada em vez de dados mock.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => {
              clearBridgeError();
              window.location.reload();
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/20"
          >
            <RefreshCw className="h-3 w-3" />
            Tentar novamente
          </button>
        </div>
      </div>
    </div>
  );
}
