import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { config } from '../config';
import { networkSeries } from '../history/historyApi';
import type { SeriesPoint } from '../history/historyApi';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { HOUR_MS, KpiTimeline, MINUTE_MS, sampleKpis } from './kpiTrends';
import type { HistoryState } from './kpiTrends';
import { usePageVisible } from './usePageVisible';

export function useKpiTrends(store: StationStore) {
  const mode = useUiStore((s) => s.mode);
  const from = useUiStore((s) => s.replay.from);
  const to = useUiStore((s) => s.replay.to);
  const watermark = useUiStore((s) => s.watermark);
  const visible = usePageVisible();
  const connection = useUiStore((s) => s.connection);
  const freshness = useUiStore((s) => s.freshness?.status);
  const timeline = useMemo(() => new KpiTimeline({ store, mode, from }), [store, mode, from]);
  const samples = useSyncExternalStore(timeline.subscribe, timeline.snapshot);
  const source = mode === 'live' ? 'live' : `replay:${from ?? ''}:${to ?? ''}`;
  const [history, setHistory] = useState<{ source: string; points: readonly SeriesPoint[]; state: HistoryState } | null>(null);

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
      // En relecture, charger une seule fois la période et ses deux heures de recul (quelques centaines de points).
      const end = mode === 'replay' && to !== null ? Date.parse(to) : Math.floor(Date.now() / 60_000) * 60_000;
      const start = mode === 'replay' && from !== null ? Date.parse(from) - 2 * HOUR_MS : end - 2 * HOUR_MS;
      try {
        const points = await networkSeries(new Date(start), new Date(end), request.signal);
        if (!disposed && !request.signal.aborted) setHistory({ source, state: 'ready', points: points.filter((p) =>
          Number.isFinite(p.t) && p.t * 1000 % MINUTE_MS === 0 && Number.isFinite(p.entries) && Number.isFinite(p.exits) && p.entries >= 0 && p.exits >= 0)
          .toSorted((a, b) => a.t - b.t) });
      } catch {
        if (!disposed) setHistory((previous) => ({ source, state: 'error',
          points: previous?.source === source ? previous.points : [] }));
      } finally {
        clearTimeout(timeout);
        if (!disposed && mode === 'live') timer = setTimeout(() => { void load(); }, 60_000);
      }
    };
    void load();
    return () => { disposed = true; request?.abort(); clearTimeout(timer); };
  }, [mode, from, to, source, visible]);

  const reference = Date.parse(watermark ?? '');
  const end = Math.floor(reference / MINUTE_MS) * MINUTE_MS;
  const matching = history?.source === source ? history : null;
  const allPoints = matching?.points.filter((p) => p.t * 1000 >= end - 2 * HOUR_MS && p.t * 1000 < end) ?? [];
  const state: HistoryState = config.demo ? 'local' : matching?.state ?? 'loading';
  const stale = mode === 'live' && (connection !== 'open' || freshness !== 'LIVE');
  return { samples: samples.filter((p) => p.t >= reference - HOUR_MS && p.t <= reference),
    points: allPoints.filter((p) => p.t * 1000 >= end - HOUR_MS), allPoints, end, reference, state, stale };
}
