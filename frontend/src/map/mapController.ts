import { flowEmphasis } from './flowEmphasis';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import type { AllPaintProperties } from '@maplibre/maplibre-gl-style-spec';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { PMTiles, Protocol } from 'pmtiles';
import { FLOW_LOCAL_ZOOM, FLOW_MOTION_BANDS, FLOW_STEP_MS, flowPattern, flowDetail, motionMinZoom } from '../animation/flowMotion';
import type { FlowDensity, FlowDetail } from '../animation/flowMotion';
import type { TrafficMotionState } from '../animation/trafficMotion';
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
import { readConcessionBounds } from './concessionBounds';
import type { RoadBounds } from './concessionBounds';
import { flowLabels } from './flowLabels';
import { formatCount } from '../ui/format';
import { buildAxisGroups, layoutLabels, stationsOnAxes } from './axes';
import { selectedRoadIds } from './motorwaySelection';
import { MOTORWAYS_SOURCE_LAYER, SOURCE } from './layers';
import { buildOdFeatures, selectFlows } from './odGeometry';
import { diffSegmentLoads } from './segmentLoads';
import type { SegmentLoad } from '../realtime/protocol';
import type { StationCollection, StationKind } from './referentiel';
import { StationLayerRenderer } from './stationLayerRenderer';
import { buildStyle } from './style';
import type { StyleOptions } from './style';
import { FRANCE_BOUNDS } from './theme';
import type { MapAppearance, Palette } from './theme';

const protocol = new Protocol();
let pmtilesRegistered = false;
type MapViewMode = 'flat' | 'perspective' | 'relief';
const TERRAIN_SOURCE = 'elevation';
const TERRAIN_HILLSHADE = 'elevation-hillshade';
const TERRAIN_MIN_ZOOM = 7;

export interface MapControllerOptions {
  readonly style: StyleOptions;
  readonly onSelect: (index: number | null) => void;
  readonly onQualityChange: (level: QualityLevel) => void;
  /** Gare sous le pointeur (null : aucune). Appelé au plus une fois par image. */
  readonly onHover: (hover: HoveredStation | null) => void;
  /** Survol (valeur du filtre « Axe », ou null en sortant) et clic sur le nom d'une autoroute. */
  readonly onAxisHover: (axis: string | null) => void;
  readonly onAxisClick: (axis: string) => void;
  readonly onTrafficOverviewChange?: (overview: boolean) => void;
}

const STATION_LAYERS = ['stations', 'stations-halo', 'stations-anomalies', 'stations-axis', 'stations-selected', 'stations-label'] as const;

const PERSPECTIVE_PITCH = 45;
const PERSPECTIVE_TRANSITION_MS = 400;
const FLOW_FADE_MS = 300;
const SEGMENT_FADE_MS = 500;
/** Au-delà, les tronçons passent à leur nouvelle charge d'un coup : animer des milliers d'états par image coûterait plus que le fondu n'apporte. */
const SEGMENT_TWEEN_LIMIT = 2_500;
const SEGMENT_FRAME_MS = 50;
const flowKey = (p: { readonly originId: string; readonly destinationId: string }): string => `${p.originId}>${p.destinationId}`;

interface AxisLabel {
  readonly marker: maplibregl.Marker;
  readonly element: HTMLElement;
  readonly value: string;
}

/** Unique point de contact avec MapLibre : React ne manipule jamais la carte directement. */
export class MapController {
  private palette: Palette;
  private appearance: MapAppearance;
  private sprite: string | null;
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
  private motionStations: ReadonlySet<string> = new Set();
  private highlightedStations: ReadonlySet<number> = new Set();
  private highlightedRoads: ReadonlySet<string | number> = new Set();
  private roadHighlightHandle: number | null = null;
  private readonly options: MapControllerOptions;
  private readonly container: HTMLElement;
  private reduced = false;
  private odVisible = false;
  private segmentsVisible = false;
  private trafficOverview = false;
  private viewMode: MapViewMode = 'flat';
  private terrainActive = false;
  private terrainFailed = false;
  private syncViewControl = (): void => {};
  private readonly directionalLabels = new Map<string, { marker: maplibregl.Marker; arrow: HTMLElement; volume: HTMLElement }>();
  private readonly concessionAbort = new AbortController();
  private concessionBounds: Promise<ReadonlyMap<string, RoadBounds>> | null = null;
  private cameraRequest = 0;
  private anomaliesVisible = true;
  private stationsVisible = true;
  private readonly flowPresence = new Presence(FLOW_FADE_MS);
  private flowFeatures: ReadonlyMap<string, Feature<LineString, OdProperties>> = new Map();
  private flowIds: ReadonlyMap<string, number> = new Map();
  private fadeHandle: number | null = null;
  private motionHandle: number | null = null;
  private motionStep = -1;
  private motionElapsedMs = 0;
  private motionLastTime: number | null = null;
  private motionDataState: TrafficMotionState = 'waiting';
  private motionDetail: FlowDetail | null = null;
  private motionDensities: ReadonlySet<FlowDensity> = new Set();
  private readonly loadTween = new LoadTween(SEGMENT_FADE_MS);
  private segmentHandle: number | null = null;
  private segmentLastFrame = 0;
  private readonly onVisibility = (): void => { this.updateMotion(); };
  private readonly onZoom = (): void => {
    // Les styles interpolent en continu ; seuls les changements de niveau réveillent ou arrêtent la boucle.
    if (!this.ready) return;
    if (flowDetail(this.map.getZoom()) !== this.motionDetail) this.updateTrafficDisplay();
  };

  constructor(
    container: HTMLElement,
    private readonly stations: StationCollection,
    store: StationStore,
    options: MapControllerOptions,
  ) {
    if (!pmtilesRegistered) {
      // MapLibre 6 résout son worker relativement à son propre module : URL explicite, produite par Vite au build.
      maplibregl.setWorkerUrl(workerUrl);
      maplibregl.addProtocol('pmtiles', protocol.tile);
      pmtilesRegistered = true;
    }
    this.options = options;
    this.container = container;
    this.palette = options.style.palette ?? 'default';
    this.appearance = options.style.appearance ?? 'dark';
    const initialStyle = buildStyle(options.style);
    this.sprite = typeof initialStyle.sprite === 'string' ? initialStyle.sprite : null;
    container.dataset.appearance = this.appearance;
    this.axisGroups = buildAxisGroups(stations);
    this.axisPositions = stations.features.map((f) => f.geometry.coordinates as [number, number]);
    this.coordinates = new Map(stations.features.map((f) => [f.properties.id, f.geometry.coordinates as [number, number]]));
    this.map = new maplibregl.Map({
      container,
      style: initialStyle,
      bounds: FRANCE_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      minZoom: 4,
      maxZoom: 15,
      attributionControl: { compact: false, customAttribution: 'Gares et échangeurs : Ministère de la Transition écologique (data.gouv.fr)' },
    });
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    this.map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    this.addPerspectiveControl();

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
      this.updateTerrain();
    });
    this.map.on('moveend', () => {
      this.updateTerrain();
      this.layoutAxisLabels();
      this.layoutFlowLabels();
    });
    this.map.on('zoom', this.onZoom);
    this.map.on('resize', () => { this.layoutAxisLabels(); this.layoutFlowLabels(); });
    this.map.on('sourcedata', (event) => {
      if (event.sourceId === SOURCE.motorways && event.sourceDataType === 'content' && this.activeAxis !== null
        && this.roadHighlightHandle === null) {
        this.roadHighlightHandle = requestAnimationFrame(() => {
          this.roadHighlightHandle = null;
          this.highlightAxisRoads();
        });
      }
    });
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

  private addPerspectiveControl(): void {
    const control = document.createElement('div');
    control.className = 'maplibregl-ctrl map-view-control';
    const group = document.createElement('div');
    group.className = 'maplibregl-ctrl-group map-perspective';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Mode de vue de la carte');
    const message = document.createElement('div');
    message.className = 'map-view-message';
    message.setAttribute('role', 'status');
    control.append(message, group);
    const modes = [['flat', '2D'], ['perspective', 'Perspective'], ['relief', 'Relief']] as const;
    const buttons = modes.map(([mode, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => {
        this.map.stop();
        this.viewMode = mode;
        this.terrainFailed = false;
        this.map.easeTo({ pitch: mode === 'flat' ? 0 : PERSPECTIVE_PITCH, duration: this.reduced ? 0 : PERSPECTIVE_TRANSITION_MS });
        this.updateTerrain();
        if (this.ready) this.updateTrafficDisplay();
      });
      group.append(button);
      return { mode, button };
    });
    this.syncViewControl = (): void => {
      this.container.dataset.viewMode = this.viewMode;
      this.container.dataset.terrain = this.terrainActive ? 'on' : 'off';
      for (const { mode, button } of buttons) button.setAttribute('aria-pressed', String(mode === this.viewMode));
      const status = this.viewMode !== 'relief' ? '' : this.terrainFailed ? 'Relief indisponible. Réessayer avec Relief.'
        : this.map.getZoom() < TERRAIN_MIN_ZOOM ? 'Zoomez pour afficher le relief.' : '';
      if (message.textContent !== status) message.textContent = status;
      message.hidden = status === '';
    };
    const syncPitch = (): void => {
      if (this.viewMode !== 'relief') this.viewMode = this.map.getPitch() > 0 ? 'perspective' : 'flat';
      this.syncViewControl();
      if (this.ready) this.updateTrafficDisplay();
    };
    const terrainError = (event: maplibregl.ErrorEvent): void => {
      if (!('sourceId' in event) || event.sourceId !== TERRAIN_SOURCE || !this.terrainActive) return;
      this.terrainFailed = true;
      queueMicrotask(() => { if (this.ready) this.updateTerrain(); });
    };
    this.map.addControl({
      onAdd: (map) => {
        this.syncViewControl();
        map.on('pitchend', syncPitch);
        map.on('error', terrainError);
        return control;
      },
      onRemove: (map) => {
        map.off('pitchend', syncPitch);
        map.off('error', terrainError);
        control.remove();
      },
    }, 'bottom-left');
  }

  private updateTerrain(): void {
    const wanted = this.ready && this.viewMode === 'relief' && !this.terrainFailed && this.map.getZoom() >= TERRAIN_MIN_ZOOM;
    if (wanted && !this.terrainActive) {
      this.terrainActive = true;
      this.map.addSource(TERRAIN_SOURCE, {
        type: 'raster-dem', url: 'https://tiles.mapterhorn.com/tilejson.json', encoding: 'terrarium', tileSize: 512,
      });
      this.map.addLayer({
        id: TERRAIN_HILLSHADE, type: 'hillshade', source: TERRAIN_SOURCE,
        paint: { 'hillshade-exaggeration': 0.28 },
      }, this.map.getLayer('motorways-casing') ? 'motorways-casing' : 'od-flows');
      this.map.setTerrain({ source: TERRAIN_SOURCE, exaggeration: 1 });
    } else if (!wanted && this.terrainActive) {
      this.terrainActive = false;
      this.map.setTerrain(null);
      this.map.removeLayer(TERRAIN_HILLSHADE);
      this.map.removeSource(TERRAIN_SOURCE);
    }
    this.syncViewControl();
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
      this.highlightAxisRoads();
    });
  }

  /** Seul le filtre choisi anime les flux ; le survol conserve uniquement la mise en évidence des gares. */
  setMotionAxis(value: string): void {
    this.motionStations = new Set(stationsOnAxes(this.stations, value).flatMap((index) => {
      const id = this.stations.features[index]?.properties.id;
      return id === undefined ? [] : [id];
    }));
    this.whenStyleReady(() => { this.applyHighlight(); this.updateMotion(); });
  }

  /** Une interruption fige les tirets affichés ; elle ne retire ni géométrie, ni volume, ni date. */
  setTrafficMotion(state: TrafficMotionState): void {
    if (state === this.motionDataState) return;
    this.motionDataState = state;
    this.whenStyleReady(() => { this.updateMotion(); });
  }

  /** Rejoué à l’arrivée des tuiles : la recherche peut précéder le chargement du tracé. */
  private highlightAxisRoads(): void {
    if (!this.ready || this.map.getSource(SOURCE.motorways) === undefined) {
      this.container.dataset.highlightedRoads = '0';
      return;
    }
    const next = this.activeAxis === null ? new Set<string | number>()
      : selectedRoadIds(this.map.querySourceFeatures(SOURCE.motorways, { sourceLayer: MOTORWAYS_SOURCE_LAYER }), this.activeAxis);
    for (const id of this.highlightedRoads) {
      if (!next.has(id)) this.map.setFeatureState({ source: SOURCE.motorways, sourceLayer: MOTORWAYS_SOURCE_LAYER, id }, { axisSelected: false });
    }
    for (const id of next) {
      if (!this.highlightedRoads.has(id)) this.map.setFeatureState({ source: SOURCE.motorways, sourceLayer: MOTORWAYS_SOURCE_LAYER, id }, { axisSelected: true });
    }
    this.highlightedRoads = next;
    this.container.dataset.highlightedRoads = String(next.size);
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

  /** Filtre par concession exacte, sans assimiler un numéro d'autoroute à un gestionnaire unique. */
  setConcession(code: string | null): void {
    this.cameraRequest++;
    this.container.dataset.concession = code ?? '';
    this.whenStyleReady(() => {
      if (this.map.getLayer('motorways-concession') !== undefined) {
        this.map.setFilter('motorways-concession', ['==', ['get', 'concession'], code ?? '__none__']);
      }
    });
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
    const wanted = buildOdFeatures(visible, coordinates, !departments).features;
    this.container.dataset.roadFlows = String(wanted.filter((f) => f.properties.routeKind === 'ROAD').length);
    this.container.dataset.schematicFlows = String(wanted.filter((f) => f.properties.routeKind === 'SCHEMATIC').length);
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
      if (!this.ready) return;
      this.applyHighlight();
      this.applyFade(performance.now());
      this.wakeFade();
      this.updateMotion();
      this.layoutFlowLabels();
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
   * Tirets des flux de l’axe en 2D, ou de la gare sélectionnée en perspective rapprochée.
   * Respecte le mouvement réduit, la visibilité de l’onglet et la qualité du rendu.
   */
  private updateMotion(): void {
    const zoom = this.map.getZoom();
    this.motionDetail = flowDetail(zoom);
    const members = this.viewMode === 'flat' ? this.motionStations
      : zoom >= FLOW_LOCAL_ZOOM && this.selectedId !== null ? new Set([this.selectedId]) : new Set<string>();
    const eligibleFlows = this.od.level === 'STATION' ? [...this.flowFeatures.values()].filter((flow) =>
      members.has(flow.properties.originId) || members.has(flow.properties.destinationId)) : [];
    const bands = FLOW_MOTION_BANDS.map((band) => ({ ...band,
      count: zoom < motionMinZoom(band.density) ? 0 : eligibleFlows.filter((flow) => flow.properties.density === band.density).length,
    }));
    const count = bands.reduce((sum, band) => sum + band.count, 0);
    const shown = this.odVisible && !this.reduced && this.loop.quality === 0;
    this.motionDensities = new Set(bands.filter((band) => shown && band.count > 0).map((band) => band.density));
    const current = this.motionDataState === 'live' || this.motionDataState === 'replay';
    const wanted = shown && count > 0 && !document.hidden && current;
    this.container.dataset.flowMotion = wanted ? 'on' : 'off';
    this.container.dataset.flowDetail = this.motionDetail;
    this.container.dataset.flowMotionReason = wanted ? 'running' : !current ? this.motionDataState
      : document.hidden ? 'hidden' : this.motionDetail === 'national' ? 'zoom' : 'display';
    this.container.dataset.animatedFlows = String(wanted ? count : 0);
    for (const { id, density, count: bandCount } of bands) {
      if (this.map.getLayer(id) !== undefined) {
        this.map.setFilter(id, ['all', ['==', ['get', 'density'], density], ['any',
          ['in', ['get', 'originId'], ['literal', [...members]]], ['in', ['get', 'destinationId'], ['literal', [...members]]],
        ]]);
        this.map.setLayoutProperty(id, 'visibility', shown && bandCount > 0 ? 'visible' : 'none');
      }
    }
    if (wanted && this.motionHandle === null) {
      this.motionStep = -1;
      this.motionLastTime = null;
      this.motionHandle = requestAnimationFrame(this.motionTick);
    } else if (!wanted && this.motionHandle !== null) {
      cancelAnimationFrame(this.motionHandle);
      this.motionHandle = null;
      this.motionLastTime = null;
    }
  }

  private readonly motionTick = (now: number): void => {
    if (this.motionLastTime !== null) this.motionElapsedMs += Math.max(0, now - this.motionLastTime);
    this.motionLastTime = now;
    const step = Math.floor(this.motionElapsedMs / FLOW_STEP_MS);
    if (step !== this.motionStep) {
      for (const { id, density } of FLOW_MOTION_BANDS) {
        if (this.motionDensities.has(density) && this.map.getLayer(id) !== undefined) {
          this.map.setPaintProperty(id, 'line-dasharray', flowPattern(density, this.motionElapsedMs));
        }
      }
      this.motionStep = step;
    }
    this.motionHandle = requestAnimationFrame(this.motionTick);
  };

  private updateTrafficDisplay(): void {
    const overview = this.viewMode !== 'flat' && flowDetail(this.map.getZoom()) === 'national'
      && this.segmentIntensity.size > 0 && (this.odVisible || this.segmentsVisible);
    if (overview !== this.trafficOverview) {
      this.trafficOverview = overview;
      this.options.onTrafficOverviewChange?.(overview);
    }
    if (this.map.getLayer('od-flows') !== undefined) {
      this.map.setLayoutProperty('od-flows', 'visibility', this.odVisible && !overview ? 'visible' : 'none');
    }
    if (this.map.getLayer('segments-load') !== undefined) {
      this.map.setLayoutProperty('segments-load', 'visibility', this.segmentsVisible || overview ? 'visible' : 'none');
    }
    this.updateMotion();
    this.layoutFlowLabels();
  }

  private layoutFlowLabels(): void {
    const labels = this.viewMode !== 'flat' && this.odVisible && this.selectedId !== null
        && this.od.level === 'STATION' && this.map.getZoom() >= FLOW_LOCAL_ZOOM
      ? flowLabels([...this.flowFeatures.values()], this.selectedId, ([lon, lat]) => {
        const point = this.map.project([lon, lat]);
        return [point.x, point.y];
      }, this.container.clientWidth, this.container.clientHeight)
      : [];
    const wanted = new Set(labels.map((label) => label.key));
    for (const [key, { marker }] of this.directionalLabels) {
      if (!wanted.has(key)) { marker.remove(); this.directionalLabels.delete(key); }
    }
    for (const label of labels) {
      let item = this.directionalLabels.get(label.key);
      if (item === undefined) {
        const element = document.createElement('div');
        element.className = 'map-flow-label';
        element.dataset.direction = label.inbound ? 'inbound' : 'outbound';
        element.setAttribute('aria-hidden', 'true');
        const arrow = document.createElement('span');
        arrow.textContent = '➜';
        const volume = document.createElement('span');
        element.append(arrow, volume);
        const marker = new maplibregl.Marker({ element, offset: [...label.offset] })
          .setLngLat([...label.position]).addTo(this.map);
        item = { marker, arrow, volume };
        this.directionalLabels.set(label.key, item);
      } else {
        item.marker.setLngLat([...label.position]).setOffset([...label.offset]);
      }
      item.arrow.style.transform = `rotate(${label.angle}deg)`;
      const volume = formatCount(label.vehicles);
      if (item.volume.textContent !== volume) item.volume.textContent = volume;
    }
  }

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
      this.map.setFeatureState({ source: SOURCE.od, id }, flowEmphasis(key, flow, this.selectedId, this.motionStations, this.od.level === 'STATION'));
    });
  }

  /** Cadre tout l'itinéraire, y compris les détours qui débordent du rectangle de ses deux gares. */
  focusFlow(flow: FlowKey): void {
    this.cameraRequest++;
    const origin = this.odCoordinates.get(flow.originId);
    const destination = this.odCoordinates.get(flow.destinationId);
    if (origin === undefined || destination === undefined) {
      return;
    }
    const points = this.flowFeatures.get(flowKey(flow))?.geometry.coordinates ?? [origin, destination];
    const bounds = new maplibregl.LngLatBounds();
    for (const point of points) {
      const [lon, lat] = point;
      bounds.extend([lon, lat]);
    }
    const center = bounds.getCenter();
    this.map.fitBounds(bounds,
      { padding: 80, maxZoom: 9, duration: this.flightTo([center.lng, center.lat]) });
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
  setSegmentLoads(loads: readonly SegmentLoad[], reference: number): void {
    this.whenStyleReady(() => {
      if (this.map.getSource(SOURCE.motorways) === undefined) {
        return;
      }
      const diff = diffSegmentLoads(this.segmentIntensity, loads, reference);
      const wasAvailable = this.segmentIntensity.size > 0;
      this.segmentIntensity = diff.next;
      if (wasAvailable !== (diff.next.size > 0)) this.updateTrafficDisplay();
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
      this.odVisible = visibility.od;
      this.segmentsVisible = visibility.segments;
      this.updateTrafficDisplay();
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
    if (focus) this.cameraRequest++;
    this.whenStyleReady(() => {
      this.renderer.setSelected(index);
      const feature = index === null ? undefined : this.stations.features[index];
      this.selectedId = feature?.properties.id ?? null;
      this.stations.features.forEach((_, id) => {
        this.map.setFeatureState({ source: SOURCE.stations, id }, { selectionDim: this.selectedId !== null && id !== index });
      });
      this.container.dataset.selectedStation = this.selectedId ?? '';
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

  /** Paint-only changes preserve sources, feature states, camera and animation phases. */
  setPalette(palette: Palette): void {
    this.palette = palette;
    this.applyAppearance();
  }

  setAppearance(appearance: MapAppearance): void {
    this.appearance = appearance;
    this.applyAppearance();
  }

  private applyAppearance(): void {
    this.whenStyleReady(() => {
      const style = buildStyle({ ...this.options.style, palette: this.palette, appearance: this.appearance });
      for (const layer of style.layers) {
        if (this.map.getLayer(layer.id) === undefined || layer.paint === undefined) continue;
        for (const [property, value] of Object.entries(layer.paint)) {
          // The live dash pattern belongs to the motion clock, not the theme.
          if (property === 'line-dasharray' && FLOW_MOTION_BANDS.some((band) => band.id === layer.id)) continue;
          const name = property as keyof AllPaintProperties;
          this.map.setPaintProperty(layer.id, name, value as AllPaintProperties[typeof name]);
        }
      }
      if (typeof style.sprite === 'string' && style.sprite !== this.sprite) {
        this.map.setSprite(style.sprite);
        this.sprite = style.sprite;
      }
      this.container.dataset.appearance = this.appearance;
    });
  }

  setReducedMotion(reduced: boolean): void {
    this.reduced = reduced;
    this.animator.setReducedMotion(reduced);
    this.flowPresence.setDuration(reduced ? 0 : FLOW_FADE_MS);
    this.loadTween.setDuration(reduced ? 0 : SEGMENT_FADE_MS);
    this.whenStyleReady(() => {
      this.updateMotion();
    });
  }

  async focusConcession(code: string): Promise<boolean | null> {
    const url = this.options.style.motorwaysUrl;
    if (url?.startsWith('pmtiles://') !== true) return false;
    const request = ++this.cameraRequest;
    const archiveUrl = url.slice('pmtiles://'.length);
    const archive = protocol.get(archiveUrl) ?? new PMTiles(archiveUrl);
    protocol.add(archive);
    this.concessionBounds ??= readConcessionBounds(archive, this.concessionAbort.signal).catch((error: unknown) => {
      this.concessionBounds = null;
      throw error;
    });
    const bounds = (await this.concessionBounds).get(code);
    if (this.concessionAbort.signal.aborted || request !== this.cameraRequest || this.container.dataset.concession !== code) return null;
    if (bounds === undefined) return false;
    const [west, south, east, north] = bounds;
    this.fitNetwork([[west, south], [east, north]]);
    return true;
  }

  private fitNetwork(bounds: [[number, number], [number, number]]): void {
    const [[west, south], [east, north]] = bounds;
    const padding = Math.min(80, Math.floor(Math.min(this.container.clientWidth, this.container.clientHeight) / 5));
    this.map.fitBounds(bounds, { padding, maxZoom: 9, duration: this.flightTo([(west + east) / 2, (south + north) / 2]) });
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
    this.cameraRequest++;
    this.fitNetwork([[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]]);
  }

  resetView(): void {
    this.cameraRequest++;
    this.map.fitBounds(FRANCE_BOUNDS, { padding: 24, duration: this.flightTo([(FRANCE_BOUNDS[0][0] + FRANCE_BOUNDS[1][0]) / 2, (FRANCE_BOUNDS[0][1] + FRANCE_BOUNDS[1][1]) / 2]) });
  }

  destroy(): void {
    this.ready = false;
    this.concessionAbort.abort();
    for (const { marker } of this.directionalLabels.values()) marker.remove();
    this.directionalLabels.clear();
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const handle of [this.fadeHandle, this.motionHandle, this.segmentHandle, this.roadHighlightHandle]) {
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
