/**
 * Canvas debug utilities.
 *
 * Ative o modo de diagnóstico de duas formas:
 *  1) localStorage.setItem("canvas:debug", "1")
 *  2) Atalho Shift+D dentro do CanvasStudio (alterna o overlay)
 *
 * Quando ativo:
 *  - Logs detalhados no console agrupados por área (fetch, filter, sync)
 *  - Painel sobreposto no canvas com contagens por estágio do filtro
 */

const STORAGE_KEY = "canvas:debug";

export function isCanvasDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCanvasDebug(enabled: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (enabled) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("canvas:debug-changed", { detail: enabled }));
  } catch {
    /* noop */
  }
}

export function toggleCanvasDebug(): boolean {
  const next = !isCanvasDebugEnabled();
  setCanvasDebug(next);
  return next;
}

/** Log condicional. Só imprime se o modo debug estiver ativo. */
export function dbg(area: string, ...args: unknown[]) {
  if (!isCanvasDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`%c[canvas:${area}]`, "color:#22c55e;font-weight:600", ...args);
}

/** Warning condicional. Sempre vale a pena ver. */
export function dbgWarn(area: string, ...args: unknown[]) {
  if (!isCanvasDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn(`[canvas:${area}]`, ...args);
}