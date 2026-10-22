import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapLayerMouseEvent } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { Protocol } from 'pmtiles';
import { FrameLoop } from '../animation/frameLoop';
import type { QualityLevel } from '../animation/frameLoop';
import { StationAnimator } from '../animation/stationAnimator';
import { EMPTY_OD_VIEW } from '../od/odTypes';
import type { OdView } from '../od/odTypes';
import type { StationStore } from '../state/stationStore';
import type { LayerVisibility } from '../state/uiStore';
import { SOURCE } from './layers';
import { buildOdFeatures, selectFlows } from './odGeometry';
import type { StationCollection, StationKind } from './referentiel';
import { StationLayerRenderer } from './stationLayerRenderer';
import { buildStyle } from './style';
import type { StyleOptions } from './style';
import { FRANCE_BOUNDS } from './theme';

let pmtilesRegistered = false;

export interface MapControllerOptions {
  readonly style: StyleOptions;
  readonly onSelect: (index: number | null) => void;
  readonly onQualityChange: (level: QualityLevel) => void;
}

const STATION_LAYERS = ['stations', 'stations-halo', 'stations-selected', 'stations-label'] as const;

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
      onQualityChange: options.onQualityChange,
    });

    this.map.on('load', () => {
      (this.map.getSource(SOURCE.stations) as GeoJSONSource).setData(this.stations).catch(reportError);
      this.ready = true;
      container.dataset.ready = 'true';
      this.onData();
      this.renderOd();
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
    this.map.on('mouseleave', 'stations', () => { this.map.getCanvas().style.cursor = ''; });
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
    if (this.ready) {
      // Aux départements, l'extrémité d'un arc est le centre de ses gares ; la gare sélectionnée ne filtre alors rien.
      const departments = this.od.level === 'DEPARTMENT';
      const coordinates = departments
        ? new Map(this.od.nodes.map((n) => [n.id, [n.longitude, n.latitude] as const]))
        : this.coordinates;
      const visible = selectFlows(this.od.flows, departments ? null : this.selectedId);
      (this.map.getSource(SOURCE.od) as GeoJSONSource).setData(buildOdFeatures(visible, coordinates)).catch(reportError);
    }
  }

  setLayers(visibility: LayerVisibility): void {
    this.whenStyleReady(() => {
      const show = (id: string, visible: boolean) => {
        if (this.map.getLayer(id) !== undefined) {
          this.map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
        }
      };
      ['stations', 'stations-halo', 'stations-selected'].forEach((id) => { show(id, visibility.stations); });
      show('stations-label', visibility.stations && visibility.labels);
      show('od-flows', visibility.od);
      show('segments-load', visibility.segments);
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
        this.map.flyTo({ center: feature.geometry.coordinates as [number, number], zoom: 11, essential: false });
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

  setReducedMotion(reduced: boolean): void {
    this.animator.setReducedMotion(reduced);
  }

  resetView(): void {
    this.map.fitBounds(FRANCE_BOUNDS, { padding: 24 });
  }

  destroy(): void {
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
