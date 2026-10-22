import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('démonstration (flux simulé)', () => {
  test('affiche la carte, le bandeau simulé et l’activité des gares', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/');

    await expect(page.getByRole('note')).toHaveText(/DONNÉES SIMULÉES/);
    await expect(page.getByRole('status')).toHaveText('Temps réel');
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect(map).toHaveAttribute('data-ready', 'true');
    await expect.poll(async () => Number(await map.getAttribute('data-rendered-stations'))).toBeGreaterThan(600);
    await expect(page.getByText('Gares actives (15 min)').locator('..')).toContainText('/ 667');
    await page.waitForTimeout(3_000);
    await page.screenshot({ path: 'test-results/demo-france.png' });

    expect(errors).toEqual([]);
  });

  test('recherche une gare au clavier et ouvre son détail', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Nom de gare').fill('La Boisse');
    await page.getByRole('button', { name: /La Boisse/ }).first().click();

    const detail = page.getByRole('region', { name: /Détail de la gare La Boisse/ });
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect.poll(async () => Number(await map.getAttribute('data-rendered-stations')), { timeout: 10_000 }).toBeLessThan(100);
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('table')).toContainText('Aujourd’hui');
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: 'test-results/demo-gare.png' });

    // Info-bulle au survol : la gare est au centre de la carte après le cadrage.
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await expect(page.getByRole('tooltip')).toContainText('La Boisse');

    await detail.getByRole('button', { name: 'Fermer le détail' }).click();
    await expect(detail).toBeHidden();
  });

  test('affiche les flux origine → destination à la demande', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Flux origine → destination').check();
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: 'test-results/demo-flux.png' });
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();

    // Légende contextuelle : la ligne des flux n'apparaît qu'avec la couche, et les sections s'ouvrent une à la fois.
    await page.getByRole('button', { name: 'Légende' }).click();
    await expect(page.getByText('Flux O/D observé (≥ 3 véh. sur 1 h)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Flux O\/D/ })).toHaveAttribute('aria-expanded', 'false');
  });

  test('la légende ne décrit que les couches affichées', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Légende' }).click();
    await expect(page.getByText('Gare d’échangeur').last()).toBeVisible();
    await expect(page.getByText('Flux O/D observé')).toHaveCount(0);
    await expect(page.getByText('Charge de tronçon')).toHaveCount(0);
  });

  test('ne présente pas de violation d’accessibilité critique hors carte', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    const results = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
