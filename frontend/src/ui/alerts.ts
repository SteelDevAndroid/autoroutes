import type { Freshness, Mode } from '../state/uiStore';
import type { OdCoverage } from '../od/odTypes';
import type { ConnectionStatus } from '../realtime/streamClient';

export type AlertSeverity = 'critical' | 'warning';

export interface Alert {
  readonly id: string;
  readonly severity: AlertSeverity;
  readonly title: string;
  readonly detail: string;
}

export interface AlertInput {
  readonly mode: Mode;
  readonly connection: ConnectionStatus;
  readonly freshness: Freshness | null;
  readonly coverage: OdCoverage | null;
  readonly stationCount: number;
}

/** Seuils alignés sur les règles Prometheus (`observability/prometheus/alerts.yml`) : origine connue < 90 %. */
export const ORIGIN_KNOWN_MIN = 0.9;
/** En dessous de ce nombre de sorties, le taux d'origine connue n'est pas significatif (démarrage, nuit). */
export const ORIGIN_KNOWN_MIN_EXITS = 100;
/** Part de gares sans donnée récente à partir de laquelle on alerte : quelques gares silencieuses sont normales (nuit, travaux). */
export const STALE_STATIONS_RATIO = 0.05;

const seconds = (value: number): string => (value >= 120 ? `${Math.round(value / 60)} min` : `${Math.round(value)} s`);

/**
 * Alertes lisibles par l'exploitant, déduites de ce que l'interface reçoit déjà (flux SSE : fraîcheur, couverture des flux O/D),
 * sans appel supplémentaire. Aucune en relecture : les indicateurs de l'instant ne décrivent pas la période relue.
 */
export function deriveAlerts(input: AlertInput): Alert[] {
  if (input.mode === 'replay') {
    return [];
  }
  const alerts: Alert[] = [];
  if (input.connection !== 'open') {
    alerts.push(input.connection === 'closed'
      ? { id: 'connection', severity: 'critical', title: 'Connexion au serveur perdue', detail: 'Les chiffres affichés ne sont plus mis à jour. Rechargez la page si cela dure.' }
      : { id: 'connection', severity: 'warning', title: 'Reconnexion au serveur…', detail: 'Les chiffres affichés ne sont plus mis à jour le temps de la reconnexion.' });
    return alerts;
  }
  const { freshness } = input;
  if (freshness?.status === 'STALE') {
    alerts.push({ id: 'stale', severity: 'critical', title: 'Données périmées', detail: `Le dernier passage traité date de ${seconds(freshness.watermarkLagSeconds)} : le flux de péage est interrompu ou très en retard.` });
  } else if (freshness?.status === 'CATCHING_UP') {
    alerts.push({ id: 'catching-up', severity: 'warning', title: 'Rattrapage en cours', detail: `Retard de ${seconds(freshness.watermarkLagSeconds)} ; les chiffres rejoignent le temps réel.` });
  }
  if (freshness !== null && input.stationCount > 0 && freshness.staleStations.length / input.stationCount >= STALE_STATIONS_RATIO) {
    alerts.push({ id: 'stale-stations', severity: 'warning', title: `${freshness.staleStations.length} gares sans données récentes`, detail: 'Elles sont grisées sur la carte ; vérifiez le système de péage concerné.' });
  }
  const { coverage } = input;
  if (coverage !== null) {
    const exits = coverage.recorded + coverage.entryMissing + coverage.entryUnknown;
    const ratio = exits === 0 ? 1 : coverage.recorded / exits;
    if (exits >= ORIGIN_KNOWN_MIN_EXITS && ratio < ORIGIN_KNOWN_MIN) {
      alerts.push({ id: 'origin-known', severity: 'warning', title: `Origine connue pour ${Math.round(ratio * 100)} % des sorties`, detail: 'Sous 90 %, les flux origine → destination sont incomplets (entrées manquantes ou gares inconnues).' });
    }
  }
  return alerts;
}

/** La plus grave d'abord ; à gravité égale, l'ordre de déduction. */
export const sortAlerts = (alerts: readonly Alert[]): Alert[] =>
  [...alerts].sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical'));
