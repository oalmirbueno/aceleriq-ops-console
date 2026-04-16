/**
 * Briefing link token utilities.
 * Supports both signed tokens (payload.signature) and legacy base64url tokens.
 * Client-side decode is for UX only — authorization happens server-side.
 */

export type BriefingKind = "enterprise_structuring" | "ai_automation";

interface BriefingTokenPayload {
  workspaceId: string;
  clientId: string;
  briefingType?: BriefingKind;
  iat?: number;
  exp?: number;
  createdAt?: number;
}

/**
 * Decode a briefing token for client-side UX (NOT authorization).
 * Handles both signed tokens (payload.sig) and legacy base64url tokens.
 */
export function decodeBriefingToken(token: string): (BriefingTokenPayload & { briefingType: BriefingKind }) | null {
  try {
    let payloadB64 = token;

    // Signed tokens have format: <payloadBase64url>.<signatureBase64url>
    const dotIdx = token.lastIndexOf(".");
    if (dotIdx !== -1) {
      payloadB64 = token.substring(0, dotIdx);
    }

    const padded = payloadB64.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    const payload = JSON.parse(json);
    if (payload.workspaceId && payload.clientId) {
      return {
        ...payload,
        briefingType: payload.briefingType ?? "enterprise_structuring",
      };
    }
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

/** Human-readable labels for briefing types */
export const BRIEFING_KIND_LABELS: Record<BriefingKind, string> = {
  enterprise_structuring: "Estruturação Empresarial",
  ai_automation: "Automação e IA",
};

export const BRIEFING_KIND_DESCRIPTIONS: Record<BriefingKind, string> = {
  enterprise_structuring: "Mapeamento da estrutura, processos, equipe e operação da empresa.",
  ai_automation: "Levantamento de oportunidades de automação e inteligência artificial.",
};
