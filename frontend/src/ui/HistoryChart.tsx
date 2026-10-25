import { useEffect, useState } from 'react';
import { stationHistory } from '../history/historyApi';
import type { SeriesPoint, StationHistory } from '../history/historyApi';
import { parisMidnight } from '../history/parisTime';
import { formatCount } from './format';

const WIDTH = 276;
const HEIGHT = 72;
const DAY_SECONDS = 86_400;
const REFRESH_MS = 60_000;

interface Comparison {
  readonly today: StationHistory;
  readonly lastWeek: StationHistory;
  readonly todayStart: number;
  readonly lastWeekStart: number;
}

const total = (points: readonly SeriesPoint[]) => points.reduce((sum, p) => sum + p.entries + p.exits, 0);
const available = (series: StationHistory): boolean => series.points.length > 0 && series.coverage?.status !== 'UNAVAILABLE';
const nature = (series: StationHistory): string => series.nature === 'SIMULATED' ? 'simulé'
  : series.nature === 'OBSERVED' ? 'observé' : series.nature === 'MIXED' ? 'mixte' : 'source non vérifiée';

function path(points: readonly SeriesPoint[], dayStart: number, max: number): string {
  return points.map((p, i) => {
    const x = ((p.t - dayStart) / DAY_SECONDS) * WIDTH;
    const y = HEIGHT - ((p.entries + p.exits) / max) * (HEIGHT - 4);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

/** Passages par quart d'heure depuis minuit (Paris) : aujourd'hui (trait plein) et même jour la semaine précédente (tirets). */
export function HistoryChart({ stationId }: { readonly stationId: string }) {
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    const load = () => {
      const now = new Date();
      const midnight = parisMidnight(now);
      const weekAgo = new Date(now.getTime() - 7 * DAY_SECONDS * 1000);
      const midnightWeekAgo = parisMidnight(weekAgo);
      Promise.all([
        stationHistory(stationId, midnight, now, 'PT15M', abort.signal),
        stationHistory(stationId, midnightWeekAgo, weekAgo, 'PT15M', abort.signal),
      ]).then(([today, lastWeek]) => {
        setData({ today, lastWeek, todayStart: midnight.getTime() / 1000, lastWeekStart: midnightWeekAgo.getTime() / 1000 });
        setError(null);
      }, (e: unknown) => {
        if (!abort.signal.aborted) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    };
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { abort.abort(); window.clearInterval(timer); };
  }, [stationId]);

  if (error !== null) {
    return <p className="note">{error}</p>;
  }
  if (data === null) {
    return <div className="chart-skeleton" role="status"><span className="sr-only">Chargement de l’historique…</span></div>;
  }
  const todayAvailable = available(data.today);
  const weekAvailable = available(data.lastWeek);
  const todayLabel = todayAvailable ? `${formatCount(total(data.today.points))} (${nature(data.today)})` : 'historique indisponible';
  const weekLabel = weekAvailable ? `${formatCount(total(data.lastWeek.points))} (${nature(data.lastWeek)})` : 'historique indisponible';
  const max = Math.max(1, ...data.today.points.map((p) => p.entries + p.exits), ...data.lastWeek.points.map((p) => p.entries + p.exits));
  return (
    <figure className="history-chart">
      <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img"
        aria-label={`Passages par quart d’heure : aujourd’hui ${todayLabel}, J-7 même heure ${weekLabel}`}>
        {weekAvailable && <path d={path(data.lastWeek.points, data.lastWeekStart, max)} className="series-last-week" />}
        {todayAvailable && <path d={path(data.today.points, data.todayStart, max)} className="series-today" />}
      </svg>
      <figcaption className="note">
        <span className="legend-today">— aujourd’hui {todayLabel}</span>{' '}
        <span className="legend-last-week">- - J-7 même heure {weekLabel}</span>
        {(todayAvailable || weekAvailable) && <span className="history-coverage"> Totaux des points disponibles ; la période peut être partielle.</span>}
      </figcaption>
    </figure>
  );
}
