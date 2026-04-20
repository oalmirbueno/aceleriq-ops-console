import { getClientColor, getClientInitials } from "@/lib/clientAvatar";
import { cn } from "@/lib/utils";

interface Props {
  name: string;
  /** stable seed for color (use client id when available; falls back to name) */
  seed?: string;
  logoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  /** show subtle ring with the client color */
  ring?: boolean;
}

const SIZE_MAP: Record<NonNullable<Props["size"]>, { box: string; text: string }> = {
  xs: { box: "h-5 w-5",  text: "text-[9px]"  },
  sm: { box: "h-6 w-6",  text: "text-[10px]" },
  md: { box: "h-8 w-8",  text: "text-xs"     },
  lg: { box: "h-10 w-10", text: "text-sm"     },
};

export default function ClientAvatar({
  name, seed, logoUrl, size = "sm", className, ring = false,
}: Props) {
  const color = getClientColor(seed || name);
  const initials = getClientInitials(name);
  const { box, text } = SIZE_MAP[size];

  return (
    <div
      className={cn(
        "relative shrink-0 rounded-md overflow-hidden flex items-center justify-center font-semibold border border-border/60",
        box,
        !logoUrl && color.bg,
        !logoUrl && color.text,
        ring && "ring-2 ring-offset-1 ring-offset-background",
        ring && color.ring,
        className,
      )}
      title={name}
      aria-label={name}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="h-full w-full object-cover"
          loading="lazy"
          onError={(e) => {
            // graceful fallback to initials if image breaks
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      ) : (
        <span className={cn("leading-none uppercase tracking-wide", text)}>{initials}</span>
      )}
    </div>
  );
}
