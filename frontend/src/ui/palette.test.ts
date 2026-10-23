import { describe, expect, it } from 'vitest';
import { cvdTheme, theme, themeFor } from '../map/theme';
import css from '../styles.css?raw';
import { PALETTE_KEY, applyPalette, loadPalette, savePalette } from './paletteStorage';

const luminance = (hex: string): number => {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

/** Variables CSS d'un bloc de `styles.css` (le premier `:root` ou le bloc d'une palette). */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1] as string, m[2] as string]));
}

describe('contrast of the interface colors (WCAG AA, 4.5:1)', () => {
  const base = tokens(':root {');
  const cvd = { ...base, ...tokens(':root[data-palette="cvd"]') };

  for (const [name, colors] of [['default', base], ['cvd', cvd]] as const) {
    it(`keeps text and status colors readable on the panels (${name})`, () => {
      for (const token of ['--text', '--text-muted', '--accent', '--ok', '--warn', '--danger']) {
        for (const background of ['--bg', '--panel']) {
          expect(contrast(colors[token] as string, colors[background] as string), `${token} sur ${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    });
  }
});

describe('colorblind palette', () => {
  it('only changes the colors that carry meaning, and keeps the two station kinds apart by lightness too', () => {
    expect(themeFor('default')).toBe(theme);
    expect(themeFor('cvd')).toBe(cvdTheme);
    expect(cvdTheme.motorway).toBe(theme.motorway);
    expect(cvdTheme.segmentRamp).toEqual(theme.segmentRamp);
    // Sans teinte (daltonisme sévère), la différence de luminosité sépare encore les deux types de gares.
    expect(contrast(cvdTheme.stationEchangeur, cvdTheme.stationPleineVoie)).toBeGreaterThan(1.3);
  });

  it('keeps the sequential ramp ordered from dark to light', () => {
    const lightness = theme.segmentRamp.map(luminance);

    expect([...lightness].sort((a, b) => a - b)).toEqual(lightness);
  });

  it('keeps every map color visible on the dark background', () => {
    for (const color of [cvdTheme.stationEchangeur, cvdTheme.stationPleineVoie, cvdTheme.odFlow]) {
      expect(contrast(color, cvdTheme.background)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('palette storage', () => {
  const memory = (initial?: string) => {
    const data = new Map<string, string>(initial === undefined ? [] : [[PALETTE_KEY, initial]]);
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); } };
  };

  it('remembers the choice and falls back to the default palette', () => {
    const storage = memory();
    expect(loadPalette(storage)).toBe('default');
    savePalette('cvd', storage);
    expect(loadPalette(storage)).toBe('cvd');
    expect(loadPalette(memory('inconnue'))).toBe('default');
  });

  it('survives a storage that refuses access', () => {
    const refusing = { getItem: () => { throw new Error('refusé'); }, setItem: () => { throw new Error('refusé'); } };

    expect(loadPalette(refusing)).toBe('default');
    expect(() => { savePalette('cvd', refusing); }).not.toThrow();
  });

  it('is applied to the page root as an attribute', () => {
    const root = document.createElement('div');

    applyPalette('cvd', root);
    expect(root.dataset.palette).toBe('cvd');
    applyPalette('default', root);
    expect(root.dataset.palette).toBeUndefined();
  });
});
