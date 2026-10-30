import { beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from './uiStore';

describe('freshness confirmation after reconnect', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('retains the last freshness and timestamp but requires a new confirmation after an outage', () => {
    const state = useUiStore.getState();
    const freshness = { status: 'LIVE' as const, watermarkLagSeconds: 1, consumerLag: 0, staleStations: [] };
    state.setConnection('open');
    state.setFreshness(freshness);
    state.setWatermark('2026-10-30T15:00:00Z');
    expect(useUiStore.getState().freshnessConfirmed).toBe(true);
    state.setConnection('reconnecting');
    expect(useUiStore.getState().freshnessConfirmed).toBe(false);
    expect(useUiStore.getState().freshness).toBe(freshness);
    expect(useUiStore.getState().watermark).toBe('2026-10-30T15:00:00Z');
    state.setConnection('open');
    expect(useUiStore.getState().freshnessConfirmed).toBe(false);
    state.setFreshness(freshness);
    expect(useUiStore.getState().freshnessConfirmed).toBe(true);
  });
});

describe('stable segment colour scale', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('keeps the first positive reference when other segments change or disappear', () => {
    const estimate = (vehicles: number[]) => ({ graphVersion: 'v1', algorithm: 'shortest',
      loads: vehicles.map((count, i) => ({ segmentId: String(i), vehicles: count })) });
    useUiStore.getState().setSegments(estimate([0]));
    expect(useUiStore.getState().segmentReference).toBeNull();
    useUiStore.getState().setSegments(estimate([100, 100]));
    expect(useUiStore.getState().segmentReference).toBe(100);
    useUiStore.getState().setSegments(estimate([100, 1000]));
    expect(useUiStore.getState().segmentReference).toBe(100);
    useUiStore.getState().setSegments(estimate([]));
    expect(useUiStore.getState().segmentReference).toBe(100);
  });

  it('recalibrates when the graph or estimation algorithm changes', () => {
    const estimate = { graphVersion: 'v1', algorithm: 'shortest', loads: [{ segmentId: 'a', vehicles: 100 }] };
    useUiStore.getState().setSegments(estimate);
    useUiStore.getState().setSegments({ ...estimate, graphVersion: 'v2', loads: [{ segmentId: 'a', vehicles: 200 }] });
    expect(useUiStore.getState().segmentReference).toBe(200);
    useUiStore.getState().setSegments({ ...estimate, graphVersion: 'v2', algorithm: 'other', loads: [{ segmentId: 'a', vehicles: 300 }] });
    expect(useUiStore.getState().segmentReference).toBe(300);
  });
});

describe('uiStore sections', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('starts with the layers section open', () => {
    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('opens the settings of a layer when it is switched on, and keeps the section when it is switched off', () => {
    useUiStore.getState().toggleLayer('od');
    expect(useUiStore.getState().openSection).toBe('od');
    useUiStore.getState().toggleLayer('segments');
    expect(useUiStore.getState().openSection).toBe('segments');

    useUiStore.getState().toggleLayer('segments');

    expect(useUiStore.getState().layers.segments).toBe(false);
    expect(useUiStore.getState().openSection).toBe('segments');
  });

  it('does not steal the focus for layers without a section of their own', () => {
    useUiStore.getState().toggleLayer('labels');

    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('hides internal flows until asked', () => {
    expect(useUiStore.getState().odIncludeInternal).toBe(false);
  });
});

describe('uiStore axis selection', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('applies the axis filter on click, and shows the flows it filters', () => {
    useUiStore.getState().chooseAxis('A0007,A0007N');

    const state = useUiStore.getState();
    expect(state.odFilters.axis).toBe('A0007,A0007N');
    expect(state.layers.od).toBe(true);
    expect(state.openSection).toBe('od');
  });

  it('removes the filter on a second click and leaves the layers alone', () => {
    useUiStore.getState().chooseAxis('A0007');
    useUiStore.getState().setOpenSection('layers');

    useUiStore.getState().chooseAxis('A0007');

    expect(useUiStore.getState().odFilters.axis).toBe('');
    expect(useUiStore.getState().openSection).toBe('layers');
  });

  it('switches directly from one axis to another and keeps the other filters', () => {
    useUiStore.getState().setOdFilters({ department: '69' });
    useUiStore.getState().chooseAxis('A0007');
    useUiStore.getState().chooseAxis('A0006');

    expect(useUiStore.getState().odFilters).toMatchObject({ axis: 'A0006', department: '69' });
  });

  it('shows the motorway names by default', () => {
    expect(useUiStore.getState().layers.axes).toBe(true);
  });
});

describe('uiStore axis focus (search)', () => {
  beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });

  it('sets the axis filter, shows the flows, and gives everything back on clear', () => {
    useUiStore.getState().focusAxis('A7', 'A0007,A0007N');

    expect(useUiStore.getState().odFilters.axis).toBe('A0007,A0007N');
    expect(useUiStore.getState().layers.od).toBe(true);
    expect(useUiStore.getState().axisFocus).toEqual({ id: 'A7', value: 'A0007,A0007N', odWasOn: false });

    useUiStore.getState().clearAxisFocus();

    expect(useUiStore.getState().odFilters.axis).toBe('');
    expect(useUiStore.getState().layers.od).toBe(false);
    expect(useUiStore.getState().axisFocus).toBeNull();
  });

  it('keeps the flows on when they were already displayed before the search', () => {
    useUiStore.getState().toggleLayer('od');

    useUiStore.getState().focusAxis('A7', 'A0007');
    useUiStore.getState().clearAxisFocus();

    expect(useUiStore.getState().layers.od).toBe(true);
    expect(useUiStore.getState().odFilters.axis).toBe('');
  });

  it('remembers the original state across a second search', () => {
    useUiStore.getState().focusAxis('A7', 'A0007');
    useUiStore.getState().focusAxis('A6', 'A0006');
    expect(useUiStore.getState().odFilters.axis).toBe('A0006');

    useUiStore.getState().clearAxisFocus();

    expect(useUiStore.getState().layers.od).toBe(false);
    expect(useUiStore.getState().odFilters.axis).toBe('');
  });

  it('searching the same motorway again does not remove its filter', () => {
    useUiStore.getState().focusAxis('A7', 'A0007');
    useUiStore.getState().focusAxis('A7', 'A0007');

    expect(useUiStore.getState().odFilters.axis).toBe('A0007');
  });

  it('does not touch a filter the user changed by hand since the search', () => {
    useUiStore.getState().focusAxis('A7', 'A0007');
    useUiStore.getState().setOdFilters({ axis: 'A0006' });

    useUiStore.getState().clearAxisFocus();

    expect(useUiStore.getState().odFilters.axis).toBe('A0006');
    expect(useUiStore.getState().layers.od).toBe(true);
    expect(useUiStore.getState().axisFocus).toBeNull();
  });
});
