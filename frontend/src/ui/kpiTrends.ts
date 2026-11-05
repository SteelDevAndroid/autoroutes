import type { ActivityMetric } from '../state/uiStore';
import type { StationStore } from '../state/stationStore';
import { anomalySummary } from '../realtime/anomalies';

export const HOUR_MS = 3_600_000;
const SAMPLE_MS = 5_000;
export type KpiMetric = Exclude<ActivityMetric, 'passages1h'>;
export interface KpiSample {
  readonly t: number;
  readonly values: Readonly<Record<KpiMetric, number | null>>;
}
export interface TrendPoint { readonly t: number; readonly value: number; readonly gap?: boolean }

export function timelinePoints(samples: readonly KpiSample[], metric: KpiMetric): TrendPoint[] {
  const points: TrendPoint[] = [];
  let gap = false;
  for (const sample of samples) {
    const value = sample.values[metric];
    if (value === null) { gap = true; continue; }
    points.push({ t: sample.t, value, gap });
    gap = false;
  }
  return points;
}

export function sampleKpis(store: StationStore, replay: boolean): KpiSample['values'] {
  const sum = (array: Float64Array) => array.reduce((total, n) => total + n, 0);
  let active = 0, reported = 0, anomalies = 0;
  for (let i = 0; i < store.size; i++) {
    if ((store.entries15m[i] ?? 0) + (store.exits15m[i] ?? 0) > 0) active++;
    const items = store.anomalies[i];
    if (items != null) { reported++; anomalies += anomalySummary(items).count; }
  }
  return { entries1h: sum(store.entries1h), exits1h: sum(store.exits1h),
    today: sum(store.entriesToday) + sum(store.exitsToday), active15m: active,
    anomalies: replay || reported === 0 ? null : anomalies };
}

/** Au plus 721 échantillons pour tout le bandeau ; ni remplissage des trous, ni persistance entre utilisateurs. */
export class KpiTimeline {
  constructor(readonly context: { readonly store: StationStore; readonly mode: string; readonly from: string | null } | null = null) {}
  private samples: readonly KpiSample[] = [];
  private readonly listeners = new Set<() => void>();
  readonly snapshot = (): readonly KpiSample[] => this.samples;
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  record(sample: KpiSample): void {
    if (!Number.isFinite(sample.t)) return;
    const last = this.samples.at(-1);
    const kept = last !== undefined && sample.t < last.t ? []
      : this.samples.filter((p) => p.t >= sample.t - HOUR_MS && Math.floor(p.t / SAMPLE_MS) !== Math.floor(sample.t / SAMPLE_MS));
    this.samples = [...kept, sample];
    this.listeners.forEach((listener) => { listener(); });
  }
}

/** Une absence est une rupture de courbe, jamais un zéro ou une interpolation sur une déconnexion. */
export function timedTrendPath(points: readonly TrendPoint[], width: number, height: number, range?: { readonly start: number; readonly end: number }): string {
  if (points.length === 0) return '';
  const first = range?.start ?? points[0]?.t ?? 0;
  const span = Math.max(1, (range?.end ?? points.at(-1)?.t ?? first) - first);
  const max = Math.max(1, ...points.map((p) => p.value));
  return points.map((p, i) => {
    const previous = points[i - 1];
    const command = previous === undefined || p.gap === true || p.t - previous.t > 90_000 ? 'M' : 'L';
    return `${command}${((p.t - first) / span * (width - 4) + 2).toFixed(1)},${(height - 2 - p.value / max * (height - 4)).toFixed(1)}`;
  }).join(' ');
}

export const MINUTE_MS = 60_000;
export type HistoryState = 'loading' | 'ready' | 'error' | 'local';

/** Une minute absente reste inconnue. Les pourcentages exigent deux fenêtres complètes. */
export function minuteWindow(points: readonly TrendPoint[], end: number) {
  const stop = Math.floor(end / MINUTE_MS) * MINUTE_MS;
  const start = stop - HOUR_MS;
  const window = points.filter((p) => p.t >= start && p.t < stop);
  const complete = window.length === 60 && window.every((p, i) =>
    p.t === start + i * MINUTE_MS && p.gap !== true && Number.isFinite(p.value) && p.value >= 0);
  return { start, end: stop, points: window, complete, total: window.reduce((sum, p) => sum + p.value, 0) };
}

export function hourlyChange(points: readonly TrendPoint[], end: number): number | 'new' | null {
  const current = minuteWindow(points, end);
  const previous = minuteWindow(points, end - HOUR_MS);
  if (!current.complete || !previous.complete) return null;
  if (previous.total === 0) return current.total === 0 ? 0 : 'new';
  return (current.total - previous.total) / previous.total;
}
