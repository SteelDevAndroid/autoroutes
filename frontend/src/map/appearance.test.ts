import { describe, expect, it } from 'vitest';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { buildStyle } from './style';
import { themeFor } from './theme';
import { lightBasemap } from './basemapTheme';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return .2126 * (channels[0] ?? 0) + .7152 * (channels[1] ?? 0) + .0722 * (channels[2] ?? 0);
}
function contrast(a: string, b: string): number {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + .05) / (Math.min(first, second) + .05);
}

const resources = { basemapUrl: 'pmtiles:///tiles/france.pmtiles', motorwaysUrl: 'pmtiles:///tiles/motorways.pmtiles',
  glyphsUrl: '/fonts/{fontstack}/{range}.pbf', spriteUrl: '/sprites/v4/dark' };

describe.each(['light', 'dark'] as const)('map appearance %s', (appearance) => {
  it.each(['default', 'cvd'] as const)('validates the full basemap and business style (%s)', (palette) => {
    expect(validateStyleMin(buildStyle({ ...resources, appearance, palette }))).toEqual([]);
  });

  it.each(['default', 'cvd'] as const)('keeps data and selection distinguishable on the reading plane (%s)', (palette) => {
    const colors = themeFor(palette, appearance);
    for (const color of [colors.stationEchangeur, colors.stationPleineVoie, colors.odFlow, colors.selection,
      colors.anomalyLow, colors.anomalyMedium, colors.anomalyHigh, colors.anomalyCritical]) {
      const backgrounds = appearance === 'light'
        ? [colors.background, lightBasemap.water, ...Object.values(lightBasemap.landcover)] : [colors.background];
      for (const background of backgrounds) expect(contrast(color, background), `${color} on ${background}`).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(colors.label, colors.labelHalo)).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the corresponding self-hosted sprite sheet', () => {
    expect(buildStyle({ ...resources, appearance }).sprite).toBe(`/sprites/v4/${appearance}`);
    expect(buildStyle({ ...resources, appearance, spriteUrl: '/custom/sprite' }).sprite).toBe('/custom/sprite');
  });
});

it('uses a light fallback when tiles are unavailable, with the same layer topology', () => {
  const offline = { basemapUrl: null, motorwaysUrl: null, glyphsUrl: null, spriteUrl: null };
  const light = buildStyle({ ...offline, appearance: 'light' });
  expect(light.layers[0]).toMatchObject({ paint: { 'background-color': '#F1F4F7' } });
  for (const options of [offline, resources]) {
    expect(buildStyle({ ...options, appearance: 'light' }).layers.map((layer) => layer.id))
      .toEqual(buildStyle({ ...options, appearance: 'dark' }).layers.map((layer) => layer.id));
  }
});

it('retains a monotonically darker light load scale and colorblind station separation', () => {
  const colors = themeFor('cvd', 'light');
  const values = colors.segmentRamp.map(luminance);
  expect(values).toEqual([...values].sort((a, b) => b - a));
  expect(contrast(colors.stationEchangeur, colors.stationPleineVoie)).toBeGreaterThan(1.3);
});
