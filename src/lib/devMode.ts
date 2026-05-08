import { useEffect, useState } from "react";

/**
 * Modo Dev — toggle administrativo único para mostrar ferramentas técnicas
 * (sync manual, smoke test, verificar realtime, reorganizar, fluxo ops,
 * gerar esteira, templates, playbook, logs técnicos). OFF por padrão.
 * Persistido em localStorage. Não toca em banco/edge functions.
 */

const KEY = "ops:dev-mode:v1";
const EVENT = "ops:dev-mode:changed";

export function readDevMode(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.localStorage.getItem(KEY) === "1"; } catch { return false; }
}

export function writeDevMode(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch { /* noop */ }
}

export function useDevMode(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState<boolean>(() => readDevMode());
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setOn(readDevMode());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return [on, (value: boolean) => { writeDevMode(value); setOn(value); }];
}