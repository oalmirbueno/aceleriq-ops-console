import { useEffect, useState, useCallback } from "react";

/**
 * Preferências do OPS V2 — persistidas em localStorage.
 * Não tocam em banco, Portal ou contrato de dados.
 */

type Setting<T> = {
  key: string;
  defaultValue: T;
  parse: (raw: string | null) => T;
  serialize: (v: T) => string;
};

const bool = (defaultValue: boolean): Pick<Setting<boolean>, "defaultValue" | "parse" | "serialize"> => ({
  defaultValue,
  parse: (raw) => raw === null ? defaultValue : raw === "1",
  serialize: (v) => (v ? "1" : "0"),
});

const enumStr = <T extends string>(defaultValue: T, allowed: readonly T[]): Pick<Setting<T>, "defaultValue" | "parse" | "serialize"> => ({
  defaultValue,
  parse: (raw) => (raw && (allowed as readonly string[]).includes(raw) ? raw as T : defaultValue),
  serialize: (v) => v,
});

export const V2_SETTINGS = {
  canvasShowMinimap: { key: "ops-v2:canvas:minimap", ...bool(true) } as Setting<boolean>,
  canvasShowSidePanel: { key: "ops-v2:canvas:side-panel", ...bool(true) } as Setting<boolean>,
  canvasAutoOrganize: { key: "ops-v2:canvas:auto-organize", ...bool(true) } as Setting<boolean>,
  canvasDefaultFullscreen: { key: "ops-v2:canvas:fullscreen", ...bool(false) } as Setting<boolean>,
  canvasDensity: { key: "ops-v2:canvas:density", ...enumStr<"comfortable" | "compact">("comfortable", ["comfortable", "compact"]) } as Setting<"comfortable" | "compact">,
  canvasShowDock: { key: "ops-v2:canvas:dock", ...bool(true) } as Setting<boolean>,
  canvasShowIAHub: { key: "ops-v2:canvas:ia-hub", ...bool(true) } as Setting<boolean>,
  canvasNodeSize: { key: "ops-v2:canvas:node-size", ...enumStr<"sm" | "md" | "lg">("md", ["sm", "md", "lg"]) } as Setting<"sm" | "md" | "lg">,
  canvasNodeRenderer: { key: "ops-v2:canvas:node-renderer", ...enumStr<"legacy" | "task-v2">("legacy", ["legacy", "task-v2"]) } as Setting<"legacy" | "task-v2">,
  canvasLayoutMode: { key: "ops-v2:canvas:layout-mode", ...enumStr<"status" | "compact" | "wide">("status", ["status", "compact", "wide"]) } as Setting<"status" | "compact" | "wide">,
};

const EVENT = "ops-v2:settings:changed";

function read<T>(s: Setting<T>): T {
  if (typeof window === "undefined") return s.defaultValue;
  try { return s.parse(window.localStorage.getItem(s.key)); } catch { return s.defaultValue; }
}
function write<T>(s: Setting<T>, v: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(s.key, s.serialize(v));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: s.key } }));
  } catch { /* noop */ }
}

export function useV2Setting<T>(s: Setting<T>): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => read(s));
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string }>).detail;
      if (!detail || detail.key === s.key) setV(read(s));
    };
    const onStorage = (e: StorageEvent) => { if (e.key === s.key) setV(read(s)); };
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, [s]);
  const set = useCallback((next: T) => { write(s, next); setV(next); }, [s]);
  return [v, set];
}

export function readV2Setting<T>(s: Setting<T>): T { return read(s); }

/** Reseta todas as preferências visuais V2 para o default. */
export function resetV2Settings() {
  if (typeof window === "undefined") return;
  try {
    Object.values(V2_SETTINGS).forEach((s) => {
      window.localStorage.removeItem((s as Setting<unknown>).key);
      window.dispatchEvent(new CustomEvent(EVENT, { detail: { key: (s as Setting<unknown>).key } }));
    });
  } catch { /* noop */ }
}
