import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_OD_VIEW } from '../od/odTypes';
import type { StationCollection } from '../map/referentiel';
import { useUiStore } from '../state/uiStore';
import { AnimatedCount } from './AnimatedCount';
import { formatCount } from './format';
import { OdPanel } from './OdPanel';
import { Section } from './Section';
import { newKeys, useNewKeys } from './flash';
import { usePresenceValue } from './usePresenceValue';

const stations: StationCollection = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [4.8, 45.7] }, properties: { id: 'A', name: 'La Boisse', kind: 'ECHANGEUR', axes: 'A0042', dept: '01', lanes: 4 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [5.4, 43.3] }, properties: { id: 'B', name: 'Marseille', kind: 'ECHANGEUR', axes: 'A0007', dept: '13', lanes: 4 } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [4.9, 44.9] }, properties: { id: 'C', name: 'Montélimar', kind: 'ECHANGEUR', axes: 'A0007', dept: '26', lanes: 4 } },
  ],
};

beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('usePresenceValue', () => {
  it('keeps the last value during the exit, then lets go', () => {
    vi.useFakeTimers();
    const initial: { value: string | null } = { value: 'gare A' };
    const { result, rerender } = renderHook(({ value }: { value: string | null }) => usePresenceValue(value, 150), { initialProps: initial });
    expect(result.current).toEqual({ value: 'gare A', leaving: false });

    rerender({ value: null });
    expect(result.current).toEqual({ value: 'gare A', leaving: true });
    act(() => { vi.advanceTimersByTime(149); });
    expect(result.current.leaving).toBe(true);
    act(() => { vi.advanceTimersByTime(2); });
    expect(result.current).toEqual({ value: null, leaving: false });
  });

  it('follows a value that changes, and cancels the exit when the value comes back', () => {
    vi.useFakeTimers();
    const initial: { value: string | null } = { value: 'A' };
    const { result, rerender } = renderHook(({ value }: { value: string | null }) => usePresenceValue(value, 150), { initialProps: initial });

    rerender({ value: 'B' });
    expect(result.current).toEqual({ value: 'B', leaving: false });
    rerender({ value: null });
    act(() => { vi.advanceTimersByTime(100); });
    rerender({ value: 'C' });
    act(() => { vi.advanceTimersByTime(500); });

    expect(result.current).toEqual({ value: 'C', leaving: false });
  });

  it('starts empty without leaving', () => {
    const { result } = renderHook(() => usePresenceValue<string>(null, 150));

    expect(result.current).toEqual({ value: null, leaving: false });
  });
});

describe('AnimatedCount', () => {
  it('shows a first value at once, then slides to the next one and ends on it', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AnimatedCount value={1_000} />);
    expect(container.textContent).toBe(formatCount(1_000));

    rerender(<AnimatedCount value={2_000} />);
    act(() => { vi.advanceTimersByTime(180); });
    const midway = container.querySelector('[aria-hidden="true"]');
    expect(midway).not.toBeNull();
    expect(container.querySelector('.sr-only')?.textContent).toBe(formatCount(2_000));

    act(() => { vi.advanceTimersByTime(600); });
    expect(container.textContent).toBe(formatCount(2_000));
  });

  it('does not count up from zero', () => {
    vi.useFakeTimers();
    const { container, rerender } = render(<AnimatedCount value={0} />);

    rerender(<AnimatedCount value={5_000} />);
    act(() => { vi.advanceTimersByTime(40); });

    expect(container.textContent).toBe(formatCount(5_000));
  });

  it('jumps straight to the value with reduced motion', () => {
    vi.useFakeTimers();
    useUiStore.setState({ reducedMotion: true });
    const { container, rerender } = render(<AnimatedCount value={1_000} />);

    rerender(<AnimatedCount value={2_000} />);
    act(() => { vi.advanceTimersByTime(40); });

    expect(container.textContent).toBe(formatCount(2_000));
  });
});

describe('flash on new items', () => {
  it('flags only keys that were absent from a previous, non-empty list', () => {
    expect(newKeys(null, ['a'])).toEqual(new Set());
    expect(newKeys(new Set(), ['a'])).toEqual(new Set());
    expect(newKeys(new Set(['a']), ['a', 'b'])).toEqual(new Set(['b']));
  });

  it('keeps a key flagged for one update only', () => {
    const { result, rerender } = renderHook(({ keys }: { keys: string[] }) => useNewKeys(keys), { initialProps: { keys: ['a'] } });
    expect([...result.current]).toEqual([]);

    rerender({ keys: ['a', 'b'] });
    expect([...result.current]).toEqual(['b']);
    rerender({ keys: ['a', 'b', 'c'] });
    expect([...result.current]).toEqual(['c']);
  });

  it('flashes a flow that enters the top list, not the ones already there', () => {
    useUiStore.setState({
      openSection: 'od',
      odView: { ...EMPTY_OD_VIEW, flows: [{ originId: 'A', destinationId: 'B', vehicles: 10 }], nodes: [] },
    });
    render(<OdPanel stations={stations} onFocusFlow={vi.fn()} />);
    expect(document.querySelectorAll('.od-row.flash')).toHaveLength(0);

    act(() => {
      useUiStore.setState({ odView: { ...EMPTY_OD_VIEW, flows: [{ originId: 'A', destinationId: 'B', vehicles: 10 }, { originId: 'C', destinationId: 'A', vehicles: 8 }] } });
    });

    const flashing = [...document.querySelectorAll('.od-row.flash')].map((el) => el.textContent);
    expect(flashing).toEqual([expect.stringContaining('Montélimar → La Boisse')]);
  });
});

describe('Section accordion', () => {
  it('keeps the content mounted but folded and out of reach when closed', () => {
    useUiStore.setState({ openSection: 'layers' });
    render(<><Section id="layers" title="Couches"><button type="button">dans couches</button></Section><Section id="od" title="Flux"><button type="button">dans flux</button></Section></>);
    const body = (id: string) => document.getElementById(`section-${id}`) as HTMLElement;

    expect(body('layers').classList.contains('section-open')).toBe(true);
    expect(body('layers').hasAttribute('inert')).toBe(false);
    expect(body('od').classList.contains('section-open')).toBe(false);
    expect(body('od').hasAttribute('inert')).toBe(true);
    expect(screen.getByText('dans flux')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Flux/ }));

    expect(body('od').hasAttribute('inert')).toBe(false);
    expect(body('layers').hasAttribute('inert')).toBe(true);
  });
});
