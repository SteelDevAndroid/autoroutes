import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config } from './config';
import { DemoEventSource } from './demo/demoEventSource';
import type { MapController } from './map/mapController';
import { loadStations } from './map/referentiel';
import type { StationCollection } from './map/referentiel';
import { startRealtime } from './realtime/runtime';
import type { EventSourceFactory } from './realtime/streamClient';
import { StationStore } from './state/stationStore';
import { useUiStore } from './state/uiStore';
import { DiagnosticPanel } from './ui/DiagnosticPanel';
import { MapView } from './ui/MapView';
import { SidePanel } from './ui/SidePanel';
import { StationDetail } from './ui/StationDetail';
import { TopBar } from './ui/TopBar';

function streamFactory(stations: StationCollection): EventSourceFactory {
  if (config.demo) {
    const demoStations = stations.features.map((f) => ({
      id: f.properties.id,
      lanes: f.properties.lanes,
      coordinates: f.geometry.coordinates as [number, number],
    }));
    return () => new DemoEventSource(demoStations);
  }
  return (url) => new EventSource(url, { withCredentials: true });
}

function Dashboard({ stations }: { readonly stations: StationCollection }) {
  const store = useMemo(() => new StationStore(stations.features.map((f) => f.properties.id)), [stations]);
  const controller = useRef<MapController | null>(null);
  const onReady = useCallback((c: MapController | null) => { controller.current = c; }, []);

  useEffect(() => startRealtime({
    url: config.streamUrl,
    store,
    factory: streamFactory(stations),
    onData: () => { controller.current?.onData(); },
    onReferentielChanged: () => { window.location.reload(); },
  }), [stations, store]);

  const focus = useCallback((index: number) => {
    useUiStore.getState().select(index);
    controller.current?.setSelected(index, true);
  }, []);

  return (
    <div className="app">
      {config.demo && <div className="simulated-banner" role="note">DONNÉES SIMULÉES — démonstration, aucune valeur réelle</div>}
      <TopBar store={store} />
      <SidePanel stations={stations} onFocus={focus} onResetView={() => { controller.current?.resetView(); }} />
      <main className="map-area">
        <MapView stations={stations} store={store} onReady={onReady} />
        <StationDetail stations={stations} store={store} />
        <DiagnosticPanel store={store} />
      </main>
    </div>
  );
}

export function App() {
  const [stations, setStations] = useState<StationCollection | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    loadStations(config.stationsUrl, abort.signal).then(setStations, (e: unknown) => {
      if (!abort.signal.aborted) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
    return () => { abort.abort(); };
  }, []);

  if (error !== null) {
    return <div className="error" role="alert">{error}</div>;
  }
  return stations === null ? <div className="loading">Chargement du référentiel…</div> : <Dashboard stations={stations} />;
}
