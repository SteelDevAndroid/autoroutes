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
  odOrigin: 'rgba(76,201,240,0.05)',
  flowMark: '#FFFFFF',
  /** Rampe séquentielle (type cividis) pour la charge ESTIMÉE des tronçons, toujours en tirets. */
  segmentRamp: ['#2B3A55', '#575D6D', '#8F8A6E', '#C8B866', '#F2D45C'],
} as const;

export type Palette = 'default' | 'cvd';
export type MapAppearance = 'light' | 'dark';

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
  odOrigin: 'rgba(204,121,167,0.05)',
  anomalyLow: '#56B4E9',
  anomalyMedium: '#E69F00',
  anomalyHigh: '#FF8C4A',
  anomalyCritical: '#FF8C4A',
} as const;

export type Theme = { readonly [K in keyof typeof theme]: (typeof theme)[K] extends readonly string[] ? readonly string[] : string };

/** Darker pigments on a luminous reading plane; the meaning and geometry stay identical. */
export const lightTheme: Theme = {
  ...theme,
  background: '#F1F4F7',
  motorway: '#68788E',
  motorwayCasing: '#F7FAFD',
  motorwayNonConcede: '#7B8797',
  label: '#344257',
  labelHalo: '#F5F8FB',
  stationEchangeur: '#087F73',
  stationPleineVoie: '#A64710',
  stationStroke: '#F7FAFD',
  stationStale: '#081420',
  halo: '#4D617B',
  selection: '#234D84',
  anomalyLow: '#2367A4',
  anomalyMedium: '#896000',
  anomalyHigh: '#B44E13',
  anomalyCritical: '#B62F45',
  odFlow: '#1769A3',
  odOrigin: 'rgba(23,105,163,0.12)',
  flowMark: '#163E68',
  segmentRamp: ['#D8E4EF', '#ADCADF', '#719DBF', '#447AA3', '#214E75'],
};

export const lightCvdTheme: Theme = {
  ...lightTheme,
  stationEchangeur: '#2074AC',
  stationPleineVoie: '#9F3D12',
  odFlow: '#8B4276',
  odOrigin: 'rgba(139,66,118,0.12)',
  anomalyLow: '#2074AC',
  anomalyMedium: '#896000',
  anomalyHigh: '#A8440D',
  anomalyCritical: '#A8440D',
};

export const themeFor = (palette: Palette, appearance: MapAppearance = 'dark'): Theme => appearance === 'light'
  ? palette === 'cvd' ? lightCvdTheme : lightTheme
  : palette === 'cvd' ? cvdTheme : theme;

export const FRANCE_BOUNDS: [[number, number], [number, number]] = [[-5.3, 41.3], [9.7, 51.2]];
