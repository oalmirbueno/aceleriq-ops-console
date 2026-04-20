/**
 * Deterministic color + initials helpers for client avatars.
 * Same name → same color → consistent recognition across canvas/tabs.
 */

const PALETTE: Array<{ bg: string; text: string; ring: string; hex: string }> = [
  { bg: "bg-[hsl(12_85%_55%)]",  text: "text-white", ring: "ring-[hsl(12_85%_55%)]",  hex: "hsl(12 85% 55%)"  },
  { bg: "bg-[hsl(28_90%_55%)]",  text: "text-white", ring: "ring-[hsl(28_90%_55%)]",  hex: "hsl(28 90% 55%)"  },
  { bg: "bg-[hsl(48_95%_55%)]",  text: "text-black", ring: "ring-[hsl(48_95%_55%)]",  hex: "hsl(48 95% 55%)"  },
  { bg: "bg-[hsl(85_65%_50%)]",  text: "text-black", ring: "ring-[hsl(85_65%_50%)]",  hex: "hsl(85 65% 50%)"  },
  { bg: "bg-[hsl(145_70%_45%)]", text: "text-white", ring: "ring-[hsl(145_70%_45%)]", hex: "hsl(145 70% 45%)" },
  { bg: "bg-[hsl(170_75%_42%)]", text: "text-white", ring: "ring-[hsl(170_75%_42%)]", hex: "hsl(170 75% 42%)" },
  { bg: "bg-[hsl(195_80%_50%)]", text: "text-white", ring: "ring-[hsl(195_80%_50%)]", hex: "hsl(195 80% 50%)" },
  { bg: "bg-[hsl(220_85%_60%)]", text: "text-white", ring: "ring-[hsl(220_85%_60%)]", hex: "hsl(220 85% 60%)" },
  { bg: "bg-[hsl(255_75%_65%)]", text: "text-white", ring: "ring-[hsl(255_75%_65%)]", hex: "hsl(255 75% 65%)" },
  { bg: "bg-[hsl(285_70%_60%)]", text: "text-white", ring: "ring-[hsl(285_70%_60%)]", hex: "hsl(285 70% 60%)" },
  { bg: "bg-[hsl(320_75%_55%)]", text: "text-white", ring: "ring-[hsl(320_75%_55%)]", hex: "hsl(320 75% 55%)" },
  { bg: "bg-[hsl(345_80%_55%)]", text: "text-white", ring: "ring-[hsl(345_80%_55%)]", hex: "hsl(345 80% 55%)" },
];

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

export function getClientColor(seed: string) {
  const idx = hashString(seed || "client") % PALETTE.length;
  return PALETTE[idx];
}

export function getClientInitials(name: string): string {
  const cleaned = (name || "").trim();
  if (!cleaned) return "?";
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
