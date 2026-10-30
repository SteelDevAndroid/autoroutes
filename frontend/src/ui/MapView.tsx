import { useEffect, useRef } from 'react';
import { config } from '../config';
import { MapController } from '../map/mapController';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { trafficMotionState } from '../animation/trafficMotion';

/**
 * Monte la carte une seule fois. Les changements d'interface sont relayés au contrôleur par abonnement
 * au store Zustand, sans re-rendu React du composant carte.
 */
export function MapView({ stations, store, onReady }: {
  readonly stations: StationCollection;
  readonly store: StationStore;
  readonly onReady: (controller: MapController | null) => void;
}) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (container.current === null) {
      return undefined;
    }
    const ui = useUiStore.getState();
    const controller = new MapController(container.current, stations, store, {
      style: {
        basemapUrl: config.basemapUrl,
        palette: ui.palette,
        motorwaysUrl: config.motorwaysUrl,
        glyphsUrl: config.glyphsUrl,
        spriteUrl: config.spriteUrl,
      },
      onSelect: (index) => { useUiStore.getState().select(index); },
      onQualityChange: (level) => { useUiStore.getState().setQuality(level); },
      onHover: (hover) => { useUiStore.getState().setHover(hover); },
      onAxisHover: (axis) => { useUiStore.getState().setHoverAxis(axis); },
      onAxisClick: (axis) => { useUiStore.getState().chooseAxis(axis); },
    });
    controller.setLayers(ui.layers);
    controller.setAnomaliesVisible(ui.mode === 'live');
    controller.setKinds(ui.kinds);
    controller.setReducedMotion(ui.reducedMotion);
    controller.setAxisLabelsVisible(ui.layers.axes);
    controller.setActiveAxis(ui.hoverAxis ?? (ui.odFilters.axis || null));
    controller.setMotionAxis(ui.odFilters.axis);
    controller.setTrafficMotion(trafficMotionState(ui));
    if (ui.segments !== null) controller.setSegmentLoads(ui.segments.loads, ui.segmentReference ?? 0);
    const unsubscribe = useUiStore.subscribe((state, previous) => {
      if (state.connection !== previous.connection || state.freshness !== previous.freshness || state.mode !== previous.mode
        || state.freshnessConfirmed !== previous.freshnessConfirmed
        || state.odSource !== previous.odSource || state.odError !== previous.odError) {
        controller.setTrafficMotion(trafficMotionState(state));
      }
      if (state.layers !== previous.layers) controller.setLayers(state.layers);
      if (state.mode !== previous.mode) controller.setAnomaliesVisible(state.mode === 'live');
      if (state.layers.axes !== previous.layers.axes) controller.setAxisLabelsVisible(state.layers.axes);
      if (state.hoverAxis !== previous.hoverAxis || state.odFilters.axis !== previous.odFilters.axis) {
        controller.setActiveAxis(state.hoverAxis ?? (state.odFilters.axis || null));
      }
      if (state.odFilters.axis !== previous.odFilters.axis) controller.setMotionAxis(state.odFilters.axis);
      if (state.kinds !== previous.kinds) controller.setKinds(state.kinds);
      if (state.segments !== previous.segments && state.segments !== null) controller.setSegmentLoads(state.segments.loads, state.segmentReference ?? 0);
      if (state.highlightedFlow !== previous.highlightedFlow) controller.setHighlightedFlow(state.highlightedFlow);
      if (state.odView !== previous.odView) controller.setOd(state.odView);
      if (state.reducedMotion !== previous.reducedMotion) controller.setReducedMotion(state.reducedMotion);
      if (state.palette !== previous.palette) controller.setPalette(state.palette);
      if (state.selectedIndex !== previous.selectedIndex) controller.setSelected(state.selectedIndex, false);
      if (state.freshness?.staleStations !== previous.freshness?.staleStations) {
        controller.setStale(state.freshness?.staleStations ?? []);
      }
    });
    onReady(controller);
    return () => {
      unsubscribe();
      onReady(null);
      controller.destroy();
    };
  }, [stations, store, onReady]);

  return <div ref={container} className="map" role="region" aria-label="Carte des gares de péage" />;
}
