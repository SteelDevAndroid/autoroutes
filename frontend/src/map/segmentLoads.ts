import type { SegmentLoad } from '../realtime/protocol';
import { percentile } from './scales';

export interface SegmentDiff {
  /** Charge normalisée (0 à 1) après la mise à jour, par segmentId. */
  readonly next: ReadonlyMap<string, number>;
  readonly set: readonly (readonly [string, number])[];
  readonly clear: readonly string[];
}

/** Repère lisible, fixé à la première estimation positive d'un graphe et partagé avec la légende. */
export function segmentReference(loads: readonly { readonly vehicles: number }[]): number | null {
  const reference = percentile(loads.map((l) => l.vehicles).filter((v) => v > 0), 0.95);
  if (!(reference > 0)) return null;
  const magnitude = 10 ** Math.max(0, Math.floor(Math.log10(reference)) - 1);
  return Math.round(reference / magnitude) * magnitude;
}

/**
 * Charges ESTIMÉES → intensité 0 à 1, avec la référence stable fournie par l'interface.
 * Sans référence explicite, le 95e centile arrondi sert au premier calcul.
 * Ne retourne que les écarts avec l'état précédent : MapLibre n'est écrit que pour les tronçons dont l'intensité change.
 */
export function diffSegmentLoads(previous: ReadonlyMap<string, number>, loads: readonly SegmentLoad[], reference = segmentReference(loads) ?? 0): SegmentDiff {
  const next = new Map<string, number>();
  const set: [string, number][] = [];
  for (const { segmentId, vehicles } of loads) {
    const intensity = reference > 0 ? Math.round(Math.min(1, vehicles / reference) * 100) / 100 : 0;
    next.set(segmentId, intensity);
    if (previous.get(segmentId) !== intensity) {
      set.push([segmentId, intensity]);
    }
  }
  const clear = [...previous.keys()].filter((id) => !next.has(id));
  return { next, set, clear };
}
