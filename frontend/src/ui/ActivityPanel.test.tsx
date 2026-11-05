import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StationCollection } from '../map/referentiel';
import { stationSeries } from '../history/historyApi';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { metrics } from '../test-fixtures';
import { ActivityPanel } from './ActivityPanel';

vi.mock('../config', () => ({ config: { demo: false } }));
vi.mock('../history/historyApi', () => ({ stationSeries: vi.fn().mockResolvedValue([]) }));

const stations: StationCollection = { type: 'FeatureCollection', features: [
  { type: 'Feature', geometry: { type: 'Point', coordinates: [5, 45] },
    properties: { id: 'A', name: 'Gare A', kind: 'ECHANGEUR', axes: 'A0007', dept: '38', lanes: 2 } },
] };

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(stationSeries).mockClear();
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
  useUiStore.setState(useUiStore.getInitialState(), true);
  useUiStore.setState({ openSection: 'layers' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it('fetches trends only while the activity panel and the document are visible, aborting on suspension', async () => {
  const store = new StationStore(['A']);
  store.replaceAll([metrics('A')]);
  render(<ActivityPanel stations={stations} store={store} onFocus={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(stationSeries).not.toHaveBeenCalled();

  await act(async () => { useUiStore.setState({ openSection: 'activity' }); await Promise.resolve(); });
  expect(stationSeries).toHaveBeenCalledTimes(1);
  const firstSignal = vi.mocked(stationSeries).mock.calls[0]?.[4];
  await act(async () => { useUiStore.setState({ openSection: 'layers' }); await Promise.resolve(); });
  expect(firstSignal?.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(stationSeries).toHaveBeenCalledTimes(1);

  await act(async () => { useUiStore.setState({ openSection: 'activity' }); await Promise.resolve(); });
  expect(stationSeries).toHaveBeenCalledTimes(2);
  await act(async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
  expect(vi.mocked(stationSeries).mock.calls[1]?.[4]?.aborted).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(stationSeries).toHaveBeenCalledTimes(2);

  await act(async () => {
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
  });
  expect(stationSeries).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
  expect(stationSeries).toHaveBeenCalledTimes(4);
});
