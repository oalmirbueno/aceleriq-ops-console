import type { ReactNode } from "react";
import { PORTAL_CLIENT_IS_MOCK } from "@/v2/data/portalClient";

interface HeaderV2Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function HeaderV2({ title, subtitle, actions }: HeaderV2Props) {
  return (
    <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border px-8 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">{title}</h1>
          {PORTAL_CLIENT_IS_MOCK && (
            <span className="rounded-sm border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-amber-300">
              demo
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}