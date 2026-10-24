import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stationHistory } from '../history/historyApi';
import { HistoryChart } from './HistoryChart';

vi.mock('../history/historyApi', () => ({ stationHistory: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('couverture historique', () => {
  it('distinguishes missing last-week data from recorded zero traffic', async () => {
    vi.mocked(stationHistory)
      .mockResolvedValueOnce({ points: [{ t: 0, entries: 0, exits: 0 }], nature: 'SIMULATED', coverage: { status: 'AVAILABLE' } })
      .mockResolvedValueOnce({ points: [], nature: 'UNKNOWN', coverage: { status: 'UNAVAILABLE' } });
    render(<HistoryChart stationId="A" />);
    expect((await screen.findByRole('img')).getAttribute('aria-label')).toContain('aujourd’hui 0 (simulé)');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('J-7 même heure historique indisponible');
    expect(screen.queryByText(/J-7 même heure 0/)).toBeNull();
    expect(document.querySelector('.series-last-week')).toBeNull();
  });

  it('does not draw an empty legacy response as a zero measurement', async () => {
    vi.mocked(stationHistory).mockResolvedValue({ points: [] });
    render(<HistoryChart stationId="A" />);
    expect((await screen.findByRole('img')).getAttribute('aria-label')).toContain('aujourd’hui historique indisponible');
    expect(document.querySelector('.series-today')).toBeNull();
  });
});
