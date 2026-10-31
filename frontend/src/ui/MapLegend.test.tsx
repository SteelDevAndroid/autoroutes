import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useUiStore } from '../state/uiStore';
import { useAppearanceStore } from '../state/appearanceStore';
import { cvdTheme, lightCvdTheme } from '../map/theme';
import { MapLegend } from './MapLegend';

beforeEach(() => { useUiStore.setState(useUiStore.getInitialState(), true); });
afterEach(cleanup);

it.each([['light', lightCvdTheme], ['dark', cvdTheme]] as const)('ne décrit que les couches et types visibles, avec la palette de la carte (%s)', (scheme, colors) => {
  useAppearanceStore.getState().setPreference(scheme);
  render(<MapLegend />);
  expect(screen.getByText('Échangeurs')).toBeTruthy();
  expect(screen.queryByText('Tronçons estimés')).toBeNull();
  act(() => {
    useUiStore.getState().toggleKind('ECHANGEUR');
    useUiStore.getState().toggleLayer('segments');
    useUiStore.getState().setPalette('cvd');
  });
  expect(screen.queryByText('Échangeurs')).toBeNull();
  expect(screen.getByText('Tronçons estimés')).toBeTruthy();
  const expected = document.createElement('span');
  expected.style.background = colors.stationPleineVoie;
  expect(screen.getByText('Barrières').querySelector<HTMLElement>('.swatch')?.style.background).toBe(expected.style.background);
});

it('déplie les explications et Échap les referme sans retirer l’axe', () => {
  useUiStore.getState().focusAxis('A7', 'A0007');
  render(<MapLegend />);
  const button = screen.getByRole('button', { name: 'Légende de la carte' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(button);
  expect(button.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/Leur vitesse est illustrative/)).toBeTruthy();
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(button);
  expect(useUiStore.getState().odFilters.axis).toBe('A0007');
});

it('laisse la priorité à une fiche ou au diagnostic et revient à leur fermeture', () => {
  render(<MapLegend />);
  act(() => { useUiStore.getState().select(0); });
  expect(screen.queryByRole('region', { name: 'Légende de la carte' })).toBeNull();
  act(() => { useUiStore.getState().select(null); });
  expect(screen.getByRole('region', { name: 'Légende de la carte' })).toBeTruthy();
  act(() => { useUiStore.getState().toggleDiagnostic(); });
  expect(screen.queryByRole('region', { name: 'Légende de la carte' })).toBeNull();
});
