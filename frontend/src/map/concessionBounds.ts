import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { PMTiles } from 'pmtiles';
import { MOTORWAYS_SOURCE_LAYER } from './layers';
import { FRANCE_BOUNDS } from './theme';

export type RoadBounds = [west: number, south: number, east: number, north: number];

/** Lit la vue nationale de l’archive, indépendamment des tuiles déjà chargées dans le viewport. */
export async function readConcessionBounds(archive: PMTiles, signal: AbortSignal): Promise<ReadonlyMap<string, RoadBounds>> {
  const header = await archive.getHeader();
  const zoom = header.minZoom;
  const scale = 2 ** zoom;
  const x = (lon: number): number => Math.floor((lon + 180) / 360 * scale);
  const y = (lat: number): number => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * scale);
  const [[west, south], [east, north]] = FRANCE_BOUNDS;
  const tiles = [];
  for (let col = x(west); col <= x(east); col++) {
    for (let row = y(north); row <= y(south); row++) {
      tiles.push({ col, row, data: archive.getZxy(zoom, col, row, signal) });
    }
  }

  const bounds = new Map<string, RoadBounds>();
  await Promise.all(tiles.map(async ({ col, row, data }) => {
    const tile = await data;
    if (tile === undefined) return;
    const layer = new VectorTile(new PbfReader(tile.data)).layers[MOTORWAYS_SOURCE_LAYER];
    if (layer === undefined) return;
    for (let i = 0; i < layer.length; i++) {
      const feature = layer.feature(i);
      const code = feature.properties.concession;
      if (typeof code !== 'string' || code === '') continue;
      const { geometry } = feature.toGeoJSON(col, row, zoom);
      const lines = geometry.type === 'LineString' ? [geometry.coordinates]
        : geometry.type === 'MultiLineString' ? geometry.coordinates : [];
      const extent = bounds.get(code) ?? [Infinity, Infinity, -Infinity, -Infinity];
      for (const line of lines) {
        for (const [lon, lat] of line) {
          if (lon === undefined || lat === undefined) continue;
          extent[0] = Math.min(extent[0], lon);
          extent[1] = Math.min(extent[1], lat);
          extent[2] = Math.max(extent[2], lon);
          extent[3] = Math.max(extent[3], lat);
        }
      }
      if (Number.isFinite(extent[0])) bounds.set(code, extent);
    }
  }));
  return bounds;
}
