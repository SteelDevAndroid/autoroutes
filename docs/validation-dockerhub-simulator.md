# Vérification Docker Hub avec simulateur — 29 octobre 2026

Résultat : validé sur les images backend-latest, simulator-latest et frontend-latest, révision OCI 506cca85d539c77c505077f5163cf574ed53b382.

- `compose.hub.yaml --profile full --profile monitoring` inclut simulateur, Kafka, initialisation des topics, PostgreSQL, backend, frontend et supervision. Aucun build local dans la configuration résolue.
- Lancement réel réussi avec `up -d --no-build --wait --wait-timeout 240`, projet isolé `autoroutes-hub-verification-20261029`, ports et volumes distincts de la pile courante.
- Services avec sondes tous sains, simulateur actif, initialisation des topics terminée avec succès.
- Backend : plus de 3 700 événements appliqués au premier relevé, retard Kafka nul, état LIVE.
- Deux tests Playwright existants passent : carte et compteurs alimentés par le backend sans erreur JavaScript ; latence p50=1 s, p95=2 s (seuil 3 s).
- PostgreSQL : 1 111 lignes station_minute, compteur simulated=5 022, observed=0 au relevé final.
- API capabilities : SIMULATED, segments DISABLED. Provenance UNKNOWN au premier instant du démarrage, puis SIMULATED après disponibilité des données.

Le test ne valide pas une semaine d’historique, l’authentification, les agents MCP ou les tronçons estimés (graphe non activé). Aucun fichier source modifié. La pile de vérification est arrêtée et ses volumes de test supprimés après validation ; la pile habituelle est conservée.

Commande de lancement habituelle :

```powershell
docker compose -f compose.hub.yaml --profile full --profile monitoring up -d --wait
```

## Reproduire les contrôles

Depuis la racine du dépôt, avec Docker Desktop démarré :

```powershell
docker compose -f compose.hub.yaml --profile full --profile monitoring up -d --no-build --wait
Invoke-RestMethod http://localhost:8080/api/v1/capabilities
Invoke-RestMethod http://localhost:8080/api/v1/diagnostic
```

Pour les scénarios navigateur existants, après installation des dépendances frontend et de Chromium :

```powershell
cd frontend
$env:E2E_LIVE = '1'
$env:E2E_BASE_URL = 'http://localhost:8080'
npx playwright test e2e/live.spec.ts --grep 'affiche les données|latence de bout' --workers=1
```

Le test du 29 octobre a utilisé le conteneur Playwright `mcr.microsoft.com/playwright:v1.64.1-noble`, les dépendances frontend déjà présentes et une URL externe pointant vers le frontend Hub. Aucun frontend de démonstration, serveur Vite ou backend construit localement n’a servi de cible.

Les tags `latest` peuvent changer : les résultats ci-dessus portent sur la révision OCI indiquée, et ne garantissent pas les publications futures. Une base vide ne permet pas de vérifier immédiatement une semaine d’historique.
