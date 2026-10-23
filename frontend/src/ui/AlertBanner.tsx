import { useEffect, useMemo, useState } from 'react';
import { useUiStore } from '../state/uiStore';
import { deriveAlerts, sortAlerts } from './alerts';
import type { Alert } from './alerts';
import { usePresenceValue } from './usePresenceValue';

const SHOWN = 3;
const EXIT_MS = 150;
/** Une coupure plus courte est une reconnexion ordinaire (démarrage, changement de réseau) : pas d'alerte. */
const CONNECTION_GRACE_MS = 5_000;

/** Alertes d'exploitation sous la barre du haut : visibles sans ouvrir Grafana ; muettes quand tout va bien. */
export function AlertBanner({ stationCount }: { readonly stationCount: number }) {
  const mode = useUiStore((s) => s.mode);
  const connection = useUiStore((s) => s.connection);
  const freshness = useUiStore((s) => s.freshness);
  const coverage = useUiStore((s) => s.odView.coverage);
  const toggleDiagnostic = useUiStore((s) => s.toggleDiagnostic);
  const [graceOver, setGraceOver] = useState(false);
  useEffect(() => {
    if (connection === 'open') {
      return undefined;
    }
    const timer = window.setTimeout(() => { setGraceOver(true); }, CONNECTION_GRACE_MS);
    return () => { window.clearTimeout(timer); setGraceOver(false); };
  }, [connection]);
  // Pendant le délai de grâce, la connexion est comptée comme ouverte : ni alerte de connexion ni indicateurs périmés par la coupure.
  const alerts = useMemo(
    () => sortAlerts(deriveAlerts({ mode, connection: connection === 'open' || graceOver ? connection : 'open', freshness: connection === 'open' || graceOver ? freshness : null, coverage, stationCount })),
    [mode, connection, graceOver, freshness, coverage, stationCount],
  );
  // Les dernières alertes restent affichées le temps de la sortie quand tout rentre dans l'ordre.
  const { value, leaving } = usePresenceValue<readonly Alert[]>(alerts.length === 0 ? null : alerts, EXIT_MS);
  if (value === null) {
    return null;
  }
  const critical = value.some((a) => a.severity === 'critical');
  return (
    <section className={`alert-banner ${critical ? 'alert-critical' : 'alert-warning'}${leaving ? ' leaving' : ''}`} {...(critical ? { role: 'alert' } : { 'aria-live': 'polite' as const })} aria-label="Alertes d’exploitation">
      <ul>
        {value.slice(0, SHOWN).map((a) => (
          <li key={a.id}><span className="alert-mark" aria-hidden="true">{a.severity === 'critical' ? '✖' : '▲'}</span> <strong>{a.title}</strong> — {a.detail}</li>
        ))}
        {value.length > SHOWN && <li>et {value.length - SHOWN} autre{value.length - SHOWN > 1 ? 's' : ''}</li>}
      </ul>
      <button type="button" className="icon-button" onClick={toggleDiagnostic}>Diagnostic</button>
    </section>
  );
}
