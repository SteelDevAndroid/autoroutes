import { expect, test } from './fixtures';

test('les résultats flottants se ferment en quittant la recherche', async ({ page }) => {
  await page.goto('/');
  const search = page.getByLabel('Nom de gare');
  const popover = page.locator('.search-popover');
  await search.fill('A7');
  await expect(popover).toBeVisible();
  await page.locator('.side-heading').click();
  await expect(popover).toBeHidden();
  await search.fill('A7');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.search-result').first()).toBeFocused();
  await expect(popover).toBeVisible();
  await page.getByRole('button', { name: 'Couches et gares', exact: true }).focus();
  await expect(popover).toBeHidden();
  await expect(search).toHaveValue('');
});
