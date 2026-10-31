import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { StationCollection } from '../map/referentiel';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { metrics } from '../test-fixtures';
import { ActiveFilters } from './ActiveFilters';
import { ActivityPanel } from './ActivityPanel';
import { MetricStations, metricStations } from './MetricStations';
import { TopBar } from './TopBar';

const stations: StationCollection = { type: 'FeatureCollection', features: ['A', 'B'].map((id) => ({
  type: 'Feature', geometry: { type: 'Point', coordinates: [4, 45] },
  properties: { id, name: `Gare ${id}`, kind: 'ECHANGEUR', axes: 'A0007', dept: '69', lanes: 4 },
})) };
const incident = { type_ano: 'Barrière', cardinalite: 3, criticite: 'Haute' };
beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  useUiStore.setState({ reducedMotion: true });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('classe chaque indicateur sur sa période et exclut les anomalies inconnues', () => {
  const store = new StationStore(['A', 'B']);
  store.replaceAll([{ ...metrics('A', 50, 2, 10), anomalies: [incident] }, metrics('B', 1, 60, 100)]);
  expect(metricStations(store, 'entries1h').map((r) => r.id)).toEqual(['A', 'B']);
  expect(metricStations(store, 'exits1h').map((r) => r.id)).toEqual(['B', 'A']);
  expect(metricStations(store, 'today')[0]?.value).toBe(200);
  expect(metricStations(store, 'anomalies')).toEqual([{ id: 'A', index: 0, value: 3 }]);
});

it('ouvre les gares concernées depuis le compteur et permet de cadrer une gare', () => {
  const store = new StationStore(['A', 'B']);
  store.replaceAll([{ ...metrics('A'), anomalies: [incident] }, metrics('B')]);
  const focus = vi.fn();
  render(<><TopBar store={store} /><ActivityPanel stations={stations} store={store} onFocus={focus} /></>);
  fireEvent.click(screen.getByRole('button', { name: /Anomalies en cours/ }));
  const list = screen.getByRole('list', { name: 'Gares avec anomalies' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(within(list).getByRole('button', { name: /Gare A/ }));
  expect(focus).toHaveBeenCalledWith(0);
  expect(screen.getByText(/États communiqués : 1 \/ 2/)).toBeTruthy();
});

it('ouvre le tiroir pour un indicateur sur téléphone', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  render(<TopBar store={new StationStore(['A'])} />);
  fireEvent.click(screen.getByRole('button', { name: /Entrées 1 h/ }));
  expect(useUiStore.getState()).toMatchObject({ activityMetric: 'entries1h', openSection: 'activity', drawerOpen: true });
});

it('ne montre jamais les anomalies du direct en relecture, même si la liste était déjà ouverte', () => {
  const store = new StationStore(['A']);
  store.replaceAll([{ ...metrics('A'), anomalies: [incident] }]);
  useUiStore.setState({ openSection: 'activity' });
  render(<MetricStations metric="anomalies" stations={stations} store={store} onFocus={vi.fn()} />);
  expect(screen.getByRole('button', { name: /Gare A/ })).toBeTruthy();
  act(() => { useUiStore.getState().setMode('replay'); });
  expect(screen.queryByRole('button', { name: /Gare A/ })).toBeNull();
  expect(screen.getByText('Historique des anomalies indisponible')).toBeTruthy();
});

it('retire un seul filtre et restaure les types masqués sans réinitialiser les autres', () => {
  useUiStore.setState({ kinds: new Set(['PLEINE_VOIE']), odSource: 'rest', layers: { ...useUiStore.getState().layers, od: true },
    odFilters: { level: 'STATION', axis: 'A0007', department: '69', role: 'ORIGIN' } });
  render(<ActiveFilters stations={stations} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retirer : Flux · département 69' }));
  expect(useUiStore.getState().odFilters).toMatchObject({ department: '', axis: 'A0007', role: 'ORIGIN' });
  fireEvent.click(screen.getByRole('button', { name: 'Retirer : Carte · échangeurs masqués' }));
  expect(useUiStore.getState().kinds.size).toBe(2);
});

it('retire un axe recherché en respectant le retour à l’affichage précédent', () => {
  useUiStore.getState().focusAxis('A7', 'A0007');
  render(<ActiveFilters stations={stations} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retirer : Axe · A7' }));
  expect(useUiStore.getState()).toMatchObject({ axisFocus: null, odFilters: { axis: '' }, layers: { od: false } });
});

it('réinitialise les filtres actifs sans modifier la gare ni la palette', () => {
  useUiStore.setState({ kinds: new Set(['ECHANGEUR']), activityMetric: 'entries1h', selectedIndex: 0, palette: 'cvd' });
  render(<ActiveFilters stations={stations} />);
  fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres actifs' }));
  expect(useUiStore.getState().kinds.has('PLEINE_VOIE')).toBe(true);
  expect(useUiStore.getState().activityMetric).toBe('passages1h');
  expect(useUiStore.getState().selectedIndex).toBe(0);
  expect(useUiStore.getState().palette).toBe('cvd');
  expect(screen.queryByRole('region', { name: 'Filtres et vue actifs' })).toBeNull();
});

it('conserve une seule surface de travail quand le tiroir mobile ouvre', () => {
  useUiStore.setState({ selectedIndex: 0, diagnosticOpen: true });
  act(() => { useUiStore.getState().setDrawerOpen(true); });
  expect(useUiStore.getState().selectedIndex).toBeNull();
  expect(useUiStore.getState().diagnosticOpen).toBe(false);
});

it('distingue la connexion initiale et la reconnexion avec données conservées', () => {
  render(<TopBar store={new StationStore(['A'])} />);
  expect(screen.getByRole('status').textContent).toBe('Connexion initiale…');
  act(() => { useUiStore.setState({ watermark: '2026-10-31T12:00:00Z', connection: 'connecting' }); });
  expect(screen.getByRole('status').textContent).toBe('Reconnexion…');
  expect(screen.getByText(/dernières données conservées/)).toBeTruthy();
});
