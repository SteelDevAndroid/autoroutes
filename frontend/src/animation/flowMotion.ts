import { dashSequence, dashStep } from './dash';

export type FlowDensity = 0 | 1 | 2;
export type FlowDetail = 'national' | 'regional' | 'local';

export const FLOW_REGIONAL_ZOOM = 6;
export const FLOW_LOCAL_ZOOM = 8;

export function flowDetail(zoom: number): FlowDetail {
  return zoom < FLOW_REGIONAL_ZOOM ? 'national' : zoom < FLOW_LOCAL_ZOOM ? 'regional' : 'local';
}

/** Les petits flux restent tracés mais leurs marques n'apparaissent qu'en vue locale. */
export function motionMinZoom(density: FlowDensity): number {
  return density === 0 ? FLOW_LOCAL_ZOOM : FLOW_REGIONAL_ZOOM;
}

/** Trois densités plafonnées ; même déplacement (0,25 unité par pas) et même largeur pour une vitesse constante. */
export const FLOW_MOTION_BANDS = [
  { id: 'od-flows-motion-low', density: 0, gap: 14.5, steps: 64 },
  { id: 'od-flows-motion-medium', density: 1, gap: 6.5, steps: 32 },
  { id: 'od-flows-motion-high', density: 2, gap: 2.5, steps: 16 },
] as const;

export const FLOW_MARK_WIDTH = 1.5;
export const FLOW_DASH_LENGTH = 1.5;
export const FLOW_STEP_MS = 40;

const sequences = FLOW_MOTION_BANDS.map(({ gap, steps }) => dashSequence(FLOW_DASH_LENGTH, gap, steps));

export function flowDensity(vehicles: number, reference: number): FlowDensity {
  const ratio = reference > 0 ? vehicles / reference : 0;
  return ratio < 0.25 ? 0 : ratio < 0.65 ? 1 : 2;
}

export function flowPattern(density: FlowDensity, now: number): number[] {
  const band = FLOW_MOTION_BANDS[density];
  return sequences[density]?.[dashStep(now, FLOW_STEP_MS, band.steps)] ?? [FLOW_DASH_LENGTH, band.gap];
}
