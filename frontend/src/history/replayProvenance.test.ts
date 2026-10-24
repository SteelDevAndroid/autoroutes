import { describe, expect, it, vi } from 'vitest';
import { trackReplayProvenance } from './replayProvenance';

describe('provenance de la relecture', () => {
  it('includes the midnight baseline and certifies only the requested historical period', async () => {
    const fetchFn = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ nature: 'SIMULATED' })));
    const onNature = vi.fn();
    const stop = trackReplayProvenance(new Date('2026-10-24T10:00:00Z'), new Date('2026-10-24T11:00:00Z'), onNature, fetchFn);
    expect(onNature).toHaveBeenCalledWith('UNKNOWN');
    const request = fetchFn.mock.calls[0]?.[0];
    if (typeof request !== 'string') throw new Error('Une URL de provenance est attendue');
    expect(request).toContain('from=2026-10-23T22:00:00.000Z');
    expect(request).toContain('to=2026-10-24T11:00:00.000Z');
    await vi.waitFor(() => { expect(onNature).toHaveBeenLastCalledWith('SIMULATED'); });
    stop();
  });

  it('ignores an old response after returning live or replacing the replay', async () => {
    let resolveOld: ((value: Response) => void) | undefined;
    const fetchFn = vi.fn<typeof fetch>().mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ nature: 'SIMULATED' })));
    const onNature = vi.fn();
    const from = new Date('2026-10-24T10:00:00Z');
    const to = new Date('2026-10-24T11:00:00Z');
    const stopOld = trackReplayProvenance(from, to, onNature, fetchFn);
    stopOld();
    const stopNew = trackReplayProvenance(from, to, onNature, fetchFn);
    await vi.waitFor(() => { expect(onNature).toHaveBeenLastCalledWith('SIMULATED'); });
    resolveOld?.(new Response(JSON.stringify({ nature: 'OBSERVED' })));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onNature).not.toHaveBeenCalledWith('OBSERVED');
    stopNew();
  });
});
