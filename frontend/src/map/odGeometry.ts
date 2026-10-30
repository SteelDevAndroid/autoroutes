import type { FeatureCollection, LineString } from 'geojson';
import type { OdFlow } from '../realtime/protocol';
import { flowWidth, percentile } from './scales';
import { flowDensity } from '../animation/flowMotion';
import type { FlowDensity } from '../animation/flowMotion';

export interface OdProperties {
  readonly originId: string;
  readonly destinationId: string;
  readonly vehicles: number;
  readonly width: number;
  readonly density: FlowDensity;
  readonly routeKind: 'ROAD' | 'SCHEMATIC';
}

const ARC_SEGMENTS = 16;
const ARC_BEND = 0.18;

/**
 * Arc de Bézier quadratique courbé vers la droite du sens de parcours :
 * A→B et B→A ne se superposent pas, le sens se lit sans flèche.
 */
export function arc(origin: readonly [number, number], destination: readonly [number, number]): [number, number][] {
  const [x0, y0] = origin;
  const [x1, y1] = destination;
  const cx = (x0 + x1) / 2 + (y1 - y0) * ARC_BEND;
  const cy = (y0 + y1) / 2 - (x1 - x0) * ARC_BEND;
  const points: [number, number][] = [];
  for (let s = 0; s <= ARC_SEGMENTS; s++) {
    const t = s / ARC_SEGMENTS;
    const u = 1 - t;
    points.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1]);
  }
  return points;
}

export const OD_NATIONAL_LIMIT = 60;

/**
 * Lisibilité : sans gare sélectionnée, seuls les flux les plus importants sont tracés ;
 * avec une gare sélectionnée, tous ses flux entrants et sortants.
 */
export function selectFlows(flows: readonly OdFlow[], selectedId: string | null, limit = OD_NATIONAL_LIMIT): OdFlow[] {
  if (selectedId !== null) {
    return flows.filter((f) => f.originId === selectedId || f.destinationId === selectedId);
  }
  return [...flows].sort((a, b) => b.vehicles - a.vehicles).slice(0, limit);
}

export function buildOdFeatures(
  flows: readonly OdFlow[],
  coordinates: ReadonlyMap<string, readonly [number, number]>,
  useRoadRoutes = true,
): FeatureCollection<LineString, OdProperties> {
  const reference = percentile(flows.map((f) => f.vehicles), 0.95);
  const features = flows.flatMap((flow, index) => {
    const origin = coordinates.get(flow.originId);
    const destination = coordinates.get(flow.destinationId);
    if (origin === undefined || destination === undefined || flow.originId === flow.destinationId) {
      return [];
    }
    const route = useRoadRoutes ? roadCoordinates(flow) : null;
    return [{
      type: 'Feature' as const,
      id: index,
      geometry: { type: 'LineString' as const, coordinates: route ?? arc(origin, destination) },
      properties: { originId: flow.originId, destinationId: flow.destinationId, vehicles: flow.vehicles,
        width: flowWidth(flow.vehicles, reference), density: flowDensity(flow.vehicles, reference),
        routeKind: route === null ? 'SCHEMATIC' as const : 'ROAD' as const },
    }];
  });
  return { type: 'FeatureCollection', features };
}

/** Géométrie complète uniquement : un arc de repli ne prétend jamais suivre le réseau. */
export function roadCoordinates(flow: OdFlow): [number, number][] | null {
  const route = flow.route;
  if (route?.nature !== 'ESTIMATED' || !Array.isArray(route.coordinates) || route.coordinates.length < 2) return null;
  const points: [number, number][] = [];
  for (const point of route.coordinates) {
    if (!Array.isArray(point)) return null;
    const lon: unknown = point[0];
    const lat: unknown = point[1];
    if (point.length !== 2 || typeof lon !== 'number' || typeof lat !== 'number' || !Number.isFinite(lon) || !Number.isFinite(lat)
      || Math.abs(lon) > 180 || Math.abs(lat) > 90) return null;
    points.push([lon, lat]);
  }
  return points;
}
