import { describe, expect, it } from 'vitest';
import type { LayerVisibility } from '../state/uiStore';
import { legendRows } from './legend';

const layers = (overrides: Partial<LayerVisibility>): LayerVisibility => ({ stations: true, labels: true, od: false, segments: false, ...overrides });
const both = { echangeur: true, pleineVoie: true };

describe('legendRows', () => {
  it('describes only the displayed layers', () => {
    expect(legendRows(layers({}), both)).toEqual(['echangeur', 'pleine-voie', 'stale']);
    expect(legendRows(layers({ od: true }), both)).toEqual(['echangeur', 'pleine-voie', 'stale', 'od']);
    expect(legendRows(layers({ stations: false, segments: true }), both)).toEqual(['segments']);
  });

  it('follows the station kinds being shown', () => {
    expect(legendRows(layers({}), { echangeur: false, pleineVoie: true })).toEqual(['pleine-voie', 'stale']);
  });

  it('is empty when nothing is displayed', () => {
    expect(legendRows(layers({ stations: false }), both)).toEqual([]);
  });
});
