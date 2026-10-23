import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Régression visuelle de l'interface HTML (panneau, fiches, puces, légende) : la carte WebGL n'est jamais comparée,
 * son rendu logiciel varie d'une machine à l'autre. Les chiffres de la démonstration étant aléatoires, seules les zones stables sont comparées.
 * Références : e2e/visual.spec.ts-snapshots/, produites sous Linux ; les régénérer avec `npm run e2e:visual:update`
 * (ou le workflow CI lancé à la demande avec « update_snapshots ») puis relire les images dans la PR.
 */
test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });

const SHOT = { stylePath: 'e2e/visual.css', animations: 'disabled', caret: 'hide' } as const;

async function ready(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('region', { name: 'Carte des gares de péage' }).waitFor();
  await expect(page.locator('#side-panel')).toBeVisible();
}

test.describe('régression visuelle', () => {
  test('panneau latéral par défaut', async ({ page }) => {
    await ready(page);

    await expect(page.locator('#side-panel')).toHaveScreenshot('panneau-defaut.png', SHOT);
  });

  test('légende avec les flux et les tronçons', async ({ page }) => {
    await ready(page);
    await page.getByLabel('Flux origine → destination').check();
    // Activer une couche ouvre sa section et referme celle des couches : on la rouvre pour la suivante.
    await page.getByRole('button', { name: 'Couches et gares' }).click();
    await page.getByLabel('Charge des tronçons (estimée)').check();
    await page.getByRole('button', { name: 'Légende' }).click();

    await expect(page.getByRole('region', { name: 'Légende' })).toHaveScreenshot('legende-flux-troncons.png', SHOT);
  });

  test('fiche de gare : en-tête', async ({ page }) => {
    await ready(page);
    await page.getByLabel('Nom de gare').fill('La Boisse');
    await page.getByRole('button', { name: /La Boisse/ }).first().click();
    const detail = page.getByRole('region', { name: /Détail de la gare La Boisse/ });
    await expect(detail).toBeVisible();
    // Seul l'en-tête (nom, étiquettes, fermeture) est stable : la hauteur du reste dépend des chiffres simulés.
    await page.mouse.move(0, 0);

    await expect(detail.locator('header')).toHaveScreenshot('fiche-gare-entete.png', SHOT);
  });

  test('puce de retour après la recherche d’une autoroute', async ({ page }) => {
    await ready(page);
    await page.getByLabel('Nom de gare').fill('a7');
    await page.keyboard.press('Enter');
    const chip = page.locator('.axis-focus');
    await expect(chip).toBeVisible();

    await expect(chip).toHaveScreenshot('puce-autoroute.png', SHOT);
  });

  test('résultats de recherche', async ({ page }) => {
    await ready(page);
    await page.getByLabel('Nom de gare').fill('a7');

    await expect(page.getByRole('region', { name: 'Recherche de gare ou d’autoroute' })).toHaveScreenshot('recherche-resultats.png', SHOT);
  });

  test('palette adaptée au daltonisme : panneau et légende', async ({ page }) => {
    await ready(page);
    await page.getByLabel('Couleurs adaptées au daltonisme').check();
    await page.getByRole('button', { name: 'Légende' }).click();

    await expect(page.locator('#side-panel')).toHaveScreenshot('panneau-daltonisme.png', SHOT);
  });

  test('petit écran : tiroir ouvert', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Panneau des couches et des filtres' }).click();

    await expect(page.locator('#side-panel')).toHaveScreenshot('tiroir-petit-ecran.png', SHOT);
  });
});
