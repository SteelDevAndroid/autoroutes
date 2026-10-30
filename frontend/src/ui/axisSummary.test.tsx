import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StationCollection } from '../map/referentiel';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { metrics } from '../test-fixtures';
import { AxisSummary, axisMetrics } from './AxisSummary';
import { StationDetail } from './StationDetail';

vi.mock('./HistoryChart', () => ({ HistoryChart: () => <span>Comparaison historique</span> }));
const stations: StationCollection = { type: 'FeatureCollection', features: ['A', 'B', 'C'].map((id, index) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [4, 45] },
  properties: { id, name: `Gare ${id}`, kind: 'ECHANGEUR', axes: index === 0 ? 'A0007,A0007N' : index === 1 ? 'A0007N' : 'A0042', dept: '69', lanes: 4 },
})) };
beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); useUiStore.setState({ reducedMotion: true }); });
afterEach(cleanup);

it('additionne chaque gare une seule fois et exclut les autres axes', () => {
  const store = new StationStore(['C', 'B', 'A']);
  store.replaceAll([metrics('A', 10, 5), metrics('B', 2, 3), metrics('C', 100, 100)]);
  const summary = axisMetrics(stations, store, 'A0007,A0007N');
  expect(summary).toMatchObject({ received: 2, active: 2, passages: 20, reported: 0 });
  expect(summary.members.map((f) => f.properties.id)).toEqual(['A', 'B']);
});

it('distingue les zéros reçus des gares manquantes et oublie la couverture sur un nouveau snapshot', () => {
  const store = new StationStore(['A', 'B']);
  expect(axisMetrics(stations, store, 'A0007,A0007N').received).toBe(0);
  store.applyDelta([{ ...metrics('A', 0, 0, 0), last15m: { entries: 0, exits: 0 } }]);
  expect(axisMetrics(stations, store, 'A0007,A0007N')).toMatchObject({ received: 1, active: 0, passages: 0 });
  store.replaceAll([metrics('B')]);
  expect([...store.received]).toEqual([0, 1]);
});

it('annonce la couverture partielle et ne reprend pas les anomalies du direct en relecture', () => {
  const store = new StationStore(['A', 'B', 'C']);
  store.replaceAll([{ ...metrics('A'), anomalies: [{ type_ano: 'Barrière', cardinalite: 2, criticite: 'Haute' }] }]);
  useUiStore.setState({ odFilters: { ...useUiStore.getState().odFilters, axis: 'A0007,A0007N' } });
  render(<AxisSummary stations={stations} store={store} />);
  expect(screen.getByText('≥ 2')).toBeTruthy();
  expect(screen.getByText(/Activité reçue : 1 \/ 2/)).toBeTruthy();
  act(() => { useUiStore.getState().setMode('replay'); });
  expect(screen.queryByText('≥ 2')).toBeNull();
  expect(screen.getByText(/Historique des anomalies indisponible/)).toBeTruthy();
});

it('met les chiffres clés avant les incidents et conserve les états inconnus', () => {
  const store = new StationStore(['A', 'B', 'C']);
  useUiStore.setState({ selectedIndex: 0 });
  render(<StationDetail stations={stations} store={store} onFocusFlow={vi.fn()} />);
  const overview = screen.getByRole('region', { name: 'Chiffres clés de la gare' });
  expect(within(overview).getAllByText('—')).toHaveLength(3);
  expect(screen.getByText('Activité non reçue pour cette gare.')).toBeTruthy();
  expect(overview.compareDocumentPosition(screen.getByRole('region', { name: 'Incidents et anomalies' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  act(() => { store.applyDelta([metrics('A', 0, 0, 0)]); });
  expect(within(overview).getAllByText('0')).toHaveLength(3);
  expect(screen.queryByText('Activité non reçue pour cette gare.')).toBeNull();
});
