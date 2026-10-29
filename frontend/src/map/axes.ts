import type { StationCollection } from './referentiel';
import { RADIUS_MAX_PX } from './scales';

/** Autoroute (ou route nationale) regroupant tous les codes du référentiel qui la désignent : A0007 et A0007N sont « A7 ». */
export interface AxisGroup {
  /** Identifiant d'affichage, « A7 ». */
  readonly id: string;
  /** Codes du référentiel (« A0007 », « A0007N »). */
  readonly codes: readonly string[];
  /** Valeur du filtre « Axe » de l'API : codes séparés par des virgules. */
  readonly value: string;
  /** Index (dans la collection de gares) des gares de l'axe. */
  readonly stations: readonly number[];
}

const CODE = /^([AN])0*(\d+)[A-Z]?$/;

/** « A0007 », « A0007N » → « A7 » ; « N0159 » → « N159 » ; un code inattendu est affiché tel quel. */
export function axisLabel(code: string): string {
  const match = CODE.exec(code.trim());
  return match === null ? code.trim() : `${match[1] ?? ''}${match[2] ?? ''}`;
}

/** Liste de codes du référentiel (« A0016, A0017 ») → libellés dédoublonnés (« A16, A17 »). */
export function formatAxes(axes: string): string {
  return [...new Set(splitCodes(axes).map(axisLabel))].join(', ');
}

export function splitCodes(axes: string): string[] {
  return axes.split(',').map((code) => code.trim()).filter((code) => code !== '');
}

const compareIds = (a: string, b: string): number => {
  const [, la = '', na = '0'] = /^([A-Z]?)(\d*)/.exec(a) ?? [];
  const [, lb = '', nb = '0'] = /^([A-Z]?)(\d*)/.exec(b) ?? [];
  return la === lb ? Number(na) - Number(nb) : la.localeCompare(lb);
};

/** Regroupe les gares par axe affiché ; trié « A1, A2, … A10 » puis les routes nationales. */
export function buildAxisGroups(stations: StationCollection): AxisGroup[] {
  const groups = new Map<string, { codes: Set<string>; stations: number[] }>();
  stations.features.forEach((feature, index) => {
    for (const code of splitCodes(feature.properties.axes)) {
      const id = axisLabel(code);
      const group = groups.get(id) ?? { codes: new Set<string>(), stations: [] };
      group.codes.add(code);
      if (!group.stations.includes(index)) {
        group.stations.push(index);
      }
      groups.set(id, group);
    }
  });
  return [...groups.entries()]
    .sort(([a], [b]) => compareIds(a, b))
    .map(([id, { codes, stations: members }]) => ({ id, codes: [...codes].sort(), value: [...codes].sort().join(','), stations: members }));
}

export interface LabelCandidate {
  readonly key: string;
  readonly text: string;
  /** Valeur du filtre « Axe » à appliquer au clic. */
  readonly value: string;
  readonly lon: number;
  readonly lat: number;
  /** Décalage du centre de l’étiquette en pixels par rapport à sa gare de référence. */
  readonly offset: readonly [x: number, y: number];
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

type Position = readonly [lon: number, lat: number];

/** Nombre d'étiquettes par axe selon le zoom : une seule à l'échelle du pays, davantage en s'approchant. */
export function labelCount(zoom: number): number {
  if (zoom < 5.5) return 1;
  if (zoom < 6.5) return 2;
  if (zoom < 7.5) return 3;
  if (zoom < 8.5) return 5;
  return 8;
}

/** Choisit `count` points répartis le long de l'axe : tri selon la dimension la plus étendue, puis quantiles. */
export function pickSpread<T extends { readonly position: Position }>(points: readonly T[], count: number): T[] {
  if (points.length <= count) {
    return [...points];
  }
  const lons = points.map((p) => p.position[0]);
  const lats = points.map((p) => p.position[1]);
  const dimension = Math.max(...lons) - Math.min(...lons) >= Math.max(...lats) - Math.min(...lats) ? 0 : 1;
  const sorted = [...points].sort((a, b) => a.position[dimension] - b.position[dimension]);
  return Array.from({ length: count }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 0.5) * sorted.length) / count))] as T);
}

const MARGIN = 24;
const CHAR_WIDTH = 8;
const BOX_PADDING = 18;
const BOX_HEIGHT = 20;
// Réserve aussi le contour des anomalies et une marge, même si le trafic augmente après le placement.
const STATION_CLEARANCE = RADIUS_MAX_PX + 8;

/**
 * Étiquettes à afficher pour la vue courante : points visibles de chaque axe répartis selon le zoom, puis évitement des
 * collisions en commençant par les axes les mieux fournis en gares (les plus importants).
 */
export function layoutLabels(
  groups: readonly AxisGroup[],
  positions: readonly Position[],
  project: (position: Position) => readonly [x: number, y: number],
  zoom: number,
  viewport: Viewport,
): LabelCandidate[] {
  const candidates: { candidate: LabelCandidate; x: number; y: number; priority: number }[] = [];
  for (const group of groups) {
    const visible = group.stations.flatMap((index) => {
      const position = positions[index];
      if (position === undefined) {
        return [];
      }
      const [x, y] = project(position);
      return x >= -MARGIN && x <= viewport.width + MARGIN && y >= -MARGIN && y <= viewport.height + MARGIN ? [{ position, x, y }] : [];
    });
    pickSpread(visible, labelCount(zoom)).forEach((point, i) => {
      candidates.push({
        candidate: { key: `${group.id}#${i}`, text: group.id, value: group.value, lon: point.position[0], lat: point.position[1], offset: [0, 0] },
        x: point.x, y: point.y, priority: group.stations.length,
      });
    });
  }
  candidates.sort((a, b) => b.priority - a.priority || a.candidate.key.localeCompare(b.candidate.key));
  const obstacles = positions.map(project).filter(([x, y]) => x >= -STATION_CLEARANCE && x <= viewport.width + STATION_CLEARANCE
    && y >= -STATION_CLEARANCE && y <= viewport.height + STATION_CLEARANCE);
  const kept: typeof candidates = [];
  for (const c of candidates) {
    const width = c.candidate.text.length * CHAR_WIDTH + BOX_PADDING;
    const dy = STATION_CLEARANCE + BOX_HEIGHT / 2;
    const dx = STATION_CLEARANCE + width / 2;
    const offsets: readonly (readonly [number, number])[] = [[0, -dy], [0, dy], [dx, 0], [-dx, 0],
      [dx, -dy], [-dx, -dy], [dx, dy], [-dx, dy]];
    for (const offset of offsets) {
      const x = c.x + offset[0];
      const y = c.y + offset[1];
      if (x - width / 2 < 0 || x + width / 2 > viewport.width || y - BOX_HEIGHT / 2 < 0 || y + BOX_HEIGHT / 2 > viewport.height) continue;
      const coversStation = obstacles.some(([sx, sy]) => {
        const nearestX = Math.max(Math.abs(sx - x) - width / 2, 0);
        const nearestY = Math.max(Math.abs(sy - y) - BOX_HEIGHT / 2, 0);
        return Math.hypot(nearestX, nearestY) < STATION_CLEARANCE;
      });
      const coversLabel = kept.some((k) => Math.abs(x - k.x) < (width + k.candidate.text.length * CHAR_WIDTH + BOX_PADDING) / 2 + 4
        && Math.abs(y - k.y) < BOX_HEIGHT + 4);
      if (!coversStation && !coversLabel) {
        kept.push({ ...c, x, y, candidate: { ...c.candidate, offset } });
        break;
      }
    }
  }
  return kept.map((c) => c.candidate);
}

/** Gares dont l'un des axes figure dans `value` (codes séparés par des virgules). */
export function stationsOnAxes(stations: StationCollection, value: string): number[] {
  const wanted = new Set(splitCodes(value));
  return stations.features.flatMap((feature, index) => (splitCodes(feature.properties.axes).some((code) => wanted.has(code)) ? [index] : []));
}
