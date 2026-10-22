import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { config } from './config';
import { DemoEventSource } from './demo/demoEventSource';
import type { MapController } from './map/mapController';
import { loadStations } from './map/referentiel';
import type { StationCollection } from './map/referentiel';
import { startRealtime } from './realtime/runtime';
import { ReplaySession } from './replay/replaySession';
import type { EventSourceFactory } from './realtime/streamClient';
import { StationStore } from './state/stationStore';
import { useUiStore } from './state/uiStore';
import { DiagnosticPanel } from './ui/DiagnosticPanel';
import { MapView } from './ui/MapView';
import { SidePanel } from './ui/SidePanel';
import { StationDetail } from './ui/StationDetail';
import { formatTime } from './ui/format';
import type { ReplayControls } from './ui/ReplayPanel';
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
  const stopLive = useRef<(() => void) | null>(null);
  const session = useRef<ReplaySession | null>(null);
  const mode = useUiStore((s) => s.mode);
  const replay = useUiStore((s) => s.replay);

  const startLive = useCallback(() => {
    stopLive.current = startRealtime({
      url: config.streamUrl,
      store,
      factory: streamFactory(stations),
      onData: () => { controller.current?.onData(); },
      onReferentielChanged: () => { window.location.reload(); },
    });
  }, [stations, store]);

  useEffect(() => {
    startLive();
    return () => {
      stopLive.current?.();
      session.current?.dispose();
    };
  }, [startLive]);

  /** Relecture : le flux temps réel est suspendu (le store ne sert qu'une source à la fois), puis repris par un snapshot. */
  const replayControls = useMemo<ReplayControls>(() => {
    const ui = useUiStore.getState;
    const backToLive = () => {
      session.current?.dispose();
      session.current = null;
      ui().setMode('live');
      ui().setReplay({ status: 'paused', time: null, error: null });
      startLive();
    };
    return {
      start: (from, durationMinutes, speed) => {
        const error = ReplaySession.validate({ from, durationMinutes, speed }, Date.now());
        if (error !== null) {
          ui().setReplay({ status: 'error', error });
          return;
        }
        stopLive.current?.();
        stopLive.current = null;
        ui().setMode('replay');
        ui().setReplay({ speed, error: null });
        const replaySession = new ReplaySession(store, {
          onData: () => { controller.current?.onData(); },
          onTime: (time) => { ui().setWatermark(time.toISOString()); ui().setReplay({ time: time.toISOString() }); },
          onStatus: (status, message) => { ui().setReplay({ status, error: message ?? null }); },
          onOd: (flows) => { ui().setOdFlows(flows); },
        });
        session.current = replaySession;
        replaySession.load({ from, durationMinutes, speed }).then(() => { replaySession.play(); }, () => {
          backToLive();
          ui().setReplay({ status: 'error' });
        });
      },
      playPause: () => {
        if (ui().replay.status === 'playing') {
          session.current?.pause();
        } else if (ui().replay.status !== 'ended') {
          session.current?.play();
        }
      },
      setSpeed: (speed) => {
        session.current?.setSpeed(speed);
        ui().setReplay({ speed });
      },
      backToLive,
    };
  }, [store, startLive]);

  const focus = useCallback((index: number) => {
    useUiStore.getState().select(index);
    controller.current?.setSelected(index, true);
  }, []);

  return (
    <div className="app">
      {config.demo && <div className="simulated-banner" role="note">DONNÉES SIMULÉES — démonstration, aucune valeur réelle</div>}
      {mode === 'replay' && (
        <div className="replay-banner" role="note">
          RELECTURE — données historiques observées · {formatTime(replay.time)} (heure de Paris) · ×{replay.speed}
        </div>
      )}
      <TopBar store={store} />
      <SidePanel stations={stations} onFocus={focus} onResetView={() => { controller.current?.resetView(); }} replay={replayControls} />
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
