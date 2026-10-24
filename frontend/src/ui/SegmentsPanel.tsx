import { useUiStore } from '../state/uiStore';
import { EmptyState } from './EmptyState';
import { Section } from './Section';
import { formatCount } from './format';

const DOC_URL = 'https://github.com/SteelDevAndroid/autoroutes/blob/main/docs/increment-4.md#4-non-atteint-à-faire-sur-un-poste-avec-accès-réseau';

/** La charge des tronçons n'est jamais une mesure : l'estimation, son algorithme et ses limites sont toujours affichés. */
export function SegmentsPanel() {
  const segments = useUiStore((s) => s.segments);
  const capability = useUiStore((s) => s.capabilities?.segments);
  return (
    <Section id="segments" title="Charge estimée" label="Charge estimée des tronçons" badge={<span className="tag section-tag">estimé</span>}>
      <p className="note"><strong>Estimation</strong>, pas une mesure : chaque flux reçu est affecté au trajet le plus rapide.
        Un seul itinéraire par flux, trajets sans péage invisibles, flux daté de la sortie.</p>
      {segments === null
        ? (
          <EmptyState title={capability === 'DISABLED' ? 'Estimation indisponible'
            : capability === 'STARTING' ? 'Premier calcul en cours' : 'Aucune estimation reçue'}>
            {capability === 'DISABLED' ? 'Aucun graphe routier n’est activé pour cette application. '
              : capability === 'STARTING' ? 'Les tronçons seront disponibles à la fin du premier calcul. '
              : 'La disponibilité des tronçons est vérifiée automatiquement. '}
            <a href={DOC_URL} target="_blank" rel="noreferrer noopener">Procédure de mise en service</a>.
          </EmptyState>
        )
        : <p className="note" data-testid="segments-info">{formatCount(segments.loads.length)} tronçons d’au moins 3 véh. sur 1 h · {segments.graphVersion}</p>}
    </Section>
  );
}
