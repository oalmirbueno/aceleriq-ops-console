import { useEffect, useState, type ReactNode } from "react";
import {
  PORTAL_MODE,
  subscribeBridgeError,
  type BridgeErrorState,
} from "@/v2/data/portalClient";

interface HeaderV2Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function HeaderV2({ title, subtitle, actions }: HeaderV2Props) {
  const [err, setErr] = useState<BridgeErrorState | null>(null);
  useEffect(() => subscribeBridgeError(setErr), []);

  const badge =
    PORTAL_MODE === "mock"
      ? { label: "demo", cls: "border-amber-400/40 bg-amber-400/10 text-amber-300" }
      : err
      ? { label: "bridge · erro", cls: "border-destructive/50 bg-destructive/10 text-destructive" }
      : { label: "bridge", cls: "border-primary/40 bg-primary/10 text-primary" };

  return (
    <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border px-8 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">{title}</h1>
          <span className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${badge.cls}`}>
            {badge.label}
          </span>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}