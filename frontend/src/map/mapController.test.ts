import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOW_MOTION_BANDS } from '../animation/flowMotion';
import { streamOdView } from '../od/odTypes';
import { StationStore } from '../state/stationStore';
import { MapController } from './mapController';
import type { StationCollection } from './referentiel';
import type { FeatureCollection } from 'geojson';

// Seule la frontière WebGL est doublée : sélection, géométrie, filtres et boucles restent réels.
const { map } = vi.hoisted(() => ({ map: {
  on: vi.fn(), once: vi.fn(), addControl: vi.fn(), remove: vi.fn(),
  getLayer: vi.fn(() => ({})), getSource: vi.fn(),
  setFilter: vi.fn(), setLayoutProperty: vi.fn(), setPaintProperty: vi.fn(),
  setFeatureState: vi.fn(), removeFeatureState: vi.fn(),
  querySourceFeatures: vi.fn(() => []),
  fitBounds: vi.fn(), getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
  getZoom: vi.fn(() => 8),
  setData: vi.fn<(data: FeatureCollection) => Promise<void>>(async () => {}),
} }));

vi.mock('maplibre-gl', async (importOriginal) => ({
  ...(await importOriginal<typeof import('maplibre-gl')>()),
  Map: vi.fn(function createMap() { return map; }),
  NavigationControl: vi.fn(function createNavigation() { return {}; }),
  ScaleControl: vi.fn(function createScale() { return {}; }),
  setWorkerUrl: vi.fn(), addProtocol: vi.fn(),
}));

const stations: StationCollection = {
  type: 'FeatureCollection',
  features: ['A', 'B', 'C'].map((id, i) => ({ type: 'Feature',
    geometry: { type: 'Point', coordinates: [i, i] },
    properties: { id, name: id, kind: 'ECHANGEUR', axes: i === 0 ? 'A0001' : 'A0002', dept: '01', lanes: 4 },
  })),
};
const flows = [
  { originId: 'A', destinationId: 'B', vehicles: 100 },
  { originId: 'C', destinationId: 'A', vehicles: 40 },
  { originId: 'B', destinationId: 'C', vehicles: 5 },
];
const visible = { stations: true, labels: true, axes: false, od: true, segments: true };
let controller: MapController;
let container: HTMLElement;
let frames: Map<number, FrameRequestCallback>;

beforeEach(async () => {
  vi.clearAllMocks();
  map.getZoom.mockReturnValue(8);
  frames = new Map();
  let handle = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++handle, callback); return handle; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { frames.delete(id); });
  vi.stubGlobal('reportError', vi.fn());
  map.getSource.mockReturnValue({ setData: map.setData });
  container = document.createElement('div');
  controller = new MapController(container, stations, new StationStore(['A', 'B', 'C']), {
    style: { basemapUrl: null, motorwaysUrl: null, glyphsUrl: null, spriteUrl: null },
    onSelect: vi.fn(), onQualityChange: vi.fn(), onHover: vi.fn(), onAxisHover: vi.fn(), onAxisClick: vi.fn(),
  });
  controller.setAxisLabelsVisible(false);
  // Événement MapLibre public : les données et la visibilité arrivent après le chargement du style.
  const onLoad = map.on.mock.calls.find(([event]) => event === 'load')?.[1] as (() => void) | undefined;
  onLoad?.();
  controller.setLayers(visible);
  controller.setTrafficMotion('live');
  controller.setOd(streamOdView(flows));
  await Promise.resolve();
});
afterEach(() => { controller.destroy(); vi.unstubAllGlobals(); });

describe('traffic motion on the selected axis', () => {
  it('keeps country views static, adds regional marks and reveals sparse flows locally', () => {
    controller.setMotionAxis('A0002');
    expect(container.dataset.animatedFlows).toBe('3');
    const zoom = map.on.mock.calls.find(([event]) => event === 'zoom')?.[1] as (() => void) | undefined;
    expect(zoom).toBeDefined();
    map.getZoom.mockReturnValue(5);
    zoom?.();
    expect(container.dataset.flowDetail).toBe('national');
    expect(container.dataset.flowMotion).toBe('off');
    map.getZoom.mockReturnValue(6.5);
    zoom?.();
    expect(container.dataset.flowDetail).toBe('regional');
    expect(container.dataset.animatedFlows).toBe('2');
    map.getZoom.mockReturnValue(8);
    zoom?.();
    expect(container.dataset.flowDetail).toBe('local');
    expect(container.dataset.animatedFlows).toBe('3');
  });

  it('freezes marks without clearing data and resumes at the same phase after a long interruption', () => {
    controller.setMotionAxis('A0001');
    const frame = (now: number) => {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => { callback(now); });
    };
    frame(0);
    frame(40);
    const phase = map.setPaintProperty.mock.calls.at(-1);
    map.setData.mockClear();
    controller.setTrafficMotion('stale');
    expect(container.dataset.flowMotion).toBe('off');
    expect(container.dataset.flowMotionReason).toBe('stale');
    expect(map.setData).not.toHaveBeenCalled();
    expect(map.setLayoutProperty).toHaveBeenLastCalledWith('od-flows-motion-high', 'visibility', 'visible');
    map.setPaintProperty.mockClear();
    frame(10_000);
    expect(map.setPaintProperty).not.toHaveBeenCalled();
    controller.setTrafficMotion('live');
    frame(20_000);
    expect(container.dataset.flowMotion).toBe('on');
    expect(map.setPaintProperty.mock.calls.at(-1)).toEqual(phase);
    frame(20_040);
    expect(map.setPaintProperty.mock.calls.at(-1)).not.toEqual(phase);
  });
  it('draws road geometry through the actual source and replaces it with a schematic arc when unavailable', async () => {
    controller.setReducedMotion(true);
    const coordinates = [[0, 0], [3, 4], [1, 1]];
    controller.setOd(streamOdView([{ originId: 'A', destinationId: 'B', vehicles: 100,
      route: { nature: 'ESTIMATED', graphVersion: 'g1', algorithm: 'fastest', coordinates } }]));
    await Promise.resolve();
    expect(map.setData.mock.lastCall?.[0].features[0]?.geometry).toEqual({ type: 'LineString', coordinates });
    expect(container.dataset.roadFlows).toBe('1');
    controller.focusFlow({ originId: 'A', destinationId: 'B' });
    const bounds = map.fitBounds.mock.lastCall?.[0] as { toArray: () => number[][] } | undefined;
    expect(bounds?.toArray()).toEqual([[0, 0], [3, 4]]);
    controller.setOd(streamOdView(flows));
    await Promise.resolve();
    expect(container.dataset.roadFlows).toBe('0');
    expect(container.dataset.schematicFlows).toBe('3');
  });
  it('keeps national arcs static and does not start motion on hover', () => {
    expect(container.dataset.flowMotion).toBe('off');
    controller.setActiveAxis('A0001');
    expect(container.dataset.flowMotion).toBe('off');
    expect(map.setLayoutProperty).toHaveBeenCalledWith('od-flows', 'visibility', 'visible');
  });

  it('animates only flows touching the chosen axis, in either direction', () => {
    controller.setMotionAxis('A0001');
    expect(container.dataset.flowMotion).toBe('on');
    expect(container.dataset.animatedFlows).toBe('2');
    for (const { id, density } of FLOW_MOTION_BANDS) {
      expect(map.setFilter).toHaveBeenCalledWith(id, ['all', ['==', ['get', 'density'], density], ['any',
        ['in', ['get', 'originId'], ['literal', ['A']]], ['in', ['get', 'destinationId'], ['literal', ['A']]],
      ]]);
      expect(map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', density === 0 ? 'none' : 'visible');
    }
    for (const callback of [...frames.values()]) callback(0);
    for (const callback of [...frames.values()]) callback(40);
    expect(map.setPaintProperty).toHaveBeenCalledWith('od-flows-motion-medium', 'line-dasharray', [0, 0.25, 1.5, 6.25]);
    controller.setMotionAxis('');
    expect(container.dataset.flowMotion).toBe('off');
    expect(container.dataset.animatedFlows).toBe('0');
  });

  it('hides movement in reduced motion and when the layer is disabled, then resumes', () => {
    controller.setMotionAxis('A0001');
    controller.setReducedMotion(true);
    expect(container.dataset.flowMotion).toBe('off');
    for (const { id } of FLOW_MOTION_BANDS) expect(map.setLayoutProperty).toHaveBeenCalledWith(id, 'visibility', 'none');
    controller.setReducedMotion(false);
    expect(container.dataset.flowMotion).toBe('on');
    controller.setLayers({ ...visible, od: false });
    expect(container.dataset.flowMotion).toBe('off');
    controller.setLayers(visible);
    expect(container.dataset.flowMotion).toBe('on');
  });

  it('stops for an empty axis, hidden tab or department aggregates', async () => {
    controller.setMotionAxis('A9999');
    expect(container.dataset.flowMotion).toBe('off');
    controller.setMotionAxis('A0001');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(container.dataset.flowMotion).toBe('off');
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(container.dataset.flowMotion).toBe('on');
    controller.setOd({ ...streamOdView(flows), level: 'DEPARTMENT', nodes: [] });
    await Promise.resolve();
    expect(container.dataset.flowMotion).toBe('off');
  });

  it('uses the shared reference to keep a segment colour unchanged across estimates', () => {
    controller.setReducedMotion(true);
    controller.setSegmentLoads([{ segmentId: 'a', vehicles: 50 }, { segmentId: 'b', vehicles: 100 }], 100);
    map.setFeatureState.mockClear();
    controller.setSegmentLoads([{ segmentId: 'a', vehicles: 50 }, { segmentId: 'b', vehicles: 1000 }], 100);
    expect(map.setFeatureState).not.toHaveBeenCalled();
  });
});
