import { formatAxes, splitCodes } from '../map/axes';
import type { StationCollection } from '../map/referentiel';
import { anomalySummary } from '../realtime/anomalies';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { DataNature } from './DataNature';
import { formatCount, formatTime } from './format';
import { Icon } from './Icon';
import { useStoreVersion } from './useStoreVersion';

/** Une gare partageant plusieurs codes de l'axe n'est comptée qu'une fois. */
export function axisMetrics(stations: StationCollection, store: StationStore, axis: string) {
  const codes = new Set(splitCodes(axis));
  const members = stations.features.filter((f) => splitCodes(f.properties.axes).some((code) => codes.has(code)));
  let received = 0, active = 0, passages = 0, reported = 0, anomalies = 0;
  for (const feature of members) {
    const index = store.indexOf(feature.properties.id);
    if (index === undefined) continue;
    if (store.received[index] === 1) {
      received++;
      passages += (store.entries1h[index] ?? 0) + (store.exits1h[index] ?? 0);
      if ((store.entries15m[index] ?? 0) + (store.exits15m[index] ?? 0) > 0) active++;
    }
    const items = store.anomalies[index];
    if (items != null) { reported++; anomalies += anomalySummary(items).count; }
  }
  return { members, received, active, passages, reported, anomalies };
}

export function AxisSummary({ stations, store }: { readonly stations: StationCollection; readonly store: StationStore }) {
  const axis = useUiStore((s) => s.odFilters.axis);
  const mode = useUiStore((s) => s.mode);
  const watermark = useUiStore((s) => s.watermark);
  const freshness = useUiStore((s) => s.freshness);
  useStoreVersion(store);
  const data = axisMetrics(stations, store, axis);
  if (axis === '') return null;
  const total = data.members.length;
  const stale = mode === 'live' ? data.members.filter((f) => freshness?.staleStations.includes(f.properties.id)).length : 0;
  return <details className="axis-summary" aria-label="Résumé de l’axe" open>
    <summary><Icon name="route" /><span>Résumé · {formatAxes(axis)}</span><Icon name="chevron" /></summary>
    <div className="axis-summary-body">
      <p className="note">Ensemble de l’axe · <DataNature /></p>
      {total === 0 ? <p className="note">Aucune gare du référentiel ne correspond à cet axe.</p> : <>
        <dl className="summary-grid">
          <div><dt>Gares de l’axe</dt><dd>{formatCount(total)}</dd></div>
          <div><dt>Actives · 15 min</dt><dd>{data.received === 0 ? '—' : formatCount(data.active)}</dd></div>
          <div><dt>Passages · 1 h</dt><dd>{data.received === 0 ? '—' : formatCount(data.passages)}</dd></div>
          <div><dt>Anomalies</dt><dd>{mode === 'replay' || data.reported === 0 ? '—' : `${data.reported < total ? '≥ ' : ''}${formatCount(data.anomalies)}`}</dd></div>
        </dl>
        <p className="note">Activité reçue : {data.received} / {total} gares.
          {mode === 'live' ? ` Anomalies : ${data.reported} / ${total} états reçus.` : ' Historique des anomalies indisponible en relecture.'}</p>
        <p className="note">Données à {formatTime(watermark)} · Paris{mode === 'replay' ? ' · relecture' : ''}.
          {stale > 0 && <strong className="status-warn"> {stale} gares signalées périmées.</strong>}
          {mode === 'live' && freshness?.status === 'CATCHING_UP' && <strong className="status-warn"> Rattrapage en cours.</strong>}
          {mode === 'live' && freshness?.status === 'STALE' && <strong className="status-warn"> Données périmées.</strong>}</p>
        <details className="axis-method"><summary>Comprendre les chiffres</summary><p className="note">Gares rattachées à l’axe, tous types confondus.
          Passages = entrées + sorties, pas des véhicules uniques. Les données non reçues sont inconnues.
          Le signe ≥ indique un total partiel d’anomalies signalées.</p></details>
      </>}
    </div>
  </details>;
}
