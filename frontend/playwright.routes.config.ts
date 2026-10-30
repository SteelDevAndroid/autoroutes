import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Rendu de production, API de test contrôlée par le navigateur : aucune pile métier requise. */
export default defineConfig({
  ...base,
  testMatch: '**/routes.spec.ts',
  testIgnore: [],
  use: { ...base.use, baseURL: 'http://localhost:4174' },
  webServer: {
    command: 'npm run build && npx vite preview --port 4174 --strictPort',
    url: 'http://localhost:4174',
    timeout: 120_000,
    reuseExistingServer: false,
    env: { VITE_DEMO: 'false', VITE_STATIONS_URL: '/api/v1/referentiel/stations',
      VITE_BASEMAP_URL: '', VITE_MOTORWAYS_URL: '', VITE_GLYPHS_URL: '', VITE_SPRITE_URL: '' },
  },
});
