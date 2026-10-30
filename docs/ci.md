# Intégration continue

Workflow : `.github/workflows/ci.yml`, déclenché à chaque pull request, à chaque poussée sur `main` et à la demande. Une nouvelle poussée sur une branche annule l'exécution précédente.

## Jobs

| Job | Ce qu'il vérifie | Durée indicative |
|---|---|---|
| **Backend** | `mvn verify` sous **Java 25** : 85 tests unitaires (dont la vérification Spring Modulith des frontières entre modules) puis 7 tests d'intégration avec **Kafka et PostgreSQL réels** (Testcontainers) : déduplication, quarantaine, rejets, SSE avec reprise, historique identique au temps réel, flux O/D filtrés et rapprochés des sorties, charge estimée des tronçons sur un graphe de test, redémarrage sans double comptage | 5 à 8 min |
| **Simulateur** | `mvn verify` : 4 tests (contrat, système ouvert ou fermé, anomalies, modèle gravitaire) | 2 min |
| **Serveur MCP des anomalies** | `mvn verify` : 25 tests (client MCP réel contre le serveur avec Kafka embarqué et backend factice : lecture par source, garde de version, relais du jeton, refus sans publication, jeton et rôle exigés en mode sécurisé, catalogue des gares). Voir `docs/mcp-anomalies.md` | 2 min |
| **Frontend** | Typage strict, lint `typescript-eslint` en mode `strictTypeChecked`, tests Vitest (dont validité du style MapLibre, niveaux de zoom, fraîcheur, reprise sans saut et référence de couleur stable), builds de production et de démonstration. **E2E Playwright** démonstration/anomalies : WebGL, plus de 600 gares, erreurs console, axe-core. Puis `npm run e2e:routes` : frontend de production avec API contrôlée et vrai flux HTTP SSE de test, itinéraires, zoom, péremption et confirmation après reconnexion | 4 à 6 min |
| **Tuiles et graphe routier** (workflow `tuiles.yml`, hors pull request) | Mensuel (le 3) et à la demande : image `cartographie/Dockerfile` construite puis **exécutée** (fond Protomaps `latest`, OSM, tronçons, graphe, polices), `verify_tiles.py` (zooms, taille, graphe, ≥ 90 % des gares rattachées), release `tuiles-AAAAMMJJ` avec `SHA256SUMS`. Installation : `scripts/fetch_tiles.sh` | 1 à 3 h |
| **Publication Docker Hub** | Après « CI réussie », sur `main` et sur les tags `v*` seulement : construit et pousse les 6 images (backend, simulateur, serveur MCP, interface de production et de démonstration, chaîne cartographique) dans `compagnonsdudev/autoroutes`, tags `<image>-edge`, `<image>-sha-…` ou `<image>-1.2.3` / `-1.2` / `-latest`. Secrets `DOCKERHUB_USERNAME` et `DOCKERHUB_TOKEN` ; sans eux, avertissement et rien de publié. Détails : `docs/docker.md` | 10 à 15 min |
| **Régression visuelle** | Captures de l'interface HTML (panneau, légende, puces, tiroir ; jamais la carte) comparées aux références versionnées ; en cas d'écart, artefact `visuel-ecarts` (attendu, obtenu, différence). Exigé par « CI réussie » (premier passage vert sur la CI avec les références produites en local). Lancé à la demande avec `update_snapshots`, il régénère les références | 3 à 5 min |
| **Référentiel et cartographie** | Tests de `prepare_motorways.py` ; **le référentiel versionné est régénéré par les scripts et comparé** (alias, cas à arbitrer et identifiants des gares logiques) : aucune dérive silencieuse | 1 min |
| **Supervision** | `promtool check config` sur la configuration et les 14 règles d'alerte Prometheus, `amtool check-config` sur Alertmanager ; le tableau de bord Grafana est **régénéré par son script puis comparé** au fichier versionné | 1 min |
| **Scripts shell** | `shellcheck` sur `cartographie/build.sh` et `scripts/perf_history.sh` | < 1 min |
| **Images Docker** | `docker compose config` pour les cinq profils (`demo`, `infra`, `full`, `monitoring`, `tiles`) ; construction complète des images backend, simulateur, serveur MCP et frontend (cache GitHub Actions) | 5 à 10 min |
| **E2E chaîne complète et supervision** | Profils `full`, `monitoring` et `mcp` démarrés de zéro (simulateur → Kafka → backend → SSE → nginx, plus Prometheus, Grafana et le serveur MCP), puis 5 scénarios navigateur et le scénario agent (`e2e/agent.spec.ts` : un client MCP déclare une anomalie, la voit dans la fiche avec sa source, puis la lève) : données réelles sans bandeau de simulation, **latence de bout en bout p95 ≤ 3 s**, relecture puis retour au direct, courbe aujourd'hui / J-7, flux O/D (niveau département, seuil, écart de rapprochement ≤ 0,5 %). Ensuite `scripts/verify_observability.py` : cibles Prometheus saines, Alertmanager joint, 14 règles chargées, aucune alerte critique, **chaque panneau Grafana alimenté** | 10 à 15 min |
| **E2E authentification OIDC** | Profils `full`, `auth` et `mcp` sécurisé (Keycloak réel) : API en 401 sans session, connexion par le navigateur, accès aux données, lecteur refusé en administration (403), administrateur refusé sans jeton CSRF puis accepté (202), déconnexion. Puis l'agent : 401 sans jeton, jeton client credentials relayé au backend (chaîne Bearer), anomalie visible dans la fiche du compte `viewer` | 8 à 12 min |
| **CI réussie** | Agrège tous les jobs ci-dessus ; échoue si l'un n'est pas en succès (y compris « skipped ») | quelques secondes |

En cas d'échec, les rapports de tests, les captures et les journaux des services sont déposés en artefacts (7 jours).

## Carte embarquée dans les images Docker

Le job `carte-images` génère la carte complète à chaque exécution de la CI, y compris sur pull request :
fond France Protomaps z12, autoroutes OSM, graphe avec géométrie, polices et sprites. Il utilise la même
chaîne que le workflow `tuiles.yml`, puis exécute `cartographie/verify_tiles.py`. Son délai maximal est de
300 minutes ; les téléchargements externes et l'espace disque rendent ce job plus coûteux que les tests unitaires.

L'artefact `carte-images` (3 jours, sans recompression) est transmis au job Docker puis à la publication.
Les cibles Docker `with-map` consomment cet artefact via le contexte BuildKit nommé `cartography`.
Le frontend et le backend publiés partagent ainsi exactement le même jeu de données ; les constructions
locales par défaut conservent leurs images légères et les montages de `compose.yaml`.

`scripts/verify_bundled_map.py` démarre l'image frontend finale sans volume et vérifie les réponses HTTP 206
des deux archives PMTiles, les polices, les sprites et le manifeste. Il compare aussi le graphe et le manifeste
du backend aux sorties générées et contrôle le chemin activé dans l'image. `compose.hub.yaml` doit laisser
ces fichiers visibles. Le point de contrôle `CI réussie` inclut la génération et ces vérifications ; la publication
Docker Hub réutilise l'artefact validé, sans nouvelle génération.

## Reproduire en local

```bash
# Backend (Docker requis pour les tests d'intégration) et simulateur
( cd backend   && mvn -B verify )
( cd simulator && mvn -B verify )
( cd mcp-anomalies && mvn -B verify )

# Frontend
( cd frontend && npm ci && npx tsc -b && npx eslint . && npx vitest run && npx playwright install chromium && npx playwright test e2e/demo.spec.ts e2e/anomalies.spec.ts && npm run e2e:routes )

# Référentiel et cartographie
pip install -r scripts/requirements.txt
( cd cartographie && python -m unittest -v test_prepare_motorways )
python scripts/analyse_referentiel.py && git status --short referentiel   # doit être propre

# Chaîne complète
cp .env.example .env    # mots de passe locaux ; variables VITE_* vides sans tuiles ; COMPOSE_PROFILES=full,monitoring
docker compose up -d --build
E2E_LIVE=1 E2E_BASE_URL=http://localhost:8080 npx playwright test e2e/live.spec.ts   # depuis frontend/
GRAFANA_PASSWORD=changez-moi python3 scripts/verify_observability.py
```

Le [guide de la carte du trafic](animation-trafic.md#vérifier-les-changements) précise les assertions du scénario
itinéraires/zoom/fraîcheur et la différence avec les tests de la chaîne complète. Les tests visuels Docker ciblés sur
les légendes se lancent depuis `frontend` avec `npm run e2e:visual:docker -- --grep légende`.

## Protection de branche recommandée

Dans *Settings → Branches → Branch protection rules* pour `main` :
- exiger une pull request avant fusion ;
- exiger le contrôle d'état **« CI réussie »** (c'est le seul à déclarer : il dépend de tous les autres, une modification de la liste des jobs n'oblige donc pas à reconfigurer la protection) ;
- exiger que la branche soit à jour avant fusion.

## Dépendances

`.github/dependabot.yml` : mises à jour hebdomadaires pour Maven (backend et simulateur, avec regroupement Spring), npm (outillage de développement regroupé), les trois Dockerfiles et les actions GitHub.

## Vérifié avant la mise en place, hors GitHub

- Les workflows passent `actionlint` (avec `shellcheck` sur les scripts embarqués) ; les scripts shell passent `shellcheck`.
- Backend (unitaires **et** intégration) et simulateur : exécutés **sous un vrai JDK 25** (image Temurin 25), avec le Docker de l'hôte pour Testcontainers : 63 + 6 + 4 tests verts (incrément 2). Incrément 5 : 85 + 7 tests backend verts sous JDK 21 (`-Djava.version=21`, JDK 25 non rejoué), 224 tests frontend, 5 scénarios navigateur réels en CI et 4 d'authentification (Keycloak réel) (+ 1 sur les tronçons, local : `E2E_SEGMENTS=1`, graphe requis) et la vérification de supervision (Alertmanager joint, 14 règles, 16 panneaux alimentés).
- La procédure du job « E2E chaîne complète et supervision » rejouée de bout en bout en local (volumes neufs, `.env` généré comme dans le job) : 4 scénarios navigateur et la vérification de supervision au vert.
- L'étape « référentiel à jour » rejouée : aucune différence ; la logique du job « CI réussie » simulée (vert et rouge).
- Les commandes `package` et d'extraction des couches des Dockerfiles du backend et du simulateur rejouées sans réseau.

## Non vérifié ici (à regarder à la première exécution)

- Les actions elles-mêmes (versions `checkout@v4`, `setup-java@v4`, `setup-node@v4`, `setup-python@v5`, `upload-artifact@v4`, `docker/setup-buildx-action@v3`, `docker/build-push-action@v6`) : GitHub Actions n'est pas exécutable depuis l'environnement de développement.
- `mvn dependency:go-offline` des Dockerfiles (plugin non présent dans le cache local) et le téléchargement des dépendances dans `docker build` (bloqué ici par le proxy TLS).
- Le démarrage du profil `full` sur un runner (déjà validé en local avec la même procédure).
- Image `cartographie/Dockerfile` : workflow manuel séparé (`cartographie-image.yml`), car il compile tippecanoe depuis les sources et les versions figées de tippecanoe et go-pmtiles n'ont pas pu être vérifiées (GitHub injoignable).
