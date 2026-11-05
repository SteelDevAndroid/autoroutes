import { describe, expect, it } from 'vitest';
import { HOUR_MS, KpiTimeline, sampleKpis, timedTrendPath, timelinePoints } from './kpiTrends';
import type { KpiSample } from './kpiTrends';
import { StationStore } from '../state/stationStore';
import { metrics } from '../test-fixtures';

const sample = (t: number, anomalies: number | null = 2): KpiSample => ({ t,
  values: { entries1h: 10, exits1h: 5, today: 20, active15m: 1, anomalies } });

describe('courbes du bandeau', () => {
  it('borne une heure de suivi et conserve uniquement le dernier état de chaque tranche de cinq secondes', () => {
    const history = new KpiTimeline();
    for (let t = 0; t <= 2 * HOUR_MS; t += 1000) history.record(sample(t));
    expect(history.snapshot().length).toBeLessThanOrEqual(721);
    expect(history.snapshot()[0]?.t).toBeGreaterThanOrEqual(HOUR_MS);
    expect(history.snapshot().at(-1)?.t).toBe(2 * HOUR_MS);
  });

  it('ne raccorde ni une déconnexion ni une période dont les anomalies sont inconnues', () => {
    const points = timelinePoints([sample(0), sample(5000, null), sample(10000)], 'anomalies');
    expect(points.map((p) => p.value)).toEqual([2, 2]);
    expect(timedTrendPath(points, 96, 22).match(/M/g)).toHaveLength(2);
    expect(timedTrendPath([{ t: 0, value: 1 }, { t: 120_000, value: 2 }], 96, 22).match(/M/g)).toHaveLength(2);
  });

  it('repart sur une autre période si l’horloge de relecture recule', () => {
    const history = new KpiTimeline();
    history.record(sample(60_000));
    history.record(sample(10_000));
    expect(history.snapshot()).toEqual([sample(10_000)]);
  });

  it('distingue absence d’état, zéro déclaré et anomalies indisponibles en relecture', () => {
    const store = new StationStore(['A']);
    store.replaceAll([metrics('A')]);
    expect(sampleKpis(store, false).anomalies).toBeNull();
    store.applyDelta([{ ...metrics('A'), anomalies: [] }]);
    expect(sampleKpis(store, false).anomalies).toBe(0);
    expect(sampleKpis(store, true).anomalies).toBeNull();
    expect(sampleKpis(store, false).active15m).toBe(1);
  });
});
