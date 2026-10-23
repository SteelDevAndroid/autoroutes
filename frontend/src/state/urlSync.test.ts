import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxisGroup } from '../map/axes';
import { useUiStore } from './uiStore';
import { startUrlSync } from './urlSync';

const groups: AxisGroup[] = [
  { id: 'A7', codes: ['A0007'], value: 'A0007', stations: [1, 2] },
  { id: 'A6', codes: ['A0006'], value: 'A0006', stations: [0] },
];

const setup = (url: string) => {
  window.history.replaceState(null, '', url);
  useUiStore.setState(useUiStore.getInitialState(), true);
  const deps = { stationIds: ['G0', 'G1', 'G2'], axisGroups: groups, showStation: vi.fn(), showAxis: vi.fn() };
  return { deps, stop: startUrlSync(deps) };
};

let stop: () => void = () => undefined;
beforeEach(() => { window.history.replaceState(null, '', '/'); });
afterEach(() => { stop(); });

describe('startUrlSync', () => {
  it('reproduces the shared display on load', () => {
    const s = setup('/?gare=G1&axe=A0007&troncons=1&niveau=DEPARTMENT');
    stop = s.stop;

    const ui = useUiStore.getState();
    expect(ui.selectedIndex).toBe(1);
    expect(ui.odFilters).toMatchObject({ axis: 'A0007', level: 'DEPARTMENT' });
    expect(ui.layers).toMatchObject({ od: true, segments: true });
    expect(ui.axisFocus).toMatchObject({ id: 'A7', value: 'A0007' });
    expect(s.deps.showStation).toHaveBeenCalledWith(1);
    expect(s.deps.showAxis).toHaveBeenCalledWith(groups[0]);
  });

  it('cleans an address with invalid parameters', () => {
    const s = setup('/?gare=INCONNUE&n=1#a-propos');
    stop = s.stop;

    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('#a-propos');
    expect(useUiStore.getState().selectedIndex).toBeNull();
  });

  it('writes the address as the display changes, with a history entry for station and axis only', () => {
    const s = setup('/');
    stop = s.stop;
    const length = window.history.length;

    useUiStore.getState().select(2);
    expect(window.location.search).toBe('?gare=G2');
    expect(window.history.length).toBe(length + 1);

    useUiStore.getState().toggleLayer('segments');
    expect(window.location.search).toBe('?gare=G2&troncons=1');
    expect(window.history.length).toBe(length + 1);

    useUiStore.getState().select(null);
    expect(window.location.search).toBe('?troncons=1');
  });

  it('follows the back button', () => {
    const s = setup('/');
    stop = s.stop;
    useUiStore.getState().select(1);

    window.history.replaceState(null, '', '/');
    window.dispatchEvent(new PopStateEvent('popstate'));

    expect(useUiStore.getState().selectedIndex).toBeNull();
    expect(s.deps.showStation).toHaveBeenLastCalledWith(null);
    expect(window.location.search).toBe('');
  });

  it('stops listening when stopped', () => {
    const s = setup('/');
    s.stop();
    stop = () => undefined;

    useUiStore.getState().select(1);

    expect(window.location.search).toBe('');
  });
});
