/**
 * Briefing link token utilities.
 * Encodes workspace + client IDs into a shareable URL-safe token.
 * Also manages localStorage persistence for client-side auto-save.
 */

interface BriefingTokenPayload {
  workspaceId: string;
  clientId: string;
  createdAt: number;
}

export function encodeBriefingToken(workspaceId: string, clientId: string): string {
  const payload: BriefingTokenPayload = {
    workspaceId,
    clientId,
    createdAt: Date.now(),
  };
  return btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeBriefingToken(token: string): BriefingTokenPayload | null {
  try {
    const padded = token.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const payload = JSON.parse(json);
    if (payload.workspaceId && payload.clientId) return payload;
    return null;
  } catch {
    return null;
  }
}

const STORAGE_PREFIX = "aceleriq_briefing_";

export function saveBriefingProgress(token: string, answers: Record<string, string>) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${token}`, JSON.stringify({
      answers,
      updatedAt: Date.now(),
    }));
  } catch { /* quota exceeded — silent */ }
}

export function loadBriefingProgress(token: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${token}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.answers ?? null;
  } catch {
    return null;
  }
}

export function clearBriefingProgress(token: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${token}`);
  } catch { /* silent */ }
}

export function generateBriefingUrl(token: string): string {
  return `${window.location.origin}/briefing/${token}`;
}
