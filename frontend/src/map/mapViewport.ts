import type { PaddingOptions } from 'maplibre-gl';

export interface MapFrame {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** Le plus grand rectangle dégagé, avec une marge autour des panneaux superposés. */
export function clearMapFrame(width: number, height: number, overlays: readonly MapFrame[]): MapFrame {
  const whole = { left: 0, top: 0, right: width, bottom: height };
  const margin = 12;
  const rects = overlays.map(({ left, top, right, bottom }) => ({
    left: Math.max(0, Math.floor(left - margin)), top: Math.max(0, Math.floor(top - margin)),
    right: Math.min(width, Math.ceil(right + margin)), bottom: Math.min(height, Math.ceil(bottom + margin)),
  })).filter((rect) => rect.left < rect.right && rect.top < rect.bottom);
  if (rects.length === 0) return whole;
  const xs = [...new Set([0, width, ...rects.flatMap((rect) => [rect.left, rect.right])])].sort((a, b) => a - b);
  const ys = [...new Set([0, height, ...rects.flatMap((rect) => [rect.top, rect.bottom])])].sort((a, b) => a - b);
  let best = whole;
  let area = 0;
  for (const left of xs) {
    for (const right of xs) {
      if (right - left < Math.min(96, width)) continue;
      for (const top of ys) {
        for (const bottom of ys) {
          const size = (right - left) * (bottom - top);
          if (bottom - top < Math.min(64, height) || size <= area) continue;
          if (rects.some((rect) => left < rect.right && right > rect.left && top < rect.bottom && bottom > rect.top)) continue;
          best = { left, top, right, bottom };
          area = size;
        }
      }
    }
  }
  return best;
}

export function mapPadding(frame: MapFrame, width: number, height: number): PaddingOptions {
  return { left: frame.left, top: frame.top, right: width - frame.right, bottom: height - frame.bottom };
}

export const MAP_PANELS = ':scope > :is(.detail, .map-legend, .diagnostic, .replay-bar, .active-filters)';

export function readMapFrame(container: HTMLElement): MapFrame {
  const origin = container.getBoundingClientRect();
  const panels = container.parentElement?.querySelectorAll<HTMLElement>(MAP_PANELS) ?? [];
  const overlays = Array.from(panels).flatMap((panel) => {
    // Les animations d’entrée transforment le panneau. L’emprise de layout est déjà à sa position définitive.
    const left = panel.offsetLeft;
    const top = panel.offsetTop;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    if (width === 0 || height === 0 || panel.classList.contains('leaving')) return [];
    if (panel.classList.contains('replay-bar')) {
      const rect = panel.getBoundingClientRect();
      return [{ left: rect.left - origin.left, right: rect.right - origin.left,
        top: rect.top - origin.top, bottom: rect.bottom - origin.top }];
    }
    return [{ left, top, right: left + width, bottom: top + height }];
  });
  return clearMapFrame(container.clientWidth, container.clientHeight, overlays);
}
