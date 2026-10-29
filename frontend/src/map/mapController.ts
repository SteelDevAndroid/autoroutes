import * as maplibregl from 'maplibre-gl';
import type { ExpressionSpecification, GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { dashSequence, dashStep } from '../animation/dash';
import { distanceKm, flightDurationMs } from '../animation/flight';
import { FrameLoop } from '../animation/frameLoop';
import { LoadTween } from '../animation/loadTween';
import { Presence } from '../animation/presence';
import type { QualityLevel } from '../animation/frameLoop';
import { StationAnimator } from '../animation/stationAnimator';
import { EMPTY_OD_VIEW } from '../od/odTypes';
import type { OdView } from '../od/odTypes';
import type { Feature, LineString } from 'geojson';
import type { OdProperties } from './odGeometry';
import type { StationStore } from '../state/stationStore';
import type { FlowKey, HoveredStation, LayerVisibility } from '../state/uiStore';
import { buildAxisGroups, layoutLabels, stationsOnAxes } from './axes';
import { MOTORWAYS_SOURCE_LAYER, SOURCE, anomalyColor, flowGradient, segmentColor, stationColor } from './layers';
import { buildOdFeatures, selectFlows } from './odGeometry';
import { diffSegmentLoads } from './segmentLoads';
import type { SegmentLoad } from '../realtime/protocol';
import type { StationCollection, StationKind } from './referentiel';
import { StationLayerRenderer } from './stationLayerRenderer';
import { buildStyle } from './style';
import type { StyleOptions } from './style';
import { FRANCE_BOUNDS, themeFor } from './theme';
import type { Palette } from './theme';

let pmtilesRegistered = false;

export interface MapControllerOptions {
  readonly style: StyleOptions;
  readonly onSelect: (index: number | null) => void;
  readonly onQualityChange: (level: QualityLevel) => void;
  /** Gare sous le pointeur (null : aucune). Appelé au plus une fois par image. */
  readonly onHover: (hover: HoveredStation | null) => void;
  /** Survol (valeur du filtre « Axe », ou null en sortant) et clic sur le nom d'une autoroute. */
  readonly onAxisHover: (axis: string | null) => void;
  readonly onAxisClick: (axis: string) => void;
}

const STATION_LAYERS = ['stations', 'stations-halo', 'stations-anomalies', 'stations-axis', 'stations-selected', 'stations-label'] as const;

const FLOW_FADE_MS = 300;
const SEGMENT_FADE_MS = 500;
/** Au-delà, les tronçons passent à leur nouvelle charge d'un coup : animer des milliers d'états par image coûterait plus que le fondu n'apporte. */
const SEGMENT_TWEEN_LIMIT = 2_500;
const SEGMENT_FRAME_MS = 50;
const DASH_STEPS = 16;
const DASH_STEP_MS = 70;
const DASH_SEQUENCE = dashSequence(1.5, 2.5, DASH_STEPS);
const flowKey = (p: { readonly originId: string; readonly destinationId: string }): string => `${p.originId}>${p.destinationId}`;

interface AxisLabel {
  readonly marker: maplibregl.Marker;
  readonly element: HTMLElement;
  readonly value: string;
}

/** Unique point de contact avec MapLibre : React ne manipule jamais la carte directement. */
export class MapController {
  private readonly map: maplibregl.Map;
  private readonly animator: StationAnimator;
  private readonly renderer: StationLayerRenderer;
  private readonly loop: FrameLoop;
  private readonly coordinates: ReadonlyMap<string, readonly [number, number]>;
  private ready = false;
  private od: OdView = EMPTY_OD_VIEW;
  private selectedId: string | null = null;
  private segmentIntensity: ReadonlyMap<string, number> = new Map();
  private highlighted: FlowKey | null = null;
  private odFeatureKeys: readonly FlowKey[] = [];
  private odCoordinates: ReadonlyMap<string, readonly [number, number]> = new Map();
  private pendingHover: HoveredStation | null | undefined;
  private readonly axisGroups;
  private readonly axisPositions: readonly (readonly [number, number])[];
  private readonly axisLabels = new Map<string, AxisLabel>();
  private axisLabelsOn = true;
  private activeAxis: string | null = null;
  private highlightedStations: ReadonlySet<number> = new Set();
  private readonly options: MapControllerOptions;
  private readonly container: HTMLElement;
  private reduced = false;
  private odVisible = false;
  private anomaliesVisible = true;
  private stationsVisible = true;
  private readonly flowPresence = new Presence(FLOW_FADE_MS);
  private flowFeatures: ReadonlyMap<string, Feature<LineString, OdProperties>> = new Map();
  private flowIds: ReadonlyMap<string, number> = new Map();
  private fadeHandle: number | null = null;
  private motionHandle: number | null = null;
  private motionStep = -1;
  private readonly loadTween = new LoadTween(SEGMENT_FADE_MS);
  private segmentHandle: number | null = null;
  private segmentLastFrame = 0;
  private readonly onVisibility = (): void => { this.updateMotion(); };

  constructor(
    container: HTMLElement,
    private readonly stations: StationCollection,
    store: StationStore,
    options: MapControllerOptions,
  ) {
    if (!pmtilesRegistered) {
      // MapLibre 6 résout son worker relativement à son propre module : URL explicite, produite par Vite au build.
      maplibregl.setWorkerUrl(workerUrl);
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      pmtilesRegistered = true;
    }
    this.options = options;
    this.container = container;
    this.axisGroups = buildAxisGroups(stations);
    this.axisPositions = stations.features.map((f) => f.geometry.coordinates as [number, number]);
    this.coordinates = new Map(stations.features.map((f) => [f.properties.id, f.geometry.coordinates as [number, number]]));
    this.map = new maplibregl.Map({
      container,
      style: buildStyle(options.style),
      bounds: FRANCE_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      minZoom: 4,
      maxZoom: 15,
      attributionControl: { compact: false, customAttribution: 'Gares et échangeurs : Ministère de la Transition écologique (data.gouv.fr)' },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    this.animator = new StationAnimator(store.size);
    this.renderer = new StationLayerRenderer(this.map, store, this.animator);
    this.loop = new FrameLoop((now, quality) => this.renderer.renderFrame(now, quality), {
      // Qualité dégradée : les tirets animés des flux s'arrêtent d'abord.
      onQualityChange: (level) => { options.onQualityChange(level); this.updateMotion(); },
    });
    document.addEventListener('visibilitychange', this.onVisibility);

    this.map.on('load', () => {
      (this.map.getSource(SOURCE.stations) as GeoJSONSource).setData(this.stations).catch(reportError);
      this.ready = true;
      container.dataset.ready = 'true';
      this.onData();
      this.renderOd();
      this.layoutAxisLabels();
    });
    this.map.on('moveend', () => { this.layoutAxisLabels(); });
    this.map.on('resize', () => { this.layoutAxisLabels(); });
    // Exposé pour les tests de bout en bout et la supervision synthétique : nombre de gares effectivement dessinées.
    this.map.on('idle', () => {
      container.dataset.renderedStations = String(this.map.queryRenderedFeatures({ layers: ['stations'] }).length);
    });
    this.map.on('click', 'stations', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.id;
      options.onSelect(typeof id === 'number' ? id : null);
    });
    this.map.on('mouseenter', 'stations', () => { this.map.getCanvas().style.cursor = 'pointer'; });
    this.map.on('mouseleave', 'stations', () => {
      this.map.getCanvas().style.cursor = '';
      this.emitHover(null, options);
    });
    this.map.on('mousemove', 'stations', (event: MapLayerMouseEvent) => {
      const id = event.features?.[0]?.id;
      this.emitHover(typeof id === 'number' ? { index: id, x: event.point.x, y: event.point.y } : null, options);
    });
  }

  /** Noms des autoroutes : affichés ou masqués. Quand ils sont affichés, ils remplacent la couche native de références (pas de doublon). */
  setAxisLabelsVisible(visible: boolean): void {
    this.axisLabelsOn = visible;
    this.whenStyleReady(() => {
      if (this.map.getLayer('motorways-ref') !== undefined) {
        this.map.setLayoutProperty('motorways-ref', 'visibility', visible ? 'none' : 'visible');
      }
    });
    this.layoutAxisLabels();
  }

  /**
   * Étiquettes recalculées à chaque fin de déplacement : leur nombre croît avec le zoom et les collisions sont évitées.
   * Les marqueurs existants sont conservés (pas de clignotement), seuls les écarts sont ajoutés ou retirés.
   */
  private layoutAxisLabels(): void {
    if (!this.ready) {
      return;
    }
    const wanted = this.axisLabelsOn
      ? layoutLabels(this.axisGroups, this.axisPositions, ([lon, lat]) => { const p = this.map.project([lon, lat]); return [p.x, p.y]; },
        this.map.getZoom(), { width: this.container.clientWidth, height: this.container.clientHeight })
      : [];
    const keys = new Set(wanted.map((l) => l.key));
    for (const [key, label] of this.axisLabels) {
      if (!keys.has(key)) {
        label.marker.remove();
        this.axisLabels.delete(key);
      }
    }
    for (const candidate of wanted) {
      const existing = this.axisLabels.get(candidate.key);
      if (existing !== undefined) {
        existing.marker.setLngLat([candidate.lon, candidate.lat]).setOffset([...candidate.offset]);
        continue;
      }
      const element = document.createElement('div');
      element.className = 'axis-label';
      element.textContent = candidate.text;
      element.dataset.axis = candidate.value;
      // Aide visuelle à la souris et au toucher : le clavier et les lecteurs d'écran passent par la liste « Axe » du panneau.
      element.setAttribute('aria-hidden', 'true');
      element.addEventListener('mouseenter', () => { this.options.onAxisHover(candidate.value); });
      element.addEventListener('mouseleave', () => { this.options.onAxisHover(null); });
      element.addEventListener('click', (event) => { event.stopPropagation(); this.options.onAxisClick(candidate.value); });
      const marker = new maplibregl.Marker({ element, anchor: 'center', offset: [...candidate.offset] })
        .setLngLat([candidate.lon, candidate.lat]).addTo(this.map);
      this.axisLabels.set(candidate.key, { marker, element, value: candidate.value });
    }
    this.styleAxisLabels();
  }

  private styleAxisLabels(): void {
    for (const { element, value } of this.axisLabels.values()) {
      element.classList.toggle('axis-label-active', value === this.activeAxis);
    }
  }

  /**
   * Met en évidence les gares d'un axe (anneau) et estompe les autres ; `null` rétablit l'affichage.
   * Les états sont écrits seulement pour les gares dont l'état change.
   */
  setActiveAxis(value: string | null): void {
    this.activeAxis = value === '' ? null : value;
    this.container.dataset.activeAxis = this.activeAxis ?? '';
    this.styleAxisLabels();
    this.whenStyleReady(() => {
      const next = new Set(this.activeAxis === null ? [] : stationsOnAxes(this.stations, this.activeAxis));
      const dimming = this.activeAxis !== null;
      const wasDimming = this.highlightedStations.size > 0;
      const touched = dimming !== wasDimming ? this.stations.features.keys() : new Set([...this.highlightedStations, ...next]).values();
      for (const index of touched) {
        const active = next.has(index);
        this.map.setFeatureState({ source: SOURCE.stations, id: index }, { axis: active, dim: dimming && !active });
      }
      this.highlightedStations = next;
    });
  }

  /** Un seul appel par image : le pointeur peut émettre bien plus d'événements que l'écran n'affiche d'images. */
  private emitHover(hover: HoveredStation | null, options: MapControllerOptions): void {
    const scheduled = this.pendingHover !== undefined;
    this.pendingHover = hover;
    if (!scheduled) {
      requestAnimationFrame(() => {
        const value = this.pendingHover;
        this.pendingHover = undefined;
        if (value !== undefined) {
          options.onHover(value);
        }
      });
    }
  }

  /** Après chaque snapshot ou delta : nouvelles cibles d'animation, réveil de la boucle d'images. */
  onData(): void {
    if (!this.ready) {
      return;
    }
    this.renderer.onData(performance.now());
    this.loop.wake();
  }

  setOd(view: OdView): void {
    this.od = view;
    this.renderOd();
  }

  private renderOd(): void {
    if (!this.ready) {
      return;
    }
    // Aux départements, l'extrémité d'un arc est le centre de ses gares ; la gare sélectionnée ne filtre alors rien.
    const departments = this.od.level === 'DEPARTMENT';
    const coordinates = departments
      ? new Map(this.od.nodes.map((n) => [n.id, [n.longitude, n.latitude] as const]))
      : this.coordinates;
    const visible = selectFlows(this.od.flows, departments ? null : this.selectedId);
    const wanted = buildOdFeatures(visible, coordinates).features;
    const now = performance.now();
    this.flowPresence.update(wanted.map((f) => flowKey(f.properties)), now);
    // Un flux qui disparaît garde sa géométrie le temps de son fondu, puis est retiré par `fadeTick`.
    const current = new Set(wanted.map((f) => flowKey(f.properties)));
    const leaving = this.flowPresence.leaving().flatMap((key) => {
      const previous = this.flowFeatures.get(key);
      return previous === undefined || current.has(key) ? [] : [previous];
    });
    const features = [...wanted, ...leaving].map((feature, id) => ({ ...feature, id }));
    this.flowFeatures = new Map(features.map((f) => [flowKey(f.properties), f]));
    this.flowIds = new Map(features.map((f) => [flowKey(f.properties), f.id]));
    this.odCoordinates = coordinates;
    this.odFeatureKeys = features.map((f) => ({ originId: f.properties.originId, destinationId: f.properties.destinationId }));
    (this.map.getSource(SOURCE.od) as GeoJSONSource).setData({ type: 'FeatureCollection', features }).then(() => {
      this.applyHighlight();
      this.applyFade(performance.now());
      this.wakeFade();
      this.updateMotion();
    }, reportError);
  }

  private applyFade(now: number): void {
    for (const [key, id] of this.flowIds) {
      this.map.setFeatureState({ source: SOURCE.od, id }, { fade: this.flowPresence.alpha(key, now) });
    }
  }

  private wakeFade(): void {
    if (this.fadeHandle === null && this.flowPresence.active) {
      this.fadeHandle = requestAnimationFrame(this.fadeTick);
    }
  }

  private readonly fadeTick = (now: number): void => {
    this.fadeHandle = null;
    const step = this.flowPresence.tick(now);
    for (const [key, alpha] of step.changed) {
      const id = this.flowIds.get(key);
      if (id !== undefined) {
        this.map.setFeatureState({ source: SOURCE.od, id }, { fade: alpha });
      }
    }
    if (step.removed.length > 0) {
      this.renderOd();
    }
    this.wakeFade();
  };

  /**
   * Tirets animés sur les flux : seulement si les flux sont affichés et non vides, mouvement non réduit, onglet visible
   * et rendu à pleine qualité. `data-flow-motion` expose l'état aux tests de bout en bout.
   */
  private updateMotion(): void {
    const wanted = this.odVisible && !this.reduced && this.odFeatureKeys.length > 0 && !document.hidden && this.loop.quality === 0;
    this.container.dataset.flowMotion = wanted ? 'on' : 'off';
    if (wanted && this.motionHandle === null) {
      this.motionHandle = requestAnimationFrame(this.motionTick);
    } else if (!wanted && this.motionHandle !== null) {
      cancelAnimationFrame(this.motionHandle);
      this.motionHandle = null;
    }
  }

  private readonly motionTick = (now: number): void => {
    const step = dashStep(now, DASH_STEP_MS, DASH_STEPS);
    if (step !== this.motionStep && this.map.getLayer('od-flows-motion') !== undefined) {
      this.map.setPaintProperty('od-flows-motion', 'line-dasharray', DASH_SEQUENCE[step] ?? [1.5, 2.5]);
      this.motionStep = step;
    }
    this.motionHandle = requestAnimationFrame(this.motionTick);
  };

  /** Met en évidence l'arc d'un flux (survol ou sélection dans la liste) et atténue les autres. */
  setHighlightedFlow(flow: FlowKey | null): void {
    this.highlighted = flow;
    this.applyHighlight();
  }

  private applyHighlight(): void {
    if (!this.ready) {
      return;
    }
    const flow = this.highlighted;
    this.odFeatureKeys.forEach((key, id) => {
      const active = flow !== null && key.originId === flow.originId && key.destinationId === flow.destinationId;
      this.map.setFeatureState({ source: SOURCE.od, id }, { active, dim: flow !== null && !active });
    });
  }

  /** Cadre la carte sur les deux extrémités d'un flux. */
  focusFlow(flow: FlowKey): void {
    const origin = this.odCoordinates.get(flow.originId);
    const destination = this.odCoordinates.get(flow.destinationId);
    if (origin === undefined || destination === undefined) {
      return;
    }
    this.map.fitBounds([[Math.min(origin[0], destination[0]), Math.min(origin[1], destination[1])],
      [Math.max(origin[0], destination[0]), Math.max(origin[1], destination[1])]],
    { padding: 80, maxZoom: 9, duration: this.flightTo([(origin[0] + destination[0]) / 2, (origin[1] + destination[1]) / 2]) });
  }

  /** Durée d'un déplacement vers `target` : proportionnelle (en logarithme) à la distance depuis le centre actuel, nulle en mouvement réduit. */
  private flightTo(target: readonly [number, number]): number {
    const center = this.map.getCenter();
    return flightDurationMs(distanceKm([center.lng, center.lat], target), this.reduced);
  }

  /**
   * Charge ESTIMÉE : intensité 0 à 1 posée en feature-state sur les tronçons de la couche autoroutes (promoteId segmentId).
   * Le passage d'une estimation à la suivante se fait en fondu (voir animation/loadTween.ts).
   */
  setSegmentLoads(loads: readonly SegmentLoad[]): void {
    this.whenStyleReady(() => {
      if (this.map.getSource(SOURCE.motorways) === undefined) {
        return;
      }
      const diff = diffSegmentLoads(this.segmentIntensity, loads);
      this.segmentIntensity = diff.next;
      const now = performance.now();
      this.loadTween.retarget(diff.set, diff.clear, now);
      const instant = this.reduced || diff.set.length + diff.clear.length > SEGMENT_TWEEN_LIMIT;
      this.applyLoadStep(this.loadTween.step(instant ? now + SEGMENT_FADE_MS : now));
      this.wakeSegments();
    });
  }

  private applyLoadStep(step: { readonly set: readonly (readonly [string, number])[]; readonly clear: readonly string[] }): void {
    const target = (id: string) => ({ source: SOURCE.motorways, sourceLayer: MOTORWAYS_SOURCE_LAYER, id });
    step.set.forEach(([id, load]) => { this.map.setFeatureState(target(id), { load }); });
    step.clear.forEach((id) => { this.map.removeFeatureState(target(id), 'load'); });
  }

  private wakeSegments(): void {
    if (this.segmentHandle === null && this.loadTween.active) {
      this.segmentHandle = requestAnimationFrame(this.segmentTick);
    }
  }

  private readonly segmentTick = (now: number): void => {
    this.segmentHandle = null;
    if (now - this.segmentLastFrame >= SEGMENT_FRAME_MS) {
      this.segmentLastFrame = now;
      this.applyLoadStep(this.loadTween.step(now));
    }
    this.wakeSegments();
  };

  setLayers(visibility: LayerVisibility): void {
    this.stationsVisible = visibility.stations;
    this.whenStyleReady(() => {
      const show = (id: string, visible: boolean) => {
        if (this.map.getLayer(id) !== undefined) {
          this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      };
      ['stations', 'stations-halo', 'stations-axis', 'stations-selected'].forEach((id) => { show(id, visibility.stations); });
      show('stations-anomalies', visibility.stations && this.anomaliesVisible);
      show('stations-label', visibility.stations && visibility.labels);
      show('od-flows', visibility.od);
      show('od-flows-motion', visibility.od && !this.reduced);
      this.odVisible = visibility.od;
      this.updateMotion();
      show('segments-load', visibility.segments);
    });
  }

  /** Le direct ne doit jamais projeter ses incidents sur une carte historique, même pendant son chargement. */
  setAnomaliesVisible(visible: boolean): void {
    this.anomaliesVisible = visible;
    this.whenStyleReady(() => {
      this.map.setLayoutProperty('stations-anomalies', 'visibility', visible && this.stationsVisible ? 'visible' : 'none');
    });
  }

  setKinds(kinds: ReadonlySet<StationKind>): void {
    this.whenStyleReady(() => {
      const filter: maplibregl.FilterSpecification = ['in', ['get', 'kind'], ['literal', [...kinds]]];
      // Les libellés sont absents sans polices auto-hébergées.
      STATION_LAYERS.filter((id) => this.map.getLayer(id) !== undefined).forEach((id) => { this.map.setFilter(id, filter); });
    });
  }

  setSelected(index: number | null, focus: boolean): void {
    this.whenStyleReady(() => {
      this.renderer.setSelected(index);
      const feature = index === null ? undefined : this.stations.features[index];
      this.selectedId = feature?.properties.id ?? null;
      this.renderOd();
      if (focus && feature !== undefined) {
        const center = feature.geometry.coordinates as [number, number];
        this.map.flyTo({ center, zoom: 11, essential: false, duration: this.flightTo(center) });
      }
    });
  }

  setStale(stationIds: readonly string[]): void {
    this.whenStyleReady(() => {
      const indices = new Set<number>();
      this.stations.features.forEach((f, i) => { if (stationIds.includes(f.properties.id)) { indices.add(i); } });
      this.renderer.setStale(indices);
    });
  }

  /** Change les couleurs des couches métier sans recharger le style (gares, flux, tronçons, anneau d'axe). */
  setPalette(palette: Palette): void {
    this.whenStyleReady(() => {
      const theme = themeFor(palette);
      const paint = (layer: string, property: 'circle-color' | 'circle-stroke-color' | 'line-gradient' | 'line-color', value: unknown) => {
        if (this.map.getLayer(layer) !== undefined) {
          this.map.setPaintProperty(layer, property, value as ExpressionSpecification | string);
        }
      };
      paint('stations', 'circle-color', stationColor(theme));
      paint('stations-anomalies', 'circle-stroke-color', anomalyColor(theme));
      paint('stations-axis', 'circle-stroke-color', theme.odFlow);
      paint('od-flows', 'line-gradient', flowGradient(theme));
      paint('segments-load', 'line-color', segmentColor(theme));
    });
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    this.animator.setReducedMotion(reduced);
    this.flowPresence.setDuration(reduced ? 0 : FLOW_FADE_MS);
    this.loadTween.setDuration(reduced ? 0 : SEGMENT_FADE_MS);
    this.whenStyleReady(() => {
      if (this.map.getLayer('od-flows-motion') !== undefined) {
        this.map.setLayoutProperty('od-flows-motion', 'visibility', this.odVisible && !reduced ? 'visible' : 'none');
      }
      this.updateMotion();
    });
  }

  /** Cadre la carte sur l'ensemble des gares d'une autoroute. */
  focusAxis(stationIndices: readonly number[]): void {
    const points = stationIndices.flatMap((i) => {
      const coordinates = this.stations.features[i]?.geometry.coordinates;
      return coordinates === undefined ? [] : [coordinates as [number, number]];
    });
    if (points.length === 0) {
      return;
    }
    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const middle: [number, number] = [(Math.min(...lons) + Math.max(...lons)) / 2, (Math.min(...lats) + Math.max(...lats)) / 2];
    this.map.fitBounds([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
      { padding: 80, maxZoom: 9, duration: this.flightTo(middle) });
  }

  resetView(): void {
    this.map.fitBounds(FRANCE_BOUNDS, { padding: 24, duration: this.flightTo([(FRANCE_BOUNDS[0][0] + FRANCE_BOUNDS[1][0]) / 2, (FRANCE_BOUNDS[0][1] + FRANCE_BOUNDS[1][1]) / 2]) });
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const handle of [this.fadeHandle, this.motionHandle, this.segmentHandle]) {
      if (handle !== null) {
        cancelAnimationFrame(handle);
      }
    }
    this.loop.stop();
    this.map.remove();
  }

  private whenStyleReady(action: () => void): void {
    if (this.ready) {
      action();
    } else {
      this.map.once('load', action);
    }
  }
}
