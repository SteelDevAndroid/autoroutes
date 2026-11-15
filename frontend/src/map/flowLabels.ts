import type { Feature, LineString } from 'geojson';
import type { OdProperties } from './odGeometry';

type Point = readonly [number, number];

interface FlowLabel {
  readonly key: string;
  readonly position: Point;
  readonly offset: Point;
  readonly angle: number;
  readonly vehicles: number;
  readonly inbound: boolean;
}

/** Positionne quelques directions dans la partie visible des trajets près de la gare sélectionnée. */
export function flowLabels(
  flows: readonly Feature<LineString, OdProperties>[],
  selected: string,
  project: (point: Point) => Point,
  width: number,
  height: number,
): FlowLabel[] {
  const visible: FlowLabel[] = [];
  const anchors: Point[] = [];
  let inboundCount = 0;
  let outboundCount = 0;
  const candidates = flows.filter(({ properties }) => properties.originId === selected || properties.destinationId === selected);
  candidates.sort((a, b) => b.properties.vehicles - a.properties.vehicles);
  for (const { geometry, properties } of candidates) {
    const inbound = properties.destinationId === selected;
    if ((inbound ? inboundCount : outboundCount) >= 3) continue;
    const coordinates = inbound ? [...geometry.coordinates].reverse() : geometry.coordinates;
    let distance = 0;
    for (let i = 1; i < coordinates.length; i++) {
      const [lon, lat] = coordinates[i - 1] ?? [];
      const [endLon, endLat] = coordinates[i] ?? [];
      if (lon === undefined || lat === undefined || endLon === undefined || endLat === undefined) continue;
      const start: Point = [lon, lat];
      const end: Point = [endLon, endLat];
      const [x, y] = project(start);
      const [endX, endY] = project(end);
      const dx = endX - x;
      const dy = endY - y;
      const length = Math.hypot(dx, dy);
      // Éloigne les libellés de la gare et sépare les deux sens sur un tracé partagé.
      const offset = Math.max(0, (inbound ? 105 : 70) - distance);
      distance += length;
      if (length < 1 || offset > length) continue;
      const ratio = offset / length;
      const side = inbound ? 18 : -18;
      const labelOffset: Point = [-dy / length * side, dx / length * side];
      const anchor: Point = [x + dx * ratio + labelOffset[0], y + dy * ratio + labelOffset[1]];
      if (anchor[0] < 44 || anchor[0] > width - 44 || anchor[1] < 22 || anchor[1] > height - 22
        || anchors.some(([ax, ay]) => Math.abs(ax - anchor[0]) < 82 && Math.abs(ay - anchor[1]) < 27)) continue;
      anchors.push(anchor);
      visible.push({
        key: `${properties.originId}>${properties.destinationId}`,
        position: [start[0] + (end[0] - start[0]) * ratio, start[1] + (end[1] - start[1]) * ratio],
        offset: labelOffset,
        angle: Math.atan2(dy, dx) * 180 / Math.PI + (inbound ? 180 : 0),
        vehicles: properties.vehicles,
        inbound,
      });
      if (inbound) inboundCount++;
      else outboundCount++;
      break;
    }
    if (inboundCount === 3 && outboundCount === 3) break;
  }
  return visible;
}
