import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures';

test.describe('démonstration (flux simulé)', () => {
  test('la légende compacte se déplie au clavier et reste utilisable sur téléphone', async ({ page }) => {
    await page.goto('/');
    const legend = page.getByRole('region', { name: 'Légende de la carte', exact: true });
    const toggle = legend.getByRole('button', { name: 'Légende de la carte' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(legend.getByText('Échangeurs', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/legende-compacte.png' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(legend.getByText('Gare d’échangeur', { exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(toggle).toBeInViewport();
    await toggle.click();
    await expect(legend.getByText('Gare d’échangeur', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'test-results/legende-mobile.png' });
    await page.keyboard.press('Tab');
    await expect(legend.locator('.map-legend-content')).toBeFocused();
  });

  test('les indicateurs ouvrent une liste et sa puce rétablit le classement habituel', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /^Entrées 1 h/ }).click();
    const list = page.getByRole('list', { name: 'Entrées sur 1 h' });
    await expect(list).toBeVisible();
    await expect(list.getByRole('button').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^Entrées sur 1 h/ })).toBeFocused();
    await page.screenshot({ path: 'test-results/indicateur-entrees.png' });
    await page.getByRole('button', { name: 'Retirer : Liste · Entrées sur 1 h' }).click();
    await expect(page.getByRole('list', { name: 'Gares les plus actives' })).toBeVisible();
    await expect(page.getByLabel('Nom de gare')).toBeFocused();
  });

  test('sur téléphone les anomalies ouvrent le tiroir et une puce retire seulement le type masqué', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: /^Anomalies en cours/ }).click();
    await expect(page.getByRole('dialog', { name: 'Explorer le réseau' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Gares avec anomalies' })).toBeVisible();
    await page.getByRole('button', { name: 'Couches et gares', exact: true }).click();
    await page.getByLabel('Gares d’échangeur', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Retirer : Carte · échangeurs masqués' }).click();
    await expect(page.getByLabel('Gares d’échangeur', { exact: true })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Retirer : Liste · Gares avec anomalies' })).toBeVisible();
  });

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
    await expect(detail.getByRole('region', { name: 'Chiffres clés de la gare' })).toBeVisible();
    await page.screenshot({ path: 'test-results/fiche-synthese.png' });
    await detail.getByText('Détail par période', { exact: true }).click();
    await expect(detail.getByRole('table')).toContainText('Aujourd’hui');
    await page.waitForTimeout(2_500);
    await page.screenshot({ path: 'test-results/demo-gare.png' });

    // Info-bulle au survol : la gare est au centre de la carte après le cadrage.
    const box = await map.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
    await expect(page.getByRole('tooltip')).toContainText('La Boisse');
    await expect(page.getByRole('tooltip')).toContainText('Passages · 1 h');
    await expect(map).not.toHaveAttribute('data-selected-station', '');

    await detail.getByRole('button', { name: 'Effacer la sélection' }).click();
    await expect(detail).toBeHidden();
    await expect(map).toHaveAttribute('data-selected-station', '');
  });

  test('« / » met le focus sur la recherche, qui trouve une autoroute et cadre ses gares', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('region', { name: 'Carte des gares de péage' }).waitFor();

    await page.keyboard.press('/');
    await expect(page.getByRole('searchbox')).toBeFocused();
    await page.keyboard.type('a7');
    await expect(page.getByRole('list', { name: 'Résultats de la recherche' }).getByRole('button').first()).toContainText('A7');
    await page.keyboard.press('Enter');

    // Choisir une autoroute active la couche des flux et ouvre sa section (le filtre « Axe » n'existe pas en démonstration).
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();
    await expect(page.getByRole('button', { name: /Flux O\/D/ })).toHaveAttribute('aria-expanded', 'true');
    const summary = page.getByRole('group', { name: 'Résumé de l’axe' });
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Résumé · A7');
    await expect(summary).toContainText('Activité reçue');
    await page.screenshot({ path: 'test-results/resume-autoroute.png' });
    await summary.locator(':scope > summary').click();
    await expect(summary.locator('.summary-grid')).toBeHidden();
    const mapLegend = page.getByRole('button', { name: 'Légende de la carte', exact: true });
    await mapLegend.click();
    await page.keyboard.press('Escape');
    await expect(mapLegend).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('region', { name: 'Carte des gares de péage' })).toHaveAttribute('data-active-axis', /A0007/);

    // Retour à l'affichage d'avant : la puce et Échap défont la recherche (flux éteints, carte recadrée sur la France).
    const back = page.getByRole('button', { name: /Revenir à la vue d’ensemble/ });
    await expect(back).toBeVisible();
    await back.click();
    await expect(summary).toHaveCount(0);
    await expect(back).toBeHidden();
    await expect(page.getByLabel('Flux origine → destination')).not.toBeChecked();

    await page.keyboard.press('/');
    await page.keyboard.type('a7');
    await page.keyboard.press('Enter');
    await expect(back).toBeVisible();
    await page.locator('body').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Escape');
    await expect(back).toBeHidden();
    await expect(page.getByLabel('Flux origine → destination')).not.toBeChecked();
  });

  test('la section « Gares les plus actives » classe les gares et ouvre leur détail', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Gares les plus actives' }).click();
    const list = page.getByRole('list', { name: 'Gares les plus actives' });
    await expect(list.getByRole('listitem').first()).toBeVisible({ timeout: 20_000 });
    const name = (await list.getByRole('listitem').first().locator('.activity-name').textContent()) ?? '';

    // The live ranking can reorder between reading the name and clicking.
    await list.getByRole('button').filter({ has: page.getByText(name, { exact: true }) }).first().click();

    await expect(page.getByRole('region', { name: `Détail de la gare ${name}`, exact: true })).toBeVisible();
  });

  test('le lien reflète la gare et l’autoroute, et les rouvrir reproduit l’affichage', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Nom de gare').fill('La Boisse');
    await page.getByRole('button', { name: /La Boisse/ }).first().click();
    await expect(page.getByRole('region', { name: /Détail de la gare La Boisse/ })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('gare')).not.toBeNull();
    const shared = page.url();

    // Un nouvel onglet ouvert sur ce lien montre la même gare.
    const other = await page.context().newPage();
    await other.goto(shared);
    await expect(other.getByRole('region', { name: /Détail de la gare La Boisse/ })).toBeVisible();
    await other.close();

    // « Précédent » revient à l'état d'avant : plus de gare ouverte.
    await page.goBack();
    await expect(page.getByRole('region', { name: /Détail de la gare/ })).toBeHidden();
    expect(new URL(page.url()).searchParams.has('gare')).toBe(false);
  });

  test('une autoroute dans le lien filtre les flux et montre le retour à la vue d’ensemble', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Nom de gare').fill('a7');
    await page.keyboard.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('axe')).toMatch(/A0007/);
    const shared = page.url();

    const other = await page.context().newPage();
    await other.goto(shared);

    await expect(other.getByLabel('Flux origine → destination')).toBeChecked();
    await expect(other.getByRole('button', { name: /Revenir à la vue d’ensemble/ })).toBeVisible();
    await other.close();
  });

  test('les couleurs adaptées au daltonisme se règlent, s’appliquent et se retrouvent au rechargement', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Préférences d’affichage', { exact: true }).click();
    await page.getByLabel('Couleurs adaptées au daltonisme').check();
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'cvd');

    await page.reload();

    await expect(page.locator('html')).toHaveAttribute('data-palette', 'cvd');
    await page.getByText('Préférences d’affichage', { exact: true }).click();
    await expect(page.getByLabel('Couleurs adaptées au daltonisme')).toBeChecked();
  });

  test('seuls les flux de l’axe sélectionné sont animés, sauf avec « Réduire les animations »', async ({ page }) => {
    // Trafic reproductible : l'axe A7 doit avoir des flux à chaque exécution.
    await page.addInitScript({ content: 'let trafficSeed = 1234; Math.random = () => ((trafficSeed = (1664525 * trafficSeed + 1013904223) >>> 0) / 4294967296);' });
    const errors: string[] = [];
    page.on('pageerror', (error) => { errors.push(error.message); });
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await map.waitFor();
    await expect(map).toHaveAttribute('data-flow-motion', 'off');

    await page.getByLabel('Flux origine → destination').check();
    await expect(map).toHaveAttribute('data-flow-motion', 'off');
    await page.getByLabel('Nom de gare').fill('a7');
    await page.keyboard.press('Enter');
    await expect(map).toHaveAttribute('data-flow-motion', 'on', { timeout: 30_000 });
    await expect.poll(async () => Number(await map.getAttribute('data-animated-flows'))).toBeGreaterThan(0);
    await page.screenshot({ path: 'test-results/traffic-animation-selected.png' });

    await page.getByRole('button', { name: 'Couches et gares' }).click();
    await page.getByText('Préférences d’affichage', { exact: true }).click();
    await page.getByLabel('Réduire les animations').check();
    await expect(map).toHaveAttribute('data-flow-motion', 'off');
    await expect(page.locator('html')).toHaveAttribute('data-reduced-motion', 'true');

    await page.getByLabel('Réduire les animations').uncheck();
    await expect(map).toHaveAttribute('data-flow-motion', 'on');

    await page.getByRole('button', { name: /Revenir à la vue d’ensemble/ }).click();
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();
    await expect(map).toHaveAttribute('data-flow-motion', 'off');
    expect(errors).toEqual([]);
  });

  test('les sections du panneau se replient et se déplient, sans rester atteignables au clavier une fois fermées', async ({ page }) => {
    await page.goto('/');
    const layers = page.getByRole('button', { name: 'Couches et gares' });
    await expect(layers).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByLabel('Gares d’échangeur', { exact: false }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Légende', exact: true }).click();

    await expect(layers).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Noms des gares')).toBeHidden();
    await expect(page.getByText('Gare d’échangeur').last()).toBeVisible();
  });

  test('la fiche, la puce et leur fermeture passent par une transition courte', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Nom de gare').fill('La Boisse');
    await page.getByRole('button', { name: /La Boisse/ }).first().click();
    const detail = page.getByRole('region', { name: /Détail de la gare La Boisse/ });
    await expect(detail).toBeVisible();

    // Observer l'état bref avant le clic : un aller-retour navigateur peut dépasser les 150 ms de sortie.
    await page.evaluate(`(() => {
      const element = document.querySelector('.detail');
      const observer = new MutationObserver(() => {
        if (element.classList.contains('leaving')) {
          document.body.dataset.detailLeavingObserved = 'true';
          observer.disconnect();
        }
      });
      observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    })()`);
    await detail.getByRole('button', { name: 'Fermer le détail' }).click();

    await expect(page.locator('body')).toHaveAttribute('data-detail-leaving-observed', 'true');
    await expect(detail).toBeHidden();
  });

  test('affiche les flux origine → destination à la demande', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Flux origine → destination').check();
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: 'test-results/demo-flux.png' });
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();

    // Légende contextuelle : la ligne des flux n'apparaît qu'avec la couche, et les sections s'ouvrent une à la fois.
    await page.getByRole('button', { name: 'Légende', exact: true }).click();
    await expect(page.getByText('Flux O/D reçu (≥ 3 véh. sur 1 h)')).toBeVisible();
    await expect(page.getByRole('button', { name: /Flux O\/D/ })).toHaveAttribute('aria-expanded', 'false');
  });

  test('la légende ne décrit que les couches affichées', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Légende', exact: true }).click();
    await expect(page.getByText('Gare d’échangeur').last()).toBeVisible();
    await expect(page.getByText('Flux O/D reçu')).toHaveCount(0);
    await expect(page.getByText('Charge de tronçon')).toHaveCount(0);
  });

  test('ne présente pas de violation d’accessibilité critique hors carte', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('status')).toBeVisible();
    const results = await new AxeBuilder({ page }).exclude('.maplibregl-canvas').analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });

  test('les noms d’autoroutes sont posés sur la carte : survol, sélection et masquage', async ({ page }) => {
    await page.goto('/');
    const map = page.getByRole('region', { name: 'Carte des gares de péage' });
    await expect(map).toHaveAttribute('data-ready', 'true');
    const labels = page.locator('.axis-label[data-axis]');
    await expect.poll(async () => labels.count(), { timeout: 15_000 }).toBeGreaterThan(10);

    // Survol : les gares de l'axe sont mises en évidence tant que le pointeur reste sur le nom.
    const first = labels.first();
    const axis = await first.getAttribute('data-axis');
    expect(axis).toBeTruthy();
    await first.hover();
    await expect(map).toHaveAttribute('data-active-axis', axis ?? '');
    await page.mouse.move(700, 500);
    await expect(map).toHaveAttribute('data-active-axis', '');

    // Clic : l'axe reste sélectionné (filtre « Axe » des flux) et la couche des flux s'active ; un second clic le retire.
    await first.click();
    await expect(page.getByLabel('Flux origine → destination')).toBeChecked();
    await page.mouse.move(700, 500);
    await expect(map).toHaveAttribute('data-active-axis', axis ?? '');
    await expect(page.locator('.axis-label-active').first()).toBeVisible();
    await page.locator(`.axis-label[data-axis="${axis ?? ''}"]`).first().click();
    // Le pointeur est encore sur le nom : le survol garde l'axe en évidence jusqu'à ce qu'il le quitte.
    await page.mouse.move(700, 500);
    await expect(map).toHaveAttribute('data-active-axis', '');
  });

  test('les noms d’autoroutes se masquent depuis le panneau et apparaissent dans la légende', async ({ page }) => {
    await page.goto('/');
    await expect.poll(async () => page.locator('.axis-label[data-axis]').count(), { timeout: 15_000 }).toBeGreaterThan(10);
    await page.getByRole('button', { name: 'Légende', exact: true }).click();
    await expect(page.getByText('Nom d’autoroute : survol')).toBeVisible();

    await page.getByRole('button', { name: 'Couches et gares' }).click();
    await page.getByLabel('Noms des autoroutes').uncheck();

    await expect(page.locator('.axis-label[data-axis]')).toHaveCount(0);
  });
});
