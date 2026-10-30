import { describe, expect, it } from 'vitest';
import { trafficMotionState } from './trafficMotion';
import type { Freshness } from '../state/uiStore';

const live = { mode: 'live' as const, connection: 'open' as const, odSource: 'rest' as const, odError: null,
  freshnessConfirmed: true,
  freshness: { status: 'LIVE', watermarkLagSeconds: 1, consumerLag: 0, staleStations: [] } as Freshness };

describe('motion follows confirmed data freshness', () => {
  it('allows confirmed live data and waits for the first freshness message', () => {
    expect(trafficMotionState(live)).toBe('live');
    expect(trafficMotionState({ ...live, freshness: null })).toBe('waiting');
    expect(trafficMotionState({ ...live, freshnessConfirmed: false })).toBe('waiting');
  });

  it('suspends movement throughout outages, catch-up and stale data', () => {
    for (const connection of ['reconnecting', 'closed'] as const) {
      expect(trafficMotionState({ ...live, connection })).toBe('disconnected');
    }
    expect(trafficMotionState({ ...live, connection: 'connecting' })).toBe('waiting');
    expect(trafficMotionState({ ...live, freshness: { ...live.freshness, status: 'CATCHING_UP' } })).toBe('catching-up');
    expect(trafficMotionState({ ...live, freshness: { ...live.freshness, status: 'STALE' } })).toBe('stale');
  });

  it('suspends failed REST refreshes but does not apply live errors to replay or stream data', () => {
    expect(trafficMotionState({ ...live, odError: '503' })).toBe('od-error');
    expect(trafficMotionState({ ...live, odError: '503', odSource: 'stream' })).toBe('live');
    expect(trafficMotionState({ ...live, mode: 'replay', connection: 'closed', freshness: null })).toBe('replay');
  });
});
