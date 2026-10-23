import { describe, expect, it } from 'vitest';
import type { Freshness } from '../state/uiStore';
import { deriveAlerts, sortAlerts } from './alerts';
import type { AlertInput } from './alerts';

const live = (overrides: Partial<Freshness> = {}): Freshness => ({ status: 'LIVE', watermarkLagSeconds: 2, consumerLag: 0, staleStations: [], ...overrides });
const input = (overrides: Partial<AlertInput> = {}): AlertInput => ({ mode: 'live', connection: 'open', freshness: live(), coverage: null, stationCount: 600, ...overrides });
const coverage = (recorded: number, missing: number) => ({ recorded, openSystem: 0, entryMissing: missing, entryUnknown: 0 });

describe('deriveAlerts', () => {
  it('is silent when everything is fine, before the first freshness message, and during a replay', () => {
    expect(deriveAlerts(input())).toEqual([]);
    expect(deriveAlerts(input({ freshness: null }))).toEqual([]);
    expect(deriveAlerts(input({ mode: 'replay', connection: 'closed', freshness: live({ status: 'STALE' }) }))).toEqual([]);
  });

  it('reports a lost connection as the only alert, critical once closed and a warning while reconnecting', () => {
    expect(deriveAlerts(input({ connection: 'closed', freshness: live({ status: 'STALE' }) }))).toEqual([expect.objectContaining({ id: 'connection', severity: 'critical' })]);
    expect(deriveAlerts(input({ connection: 'connecting' }))).toEqual([expect.objectContaining({ id: 'connection', severity: 'warning' })]);
  });

  it('reports stale data as critical and catching up as a warning, with the lag in readable units', () => {
    const [stale] = deriveAlerts(input({ freshness: live({ status: 'STALE', watermarkLagSeconds: 600 }) }));
    const [catching] = deriveAlerts(input({ freshness: live({ status: 'CATCHING_UP', watermarkLagSeconds: 45 }) }));

    expect(stale).toMatchObject({ id: 'stale', severity: 'critical' });
    expect(stale?.detail).toContain('10 min');
    expect(catching).toMatchObject({ id: 'catching-up', severity: 'warning' });
    expect(catching?.detail).toContain('45 s');
  });

  it('alerts on silent stations only from 5 % of them', () => {
    const silent = (n: number) => Array.from({ length: n }, (_, i) => `S${i}`);

    expect(deriveAlerts(input({ freshness: live({ staleStations: silent(29) }) }))).toEqual([]);
    expect(deriveAlerts(input({ freshness: live({ staleStations: silent(30) }) }))).toEqual([expect.objectContaining({ id: 'stale-stations', title: '30 gares sans données récentes' })]);
  });

  it('alerts when the origin is known for less than 90 % of the exits, once there are enough of them', () => {
    expect(deriveAlerts(input({ coverage: coverage(850, 150) }))).toEqual([expect.objectContaining({ id: 'origin-known', title: 'Origine connue pour 85 % des sorties' })]);
    expect(deriveAlerts(input({ coverage: coverage(900, 100) }))).toEqual([]);
    expect(deriveAlerts(input({ coverage: coverage(1, 50) }))).toEqual([]);
  });
});

describe('sortAlerts', () => {
  it('puts critical alerts first', () => {
    const sorted = sortAlerts(deriveAlerts(input({ freshness: live({ status: 'STALE', staleStations: Array.from({ length: 100 }, (_, i) => `S${i}`) }) })));

    expect(sorted.map((a) => a.severity)).toEqual(['critical', 'warning']);
  });
});
