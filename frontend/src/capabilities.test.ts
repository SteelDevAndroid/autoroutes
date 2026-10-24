import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCapabilities } from './capabilities';

afterEach(() => { vi.unstubAllGlobals(); });
describe('capacités du serveur', () => {
  it('rejects incomplete metadata instead of assuming real observations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ segments: 'READY' }) }));
    await expect(loadCapabilities(new AbortController().signal)).rejects.toThrow('invalide');
  });
  it('accepts disabled cartography independently from a simulated source', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ provenance: 'SIMULATED', segments: 'DISABLED' }) }));
    await expect(loadCapabilities(new AbortController().signal)).resolves.toEqual({ provenance: 'SIMULATED', segments: 'DISABLED' });
  });
});
