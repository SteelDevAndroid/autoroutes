import { axisLabel, splitCodes } from './axes';

interface RoadFeature {
  readonly id?: string | number | undefined;
  readonly properties?: { readonly ref?: unknown } | null;
}

/** Références OSM (A 7;E15), comparées par numéro complet au filtre du référentiel (A0007,A0007N). */
export function selectedRoadIds(features: readonly RoadFeature[], axis: string | null): Set<string | number> {
  const wanted = new Set(splitCodes(axis ?? '').map((code) => axisLabel(code.toUpperCase())));
  const selected = new Set<string | number>();
  for (const feature of features) {
    const ref = feature.properties?.ref;
    if (feature.id === undefined || typeof ref !== 'string') continue;
    const matches = ref.split(/[;,]/).some((part) => wanted.has(axisLabel(part.replace(/\s/g, '').toUpperCase())));
    if (matches) selected.add(feature.id);
  }
  return selected;
}
