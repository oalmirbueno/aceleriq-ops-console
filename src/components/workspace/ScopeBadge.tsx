import { Badge } from "@/components/ui/badge";
import { type ScopeClassification, getScopeLabel, getScopeColor } from "./aceleraConstants";

interface ScopeBadgeProps {
  scope: ScopeClassification;
  className?: string;
}

export default function ScopeBadge({ scope, className = "" }: ScopeBadgeProps) {
  return (
    <Badge variant="outline" className={`text-[10px] ${getScopeColor(scope)} ${className}`}>
      {getScopeLabel(scope)}
    </Badge>
  );
}
