import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAppearance, useAppearanceStore } from './appearanceStore';

beforeEach(() => {
  localStorage.clear();
  useAppearanceStore.setState({ preference: 'system', scheme: 'light', systemDark: false });
});
afterEach(() => { vi.unstubAllGlobals(); delete document.documentElement.dataset.appearance; });

describe('appearance preference', () => {
  it('resolves the OS preference while respecting an explicit override', () => {
    const state = useAppearanceStore.getState;
    state().setSystemDark(true);
    expect(state().scheme).toBe('dark');
    state().setPreference('light');
    state().setSystemDark(false);
    state().setSystemDark(true);
    expect(state().scheme).toBe('light');
    state().setPreference('system');
    expect(state().scheme).toBe('dark');
  });

  it('keeps a session choice when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('storage disabled'); });
    useAppearanceStore.getState().setPreference('dark');
    expect(useAppearanceStore.getState().scheme).toBe('dark');
    expect(useAppearanceStore.getState().preference).toBe('dark');
  });

  it('applies the resolved scheme before mounting and removes the OS listener on cleanup', () => {
    const query = { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.stubGlobal('matchMedia', vi.fn(() => query));
    const stop = startAppearance();
    expect(useAppearanceStore.getState().scheme).toBe('dark');
    expect(document.documentElement.dataset.appearance).toBe('system');
    const listener = query.addEventListener.mock.calls[0]?.[1] as () => void;
    query.matches = false;
    listener();
    expect(useAppearanceStore.getState().scheme).toBe('light');
    useAppearanceStore.getState().setPreference('dark');
    expect(document.documentElement.dataset.appearance).toBe('dark');
    stop();
    expect(query.removeEventListener).toHaveBeenCalledWith('change', listener);
  });
});
