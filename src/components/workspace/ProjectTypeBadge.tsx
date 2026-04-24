/**
 * ProjectTypeBadge — badge visual que identifica o tipo de projeto do cliente.
 * Usado em listas, cards e headers para dar contexto visual imediato.
 */
import {
  Sparkles, Megaphone, Archive, Globe, Workflow, Bot,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getProjectTypeMeta, type ProjectType } from "@/lib/projectTypes";
import { cn } from "@/lib/utils";

const ICON_MAP = {
  Sparkles, Megaphone, Archive, Globe, Workflow, Bot,
};

interface Props {
  type: string | null | undefined;
  variant?: "full" | "icon" | "compact";
  className?: string;
}

export default function ProjectTypeBadge({ type, variant = "compact", className }: Props) {
  const meta = getProjectTypeMeta(type);
  const Icon = ICON_MAP[meta.icon as keyof typeof ICON_MAP] ?? Sparkles;

  if (variant === "icon") {
    return (
      <div
        className={cn("flex h-6 w-6 items-center justify-center rounded-md shrink-0", className)}
        style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}35` }}
        title={meta.label}
      >
        <Icon className="h-3 w-3" style={{ color: meta.color }} />
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div
        className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", className)}
        style={{ background: `${meta.color}10`, border: `1px solid ${meta.color}30` }}
      >
        <Icon className="h-3.5 w-3.5" style={{ color: meta.color }} />
        <span className="text-xs font-semibold" style={{ color: meta.color }}>
          {meta.label}
        </span>
      </div>
    );
  }

  // compact (default)
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] gap-1 px-1.5 py-0 h-5", className)}
      style={{ background: `${meta.color}10`, borderColor: `${meta.color}30`, color: meta.color }}
    >
      <Icon className="h-2.5 w-2.5" />
      {meta.shortLabel}
    </Badge>
  );
}
