import { useUiStore } from '../state/uiStore';
import { usePresenceValue } from './usePresenceValue';

const EXIT_MS = 150;

/** Rappel de l'autoroute cherchée, avec le retour à l'affichage d'avant (filtre retiré, flux rétablis, carte recadrée). Échap fait de même. */
export function AxisFocusChip({ onBack }: { readonly onBack: () => void }) {
  const focus = useUiStore((s) => s.axisFocus);
  const filter = useUiStore((s) => s.odFilters.axis);
  const clear = useUiStore((s) => s.clearAxisFocus);
  // Le filtre changé à la main (liste « Axe », second clic sur le nom) rend le rappel caduc.
  const current = focus !== null && filter === focus.value ? focus : null;
  const { value, leaving } = usePresenceValue(current, EXIT_MS);
  if (value === null) {
    return null;
  }
  return (
    <div className={`axis-focus${leaving ? ' leaving' : ''}`} role="status">
      <span>Autoroute <strong>{value.id}</strong> : gares cadrées, flux filtrés</span>
      <button type="button" className="icon-button" onClick={() => { clear(); onBack(); }} disabled={leaving}>Revenir à la vue d’ensemble (Échap)</button>
    </div>
  );
}
