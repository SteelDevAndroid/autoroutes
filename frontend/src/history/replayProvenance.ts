import type { Provenance } from '../capabilities';
import { parisMidnight } from './parisTime';

/** La portée inclut les fenêtres glissantes et le cumul depuis minuit montrés pendant la relecture. */
export function trackReplayProvenance(from: Date, to: Date, onNature: (nature: Provenance) => void,
  fetchFn: typeof fetch = fetch): () => void {
  const abort = new AbortController();
  let disposed = false;
  onNature('UNKNOWN');
  const start = new Date(Math.min(parisMidnight(from).getTime(), from.getTime() - 3_600_000));
  const timeout = setTimeout(() => { abort.abort(); }, 8_000);
  fetchFn(`/api/v1/history/provenance?from=${start.toISOString()}&to=${to.toISOString()}`, { signal: abort.signal })
    .then(async (response) => {
      if (!response.ok) return 'UNKNOWN' as const;
      const body = await response.json() as { nature?: Provenance };
      return ['SIMULATED', 'OBSERVED', 'MIXED', 'UNKNOWN'].includes(body.nature ?? '') ? body.nature ?? 'UNKNOWN' : 'UNKNOWN';
    }).then((nature) => {
      if (!disposed && !abort.signal.aborted) onNature(nature);
    }, () => { /* La provenance reste inconnue si le serveur ne peut pas la certifier. */ })
    .finally(() => { clearTimeout(timeout); });
  return () => { disposed = true; clearTimeout(timeout); abort.abort(); };
}
