# Vérification de la modernisation

Environnement : Linux, Node 24.19.0, Chromium système (`/usr/bin/chromium`), WebGL logiciel SwiftShader. Dépôt initial propre, aucune instruction `AGENTS.md` trouvée. Dépendances du lockfile installées sans scripts (`npm ci --ignore-scripts --cache /tmp/autoroutes-npm-cache`), aucun changement de manifeste ou de lockfile.

## Base avant modification

- `npm test` : 44 fichiers, 235 tests réussis.
- `npm run build:demo` : réussi.
- [Capture initiale à 1440 × 900](desktop-avant.png).

## Contrôles de la version modifiée

Commandes exécutées depuis `frontend/` :

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Types et compilation de production | `npm run build` | Réussi |
| Types et compilation de démonstration | `npm run build:demo` | Réussi |
| Lint | `npm run lint` | Réussi |
| Tests unitaires et composants | `npm test` | 235 / 235, 44 fichiers |
| Contrastes et palette après ajustements CSS | `npm test -- src/ui/palette.test.ts` | 8 / 8 |
| Références visuelles | `CHROMIUM_PATH=/usr/bin/chromium E2E_BASE_URL=http://localhost:4173 npm run e2e:visual:update -- --workers=1` | 7 scénarios ; 8 images inspectées, dont l'échelle des tronçons |
| Écarts de format | `git diff --check` | Aucun |

Le frontend compilé de démonstration est servi par `npx vite preview --host 0.0.0.0 --port 4173 --strictPort`.

Suite navigateur :

Résultat final : **41 / 41 scénarios réussis**, sans mise à jour des références pendant la vérification. L'exécution complète s'est terminée le 25 octobre 2026 à 13:35 UTC ; `frontend/test-results/.last-run.json` confirme `status: passed` et une liste vide de tests en échec.

```sh
CHROMIUM_PATH=/usr/bin/chromium E2E_BASE_URL=http://localhost:4173 \
  npm run e2e -- e2e/demo.spec.ts e2e/responsive.spec.ts \
  e2e/tour.spec.ts e2e/visual.spec.ts --workers=2
```

Les scénarios couvrent les données simulées, la recherche au clavier, le cadrage d'un axe, le retour à la vue d'ensemble, l'activité, les liens partageables et l'historique du navigateur, les couches et la légende, la palette persistée, les animations et le mouvement réduit, les accordéons, la fermeture de fiche, l'aide et la visite guidée. Les contrôles axe-core ne détectent aucune violation critique ou grave dans les vues testées, hors canvas WebGL ; ils ne constituent pas une certification WCAG complète.

Les ajouts ciblent le confinement du focus dans le tiroir, le retour du focus après la fiche, les outils mobiles, la recherche vide et la visibilité des actions. Les scénarios responsive vérifient 1920 × 1080, 1280 × 800, 1024 × 768, 768 × 1024 et 390 × 844. Les contrôles compacts existants couvrent aussi 614 px. Une inspection supplémentaire des rectangles DOM a confirmé l'absence de débordement horizontal à 320, 390, 768, 1024, 1280, 1440 et 1920 px.

Une exécution intermédiaire a échoué à l'écriture des traces (`ENOENT`) parce que deux commandes Playwright partageaient leur répertoire d'artefacts. Elles ont été relancées séquentiellement ; les références ont ensuite été vérifiées sans mise à jour dans la suite complète.

Contrôle navigateur complémentaire : requête du référentiel volontairement différée, skeleton avec `aria-busy`, réponse HTTP 503, écran d'erreur, puis succès après « Réessayer ». Toutes ces étapes sont vérifiées par assertions Playwright sur la version compilée.

Une analyse axe-core complémentaire de la fiche « La Boisse » ouverte ne rapporte aucune violation critique ou grave, hors canvas WebGL. Le script d'inspection a été corrigé pour utiliser un contexte navigateur explicite, requis par axe-core, puis exécuté avec succès.

## Captures à consulter

- [Desktop, 1440 × 900](desktop.png)
- [Exploration mobile, 390 × 844](mobile-exploration.png)
- [Fiche de gare mobile](mobile-gare.png)
- Références des composants : `frontend/e2e/visual.spec.ts-snapshots/`.

## Limites explicites

- La pile Kafka / simulateur / backend / Keycloak n'est pas lancée. Les scénarios `live.spec.ts` et `auth.spec.ts` nécessitent cette pile et ne sont pas revendiqués comme validés. Les modules métier existants restent couverts par leurs tests unitaires ; aucun contrat backend ou mécanisme d'authentification n'a été changé.
- La démonstration désactive les tuiles externes, l'historique serveur et la relecture. Les captures ne valident donc pas le rendu d'un fond OSM réel ni le comportement d'une connexion de production en panne.
- La carte est conservée sous MapLibre : ses pixels et les compteurs simulés aléatoires ne font pas l'objet des comparaisons visuelles.
- L'avertissement Vite sur les chunks de plus de 500 kB existait avant la refonte, principalement à cause de la cartographie. Il subsiste ; aucune dépendance supplémentaire n'a été ajoutée. Cette livraison ne prétend pas résoudre le coût initial de MapLibre.
- Aucun déploiement ni changement d'un système métier distant. La mise en pull request est distincte de ces validations locales.
