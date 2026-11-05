import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { config } from '../config';
import { networkSeries } from '../history/historyApi';
import type { SeriesPoint } from '../history/historyApi';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { HOUR_MS, KpiTimeline, sampleKpis } from './kpiTrends';
import { usePageVisible } from './usePageVisible';

export function useKpiTrends(store: StationStore) {
  const mode = useUiStore((s) => s.mode);
  const from = useUiStore((s) => s.replay.from);
  const to = useUiStore((s) => s.replay.to);
  const watermark = useUiStore((s) => s.watermark);
  const visible = usePageVisible();
  const timeline = useMemo(() => new KpiTimeline({ store, mode, from }), [store, mode, from]);
  const samples = useSyncExternalStore(timeline.subscribe, timeline.snapshot);
  const source = mode === 'live' ? 'live' : `replay:${from ?? ''}:${to ?? ''}`;
  const [history, setHistory] = useState<{ source: string; points: readonly SeriesPoint[] } | null>(null);

  useEffect(() => {
    if (!visible) return undefined;
    const capture = () => {
      const ui = useUiStore.getState();
      if (store.version === 0 || ui.watermark === null || (ui.mode === 'live' && ui.connection !== 'open')
        || (ui.mode === 'replay' && ui.replay.time === null)) return;
      timeline.record({ t: Date.parse(ui.watermark), values: sampleKpis(store, ui.mode === 'replay') });
    };
    capture();
    const stopStore = store.subscribe(capture);
    const stopUi = useUiStore.subscribe((state, previous) => {
      if (state.watermark !== previous.watermark) capture();
    });
    return () => { stopStore(); stopUi(); };
  }, [store, timeline, visible]);

  useEffect(() => {
    if (config.demo || !visible || (mode === 'replay' && (from === null || to === null))) return undefined;
    let disposed = false;
    let request: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      request = new AbortController();
      const timeout = setTimeout(() => { request?.abort(); }, 8_000);
      // En relecture, charger une seule fois la période et son heure de recul (quelques centaines de points).
      const end = mode === 'replay' && to !== null ? Date.parse(to) : Math.floor(Date.now() / 60_000) * 60_000;
      const start = mode === 'replay' && from !== null ? Date.parse(from) - HOUR_MS : end - HOUR_MS;
      try {
        const points = await networkSeries(new Date(start), new Date(end), request.signal);
        if (!disposed && !request.signal.aborted) setHistory({ source, points: points.filter((p) =>
          Number.isFinite(p.t) && Number.isFinite(p.entries) && Number.isFinite(p.exits) && p.entries >= 0 && p.exits >= 0)
          .toSorted((a, b) => a.t - b.t) });
      } catch {
        // Les compteurs et le suivi local restent utilisables si l'historique n'est pas disponible.
      } finally {
        clearTimeout(timeout);
        if (!disposed && mode === 'live') timer = setTimeout(() => { void load(); }, 60_000);
      }
    };
    void load();
    return () => { disposed = true; request?.abort(); clearTimeout(timer); };
  }, [mode, from, to, source, visible]);

  const reference = Date.parse(watermark ?? '');
  const points = history?.source === source ? history.points.filter((p) =>
    p.t * 1000 >= reference - HOUR_MS && p.t * 1000 < reference) : [];
  return { samples: samples.filter((p) => p.t >= reference - HOUR_MS && p.t <= reference), points };
}
