import { expect, test } from './fixtures';

const scheme = 'getComputedStyle(document.documentElement).colorScheme';

test('le choix d’apparence est mémorisé sans changer les filtres ni la sélection', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Nom de gare').fill('La Boisse');
  await page.locator('.search-result').first().click();
  const selectedUrl = page.url();
  await page.getByText('Préférences d’affichage', { exact: true }).click();
  const appearance = page.getByRole('combobox', { name: 'Apparence', exact: true });
  await appearance.selectOption('dark');
  await expect.poll(() => page.evaluate<string>(scheme)).toBe('dark');
  await expect(page.getByLabel('Activité des gares', { exact: true })).toBeChecked();
  await expect(page.locator('.detail')).toBeVisible();
  expect(page.url()).toBe(selectedUrl);
  await page.reload();
  await expect(page.locator('.detail')).toBeVisible();
  await expect.poll(() => page.evaluate<string>(scheme)).toBe('dark');
  await page.getByText('Préférences d’affichage', { exact: true }).click();
  await expect(appearance).toHaveValue('dark');
  await appearance.selectOption('light');
  await expect.poll(() => page.evaluate<string>(scheme)).toBe('light');
});

test('le mode automatique suit le système et un choix explicite le remplace', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  await page.locator('#side-panel').waitFor({ state: 'visible' });
  await expect.poll(() => page.evaluate<string>(scheme)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(() => page.evaluate<string>(scheme)).toBe('light');
  await page.getByText('Préférences d’affichage', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Apparence', exact: true }).selectOption('dark');
  await expect.poll(() => page.evaluate<string>(scheme)).toBe('dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.getByRole('combobox', { name: 'Apparence', exact: true }).selectOption('light');
  await expect.poll(() => page.evaluate<string>(scheme)).toBe('light');
});
