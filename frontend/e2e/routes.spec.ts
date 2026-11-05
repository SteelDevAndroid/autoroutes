import { expect, test } from './trafficFixtures';

test('adapte les flux au zoom, les fige si périmés et reprend après confirmation sans perdre les données', async ({ page, stream }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => { errors.push(error.message); });
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  const ids = ['A', 'B', 'C'];
  const coordinates = [[4.8, 45.7], [5.4, 43.3], [2.3, 48.8]];
  const stations = { type: 'FeatureCollection', features: ids.map((id, i) => ({ type: 'Feature',
    geometry: { type: 'Point', coordinates: coordinates[i] },
    properties: { id, name: `Gare ${id}`, kind: 'ECHANGEUR', axes: i < 2 ? 'A0007' : 'A0006', dept: '38', lanes: 4 },
  })) };
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: { authenticated: false, name: null, roles: [] } }));
  await page.route('**/api/v1/referentiel/stations', (route) => route.fulfill({ json: stations }));
  await page.route('**/api/v1/capabilities', (route) => route.fulfill({ json: { provenance: 'SIMULATED', segments: 'DISABLED' } }));
  await page.route('**/api/v1/stations/*/history?*', (route) => route.fulfill({ json: {
    points: [], nature: 'SIMULATED', coverage: { status: 'AVAILABLE' },
  } }));
  const sentAt = new Date().toISOString();
  await page.route('**/api/v1/history/network?*', (route) => route.fulfill({ json: { points:
    Array.from({ length: 120 }, (_, i) => ({ t: Math.floor(Date.parse(sentAt) / 60_000) * 60 - (120 - i) * 60,
      entries: i < 60 ? 10 : 20, exits: i < 60 ? 5 : 10 })),
  } }));
  const metrics = ids.map((stationId) => ({ stationId, last5m: { entries: 1, exits: 1 }, last15m: { entries: 1, exits: 1 },
    last1h: { entries: 10, exits: 10 }, today: { entries: 10, exits: 10 }, lastEventTime: sentAt }));
  const snapshot = { type: 'snapshot', epoch: 'route-test', seq: 0, sentAt, watermark: sentAt, payload: { stations: metrics, referentielVersion: 'test' } };
  const freshness = (status: 'LIVE' | 'CATCHING_UP' | 'STALE') => ({ type: 'freshness', epoch: 'route-test', sentAt,
    payload: { status, consumerLag: 0, watermarkLagSeconds: status === 'LIVE' ? 1 : 180, staleStations: [] } });
  stream.send(snapshot);
  stream.send(freshness('LIVE'));
  await page.route('**/api/v1/stream', (route) => route.fulfill({ status: 307, headers: { location: stream.url } }));
  let withGeometry = true;
  const queries: string[] = [];
  await page.route('**/api/v1/od?*', (route) => {
    queries.push(route.request().url());
    return route.fulfill({ json: { level: 'STATION', minVehicles: 3,
      flows: [
        { originId: 'A', destinationId: 'B', vehicles: 30, ...(withGeometry ? { route: {
          nature: 'ESTIMATED', graphVersion: 'test-road', algorithm: 'fastest',
          coordinates: [[4.8, 45.7], [4.84, 45.2], [4.9, 44.4], [5.1, 43.8], [5.4, 43.3]],
        } } : {}) },
        { originId: 'A', destinationId: 'C', vehicles: 5 },
      ], nodes: [], masked: { flows: 0, vehicles: 0 }, totalVehicles: 35, truncated: false, coverage: null,
    } });
  });

  await page.goto('/?axe=A0007&flux=1');
  const map = page.getByRole('region', { name: 'Carte des gares de péage' });
  await expect(map).toHaveAttribute('data-ready', 'true');
  await expect(page.getByRole('img', { name: /^Entrées par minute sur la dernière heure/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /^Sorties par minute sur la dernière heure/ })).toBeVisible();
  for (const name of [/^Entrées 1 h/, /^Sorties 1 h/]) {
    const indicator = page.getByRole('button', { name });
    await expect(indicator.locator('.kpi-value')).toHaveCount(0);
    const width = (await indicator.locator('svg').boundingBox())?.width ?? 0;
    expect(width).toBeGreaterThan(150);
  }
  await expect(page.getByText('+100 % vs heure précédente', { exact: true })).toHaveCount(2);
  await expect(page.getByText('−30 min', { exact: true })).toHaveCount(2);
  await page.getByRole('img', { name: /^Entrées par minute/ }).hover();
  await expect(page.getByRole('tooltip')).toContainText('20 /min');
  await expect(page.getByRole('tooltip')).toContainText(/Total sur 1 h : 1.200/);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: 'test-results/hour-trends-desktop.png' });
  await expect(map).toHaveAttribute('data-road-flows', '1');
  await expect(map).toHaveAttribute('data-schematic-flows', '1');
  await expect(map).toHaveAttribute('data-flow-motion', 'on');
  await expect(page.getByText('Itinéraire estimé', { exact: true })).toBeVisible();
  await expect(page.getByText('Liaison schématique', { exact: true })).toBeVisible();
  expect(queries.every((url) => new URL(url).searchParams.get('includeRoutes') === 'true')).toBe(true);
  // Laisser la caméra et le fondu terminer avant de documenter le rendu.
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'test-results/road-routes.png' });

  await page.locator('.maplibregl-ctrl-zoom-out').click({ clickCount: 5, delay: 350 });
  await expect(map).toHaveAttribute('data-flow-detail', 'national');
  await expect(map).toHaveAttribute('data-flow-motion', 'off');
  await expect(map).toHaveAttribute('data-road-flows', '1');
  await page.locator('.maplibregl-ctrl-zoom-in').click({ clickCount: 3, delay: 350 });
  await expect(map).toHaveAttribute('data-flow-detail', 'regional');
  await expect(map).toHaveAttribute('data-animated-flows', '1');
  await page.locator('.maplibregl-ctrl-zoom-in').click({ clickCount: 2, delay: 350 });
  await expect(map).toHaveAttribute('data-flow-detail', 'local');
  await expect(map).toHaveAttribute('data-animated-flows', '2');

  const updatedAt = page.locator('.connection-detail time');
  await expect(updatedAt).toHaveAttribute('datetime', sentAt);
  const time = await updatedAt.innerText();
  for (const [status, reason] of [['STALE', 'stale'], ['CATCHING_UP', 'catching-up']] as const) {
    stream.send(freshness(status));
    await expect(map).toHaveAttribute('data-flow-motion', 'off');
    await expect(map).toHaveAttribute('data-flow-motion-reason', reason);
    await expect(map).toHaveAttribute('data-road-flows', '1');
    await expect(updatedAt).toHaveText(time);
    await expect(updatedAt).toHaveAttribute('datetime', sentAt);
    stream.send(freshness('LIVE'));
    await expect(map).toHaveAttribute('data-flow-motion', 'on');
  }
  stream.forget('freshness');
  stream.disconnect();
  await expect(map).toHaveAttribute('data-flow-motion-reason', 'waiting', { timeout: 15_000 });
  await expect(map).toHaveAttribute('data-flow-motion', 'off');
  await expect(map).toHaveAttribute('data-road-flows', '1');
  stream.send(freshness('LIVE'));
  await expect(map).toHaveAttribute('data-flow-motion', 'on');

  withGeometry = false;
  await page.getByRole('button', { name: /Revenir à la vue d’ensemble/ }).click();
  await expect(map).toHaveAttribute('data-road-flows', '0');
  await expect(map).toHaveAttribute('data-schematic-flows', '2');
  await expect(map).toHaveAttribute('data-flow-motion', 'off');
  await expect(page.getByText('Itinéraire estimé', { exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: /Plus d’indicateurs/ }).click();
  await expect(page.getByRole('img', { name: /^Passages par minute sur la dernière heure/ })).toBeVisible();
  expect(await page.evaluate('document.documentElement.scrollWidth - innerWidth')).toBe(0);
  await page.screenshot({ path: 'test-results/hour-trends-mobile.png' });
});
