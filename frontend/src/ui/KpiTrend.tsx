import type { TrendPoint } from './kpiTrends';
import { timedTrendPath } from './kpiTrends';
import { formatTime } from './format';

/** Courbe compacte à côté de la valeur ; la légende précise mesure, période et éventuelle couverture partielle. */
export function KpiTrend({ points, label, recorded = false }: {
  readonly points: readonly TrendPoint[]; readonly label: string; readonly recorded?: boolean;
}) {
  const first = points[0];
  const last = points.at(-1);
  const full = first !== undefined && last !== undefined && last.t - first.t >= 58 * 60_000;
  const detail = points.length === 0 ? `${label} : historique indisponible`
    : `${label} · ${formatTime(first?.t ?? null)} – ${formatTime(last?.t ?? null)} (Paris)${recorded
      ? ` · historique enregistré${full ? '' : ', période partielle'}, retard possible de 60 s` : ' · suivi depuis l’ouverture, période éventuellement partielle'}`;
  return <span className={`kpi-trend${points.length === 0 ? ' kpi-trend-empty' : ''}`} title={detail}>
    <svg width="96" height="22" viewBox="0 0 96 22" role="img" aria-label={detail}>
      <path className="kpi-trend-baseline" d="M2,20 H94" />
      {points.length > 1 && <path d={timedTrendPath(points, 96, 22)} />}
      {points.length === 1 && <circle cx="94" cy="11" r="2" />}
    </svg>
    <span className="kpi-trend-period" aria-hidden="true">{points.length === 0 ? '—' : recorded ? '/min' : full ? '1 h' : 'Suivi'}</span>
  </span>;
}
