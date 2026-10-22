import type { LayerVisibility } from '../state/uiStore';

export type LegendRowId = 'echangeur' | 'pleine-voie' | 'stale' | 'od' | 'segments';

/** La légende ne décrit que ce qui est affiché : une ligne par couche active, dans l'ordre de lecture. */
export function legendRows(layers: LayerVisibility, kinds: { echangeur: boolean; pleineVoie: boolean }): LegendRowId[] {
  const rows: LegendRowId[] = [];
  if (layers.stations) {
    if (kinds.echangeur) rows.push('echangeur');
    if (kinds.pleineVoie) rows.push('pleine-voie');
    rows.push('stale');
  }
  if (layers.od) rows.push('od');
  if (layers.segments) rows.push('segments');
  return rows;
}
