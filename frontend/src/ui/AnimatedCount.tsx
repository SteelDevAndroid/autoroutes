import { useUiStore } from '../state/uiStore';
import { formatCount } from './format';
import { useAnimatedNumber } from './useAnimatedNumber';

/**
 * Entier qui glisse vers sa nouvelle valeur. Le texte animé est masqué aux lecteurs d'écran (il changerait à chaque image) :
 * ils lisent la valeur finale, seule, dans un texte visuellement caché.
 */
export function AnimatedCount({ value }: { readonly value: number }) {
  const reduced = useUiStore((s) => s.reducedMotion);
  const shown = useAnimatedNumber(value, 400, !reduced);
  if (shown === value) {
    return <>{formatCount(value)}</>;
  }
  return (
    <>
      <span aria-hidden="true">{formatCount(shown)}</span>
      <span className="sr-only">{formatCount(value)}</span>
    </>
  );
}
