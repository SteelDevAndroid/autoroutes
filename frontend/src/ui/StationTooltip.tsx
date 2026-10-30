import { useLayoutEffect, useRef } from 'react';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import { formatAxes } from '../map/axes';
import { formatCount, formatTime } from './format';
import { tooltipPosition } from './tooltipPosition';
import { useStoreVersion } from './useStoreVersion';
import { anomalySummary } from '../realtime/anomalies';
import { Icon } from './Icon';

/** Aperçu d'une gare au survol, sans clic : nom, passages sur 1 h, état des données et anomalies. Le détail complet reste dans le panneau. */
export function StationTooltip({ stations, store }: { readonly stations: StationCollection; readonly store: StationStore }) {
  useStoreVersion(store);
  const hover = useUiStore((s) => s.hover);
  const mode = useUiStore((s) => s.mode);
  const freshness = useUiStore((s) => s.freshness);
  const connection = useUiStore((s) => s.connection);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    const container = element?.offsetParent;
    if (element !== null && container instanceof HTMLElement && hover !== null) {
      const { left, top } = tooltipPosition(hover, { width: container.clientWidth, height: container.clientHeight },
        { width: element.offsetWidth, height: element.offsetHeight });
      element.style.left = `${left}px`;
      element.style.top = `${top}px`;
    }
  });

  const feature = hover === null ? undefined : stations.features[hover.index];
  if (hover === null || feature === undefined) {
    return null;
  }
  const p = feature.properties;
  const last = store.lastEventMs[hover.index];
  const stale = mode === 'live' && (freshness?.status === 'STALE' || (freshness?.staleStations.includes(p.id) ?? false));
  const received = store.received[hover.index] === 1;
  const anomalies = anomalySummary(store.anomalies[hover.index] ?? null);
  return (
    <div ref={ref} className="station-tooltip" role="tooltip">
      <strong>{p.name}</strong>
      <span className="tooltip-meta">{p.kind === 'ECHANGEUR' ? 'Gare d’échangeur' : 'Barrière pleine voie'} · {formatAxes(p.axes)}</span>
      <span>Passages · 1 h : <strong>{received ? formatCount((store.entries1h[hover.index] ?? 0) + (store.exits1h[hover.index] ?? 0)) : '—'}</strong></span>
      {mode === 'live' && anomalies.count > 0 && <span className={`anomaly-severity anomaly-level-${anomalies.severity}`}><Icon name="warning" />{formatCount(anomalies.count)} {anomalies.count === 1 ? 'occurrence signalée' : 'occurrences signalées'} · {anomalies.label}{anomalies.unknown ? ' · criticité à vérifier' : ''}</span>}
      {mode === 'live' && anomalies.count === 0 && <span className="tooltip-meta">{store.anomalies[hover.index] === null ? 'Anomalies non communiquées' : 'Aucune anomalie signalée'}</span>}
      <span className={stale ? 'status-warn' : 'tooltip-meta'}>
        {mode === 'replay' ? 'Relecture · anomalies indisponibles' : !received ? 'Activité non reçue' : stale ? 'Données périmées' : connection !== 'open' ? 'Connexion interrompue · dernières valeurs' : freshness?.status === 'CATCHING_UP' ? 'Rattrapage · dernières valeurs' : `Dernier passage ${formatTime(last === undefined || Number.isNaN(last) ? null : last)}`}
      </span>
    </div>
  );
}
