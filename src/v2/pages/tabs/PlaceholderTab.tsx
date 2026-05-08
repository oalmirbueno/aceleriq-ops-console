import EmptyState from "@/components/EmptyState";
import type { LucideIcon } from "lucide-react";

export default function PlaceholderTab({
  icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return <EmptyState icon={icon} title={title} description={description} />;
}
