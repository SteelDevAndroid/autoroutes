import { namedFlavor } from '@protomaps/basemaps';
import type { Flavor } from '@protomaps/basemaps';
import { lightTheme } from './theme';
import type { MapAppearance } from './theme';

/** Quiet geography lets station activity and alerts keep the strongest contrast. */
export const lightBasemap = {
  ...namedFlavor('light'),
  background: lightTheme.background, earth: lightTheme.background,
  water: '#DBE6EF',
  park_a: '#E8EEE9', park_b: '#DFE8E1',
  wood_a: '#E6EDE8', wood_b: '#DCE6DF',
  scrub_a: '#E7EDE9', scrub_b: '#E0E8E2',
  landcover: {
    barren: '#EEEDE8', farmland: '#EDEEE7', forest: '#DFE7E2',
    glacier: '#F4F6F8', grassland: '#E9EEE8', scrub: '#E7ECE7', urban_area: '#EBEFF3',
  },
  roads_label_minor: '#5A6A80', roads_label_major: '#4E5E75',
  roads_label_minor_halo: lightTheme.labelHalo, roads_label_major_halo: lightTheme.labelHalo,
  city_label: '#46566D', city_label_halo: lightTheme.labelHalo,
  subplace_label: '#5A6A80', subplace_label_halo: lightTheme.labelHalo,
  state_label: '#586A82', state_label_halo: lightTheme.labelHalo,
  country_label: '#586A82', ocean_label: '#4B647B',
  address_label: '#5A6A80', address_label_halo: lightTheme.labelHalo,
} satisfies Flavor;

export const basemapTheme = (appearance: MapAppearance): Flavor => appearance === 'light'
  ? lightBasemap : namedFlavor('dark');
