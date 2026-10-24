import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useUiStore } from '../state/uiStore';
import { ProvenanceBanner } from './ProvenanceBanner';
import { DataNature } from './DataNature';

beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });
afterEach(cleanup);

describe('provenance des données', () => {
  it('does not present an unknown source as observed, then follows the server provenance', () => {
    render(<><ProvenanceBanner /><DataNature /></>);
    expect(screen.getByRole('note').textContent).toContain('peuvent inclure une simulation');
    expect(screen.queryByText('observé')).toBeNull();
    act(() => { useUiStore.getState().setCapabilities({ provenance: 'SIMULATED', segments: 'DISABLED' }); });
    expect(screen.getByRole('note').textContent).toContain('DONNÉES SIMULÉES');
    expect(screen.getByText('simulé')).toBeTruthy();
    act(() => { useUiStore.getState().setCapabilities({ provenance: 'MIXED', segments: 'READY' }); });
    expect(screen.getByRole('note').textContent).toContain('Données mixtes');
    expect(screen.getByText('mixte')).toBeTruthy();
  });

  it('never reuses live provenance to certify an older replay', () => {
    useUiStore.setState({ capabilities: { provenance: 'OBSERVED', segments: 'READY' }, mode: 'replay' });
    render(<><ProvenanceBanner /><DataNature /></>);
    expect(screen.getByRole('note').textContent).toContain('historique non vérifiée');
    expect(screen.queryByText('observé')).toBeNull();
    act(() => { useUiStore.getState().setReplayProvenance('SIMULATED'); });
    expect(screen.getByRole('note').textContent).toContain('DONNÉES SIMULÉES');
  });

  it('turns off an active estimate when the server disables it', () => {
    useUiStore.getState().toggleLayer('segments');
    useUiStore.getState().setCapabilities({ provenance: 'SIMULATED', segments: 'DISABLED' });
    expect(useUiStore.getState().layers.segments).toBe(false);
  });
});
