import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

export default function EmptyState({ icon: Icon, title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="empty-state-icon mb-4 rounded-xl border border-border bg-secondary p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mb-1 text-sm font-medium text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
