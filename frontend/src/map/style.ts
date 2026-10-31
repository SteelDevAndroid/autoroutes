import { layers as basemapLayers } from '@protomaps/basemaps';
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { businessLayers, businessSources, motorwayLayers } from './layers';
import { themeFor } from './theme';
import { basemapTheme } from './basemapTheme';
import type { MapAppearance, Palette } from './theme';

export interface StyleOptions {
  readonly basemapUrl: string | null;
  /** Palette des couches métier (défaut : `default`). */
  readonly palette?: Palette;
  readonly appearance?: MapAppearance;
  readonly motorwaysUrl: string | null;
  readonly glyphsUrl: string | null;
  readonly spriteUrl: string | null;
}

const BASEMAP_SOURCE = 'basemap';

/**
 * Fond Protomaps auto-hébergé et couches métier accordés à la même apparence.
 * Sans fond configuré (démonstration hors ligne), un aplat neutre le remplace : les couches métier restent identiques.
 */
export function buildStyle(options: StyleOptions): StyleSpecification {
  const appearance = options.appearance ?? 'dark';
  const theme = themeFor(options.palette ?? 'default', appearance);
  const base: LayerSpecification[] = options.basemapUrl === null
    ? [{ id: 'background', type: 'background', paint: { 'background-color': theme.background } }]
    : basemapLayers(BASEMAP_SOURCE, basemapTheme(appearance), { lang: 'fr' });
  const style: StyleSpecification = {
    version: 8,
    sources: {
      ...(options.basemapUrl === null ? {} : {
        [BASEMAP_SOURCE]: {
          type: 'vector',
          url: options.basemapUrl,
          attribution: '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
        },
      }),
      ...businessSources(options.motorwaysUrl),
    },
    // Sans polices auto-hébergées, aucun libellé : une couche texte sans glyphs rend le style invalide.
    layers: [
      ...base,
      ...(options.motorwaysUrl === null ? [] : motorwayLayers(theme)),
      ...businessLayers(theme),
    ].filter((layer) => options.glyphsUrl !== null || layer.type !== 'symbol'),
  };
  if (options.glyphsUrl !== null) {
    style.glyphs = options.glyphsUrl;
  }
  if (options.spriteUrl !== null) {
    // Both canonical sheets are bundled. Custom sprite URLs retain their contract.
    style.sprite = options.spriteUrl.replace(/\/(?:dark|light)(?=[?#]|$)/, `/${appearance}`);
  }
  return style;
}
