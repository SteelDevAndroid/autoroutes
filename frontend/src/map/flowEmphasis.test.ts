import { expect, it } from 'vitest';
import { flowEmphasis } from './flowEmphasis';
const flow = { originId: 'A', destinationId: 'B' };
it('garde les flux de contexte et atténue les liaisons secondaires', () => {
  expect(flowEmphasis(flow, null, null, new Set(['B']), true)).toMatchObject({ context: true, dim: false });
  expect(flowEmphasis(flow, null, null, new Set(['C']), true).dim).toBe(true);
});
it('donne la priorité à la gare et au survol, puis restaure le contexte', () => {
  expect(flowEmphasis(flow, null, 'C', new Set(['A']), true).dim).toBe(true);
  expect(flowEmphasis(flow, flow, 'C', new Set(), true)).toMatchObject({ active: true, dim: false });
  expect(flowEmphasis(flow, null, null, new Set(), true)).toEqual({ active: false, context: false, dim: false });
});
it('ne compare pas des départements aux identifiants de gares', () => {
  expect(flowEmphasis(flow, null, 'C', new Set(['C']), false)).toMatchObject({ context: false, dim: false });
});
