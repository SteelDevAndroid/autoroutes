import type { ActivityMetric } from '../state/uiStore';
import { useUiStore } from '../state/uiStore';
import type { StationStore } from '../state/stationStore';
import type { StationCollection } from '../map/referentiel';
import { anomalySummary } from '../realtime/anomalies';
import { Section } from './Section';
import { EmptyState } from './EmptyState';
import { DataNature } from './DataNature';
import { formatCount } from './format';
import { useStoreVersion } from './useStoreVersion';

export const METRIC_LABELS: Record<ActivityMetric, string> = {
  passages1h: 'Gares les plus actives', entries1h: 'Entrées sur 1 h', exits1h: 'Sorties sur 1 h',
  today: 'Passages aujourd’hui', active15m: 'Gares actives sur 15 min', anomalies: 'Gares avec anomalies',
};

export function metricStations(store: StationStore, metric: ActivityMetric) {
  return store.ids.map((id, index) => {
    const value = metric === 'anomalies' ? anomalySummary(store.anomalies[index] ?? null).count
      : metric === 'entries1h' ? (store.entries1h[index] ?? 0)
      : metric === 'exits1h' ? (store.exits1h[index] ?? 0)
      : metric === 'today' ? (store.entriesToday[index] ?? 0) + (store.exitsToday[index] ?? 0)
      : metric === 'active15m' ? (store.entries15m[index] ?? 0) + (store.exits15m[index] ?? 0)
      : (store.entries1h[index] ?? 0) + (store.exits1h[index] ?? 0);
    return { id, index, value };
  }).filter((row) => row.value > 0).sort((a, b) => b.value - a.value || a.index - b.index);
}

export function MetricStations({ stations, store, metric, onFocus }: {
  readonly stations: StationCollection; readonly store: StationStore;
  readonly metric: ActivityMetric; readonly onFocus: (index: number) => void;
}) {
  useStoreVersion(store);
  const mode = useUiStore((s) => s.mode);
  const anomalies = metric === 'anomalies';
  const unavailable = anomalies && mode === 'replay';
  const rows = unavailable ? [] : metricStations(store, metric);
  const shown = anomalies ? rows : rows.slice(0, 8);
  const reported = store.anomalies.filter((items) => items !== null).length;
  const title = METRIC_LABELS[metric];
  return <Section id="activity" title={title} badge={anomalies ? <span className="tag">signalé</span> : <DataNature />}>
    <p className="note">Ensemble du réseau, indépendamment des filtres de la carte.
      {anomalies ? ` États communiqués : ${formatCount(reported)} / ${formatCount(store.size)} gares. Les états inconnus ne sont pas comptés comme zéro.`
        : ` ${shown.length} gares affichées sur ${formatCount(rows.length)} avec des passages. Valeur : ${metric === 'active15m' ? 'passages sur 15 min' : title.toLocaleLowerCase('fr')}.`}</p>
    {shown.length === 0 ? <EmptyState title={unavailable ? 'Historique des anomalies indisponible' : anomalies ? reported === 0 ? 'État des anomalies non communiqué' : 'Aucune anomalie dans les états communiqués' : 'Aucun passage sur cette période'}>
      {unavailable ? 'Revenir au direct pour consulter les signalements actuels.' : 'La liste suit les données reçues.'}
    </EmptyState> : <ol className="activity-list" aria-label={title}>
      {shown.map((row) => <li key={row.id}><button type="button" className="metric-row" onClick={() => { onFocus(row.index); }}>
        <span>{stations.features[row.index]?.properties.name ?? row.id}</span>
        <span className="activity-count">{formatCount(row.value)}{anomalies ? ' signal.' : ''}</span>
      </button></li>)}
    </ol>}
  </Section>;
}
