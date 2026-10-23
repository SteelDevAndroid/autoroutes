/**
 * Tirets qui avancent le long d'une ligne MapLibre : `line-dasharray` ne s'anime pas, on change donc de motif à chaque pas.
 * Le motif de base est « tiret, vide » ; décalé de `offset` vers l'aval (sens de tracé : origine → destination), il s'écrit
 * « [0, décalage, tiret, vide − décalage] » tant que le décalage tient dans le vide, puis le tiret se coupe en deux (début et fin de période).
 * Chaque motif a la même longueur (tiret + vide) : le passage d'un pas au suivant ne saute pas.
 */
export function dashSequence(dash: number, gap: number, steps: number): number[][] {
  const period = dash + gap;
  return Array.from({ length: steps }, (_, k) => {
    const offset = (k * period) / steps;
    if (offset === 0) {
      return [dash, gap];
    }
    if (offset <= gap) {
      return [0, offset, dash, gap - offset];
    }
    const head = offset - gap;
    return [head, gap, dash - head, 0];
  });
}

/** Pas courant d'une séquence à l'instant `now` (ms) : `stepMs` par pas, en boucle. */
export function dashStep(now: number, stepMs: number, steps: number): number {
  return Math.floor(now / stepMs) % steps;
}
