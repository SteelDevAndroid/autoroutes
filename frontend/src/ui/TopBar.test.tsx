import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { StationMetrics } from '../realtime/protocol';
import { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { TopBar } from './TopBar';

const station = (stationId: string, anomalies: StationMetrics['anomalies']): StationMetrics => ({
  stationId, last5m: { entries: 0, exits: 0 }, last15m: { entries: 0, exits: 0 },
  last1h: { entries: 0, exits: 0 }, today: { entries: 0, exits: 0 }, lastEventTime: null,
  ...(anomalies === undefined ? {} : { anomalies }),
});
const incident = (cardinalite: number, source = 'peage') => ({ type_ano: 'Barrière', cardinalite, criticite: 'Haute', source });
const counter = () => screen.getByRole('group', { name: 'Anomalies en cours' });

beforeEach(() => {
  useUiStore.setState(useUiStore.getInitialState(), true);
  useUiStore.setState({ reducedMotion: true });
});
afterEach(cleanup);

describe('compteur réseau des anomalies', () => {
  it('additionne les occurrences de toutes les gares et sources, puis suit les levées', async () => {
    const store = new StationStore(['A', 'B']);
    store.replaceAll([station('A', [incident(3), incident(2, 'mcp:agent')]), station('B', [incident(4)])]);
    render(<TopBar store={store} />);
    expect(counter().textContent).toBe('Anomalies en cours9');
    act(() => { store.applyDelta([station('A', []), station('B', [incident(1)])]); });
    await waitFor(() => { expect(counter().textContent).toBe('Anomalies en cours1'); });
  });

  it('affiche zéro seulement quand les états sont explicitement sans anomalie', () => {
    const store = new StationStore(['A', 'B']);
    store.replaceAll([station('A', []), station('B', [incident(0)])]);
    render(<TopBar store={store} />);
    expect(counter().textContent).toBe('Anomalies en cours0');
  });

  it('ne transforme pas les états non communiqués en zéro', () => {
    const store = new StationStore(['A', 'B']);
    store.replaceAll([station('A', null), station('B', undefined)]);
    render(<TopBar store={store} />);
    expect(counter().textContent).toBe('Anomalies en cours—');
    expect(counter().title).toContain('non communiqué');
    act(() => { store.applyDelta([station('A', [incident(3)])]); });
    expect(counter().textContent).toBe('Anomalies en cours≥ 3');
    expect(counter().title).toContain('1 / 2 gares');
  });

  it('ne présente pas les anomalies du direct comme des données historiques', () => {
    const store = new StationStore(['A']);
    store.replaceAll([station('A', [incident(7)])]);
    render(<TopBar store={store} />);
    act(() => { useUiStore.setState({ mode: 'replay' }); });
    expect(counter().textContent).toBe('Anomalies en cours—');
    expect(counter().title).toContain('relecture');
    act(() => { useUiStore.setState({ mode: 'live' }); });
    expect(counter().textContent).toBe('Anomalies en cours7');
  });
});
