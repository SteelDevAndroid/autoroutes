import { describe, expect, it } from 'vitest';
import { FLOW_DASH_LENGTH, FLOW_MOTION_BANDS, FLOW_STEP_MS, flowDensity, flowPattern, flowDetail, motionMinZoom } from './flowMotion';

describe('volume marks', () => {
  it('keeps the country static, animates substantial regional flows and reveals all densities locally', () => {
    expect([4, 5.99, 6, 7.99, 8, 15].map(flowDetail)).toEqual(['national', 'national', 'regional', 'regional', 'local', 'local']);
    expect([0, 1, 2].map((d) => motionMinZoom(d as 0 | 1 | 2))).toEqual([8, 6, 6]);
  });
  it('increases density at the volume thresholds and caps extreme volumes', () => {
    expect([0, 24, 25, 64, 65, 100, 10_000].map((v) => flowDensity(v, 100))).toEqual([0, 0, 1, 1, 2, 2, 2]);
    expect(flowDensity(0, 0)).toBe(0);
  });

  it('moves every density by the same distance per step, independently of its period', () => {
    for (const { density, gap, steps } of FLOW_MOTION_BANDS) {
      expect(flowPattern(density, FLOW_STEP_MS)).toEqual([0, 0.25, FLOW_DASH_LENGTH, gap - 0.25]);
      expect(flowPattern(density, FLOW_STEP_MS * steps)).toEqual(flowPattern(density, 0));
      for (let k = 0; k < steps; k++) {
        const pattern = flowPattern(density, k * FLOW_STEP_MS);
        expect(pattern.reduce((a, b) => a + b, 0)).toBe(FLOW_DASH_LENGTH + gap);
        expect(pattern.every((v) => v >= 0)).toBe(true);
      }
    }
  });
});
