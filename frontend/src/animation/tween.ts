import { easeOutCubic } from './easing';

/** Valeur intermédiaire entre `from` et `to` à l'avancement `t` (0 à 1), avec décélération. */
export function tweenValue(from: number, to: number, t: number): number {
  return from + (to - from) * easeOutCubic(t);
}

/**
 * Un compteur ne s'anime que d'une valeur déjà affichée à une autre : au premier affichage (0 → valeur reçue) il montre directement
 * la valeur, le compte à rebours depuis zéro n'apprend rien.
 */
export function shouldAnimateCount(shown: number, target: number): boolean {
  return Number.isFinite(shown) && Number.isFinite(target) && shown > 0 && shown !== target;
}
