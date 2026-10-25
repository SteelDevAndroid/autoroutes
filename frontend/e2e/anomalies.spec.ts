import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

for (const [width, height] of [[1440, 900], [390, 844]]) {
  test(`présente les anomalies de la gare et leur cardinalité à ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('status')).toHaveText('Temps réel');
    if (width <= 900) await page.getByRole('button', { name: 'Panneau des couches et des filtres' }).click();
    await page.getByLabel('Nom de gare').fill('La Boisse');
    await page.getByRole('button', { name: /La Boisse/ }).first().click();
    const incidents = page.getByRole('region', { name: 'Incidents et anomalies', exact: true });
    await expect(incidents.getByText('8 occurrences')).toBeVisible();
    await expect(incidents.getByRole('listitem')).toHaveCount(4);
    await expect(incidents.getByRole('listitem').first()).toContainText('Critique');
    await expect(incidents.getByRole('listitem').first()).toContainText('serveur central de paiement');
    await expect(incidents.getByLabel('4 occurrences')).toBeVisible();
    const results = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
    expect(results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious').map((v) => v.id)).toEqual([]);
    expect(await page.evaluate('document.documentElement.scrollWidth - innerWidth')).toBe(0);
  });
}
