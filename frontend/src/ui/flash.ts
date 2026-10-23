import { useState } from 'react';

/** Clés de `current` absentes de `previous`. Sans liste précédente ou à partir d'une liste vide (premières données), rien n'est nouveau : on ne signale pas toute la liste. */
export function newKeys(previous: ReadonlySet<string> | null, current: readonly string[]): Set<string> {
  return previous === null || previous.size === 0 ? new Set() : new Set(current.filter((key) => !previous.has(key)));
}

/**
 * Clés apparues depuis la liste précédente, pour les signaler une fois (fond qui s'estompe). Le premier affichage n'en signale aucune ;
 * une clé déjà vue ne l'est plus à l'affichage suivant.
 */
export function useNewKeys(keys: readonly string[]): ReadonlySet<string> {
  const signature = keys.join('\u0000');
  const [state, setState] = useState<{ signature: string; known: ReadonlySet<string> | null; fresh: ReadonlySet<string> }>(
    { signature, known: new Set(keys), fresh: new Set() },
  );
  if (state.signature !== signature) {
    // Ajustement d'état pendant le rendu : l'affichage courant porte déjà les clés nouvelles.
    setState({ signature, known: new Set(keys), fresh: newKeys(state.known, keys) });
  }
  return state.fresh;
}
