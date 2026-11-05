import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { networkSeries } from '../history/historyApi';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { useKpiTrends } from './useKpiTrends';

vi.mock('../config', () => ({ config: { demo: false } }));
vi.mock('../history/historyApi', () => ({ networkSeries: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime('2026-11-05T10:00:00Z');
  vi.mocked(networkSeries).mockReset().mockResolvedValue([]);
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  useUiStore.setState(useUiStore.getInitialState(), true);
  useUiStore.setState({ watermark: '2026-11-05T10:00:00Z' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('partage une requête minute réseau, la renouvelle sans chevauchement et l’annule dans un onglet masqué', async () => {
  const store = new StationStore(['A']);
  renderHook(() => useKpiTrends(store));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(networkSeries).toHaveBeenCalledTimes(1);
  expect(networkSeries).toHaveBeenLastCalledWith(new Date('2026-11-05T08:00:00Z'), new Date('2026-11-05T10:00:00Z'), expect.any(AbortSignal));
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(networkSeries).toHaveBeenCalledTimes(2);
  const signal = vi.mocked(networkSeries).mock.calls[1]?.[2];
  await act(async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
  expect(signal?.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(networkSeries).toHaveBeenCalledTimes(2);
});

it('charge la plage de relecture une seule fois, sans utiliser l’historique du direct', async () => {
  vi.mocked(networkSeries).mockResolvedValueOnce([{ t: Date.parse('2026-11-05T09:59:00Z') / 1000, entries: 8, exits: 4 }])
    .mockResolvedValueOnce([{ t: Date.parse('2026-11-04T09:59:00Z') / 1000, entries: 2, exits: 1 }]);
  const store = new StationStore(['A']);
  const { result } = renderHook(() => useKpiTrends(store));
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(result.current.points[0]?.entries).toBe(8);
  await act(async () => {
    useUiStore.setState({ mode: 'replay', watermark: '2026-11-04T10:00:00Z', replay: {
      ...useUiStore.getState().replay, from: '2026-11-04T10:00:00Z', to: '2026-11-04T11:00:00Z', time: '2026-11-04T10:00:00Z',
    } });
    await Promise.resolve();
  });
  expect(networkSeries).toHaveBeenCalledTimes(2);
  expect(result.current.points.map((p) => p.entries)).toEqual([2]);
  await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
  expect(networkSeries).toHaveBeenCalledTimes(2);
});

it('signale une panne au lieu de présenter l’ancien historique comme disponible', async () => {
  vi.mocked(networkSeries).mockResolvedValueOnce([{ t: Date.parse('2026-11-05T09:59:00Z') / 1000, entries: 8, exits: 4 }])
    .mockRejectedValueOnce(new Error('indisponible'));
  const store = new StationStore(['A']);
  const { result } = renderHook(() => useKpiTrends(store));
  expect(result.current.state).toBe('loading');
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(result.current.state).toBe('ready');
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(result.current.state).toBe('error');
  expect(result.current.points[0]?.entries).toBe(8);
});
