import { expect, it } from 'vitest';
import { flowLabels } from './flowLabels';
import { buildOdFeatures } from './odGeometry';

it('keeps the two directions readable and preserves their volumes on a shared road', () => {
  const stations = new Map([['A', [0, 0] as const], ['B', [1, 0] as const], ['C', [2, 0] as const]]);
  const features = buildOdFeatures([
    { originId: 'A', destinationId: 'B', vehicles: 30, route: { nature: 'ESTIMATED', graphVersion: 'test', algorithm: 'test', coordinates: [[0, 0], [1, 0]] } },
    { originId: 'B', destinationId: 'A', vehicles: 20, route: { nature: 'ESTIMATED', graphVersion: 'test', algorithm: 'test', coordinates: [[1, 0], [0, 0]] } },
    { originId: 'B', destinationId: 'C', vehicles: 50 },
  ], stations).features;
  const labels = flowLabels(features, 'A', ([lon, lat]) => [200 + 200 * lon, 100 + 100 * lat], 700, 500);
  expect(labels).toMatchObject([
    { inbound: false, angle: 0, vehicles: 30 },
    { inbound: true, angle: 180, vehicles: 20 },
  ]);
  expect(labels[0]?.offset[1]).toBeLessThan(0);
  expect(labels[1]?.offset[1]).toBeGreaterThan(0);
});
