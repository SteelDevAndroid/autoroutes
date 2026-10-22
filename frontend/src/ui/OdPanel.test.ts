import { describe, expect, it } from 'vitest';
import type { StationCollection } from '../map/referentiel';
import { filterOptions } from './OdPanel';

const feature = (id: string, dept: string, axes: string) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [0, 0] },
  properties: { id, name: id, kind: 'ECHANGEUR' as const, axes, dept, lanes: 2 },
});

describe('filterOptions', () => {
  it('lists distinct sorted departments and axes, splitting multi-axis stations', () => {
    const stations: StationCollection = {
      type: 'FeatureCollection',
      features: [feature('a', '69', 'A0007, A0006'), feature('b', '13', 'A0007'), feature('c', '', 'A0001')],
    };

    expect(filterOptions(stations)).toEqual({ departments: ['13', '69'], axes: ['A0001', 'A0006', 'A0007'] });
  });
});
