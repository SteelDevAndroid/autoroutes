import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSession } from './auth/session';
import { App } from './App';

vi.mock('./ui/MapView', () => ({ MapView: () => null }));
vi.mock('./auth/session', () => ({ LOGIN_URL: '/login', checkSession: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

describe('démarrage', () => {
  it('offers a fresh attempt after a temporary initial server failure', async () => {
    vi.mocked(checkSession).mockRejectedValueOnce(new Error('Session indisponible (503)'))
      .mockImplementationOnce(() => new Promise(() => { /* requête suivante encore en cours */ }));
    render(<App />);
    expect((await screen.findByRole('alert')).textContent).toContain('Connexion à l’application impossible');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(checkSession).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Chargement du référentiel…')).toBeTruthy();
  });
});
