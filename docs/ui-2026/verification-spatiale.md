# Vérification des surfaces spatiales

Date : 31 octobre 2026. Dépôt de départ propre à `1e959d3`. Node 24.19.0, Linux, rendu WebGL logiciel SwiftShader. Aucune modification des dépendances, des calculs, du store métier, des API, de la cartographie ou de l'authentification.

## Base

Avant la refonte : `npm test` = 55 fichiers, 301 tests réussis ; `npm run build:demo` réussi. [Capture initiale](spatial/desktop-avant.png).

## Vérifications de la livraison

Commandes depuis `frontend/` :

| Contrôle | Résultat |
| --- | --- |
| `npm run typecheck` | Réussi. |
| `npm run lint` | Réussi. |
| `npm test` | 55 fichiers, 303 tests réussis. |
| `npm run build` | Réussi. |
| `npm run build:demo` | Réussi. |
| `git diff --check` | Réussi. |
| Tests responsive et visite guidée, Chromium système | 19 scénarios réussis. |
| Génération des snapshots, Chromium épinglé | 9 scénarios réussis, 11 références inspectées ; nouvelles vues sombres. |
| Suite navigateur finale sans mise à jour | **49 / 49 scénarios réussis**, 6 fichiers, 6,9 minutes. |

Les tests de contraste existants ont été adaptés au fichier central de tokens et étendus aux quatre combinaisons clair/sombre × standard/daltonisme. Les textes et couleurs d'état contrôlés atteignent 4,5:1 sur les fonds de lecture. Un audit axe-core complémentaire couvre 20 vues/états à 1440, 1024, 768 et 390 px : habillage clair/sombre, recherche, fiche, aide et tiroir ; [rapport JSON](spatial/audit-axe.json). Aucune violation WCAG A/AA ni aucun débordement horizontal détecté dans ce périmètre, hors canvas WebGL.

Les nouveaux scénarios vérifient la persistance d'apparence, le suivi des préférences du système, l'indépendance des filtres et de la sélection, et la fermeture du popover par clic extérieur ou déplacement du focus.

Commande de validation finale, sans mise à jour des références :

```sh
E2E_BASE_URL=http://localhost:4173 \
PLAYWRIGHT_BROWSERS_PATH=/tmp/autoroutes-playwright \
npx playwright test e2e/demo.spec.ts e2e/responsive.spec.ts \
  e2e/tour.spec.ts e2e/visual.spec.ts e2e/appearance.spec.ts \
  e2e/search-popover.spec.ts --workers=1
```

## Références visuelles

L'image Docker officielle `mcr.microsoft.com/playwright:v1.64.1-noble` a été tentée ; Docker a échoué à enregistrer sa dernière couche avec `no space left on device`. Aucun nettoyage global ni changement du daemon n'a été effectué.

Les références locales utilisent le Chromium **156.0.8078.4 / révision Playwright 1248**, épinglé par `@playwright/test` 1.64.1. Installation :

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/autoroutes-playwright npx playwright install chromium
```

La version compilée est servie par `npx vite preview --mode demo --host 0.0.0.0 --port 4173 --strictPort`. Mise à jour locale :

```sh
E2E_BASE_URL=http://localhost:4173 \
PLAYWRIGHT_BROWSERS_PATH=/tmp/autoroutes-playwright \
npx playwright test e2e/visual.spec.ts --update-snapshots --workers=1
```

La police de comparaison reste Liberation Sans. Les captures neutralisent le canvas et les indicateurs aléatoires derrière les surfaces translucides. Le CSS de capture reste appliqué entre deux images afin d'éviter les déplacements du dialogue dus aux changements de métriques de police. Les attentes de capture disposent de 15 secondes pour le rendu logiciel ; la tolérance aux différences de pixels n'a pas été augmentée.

La parité des images avec l'environnement Ubuntu de la CI reste à vérifier : elles ont été produites sous Linux avec le navigateur épinglé, en dehors du conteneur officiel. Commande canonique du dépôt : `npm run e2e:visual:docker`.

## Périmètre et limites

- Parcours navigateur validés en démonstration. Les références visuelles excluent les pixels du canvas et les chiffres simulés aléatoires.
- Pas de pile Kafka / backend / Keycloak : `live.spec.ts`, `auth.spec.ts`, historique et relecture serveur ne sont pas revendiqués comme validés en intégration réelle.
- Le mouvement réduit, le focus, les liens partageables, la sélection, la palette daltonisme et les outils mobiles sont couverts par les suites existantes et leurs extensions.
- Fallback opaque et transparence réduite implémentés en CSS. Safari/iOS réel et performances GPU sur appareils physiques non mesurés.
- Le warning Vite sur le bundle cartographique supérieur à 500 kB est préexistant. Aucune nouvelle dépendance.
- Modifications locales ; aucun push, déploiement ou changement de système distant.
