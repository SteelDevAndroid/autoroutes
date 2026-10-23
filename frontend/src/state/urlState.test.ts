import { describe, expect, it } from 'vitest';
import { EMPTY_URL_STATE, parseUrlState, serializeUrlState } from './urlState';

const known = new Set(['G1', 'G2']);

describe('parseUrlState', () => {
  it('reads every shared setting', () => {
    expect(parseUrlState('?gare=G2&axe=a0007,a0007n&troncons=1&niveau=department&dept=2a&role=origin', known)).toEqual({
      stationId: 'G2', axis: 'A0007,A0007N', od: true, segments: true, level: 'DEPARTMENT', department: '2A', role: 'ORIGIN',
    });
  });

  it('returns the default display for an empty address', () => {
    expect(parseUrlState('', known)).toEqual(EMPTY_URL_STATE);
  });

  it('ignores unknown stations, malformed or hostile values instead of failing', () => {
    expect(parseUrlState('?gare=ZZ&axe=A7;DROP TABLE&niveau=x&role=y&dept=9999&troncons=oui&flux=2', known)).toEqual(EMPTY_URL_STATE);
    expect(parseUrlState('?axe=' + 'A1,'.repeat(40) + 'A2', known).axis).toBe('');
  });

  it('shows the flows when an axis is filtered, or when asked', () => {
    expect(parseUrlState('?axe=A0007', known).od).toBe(true);
    expect(parseUrlState('?flux=1', known).od).toBe(true);
    expect(parseUrlState('?flux=0', known).od).toBe(false);
  });
});

describe('serializeUrlState', () => {
  it('writes nothing for the default display', () => {
    expect(serializeUrlState(EMPTY_URL_STATE)).toBe('');
  });

  it('writes only what differs, in a fixed order, without repeating the flows an axis implies', () => {
    expect(serializeUrlState({ stationId: 'G1', axis: 'A0007', od: true, segments: true, level: 'STATION', department: '', role: 'DESTINATION' }))
      .toBe('gare=G1&axe=A0007&troncons=1&role=DESTINATION');
    expect(serializeUrlState({ ...EMPTY_URL_STATE, od: true })).toBe('flux=1');
  });

  it('round-trips', () => {
    const state = { stationId: 'G2', axis: 'A0007,A0007N', od: true, segments: false, level: 'DEPARTMENT' as const, department: '13', role: 'ORIGIN' as const };

    expect(parseUrlState(serializeUrlState(state), known)).toEqual(state);
  });
});
