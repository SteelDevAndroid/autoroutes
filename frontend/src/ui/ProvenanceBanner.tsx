import { config } from '../config';
import { useUiStore } from '../state/uiStore';

/** La fraîcheur du transport ne prouve jamais la provenance des événements. */
export function ProvenanceBanner() {
  const mode = useUiStore((s) => s.mode);
  const provenance = useUiStore((s) => s.mode === 'replay' ? s.replayProvenance : s.capabilities?.provenance ?? 'UNKNOWN');
  if (mode === 'replay' && provenance === 'UNKNOWN') return <div className="source-banner source-warning" role="note">Provenance historique non vérifiée — ces données peuvent inclure une simulation</div>;
  if (config.demo || provenance === 'SIMULATED') {
    return <div className="simulated-banner" role="note">DONNÉES SIMULÉES — démonstration, aucune valeur réelle</div>;
  }
  if (provenance === 'OBSERVED') {
    return <div className="source-banner" role="note">Données observées — événements des gares</div>;
  }
  return <div className="source-banner source-warning" role="note">{provenance === 'MIXED'
    ? 'Données mixtes — événements observés et simulés'
    : 'Provenance non vérifiée — ces données peuvent inclure une simulation'}</div>;
}
