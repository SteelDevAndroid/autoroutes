import { describe, expect, it } from 'vitest';
import { dashSequence, dashStep } from './dash';
import { FLIGHT_MAX_MS, FLIGHT_MIN_MS, distanceKm, flightDurationMs } from './flight';
import { LoadTween } from './loadTween';
import { Presence } from './presence';
import { shouldAnimateCount, tweenValue } from './tween';

describe('dashSequence', () => {
  it('starts with the base pattern and keeps the same length at every step', () => {
    const sequence = dashSequence(1.5, 2.5, 16);

    expect(sequence).toHaveLength(16);
    expect(sequence[0]).toEqual([1.5, 2.5]);
    for (const pattern of sequence) {
      expect(pattern.reduce((a, b) => a + b, 0)).toBeCloseTo(4, 10);
      expect(pattern.length % 2).toBe(0);
      expect(pattern.every((v) => v >= 0)).toBe(true);
    }
  });

  it('moves the dash downstream: a leading gap first, then the dash is split across the period', () => {
    const sequence = dashSequence(1, 3, 8);

    expect(sequence[1]).toEqual([0, 0.5, 1, 2.5]);
    expect(sequence[7]).toEqual([0.5, 3, 0.5, 0]);
  });

  it('cycles through the sequence', () => {
    expect(dashStep(0, 80, 16)).toBe(0);
    expect(dashStep(81, 80, 16)).toBe(1);
    expect(dashStep(80 * 16, 80, 16)).toBe(0);
  });
});

describe('flight duration', () => {
  it('measures distances on the sphere', () => {
    expect(distanceKm([2.35, 48.85], [2.35, 48.85])).toBe(0);
    expect(distanceKm([2.35, 48.85], [4.83, 45.76])).toBeGreaterThan(385);
    expect(distanceKm([2.35, 48.85], [4.83, 45.76])).toBeLessThan(400);
  });

  it('is short for a neighbour, longer for a far target, capped, and instantaneous with reduced motion', () => {
    expect(flightDurationMs(0, false)).toBe(FLIGHT_MIN_MS);
    expect(flightDurationMs(5, false)).toBeLessThan(flightDurationMs(500, false));
    expect(flightDurationMs(500, false)).toBeLessThan(FLIGHT_MAX_MS);
    expect(flightDurationMs(1_000_000, false)).toBe(FLIGHT_MAX_MS);
    expect(flightDurationMs(500, true)).toBe(0);
  });
});

describe('tween', () => {
  it('goes from the start to the end with deceleration', () => {
    expect(tweenValue(10, 20, 0)).toBe(10);
    expect(tweenValue(10, 20, 1)).toBe(20);
    expect(tweenValue(10, 20, 0.5)).toBeGreaterThan(15);
  });

  it('only counts between two shown values, never up from zero', () => {
    expect(shouldAnimateCount(0, 500)).toBe(false);
    expect(shouldAnimateCount(100, 100)).toBe(false);
    expect(shouldAnimateCount(100, 130)).toBe(true);
    expect(shouldAnimateCount(Number.NaN, 5)).toBe(false);
  });
});

describe('Presence', () => {
  it('fades new keys in and removes leaving ones once faded out', () => {
    const presence = new Presence(300);
    presence.update(['a', 'b'], 0);
    expect(presence.alpha('a', 0)).toBe(0);
    expect(presence.alpha('a', 150)).toBeGreaterThan(0.5);

    const midway = presence.tick(150);
    expect(midway.active).toBe(true);
    expect([...midway.changed.keys()]).toEqual(['a', 'b']);

    expect(presence.tick(300).active).toBe(false);
    expect(presence.alpha('a', 400)).toBe(1);

    presence.update(['a'], 1_000);
    expect(presence.leaving()).toEqual(['b']);
    expect(presence.alpha('b', 1_000)).toBe(1);
    expect(presence.tick(1_150).removed).toEqual([]);
    expect(presence.tick(1_300)).toMatchObject({ removed: ['b'], active: false });
    expect(presence.leaving()).toEqual([]);
  });

  it('restarts from the current opacity when a key comes back while it disappears', () => {
    const presence = new Presence(300);
    presence.update(['a'], 0);
    presence.tick(300);
    presence.update([], 1_000);
    const fading = presence.alpha('a', 1_150);
    expect(fading).toBeLessThan(0.5);

    presence.update(['a'], 1_150);

    expect(presence.alpha('a', 1_150)).toBeCloseTo(fading, 10);
    expect(presence.leaving()).toEqual([]);
    presence.tick(1_450);
    expect(presence.alpha('a', 1_450)).toBe(1);
  });

  it('is immediate with a zero duration', () => {
    const presence = new Presence(0);
    presence.update(['a'], 0);
    expect(presence.alpha('a', 0)).toBe(1);
    expect(presence.active).toBe(false);

    presence.update([], 10);
    expect(presence.leaving()).toEqual([]);
    expect(presence.alpha('a', 10)).toBe(0);
    expect(presence.tick(10)).toMatchObject({ removed: [], active: false });

    presence.setDuration(300);
    presence.update(['b'], 20);
    expect(presence.alpha('b', 20)).toBe(0);
  });
});

describe('LoadTween', () => {
  it('raises new segments from zero and finishes on the target', () => {
    const tween = new LoadTween(400);
    tween.retarget([['s1', 1], ['s2', 0.5]], [], 0);

    const middle = tween.step(100);
    expect(middle.active).toBe(true);
    expect(middle.set[0]?.[1]).toBeGreaterThan(0);
    expect(middle.set[0]?.[1]).toBeLessThan(1);

    const end = tween.step(400);
    expect(end).toMatchObject({ set: [['s1', 1], ['s2', 0.5]], clear: [], active: false });
    expect(tween.value('s1')).toBe(1);
  });

  it('brings disappearing segments down to zero before clearing them', () => {
    const tween = new LoadTween(400);
    tween.retarget([['s1', 1]], [], 0);
    tween.step(400);

    tween.retarget([], ['s1'], 1_000);
    expect(tween.step(1_100).set[0]?.[1]).toBeLessThan(1);
    expect(tween.step(1_400)).toMatchObject({ set: [], clear: ['s1'], active: false });
    expect(tween.value('s1')).toBe(0);
  });

  it('retargets from the displayed value, without a jump', () => {
    const tween = new LoadTween(400);
    tween.retarget([['s1', 1]], [], 0);
    tween.step(100);
    const shown = tween.value('s1');

    tween.retarget([['s1', 0.2]], [], 100);

    expect(tween.step(100).set[0]?.[1]).toBeCloseTo(shown, 2);
  });

  it('applies targets at once with a zero duration', () => {
    const tween = new LoadTween(0);
    tween.retarget([['s1', 0.7]], ['s2'], 0);

    expect(tween.step(0)).toMatchObject({ set: [['s1', 0.7]], clear: ['s2'], active: false });
  });
});
