import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test.describe('petit écran : le panneau latéral est un tiroir', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('fermé par défaut, ouvert par le bouton, refermé par Échap ou le fond', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('#side-panel');
    const toggle = page.getByRole('button', { name: 'Panneau des couches et des filtres' });
    await expect(page.getByRole('status')).toBeVisible();
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await toggle.click();
    await expect(panel).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Nom de gare')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toBeFocused();

    await toggle.click();
    await expect(panel).toBeVisible();
    await page.mouse.click(380, 400);
    await expect(panel).toBeHidden();
  });

  test('choisir une gare ferme le tiroir et montre son détail', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Panneau des couches et des filtres' }).click();
    await page.getByLabel('Nom de gare').fill('La Boisse');
    await page.getByRole('button', { name: /La Boisse/ }).first().click();

    await expect(page.locator('#side-panel')).toBeHidden();
    await expect(page.getByRole('region', { name: /Détail de la gare La Boisse/ })).toBeVisible();
  });

  test('la page ne défile pas horizontalement et reste accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    const overflow = await page.evaluate<number>('document.documentElement.scrollWidth - document.documentElement.clientWidth');
    expect(overflow).toBeLessThanOrEqual(0);

    const results = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

test.describe('grand écran', () => {
  test('le bouton du tiroir est absent et le panneau toujours visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#side-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Panneau des couches et des filtres' })).toBeHidden();
  });
});

test.describe('barre supérieure compacte', () => {
  for (const width of [390, 614, 768]) {
    test(`conserve un titre lisible et des indicateurs séparés à ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      const title = page.getByRole('heading', { name: 'Supervision des gares de péage', exact: true });
      await expect(title).toBeVisible();
      const titleBox = await title.boundingBox();
      const metricsBox = await page.locator('.topbar-metrics').boundingBox();
      expect(titleBox).not.toBeNull();
      expect(metricsBox).not.toBeNull();
      if (titleBox === null || metricsBox === null) throw new Error('Barre supérieure absente');
      expect(titleBox.height).toBeLessThanOrEqual(40);
      expect(metricsBox.y).toBeGreaterThanOrEqual(titleBox.y + titleBox.height);
      expect(await page.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')).toBeLessThanOrEqual(0);
    });
  }
});
