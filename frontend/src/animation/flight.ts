const EARTH_RADIUS_KM = 6371;

/** Distance orthodromique entre deux points (lon, lat) en degrés. */
export function distanceKm(a: readonly [number, number], b: readonly [number, number]): number {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const FLIGHT_MIN_MS = 500;
export const FLIGHT_MAX_MS = 2_200;

/**
 * Durée d'un déplacement de caméra selon la distance : courte pour un voisin (pas d'effet « téléportation » ni d'attente inutile),
 * croissante en logarithme pour les longues distances, plafonnée. Mouvement réduit : instantané.
 */
export function flightDurationMs(km: number, reducedMotion: boolean): number {
  if (reducedMotion) {
    return 0;
  }
  const raw = FLIGHT_MIN_MS + 450 * Math.log2(1 + Math.max(0, km) / 40);
  return Math.round(Math.min(FLIGHT_MAX_MS, Math.max(FLIGHT_MIN_MS, raw)));
}
