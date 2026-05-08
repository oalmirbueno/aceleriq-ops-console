import type { ReactNode } from "react";
import { useDevMode } from "@/lib/devMode";
import { featureFlags } from "@/config/featureFlags";

/**
 * Renderiza filhos somente quando Modo Dev está ON (ou flag global de dev).
 * Útil para esconder ferramentas técnicas no modo operação por padrão.
 */
export default function DevOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const [devMode] = useDevMode();
  if (!devMode && !featureFlags.enableCanvasDevTools) return <>{fallback}</>;
  return <>{children}</>;
}
