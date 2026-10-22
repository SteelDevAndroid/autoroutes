import { useUiStore } from '../state/uiStore';

/** Rappel de l'autoroute cherchée, avec le retour à l'affichage d'avant (filtre retiré, flux rétablis, carte recadrée). Échap fait de même. */
export function AxisFocusChip({ onBack }: { readonly onBack: () => void }) {
  const focus = useUiStore((s) => s.axisFocus);
  const filter = useUiStore((s) => s.odFilters.axis);
  const clear = useUiStore((s) => s.clearAxisFocus);
  // Le filtre changé à la main (liste « Axe », second clic sur le nom) rend le rappel caduc.
  if (focus === null || filter !== focus.value) {
    return null;
  }
  return (
    <div className="axis-focus" role="status">
      <span>Autoroute <strong>{focus.id}</strong> : gares cadrées, flux filtrés</span>
      <button type="button" className="icon-button" onClick={() => { clear(); onBack(); }}>Revenir à la vue d’ensemble (Échap)</button>
    </div>
  );
}
