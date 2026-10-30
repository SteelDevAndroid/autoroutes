import { afterEach, describe, expect, it, vi } from 'vitest';
import { liveOd } from './odApi';
import { DEFAULT_OD_FILTERS } from './odTypes';

afterEach(() => { vi.unstubAllGlobals(); });

describe('live OD road routes', () => {
  it('requests geometry with station flows and preserves its distinct provenance', async () => {
    const route = { nature: 'ESTIMATED', graphVersion: 'g1', algorithm: 'fastest', coordinates: [[4, 45], [5, 46]] };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      level: 'STATION', flows: [{ originId: 'A', destinationId: 'B', vehicles: 5, route }], nodes: [],
      masked: { flows: 0, vehicles: 0 }, totalVehicles: 5, truncated: false, coverage: null,
    })));
    vi.stubGlobal('fetch', fetch);
    const abort = new AbortController();
    const view = await liveOd(DEFAULT_OD_FILTERS, abort.signal);
    expect(fetch).toHaveBeenCalledWith('/api/v1/od?level=STATION&role=ANY&limit=500&includeRoutes=true', { signal: abort.signal });
    expect(view.flows[0]?.route).toEqual(route);
    expect(view.totalVehicles).toBe(5);
  });

  it('keeps department views schematic without requesting station routes', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ level: 'DEPARTMENT', flows: [], nodes: [],
      masked: { flows: 0, vehicles: 0 }, totalVehicles: 0, truncated: false, coverage: null })));
    vi.stubGlobal('fetch', fetch);
    await liveOd({ ...DEFAULT_OD_FILTERS, level: 'DEPARTMENT' });
    expect(fetch).toHaveBeenCalledWith('/api/v1/od?level=DEPARTMENT&role=ANY&limit=500', {});
  });
});
