import type { ReactNode } from "react";

interface AppHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function AppHeader({ title, subtitle, actions }: AppHeaderProps) {
  return (
    <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-border px-8 py-4">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
