import { useEffect, useRef, useState } from 'react';
import { shouldAnimateCount, tweenValue } from '../animation/tween';

/**
 * Valeur affichée d'un compteur : glisse de la valeur précédente à la nouvelle en `durationMs`.
 * Immédiat au premier affichage, hors animation (mouvement réduit) ou quand la valeur précédente est nulle.
 */
export function useAnimatedNumber(target: number, durationMs: number, enabled: boolean): number {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const from = current.current;
    if (from === target) {
      return undefined;
    }
    const animate = enabled && shouldAnimateCount(from, target);
    let start: number | null = null;
    let handle = 0;
    const step = (now: number) => {
      start ??= now;
      const t = animate ? Math.min(1, (now - start) / durationMs) : 1;
      current.current = t >= 1 ? target : tweenValue(from, target, t);
      setShown(Math.round(current.current));
      if (t < 1) {
        handle = requestAnimationFrame(step);
      }
    };
    handle = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(handle); };
  }, [target, durationMs, enabled]);
  return shown;
}
