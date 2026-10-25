/**
 * Direction artistique « supervision sombre ». Couleurs métier choisies pour rester distinguables
 * en deutéranopie / protanopie (sarcelle vs ambre) et doublées d'un indice de forme (contour).
 */
export const theme = {
  background: '#0E1116',
  motorway: '#5B6578',
  motorwayCasing: '#1B2029',
  motorwayNonConcede: '#3A4150',
  label: '#C9D1D9',
  labelHalo: '#0E1116',
  stationEchangeur: '#2EC4B6',
  stationPleineVoie: '#F4A261',
  stationStroke: '#E6EDF3',
  stationStale: '#6E7681',
  halo: '#E6EDF3',
  selection: '#FFFFFF',
  anomalyLow: '#91C8F6',
  anomalyMedium: '#F1C478',
  anomalyHigh: '#F8AD74',
  anomalyCritical: '#FF9F9A',
  odFlow: '#4CC9F0',
  /** Rampe séquentielle (type cividis) pour la charge ESTIMÉE des tronçons, toujours en tirets. */
  segmentRamp: ['#2B3A55', '#575D6D', '#8F8A6E', '#C8B866', '#F2D45C'],
} as const;

export type Palette = 'default' | 'cvd';

/**
 * Palette « daltonisme » (couleurs de Okabe et Ito) : bleu ciel contre vermillon pour les gares, violet rougeâtre pour les flux ;
 * même rampe séquentielle bleu → jaune pour les tronçons, qui reste lisible sans distinguer le rouge du vert.
 * Les états (périmé, gare sans données) ne reposent jamais sur la couleur seule : texte, contour, tirets.
 */
export const cvdTheme = {
  ...theme,
  stationEchangeur: '#56B4E9',
  stationPleineVoie: '#D55E00',
  odFlow: '#CC79A7',
  anomalyLow: '#56B4E9',
  anomalyMedium: '#E69F00',
  anomalyHigh: '#FF8C4A',
  anomalyCritical: '#FF8C4A',
} as const;

export type Theme = { readonly [K in keyof typeof theme]: (typeof theme)[K] extends readonly string[] ? readonly string[] : string };

export const themeFor = (palette: Palette): Theme => (palette === 'cvd' ? cvdTheme : theme);

export const FRANCE_BOUNDS: [[number, number], [number, number]] = [[-5.3, 41.3], [9.7, 51.2]];
