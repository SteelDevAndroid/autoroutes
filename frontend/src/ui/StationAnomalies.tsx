import type { StationAnomaly } from '../realtime/anomalies';
import { anomalySeverity, anomalySummary } from '../realtime/anomalies';
import { formatCount } from './format';
import { Icon } from './Icon';

export function StationAnomalies({ anomalies, updatedAt }: { readonly anomalies: readonly StationAnomaly[] | null; readonly updatedAt?: string | null }) {
  const summary = anomalySummary(anomalies);
  const active = (anomalies ?? []).filter((item) => item.cardinalite > 0)
    .toSorted((a, b) => anomalySeverity(b.criticite) - anomalySeverity(a.criticite));
  return <section className="station-anomalies" aria-label="Incidents et anomalies">
    <div className="anomalies-heading"><h3>Incidents et anomalies</h3>
      {summary.count > 0 && <span className="note">{formatCount(summary.count)} {summary.count === 1 ? 'occurrence' : 'occurrences'}</span>}
    </div>
    {anomalies === null ? <p className="note">État des anomalies non communiqué pour cette gare.</p>
      : active.length === 0 ? <p className="note">Aucune anomalie signalée par la source.</p>
      : <ul className="anomaly-list">{active.map((item, index) => <li key={`${item.type_ano}-${item.criticite}-${index}`}>
        <div className="anomaly-description"><span className={`anomaly-severity anomaly-level-${anomalySeverity(item.criticite)}`}><Icon name="warning" />{item.criticite}</span>
          <span>{item.type_ano}</span></div>
        <span className="anomaly-count" aria-label={`${formatCount(item.cardinalite)} ${item.cardinalite === 1 ? 'occurrence' : 'occurrences'}`}>×{formatCount(item.cardinalite)}</span>
      </li>)}</ul>}
    {summary.unknown && <p className="note">Criticité non reconnue : sa valeur est affichée sans classement de gravité.</p>}
    {updatedAt != null && Number.isFinite(Date.parse(updatedAt)) && <p className="note">État déclaré le {new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(updatedAt))} (Paris).</p>}
  </section>;
}
