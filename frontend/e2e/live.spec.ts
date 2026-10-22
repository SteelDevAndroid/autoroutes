import { expect, test } from '@playwright/test';

/**
 * Bout en bout réel : simulateur → Kafka → backend → SSE → navigateur.
 * Exécuté seulement avec E2E_LIVE=1 contre un frontend de production relié au backend (compose --profile full).
 */
test.describe('flux réel (backend + simulateur)', () => {
  test.skip(process.env.E2E_LIVE !== '1', 'E2E_LIVE=1 requis');

  test('affiche les données du backend sans bandeau de simulation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');

    await expect(page.getByText(/DONNÉES SIMULÉES/)).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect.poll(async () => Number(await map.getAttribute('data-rendered-stations'))).toBeGreaterThan(600);
    await expect.poll(async () => Number((await page.getByText('Entrées 1 h').locator('..').innerText()).replace(/\D/g, '')))
      .toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/live-france.png' });
    expect(errors).toEqual([]);
  });

  test('latence de bout en bout ≤ 3 s au 95e centile', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Temps réel', { timeout: 20_000 });
    const samples: number[] = [];
    for (let i = 0; i < 30; i++) {
      await page.waitForTimeout(500);
      const shown = (await page.getByText('Données à').locator('..').innerText()).match(/(\d{2}):(\d{2}):(\d{2})/);
      if (shown !== null) {
        const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
        const displayed = new Date(now);
        displayed.setHours(Number(shown[1]), Number(shown[2]), Number(shown[3]), 0);
        samples.push((now.getTime() - displayed.getTime()) / 1_000);
      }
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? Number.POSITIVE_INFINITY;
    console.log(`latence (now − watermark affiché) : p50=${samples[Math.floor(samples.length / 2)]} s, p95=${p95} s`);
    expect(p95).toBeLessThanOrEqual(3);
  });
});
