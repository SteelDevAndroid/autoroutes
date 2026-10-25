import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { delta, metrics } from '../test-fixtures';
import { parseStreamMessage } from '../realtime/protocol';
import { StationStore } from '../state/stationStore';
import { StationAnomalies } from './StationAnomalies';
import { anomalySummary } from '../realtime/anomalies';
import { StationDetail } from './StationDetail';
import { useUiStore } from '../state/uiStore';

vi.mock('./HistoryChart', () => ({ HistoryChart: () => null }));

const incidents = [
  { type_ano: 'Lecteur de badge', cardinalite: 2, criticite: 'Moyenne' },
  { type_ano: 'Imprimante', cardinalite: 1, criticite: 'Faible' },
  { type_ano: 'Barrière ouverte', cardinalite: 1, criticite: 'Haute' },
  { type_ano: 'Communication paiement', cardinalite: 4, criticite: 'Critique' },
];
afterEach(cleanup);

describe('anomalies de gare', () => {
  it('accepts the supplied wire format and summarizes occurrences independently of traffic', () => {
    const message = delta(1, [{ ...metrics('A'), anomalies: incidents }]);
    expect(parseStreamMessage(JSON.stringify(message))).toEqual(message);
    expect(anomalySummary(incidents)).toMatchObject({ count: 8, severity: 4, label: 'Critique' });
  });

  it('keeps the source of each anomaly when the backend details its sources, and labels it in the station sheet', () => {
    const badge = { type_ano: 'Lecteur de badge', cardinalite: 2, criticite: 'Moyenne' };
    const barrier = { type_ano: 'Barrière ouverte', cardinalite: 1, criticite: 'Haute' };
    const anomalySources = [
      { source: 'mcp:service-account-agent-anomalies', updatedAt: '2026-10-25T15:00:00Z', anomalies: [barrier] },
      { source: 'peage', updatedAt: '2026-10-25T14:00:00Z', anomalies: [badge] },
    ];
    const message = parseStreamMessage(JSON.stringify(delta(1, [{ ...metrics('A'), anomalies: [barrier, badge], anomalySources }])));
    const parsed = message?.type === 'delta' ? message.payload.stations[0]?.anomalies : undefined;
    expect(parsed).toEqual([{ ...barrier, source: 'mcp:service-account-agent-anomalies' }, { ...badge, source: 'peage' }]);

    render(<StationAnomalies anomalies={parsed ?? null} />);
    expect(screen.getByText('Agent service-account-agent-anomalies')).toBeTruthy();
    expect(screen.getByText('Équipements de péage')).toBeTruthy();
  });

  it('falls back to the anonymous union when the source detail is malformed', () => {
    const badge = { type_ano: 'Lecteur de badge', cardinalite: 2, criticite: 'Moyenne' };
    const message = parseStreamMessage(JSON.stringify(delta(1, [{ ...metrics('A'), anomalies: [badge],
      anomalySources: [{ source: 'a b', updatedAt: '2026-10-25T14:00:00Z', anomalies: [badge] }] }])));
    expect(message?.type === 'delta' ? message.payload.stations[0]?.anomalies : undefined).toEqual([badge]);
  });

  it('replaces rather than accumulates, clears explicit empty state, and forgets live data on a snapshot', () => {
    const store = new StationStore(['A', 'B']);
    store.replaceAll([{ ...metrics('A'), anomalies: incidents }]);
    store.applyDelta([{ ...metrics('A'), anomalies: incidents.slice(0, 1) }]);
    expect(store.anomalies[0]).toEqual([incidents[0]]);
    store.applyDelta([{ ...metrics('A'), anomalies: [] }]);
    expect(store.anomalies[0]).toEqual([]);
    store.replaceAll([metrics('B')]);
    expect(store.anomalies[0]).toBeNull();
    expect(store.anomalies[1]).toBeNull();
  });

  it.each([{}, [{ type_ano: 'A', cardinalite: -1, criticite: 'Haute' }], [{ type_ano: 'A', cardinalite: 1.5, criticite: 'Haute' }], [{ type_ano: 'A', cardinalite: 1 }]])('does not present malformed data as healthy: %j', (anomalies) => {
    const parsed = parseStreamMessage(JSON.stringify(delta(1, [{ ...metrics('A'), anomalies } as never])));
    expect(parsed?.type).toBe('delta');
    if (parsed?.type !== 'delta') throw new Error('Expected traffic data to remain available');
    expect(parsed.payload.stations[0]?.anomalies).toBeNull();
  });

  it('keeps unknown criticality visible without treating it as low', () => {
    render(<StationAnomalies anomalies={[{ type_ano: 'Nouveau code', cardinalite: 3, criticite: 'Urgence externe' }]} />);
    expect(screen.getByText('Urgence externe')).toBeTruthy();
    expect(screen.getByText(/Criticité non reconnue/)).toBeTruthy();
  });

  it('does not trust a report timestamp without a valid string date', () => {
    const message = delta(1, [metrics('A')]);
    const parsed = parseStreamMessage(JSON.stringify({ ...message, payload: { stations: [{ ...metrics('A'), anomaliesUpdatedAt: { toString: 0 } }] } }));
    expect(parsed?.type === 'delta' ? parsed.payload.stations[0]?.anomaliesUpdatedAt : undefined).toBeNull();
  });

  it('shows the most urgent types first and all exact counts', () => {
    render(<StationAnomalies anomalies={incidents} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Communication paiement'), expect.stringContaining('Barrière ouverte'),
      expect.stringContaining('Lecteur de badge'), expect.stringContaining('Imprimante'),
    ]);
    expect(screen.getByText('8 occurrences')).toBeTruthy();
    expect(rows[0]?.textContent).toContain('4');
  });

  it('distinguishes unavailable and explicitly healthy, and follows updates without moving focus', () => {
    const { rerender } = render(<StationAnomalies anomalies={null} />);
    expect(screen.getByText(/État des anomalies non communiqué/)).toBeTruthy();
    act(() => { rerender(<StationAnomalies anomalies={[]} />); });
    expect(screen.getByText(/Aucune anomalie signalée/)).toBeTruthy();
  });

  it('never shows live incidents in a historical station detail, including while replay is loading', () => {
    useUiStore.setState(useUiStore.getInitialState(), true);
    useUiStore.setState({ selectedIndex: 0 });
    const store = new StationStore(['A']);
    store.replaceAll([{ ...metrics('A'), anomalies: incidents }]);
    render(<StationDetail stations={{ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [4.8, 45.7] }, properties: { id: 'A', name: 'Gare A', kind: 'ECHANGEUR', axes: 'A0007', dept: '69', lanes: 4 } }] }} store={store} onFocusFlow={() => undefined} />);
    expect(screen.getByText('Communication paiement')).toBeTruthy();
    act(() => { useUiStore.getState().setMode('replay'); });
    expect(screen.queryByText('Communication paiement')).toBeNull();
    expect(screen.getByText(/État des anomalies indisponible en relecture/)).toBeTruthy();
    act(() => { useUiStore.getState().setMode('live'); });
    expect(screen.getByText('Communication paiement')).toBeTruthy();
  });
});
