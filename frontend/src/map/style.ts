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

function quietBasemap(layer: LayerSpecification): LayerSpecification {
  if (layer.type === 'fill' && ['buildings', 'landuse_industrial', 'landuse_pedestrian'].includes(layer.id)) {
    return { ...layer, paint: { ...layer.paint, 'fill-opacity': 0.55 } };
  }
  if (layer.type === 'line' && layer.id.startsWith('roads_')) {
    const opacity = /(?:minor|service|other|link|rail)/.test(layer.id) ? 0.38 : 0.62;
    return { ...layer, paint: { ...layer.paint, 'line-opacity': opacity } };
  }
  if (layer.type === 'symbol' && /^(?:roads_|address_|pois$|places_subplace$)/.test(layer.id)) {
    return { ...layer, paint: { ...layer.paint, 'text-opacity': 0.6, 'icon-opacity': 0.6 } };
  }
  return layer;
}

/**
 * Fond Protomaps auto-hébergé et couches métier accordés à la même apparence.
 * Sans fond configuré, un aplat neutre le remplace.
 */
export function buildStyle(options: StyleOptions): StyleSpecification {
  const appearance = options.appearance ?? 'dark';
  const theme = themeFor(options.palette ?? 'default', appearance);
  const base: LayerSpecification[] = options.basemapUrl === null
    ? [{ id: 'background', type: 'background', paint: { 'background-color': theme.background } }]
    : basemapLayers(BASEMAP_SOURCE, basemapTheme(appearance), { lang: 'fr' }).map(quietBasemap);
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
