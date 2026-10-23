import type { Palette } from '../map/theme';

export const PALETTE_KEY = 'supervision.palette.v1';

type PaletteStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Stockage absent ou refusé : la palette par défaut s'applique, sans erreur. */
export function loadPalette(storage?: PaletteStorage): Palette {
  try {
    return (storage ?? window.localStorage).getItem(PALETTE_KEY) === 'cvd' ? 'cvd' : 'default';
  } catch {
    return 'default';
  }
}

export function savePalette(palette: Palette, storage?: PaletteStorage): void {
  try {
    (storage ?? window.localStorage).setItem(PALETTE_KEY, palette);
  } catch {
    // Le choix vaut pour la session seulement.
  }
}

/** Les couleurs de l'interface (hors carte) suivent l'attribut `data-palette` de la racine (feuille de style). */
export function applyPalette(palette: Palette, root: HTMLElement = document.documentElement): void {
  if (palette === 'cvd') {
    root.dataset.palette = 'cvd';
  } else {
    delete root.dataset.palette;
  }
}
