/**
 * operationalEvents — predicado para esconder eventos técnicos/sintéticos
 * (sync_*, smoke_*, e2e_*, fake_*, debug_*) do feed de operação.
 *
 * Apenas leitura. Não toca em DB, edge ou sync.
 */

const TECHNICAL_PREFIXES = ["sync_", "smoke_", "e2e_", "fake_", "debug_", "test_", "audit_"];
const TECHNICAL_TYPES = new Set([
  "realtime_check",
  "verify_realtime",
  "backfill_run",
  "smoke_test_cycle",
]);

export interface OperationalEventLike {
  event_type?: string | null;
  title?: string | null;
}

export function isOperationalEvent(ev: OperationalEventLike): boolean {
  const t = String(ev.event_type ?? "").toLowerCase();
  if (!t) return true;
  if (TECHNICAL_TYPES.has(t)) return false;
  for (const p of TECHNICAL_PREFIXES) if (t.startsWith(p)) return false;
  return true;
}

export function filterOperationalEvents<T extends OperationalEventLike>(events: T[]): T[] {
  return events.filter(isOperationalEvent);
}
