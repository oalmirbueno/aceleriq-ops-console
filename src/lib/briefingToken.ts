interface BriefingTokenPayload {
  workspaceId: string;
  clientId: string;
  createdAt: number;
  nonce: string;
}

const STORAGE_PREFIX = "aceleriq_briefing_public_";
const PUBLISHED_ORIGIN = "https://acel-ops-core.lovable.app";

function toBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

export function encodeBriefingToken(workspaceId: string, clientId: string): string {
  const payload: BriefingTokenPayload = {
    workspaceId,
    clientId,
    createdAt: Date.now(),
    nonce: crypto.randomUUID().slice(0, 8),
  };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeBriefingToken(token: string): BriefingTokenPayload | null {
  try {
    const parsed = JSON.parse(fromBase64Url(token)) as BriefingTokenPayload;
    if (!parsed.workspaceId || !parsed.clientId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function generateBriefingUrl(token: string): string {
  return `${PUBLISHED_ORIGIN}/b/${token}`;
}

export function saveBriefingProgress(token: string, answers: Record<string, string>) {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${token}`, JSON.stringify({ answers, updatedAt: Date.now() }));
  } catch {
    // ignore local storage failures
  }
}

export function loadBriefingProgress(token: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${token}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { answers?: Record<string, string> };
    return parsed.answers ?? null;
  } catch {
    return null;
  }
}

export function clearBriefingProgress(token: string) {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${token}`);
  } catch {
    // ignore
  }
}
