import { expect, test } from './fixtures';

test('les filtres sur la carte se retirent ensemble', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Barrières pleine voie', { exact: false }).uncheck();
  const filters = page.getByRole('region', { name: 'Filtres et vue actifs' });
  await expect(filters).toBeVisible();
  await filters.getByRole('button', { name: 'Réinitialiser les filtres actifs' }).click();
  await expect(filters).toBeHidden();
});

test('la fiche mobile se règle et cède la place aux filtres', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  await page.getByLabel('Nom de gare').fill('La Boisse');
  await page.locator('.search-result').first().click();
  const detail = page.locator('.detail');
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Agrandir la fiche' }).click();
  await expect(detail).toHaveClass(/detail-expanded/);
  await detail.getByRole('button', { name: 'Réduire la fiche' }).click();
  await expect(detail).not.toHaveClass(/detail-expanded/);
  await page.getByRole('button', { name: 'Couches et filtres', exact: true }).click();
  await expect(detail).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Explorer le réseau' })).toBeVisible();
});
