import { PMTiles } from 'pmtiles';
import type { Header } from 'pmtiles';
import { PbfWriter } from 'pbf';
import { expect, it, vi } from 'vitest';
import { readConcessionBounds } from './concessionBounds';

/** Une couche MVT avec des tronçons courts dont les coordonnées sont locales à leur tuile. */
function tile(rows: readonly { code: string; x: number }[]): ArrayBuffer {
  const writer = new PbfWriter();
  writer.writeMessage(3, (segments, layer) => {
    layer.writeStringField(1, 'motorways');
    layer.writeVarintField(15, 2);
    layer.writeVarintField(5, 4096);
    layer.writeStringField(3, 'concession');
    segments.forEach(({ code, x }, index) => {
      layer.writeMessage(4, (value, properties) => { properties.writeStringField(1, value); }, code);
      layer.writeMessage(2, (column, feature) => {
        feature.writePackedVarint(2, [0, index]);
        feature.writeVarintField(3, 2);
        // MoveTo puis LineTo, coordonnées et différences positives encodées en zigzag.
        feature.writePackedVarint(4, [9, column * 2, 2000, 10, 240, 100]);
      }, x);
    });
  }, rows);
  return Uint8Array.from(writer.finish()).buffer;
}

it('cadre les tronçons d’une concession répartis sur plusieurs tuiles sans inclure un autre gestionnaire', async () => {
  const archive = new PMTiles('https://example.test/motorways.pmtiles');
  vi.spyOn(archive, 'getHeader').mockResolvedValue({ minZoom: 4 } as Header);
  const west = tile([{ code: 'APRR', x: 3800 }]);
  const east = tile([{ code: 'APRR', x: 300 }, { code: 'AREA', x: 1500 }]);
  vi.spyOn(archive, 'getZxy').mockImplementation((_zoom, x, y) =>
    Promise.resolve(y === 5 && (x === 7 || x === 8) ? { data: x === 7 ? west : east } : undefined));
  const bounds = await readConcessionBounds(archive, new AbortController().signal);
  expect(bounds.get('APRR')?.[0]).toBeCloseTo(-1.626, 2);
  expect(bounds.get('APRR')?.[2]).toBeCloseTo(2.307, 2);
  expect(bounds.get('AREA')?.[0]).toBeCloseTo(8.24, 2);
  expect(bounds.size).toBe(2);
});
