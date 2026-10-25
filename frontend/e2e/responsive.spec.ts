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
    const close = page.getByRole('button', { name: 'Fermer le détail' });
    await expect(close).toBeFocused();
    await close.click();
    await expect(page.getByRole('button', { name: 'Panneau des couches et des filtres' })).toBeFocused();
  });

  test('le tiroir garde le focus et ses préférences restent utilisables au clavier', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Panneau des couches et des filtres' }).click();
    const drawer = page.getByRole('dialog', { name: 'Explorer le réseau' });
    await expect(drawer).toHaveAttribute('aria-modal', 'true');
    await page.getByRole('button', { name: 'Diagnostic', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Fermer le panneau' })).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button', { name: 'Diagnostic', exact: true })).toBeFocused();
    await page.getByText('Préférences d’affichage', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Couleurs adaptées au daltonisme')).toBeFocused();
    const audit = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
    expect(audit.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
  });

  test('les outils mobiles révèlent leur résultat et rendent le focus', async ({ page }) => {
    await page.goto('/');
    const menu = page.getByRole('button', { name: 'Panneau des couches et des filtres' });
    await menu.click();
    await page.getByRole('button', { name: 'Diagnostic', exact: true }).click();
    await expect(page.locator('#side-panel')).toBeHidden();
    await expect(page.getByRole('region', { name: 'Diagnostic du flux' })).toBeVisible();
    const close = page.getByRole('button', { name: 'Fermer le diagnostic' });
    await expect(close).toBeFocused();
    await close.click();
    await expect(menu).toBeFocused();
    await menu.click();
    await page.getByRole('button', { name: 'Vue France entière' }).click();
    await expect(page.locator('#side-panel')).toBeHidden();
    await expect(menu).toBeFocused();
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

test.describe('grille du poste de supervision', () => {
  for (const [width, height] of [[1920, 1080], [1280, 800], [1024, 768], [768, 1024], [390, 844]]) {
    test(`préserve la carte et les outils à ${width} × ${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await expect(page.locator('.map')).toBeVisible();
      expect(await page.evaluate('document.documentElement.scrollWidth - innerWidth')).toBe(0);
      if (width <= 900) await page.getByRole('button', { name: 'Panneau des couches et des filtres' }).click();
      for (const name of ['Vue France entière', 'Diagnostic']) {
        const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(bounds).not.toBeNull();
        expect((bounds?.y ?? height) + (bounds?.height ?? 1)).toBeLessThanOrEqual(height);
      }
      await expect(page.getByRole('button', { name: 'Légende', exact: true })).toBeInViewport();
      await page.getByLabel('Nom de gare').fill('zzzintrouvable');
      await expect(page.getByText('Essayez un nom de gare ou un numéro d’autoroute, par exemple A7.')).toBeVisible();
      await page.getByRole('button', { name: 'Effacer la recherche' }).click();
      await expect(page.getByLabel('Nom de gare')).toBeFocused();
      await expect(page.getByLabel('Nom de gare')).toHaveValue('');
    });
  }
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
