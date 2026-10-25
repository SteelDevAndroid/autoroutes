// Régression visuelle dans l'image Playwright officielle, celle du job CI : mêmes navigateur, polices et rendu sur toutes les machines.
// Usage : node scripts/visual-docker.mjs [options de playwright test], ex. --update-snapshots. Seuls Node et Docker sont requis sur l'hôte.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const frontend = fileURLToPath(new URL('..', import.meta.url));
const { devDependencies } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// L'image suit la version exacte de @playwright/test : le navigateur attendu y est déjà installé.
const image = `mcr.microsoft.com/playwright:v${devDependencies['@playwright/test']}-noble`;
// Sous Linux, rendre à l'utilisateur les fichiers écrits par le conteneur (root) ; inutile avec Docker Desktop.
const owner = process.getuid?.() ? `${process.getuid()}:${process.getgid()}` : '';

const script = [
  'set -e',
  'npm ci --no-audit --no-fund',
  'status=0',
  'npx playwright test e2e/visual.spec.ts "$@" || status=$?',
  'if [ -n "$OWNER" ]; then chown -R "$OWNER" e2e/visual.spec.ts-snapshots test-results dist 2>/dev/null || true; fi',
  'exit $status',
].join('\n');

const result = spawnSync('docker', [
  'run', '--rm', '--ipc=host', '--env', `OWNER=${owner}`,
  // node_modules de l'hôte masqué : ses binaires natifs (esbuild, rollup) peuvent viser un autre système.
  '--volume', `${frontend}:/work`, '--volume', '/work/node_modules', '--workdir', '/work',
  image, 'sh', '-c', script, 'sh', ...process.argv.slice(2),
], { stdio: 'inherit' });

if (result.error) {
  console.error(`Docker introuvable ou injoignable : ${result.error.message}`);
}
process.exit(result.status ?? 1);
