import { formatCount } from './format';
import { useUiStore } from '../state/uiStore';

/** La charge des tronçons n'est jamais une mesure : l'estimation, son algorithme et ses limites sont toujours affichés. */
export function SegmentsPanel() {
  const segments = useUiStore((s) => s.segments);
  return (
    <section aria-label="Charge estimée des tronçons">
      <h2>Charge estimée</h2>
      <p className="note"><strong>Estimation</strong>, pas une mesure : chaque flux observé est affecté au trajet le plus rapide.
        Un seul itinéraire par flux, trajets sans péage invisibles, flux daté de la sortie.</p>
      {segments === null
        ? <p className="note" data-testid="segments-empty">Aucune estimation reçue : graphe routier non configuré ou premier calcul en cours.</p>
        : <p className="note" data-testid="segments-info">{formatCount(segments.loads.length)} tronçons d’au moins 3 véh. sur 1 h · {segments.graphVersion}</p>}
    </section>
  );
}
