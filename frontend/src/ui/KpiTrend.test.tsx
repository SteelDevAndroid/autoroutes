import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { KpiTrend } from './KpiTrend';
import { HOUR_MS, MINUTE_MS } from './kpiTrends';

const end = Date.parse('2026-11-05T10:00:00Z');
const points = Array.from({ length: 120 }, (_, i) => ({ t: end - 2 * HOUR_MS + i * MINUTE_MS, value: i < 60 ? 1 : 2 }));
afterEach(cleanup);

it('affiche les trois repères, le pourcentage et les valeurs de la minute survolée', () => {
  render(<button><KpiTrend points={points} reference={end} label="Entrées" recorded expanded historyState="ready" /></button>);
  expect(screen.getByText('−60 min')).toBeTruthy();
  expect(screen.getByText('−30 min')).toBeTruthy();
  expect(screen.getByText('Maintenant')).toBeTruthy();
  expect(screen.getByText('+100 % vs heure précédente')).toBeTruthy();
  const svg = screen.getByRole('img');
  vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 22, width: 100, height: 22, toJSON: () => ({}) });
  fireEvent.pointerMove(svg, { clientX: 50 });
  const tooltip = screen.getByRole('tooltip');
  expect(tooltip.textContent).toContain('10:30:00 (Paris) · 2 /min');
  expect(tooltip.textContent).toContain('Total sur 1 h : 120');
  fireEvent.pointerLeave(svg);
  expect(screen.queryByRole('tooltip')).toBeNull();
});

it('distingue chargement, panne, données manquantes et zéro confirmé', () => {
  const { rerender } = render(<KpiTrend points={[]} label="Entrées" expanded historyState="loading" />);
  expect(screen.getByText('Chargement…')).toBeTruthy();
  rerender(<KpiTrend points={[]} label="Entrées" expanded historyState="error" />);
  expect(screen.getByText('Historique indisponible')).toBeTruthy();
  rerender(<KpiTrend points={[]} label="Entrées" expanded historyState="ready" />);
  expect(screen.getByText('Aucune donnée')).toBeTruthy();
  rerender(<KpiTrend points={points.map((p) => ({ ...p, value: 0 }))} reference={end} label="Entrées" recorded expanded historyState="ready" />);
  expect(screen.getByText('/min · Aucun trafic')).toBeTruthy();
  rerender(<KpiTrend points={points.slice(0, 119)} reference={end} label="Entrées" recorded expanded historyState="ready" />);
  expect(screen.getByText('/min · Historique partiel · 59/60 min')).toBeTruthy();
  expect(screen.queryByText(/vs heure précédente/)).toBeNull();
  rerender(<KpiTrend points={points} reference={end} label="Entrées" recorded expanded historyState="ready" stale />);
  expect(screen.getByText('/min · Données anciennes')).toBeTruthy();
  expect(screen.queryByText(/vs heure précédente/)).toBeNull();
});

it('rend les détails consultables au clavier sans ajouter un bouton dans le compteur', () => {
  render(<button><KpiTrend points={points} reference={end} label="Entrées" recorded expanded historyState="ready" /></button>);
  const button = screen.getByRole('button');
  fireEvent.focus(button);
  expect(screen.getByRole('tooltip').textContent).toContain('10:59:00 (Paris)');
  expect(button.getAttribute('aria-describedby')).toBe(screen.getByRole('tooltip').id);
  fireEvent.keyDown(button, { key: 'ArrowLeft' });
  expect(screen.getByRole('tooltip').textContent).toContain('10:58:00 (Paris)');
  fireEvent.keyDown(button, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
});
