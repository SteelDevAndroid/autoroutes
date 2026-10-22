import { config } from '../config';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { formatAxes } from '../map/axes';
import { formatCount, formatSigned, formatTime } from './format';
import { HistoryChart } from './HistoryChart';
import { useStoreVersion } from './useStoreVersion';

export function StationDetail({ stations, store }: { readonly stations: StationCollection; readonly store: StationStore }) {
  useStoreVersion(store);
  const index = useUiStore((s) => s.selectedIndex);
  const select = useUiStore((s) => s.select);
  const staleIds = useUiStore((s) => s.freshness?.staleStations);
  const feature = index === null ? undefined : stations.features[index];
  if (index === null || feature === undefined) {
    return null;
  }
  const p = feature.properties;
  const rows: [string, number, number][] = [
    ['5 min', store.entries5m[index] ?? 0, store.exits5m[index] ?? 0],
    ['15 min', store.entries15m[index] ?? 0, store.exits15m[index] ?? 0],
    ['1 h', store.entries1h[index] ?? 0, store.exits1h[index] ?? 0],
    ['Aujourd’hui', store.entriesToday[index] ?? 0, store.exitsToday[index] ?? 0],
  ];
  const stale = staleIds?.includes(p.id) ?? false;
  return (
    <section className="detail" aria-label={`Détail de la gare ${p.name}`}>
      <header>
        <div>
          <h2>{p.name}</h2>
          <span className="tag">{p.kind === 'ECHANGEUR' ? 'Gare d’échangeur' : 'Barrière pleine voie'}</span>{' '}
          <span className="tag">{formatAxes(p.axes)}</span>{' '}
          <span className="tag">Dép. {p.dept}</span>
        </div>
        <button type="button" className="icon-button" onClick={() => { select(null); }} aria-label="Fermer le détail">✕</button>
      </header>
      <table>
        <thead><tr><th>Fenêtre</th><th>Entrées</th><th>Sorties</th><th>Solde</th></tr></thead>
        <tbody>
          {rows.map(([label, entries, exits]) => (
            <tr key={label}><td>{label}</td><td>{formatCount(entries)}</td><td>{formatCount(exits)}</td><td>{formatSigned(entries - exits)}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        Dernier passage : {formatTime(Number.isNaN(store.lastEventMs[index] ?? Number.NaN) ? null : store.lastEventMs[index] ?? null)}
        {stale && <strong className="status-warn"> — données périmées</strong>}
      </p>
      {!config.demo && <HistoryChart stationId={p.id} />}
      <p className="note">{formatCount(p.lanes)} voies. Le solde n’est pas un nombre de véhicules présents.</p>
    </section>
  );
}
