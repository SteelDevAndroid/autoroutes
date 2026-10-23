import { useEffect, useState } from 'react';

/**
 * Garde une valeur à l'écran le temps de sa sortie : quand `value` passe à `null`, la dernière valeur reste renvoyée
 * (avec `leaving` à vrai) pendant `exitMs`, ce qui laisse jouer une transition de sortie sans conserver l'élément à l'état fantôme.
 * Les entrées se jouent par animation CSS à l'apparition de l'élément.
 */
export function usePresenceValue<T>(value: T | null, exitMs: number): { readonly value: T | null; readonly leaving: boolean } {
  const [retained, setRetained] = useState<T | null>(value);
  const [previous, setPrevious] = useState<T | null>(value);
  // Ajustement d'état pendant le rendu (modèle recommandé par React) : pas de rendu intermédiaire avec l'ancienne valeur.
  if (value !== previous) {
    setPrevious(value);
    if (value !== null) {
      setRetained(value);
    }
  }
  const leaving = value === null && retained !== null;
  useEffect(() => {
    if (!leaving) {
      return undefined;
    }
    const timer = window.setTimeout(() => { setRetained(null); }, exitMs);
    return () => { window.clearTimeout(timer); };
  }, [leaving, exitMs]);
  return { value: value ?? retained, leaving };
}
