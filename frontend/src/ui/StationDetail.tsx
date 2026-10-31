import { useEffect, useRef } from 'react';
import { config } from '../config';
import { DataNature } from './DataNature';
import type { StationCollection } from '../map/referentiel';
import type { StationStore } from '../state/stationStore';
import { useUiStore } from '../state/uiStore';
import type { FlowKey } from '../state/uiStore';
import { formatAxes } from '../map/axes';
import { formatCount, formatSigned, formatTime } from './format';
import { HistoryChart } from './HistoryChart';
import { flowsOfStation } from './stationFlows';
import { useNewKeys } from './flash';
import { usePresenceValue } from './usePresenceValue';
import { useStoreVersion } from './useStoreVersion';
import { GlassPanel } from './Spatial';
import { Icon } from './Icon';
import { COMPACT_QUERY } from './useCompact';
import { StationAnomalies } from './StationAnomalies';

const TOP_FLOWS = 5;
const EXIT_MS = 150;

/** Principaux flux O/D de la gare, lus dans la liste déjà chargée : mêmes filtres, même seuil de 3 véhicules que la section « Flux O/D ». */
function StationFlows({ stationId, stations, onFocusFlow }: {
  readonly stationId: string;
  readonly stations: StationCollection;
  readonly onFocusFlow: (flow: FlowKey) => void;
}) {
  const view = useUiStore((s) => s.odView);
  const odLayer = useUiStore((s) => s.layers.od);
  const toggleLayer = useUiStore((s) => s.toggleLayer);
  const highlight = useUiStore((s) => s.setHighlightedFlow);
  const flows = flowsOfStation(view.flows, stationId, TOP_FLOWS);
  const fresh = useNewKeys(flows.map((f) => `${f.direction}-${f.otherId}`));
  const names = new Map(stations.features.map((f) => [f.properties.id, f.properties.name]));
  view.nodes.forEach((n) => { names.set(n.id, n.name); });
  // Hors démonstration, la liste n'est relue par l'API que si la couche des flux est affichée.
  if (!config.demo && !odLayer) {
    return (
      <div className="detail-flows">
        <h3>Principaux flux</h3>
        <button type="button" className="icon-button" onClick={() => { toggleLayer('od'); }}>Afficher les flux O/D</button>
      </div>
    );
  }
  if (view.level !== 'STATION') {
    return <div className="detail-flows"><h3>Principaux flux</h3><p className="note">Les flux sont regroupés par départements : choisissez le niveau « Gares » pour voir ceux de cette gare.</p></div>;
  }
  return (
    <div className="detail-flows">
      <h3>Principaux flux <DataNature /></h3>
      {flows.length === 0
        ? <p className="note">Aucun flux d’au moins 3 véhicules sur l’heure pour cette gare, avec les filtres actuels.</p>
        : (
          <ol aria-label="Principaux flux de la gare">
            {flows.map((f) => {
              const key = f.direction === 'out' ? { originId: stationId, destinationId: f.otherId } : { originId: f.otherId, destinationId: stationId };
              return (
<li key={`${f.direction}-${f.otherId}`}>
                  <button type="button" className={`od-row${fresh.has(`${f.direction}-${f.otherId}`) ? ' flash' : ''}`} onMouseEnter={() => { highlight(key); }} onMouseLeave={() => { highlight(null); }}
                    onFocus={() => { highlight(key); }} onBlur={() => { highlight(null); }} onClick={() => { onFocusFlow(key); }}>
                    <span className="od-route">{f.direction === 'out' ? 'Vers' : 'Depuis'} {names.get(f.otherId) ?? f.otherId}</span>
                    <span className="od-count">{formatCount(f.vehicles)} véh.</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
    </div>
  );
}

export function StationDetail({ stations, store, onFocusFlow }: {
  readonly stations: StationCollection;
  readonly store: StationStore;
  readonly onFocusFlow: (flow: FlowKey) => void;
}) {
  useStoreVersion(store);
  const selected = useUiStore((s) => s.selectedIndex);
  const mode = useUiStore((s) => s.mode);
  const closeButton = useRef<HTMLButtonElement>(null);
  const previousSelection = useRef<number | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (selected !== null) {
      if (previousSelection.current === null) returnFocus.current = document.activeElement as HTMLElement | null;
      closeButton.current?.focus({ preventScroll: true });
    } else if (previousSelection.current !== null) {
      const origin = returnFocus.current;
      if (origin?.isConnected && origin.matches('button, input, select, textarea, a[href], [tabindex]') && origin.getClientRects().length > 0 && getComputedStyle(origin).visibility !== 'hidden' && !origin.closest('[inert]')) {
        origin.focus({ preventScroll: true });
      } else {
        document.getElementById(window.matchMedia(COMPACT_QUERY).matches ? 'drawer-toggle' : 'station-search')?.focus({ preventScroll: true });
      }
    }
    previousSelection.current = selected;
  }, [selected]);
  // À la fermeture, la dernière gare reste affichée le temps de la transition de sortie.
  const { value: index, leaving } = usePresenceValue(selected, EXIT_MS);
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
  const stale = mode === 'live' && (staleIds?.includes(p.id) ?? false);
  const received = store.received[index] === 1;
  const count = (value: number) => received ? formatCount(value) : '—';
  return (
    <GlassPanel material="thick" depth="floating" className={`detail${leaving ? ' leaving' : ''}`} aria-label={`Détail de la gare ${p.name}`}>
      <header>
        <div>
          <p className="eyebrow">Fiche de gare</p>
          <h2>{p.name}</h2>
          <p className="station-meta">{p.kind === 'ECHANGEUR' ? 'Gare d’échangeur' : 'Barrière pleine voie'}<span>{formatAxes(p.axes)}</span><span>Dép. {p.dept}</span></p>
        </div>
        <button ref={closeButton} type="button" className="icon-button" onClick={() => { select(null); }} aria-label="Fermer le détail"><Icon name="close" /></button>
      </header>
      <button type="button" className="icon-button selection-clear" onClick={() => { select(null); }}>Effacer la sélection</button>
      <section className="station-overview" aria-label="Chiffres clés de la gare">
        <div className="anomalies-heading"><h3>Activité de la gare</h3><DataNature /></div>
        <dl className="summary-grid station-key-metrics">
          <div><dt>Entrées · 1 h</dt><dd>{count(store.entries1h[index] ?? 0)}</dd></div>
          <div><dt>Sorties · 1 h</dt><dd>{count(store.exits1h[index] ?? 0)}</dd></div>
          <div><dt>Passages aujourd’hui</dt><dd>{count((store.entriesToday[index] ?? 0) + (store.exitsToday[index] ?? 0))}</dd></div>
        </dl>
        {!received && <p className="note">Activité non reçue pour cette gare.</p>}
        <p className="note">Dernier passage : {formatTime(Number.isNaN(store.lastEventMs[index] ?? Number.NaN) ? null : store.lastEventMs[index] ?? null)}
          {mode === 'replay' && ' · relecture'}
          {stale && <strong className="status-warn"> — données périmées</strong>}
        </p>
      </section>
      {mode === 'replay' ? <section className="station-anomalies" aria-label="Incidents et anomalies"><h3>Incidents et anomalies</h3><p className="note">État des anomalies indisponible en relecture : aucun historique d’incidents n’est fourni.</p></section>
        : <StationAnomalies anomalies={store.anomalies[index] ?? null} updatedAt={store.anomaliesUpdatedAt[index] ?? null} />}
      <details className="period-breakdown" key={p.id}>
        <summary>Détail par période <Icon name="chevron" /></summary>
      <table>
        <caption className="sr-only">Passages par période et solde des entrées et sorties</caption>
        <thead><tr><th scope="col">Période</th><th scope="col">Entrées</th><th scope="col">Sorties</th><th scope="col">Solde</th></tr></thead>
        <tbody>
          {rows.map(([label, entries, exits]) => (
            <tr key={label}><th scope="row">{label}</th><td>{count(entries)}</td><td>{count(exits)}</td><td>{received ? formatSigned(entries - exits) : '—'}</td></tr>
          ))}
        </tbody>
      </table>
      <p className="note">Le solde est la différence entre entrées et sorties, pas un nombre de véhicules présents.</p>
      </details>
      <section className="detail-history" aria-label="Historique de la gare">
        <h3>Historique</h3>
        {config.demo ? <p className="note">La démonstration ne fournit pas de séries historiques.</p>
          : mode === 'replay' ? <p className="note">Comparaison avec J-7 disponible au retour au direct.</p>
          : <HistoryChart key={p.id} stationId={p.id} />}
      </section>
      <StationFlows stationId={p.id} stations={stations} onFocusFlow={onFocusFlow} />
      <p className="note">{formatCount(p.lanes)} voies. Les passages additionnent les entrées et sorties ; ce ne sont pas des véhicules uniques. La répartition par classe de véhicule n’est pas diffusée par le flux.</p>
    </GlassPanel>
  );
}
