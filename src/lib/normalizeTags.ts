/** Normalizes a tags input (string, string[], null, undefined) into a clean string[]. Never returns null. */
export function normalizeTags(raw: string | string[] | null | undefined): string[] {
  if (!raw) return [];
  const arr = typeof raw === "string" ? raw.split(",") : raw;
  return arr.map((t) => t.trim()).filter(Boolean);
}
