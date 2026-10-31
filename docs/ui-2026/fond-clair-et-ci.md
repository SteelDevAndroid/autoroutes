# Fond clair et réutilisation cartographique en CI

Cette itération prolonge les surfaces spatiales avec deux changements : une carte accordée à l'apparence et la réutilisation de jeux cartographiques déjà validés pour les PR qui ne changent pas leurs sources.

## Carte et apparence

- Le choix clair/sombre/automatique s'applique au fond Protomaps, aux gares, aux contours d'anomalies, aux flux, aux sélections et à la légende.
- Le fond clair emploie des terrains désaturés et une eau bleu gris. Les couleurs métier gardent la priorité visuelle. Le sombre existant est conservé.
- Les pigments de la palette daltonisme sont adaptés au fond clair ; les deux types de gares restent aussi distingués par leur contour. La rampe des tronçons devient progressivement plus sombre sur fond clair, avec les mêmes valeurs et seuils.
- Le changement applique les propriétés de peinture et le sprite correspondant à chaud. Il ne remplace ni le style complet ni les sources : caméra, sélection, états des objets, données et phase des tirets sont conservés.
- Un store d'apparence séparé résout la préférence du système avant le montage de la carte et suit ses changements. Un choix explicite reste prioritaire et vaut pour la session même si le stockage est refusé.
- Sans tuiles configurées, la démonstration conserve un fond uni adapté à l'apparence.

Sources : `frontend/src/map/theme.ts`, `basemapTheme.ts`, `style.ts`, `mapController.ts` et `frontend/src/state/appearanceStore.ts`.

## Réutilisation en CI

Les exécutions `push`, tags et manuelles continuent à produire une carte fraîche. Sur `pull_request`, `scripts/ci_map_artifact.py` cherche un artefact `carte-images` récent, issu d'une **exécution CI entièrement réussie, déclenchée par un push sur la branche par défaut du même dépôt**. Aucun artefact de PR ou de fork n'est sélectionné.

Les conditions sont cumulatives :

1. Empreinte Git identique des sources versionnées : `cartographie/`, `referentiel/`, `echangeurs-rrnc-2025.csv` et `.dockerignore`. Un nouveau fichier dans ces arbres invalide aussi la réutilisation.
2. Artefact non expiré, âgé de trois jours au maximum. La recherche est bornée aux 30 dernières exécutions réussies de la branche principale.
3. Manifeste conforme à la recette CI : zoom 12, source OSM `single`, emprise France attendue, build Protomaps daté et nom de graphe sûr.
4. Commit du manifeste identique à celui de l'exécution source sélectionnée.
5. Nouvelle exécution de `verify_tiles.py` : taille et en-têtes PMTiles, couverture des gares, graphe, polices et sprites.

Si la recherche, le téléchargement ou la validation échoue, la génération complète reprend. Les fichiers d'une restauration partielle sont retirés avant cette génération. Une PR qui modifie les sources cartographiques emprunte également ce chemin.

Le job transmet l'identifiant exact de l'artefact et de son exécution au job Docker. Un artefact réutilisé n'est pas téléversé une seconde fois. Le manifeste conserve le commit de production original : il n'est pas réécrit avec celui de la PR. Les images frontend/backend continuent à être construites et contrôlées avec les mêmes tuiles, ressources et graphe, notamment les réponses HTTP Range 206 et les empreintes du graphe embarqué.

La validation `CI réussie` conserve tous ses jobs et aucune tolérance de test n'est modifiée. Les seules permissions ajoutées sont la lecture des Actions pour les deux jobs consommateurs.

## Vérification

Commandes depuis la racine :

```sh
python3 -m unittest discover -s scripts -p test_ci_map_artifact.py -v
actionlint .github/workflows/ci.yml
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run build
npm --prefix frontend run build:demo
```

Les neuf tests Python couvrent la réutilisation après changement UI, l'invalidation des sources, les nouveaux fichiers producteurs, les branches/exécutions non fiables, les artefacts expirés ou trop anciens, la recette, la provenance et les chemins de graphe. Le sélecteur a aussi trouvé un artefact compatible réel de `main`, exécution `41136251047`.

Les 320 tests frontend couvrent notamment les styles MapLibre complets dans les quatre variantes, les contrastes des couleurs métier sur les terrains et l'eau du fond clair, les libellés, la rampe, les sprites, le suivi du système et la conservation des données/caméra/phase d'animation. Les tests navigateur vérifient aussi que le même canvas et la même sélection survivent au changement d'apparence.

### Aperçus sur des tuiles réelles

Les captures utilisent un extrait Protomaps `20261031` jusqu'au zoom 6 pour la vue nationale, avec polices et sprites auto-hébergés. Il sert à la vérification locale et n'est pas ajouté au dépôt. La production CI conserve son jeu complet au zoom 12.

- [Clair standard](map-appearance/protomaps-light.png)
- [Sombre standard](map-appearance/protomaps-dark.png)
- [Clair adapté au daltonisme](map-appearance/protomaps-light-cvd.png)
- [Sombre adapté au daltonisme](map-appearance/protomaps-dark-cvd.png)
- [Ressources et erreurs du navigateur](map-appearance/browser-audit.json) : aucune erreur ni ressource en échec dans les quatre variantes.

Les contrôles automatisés ne constituent pas une certification d'accessibilité. Le profilage GPU sur appareils physiques et Safari/iOS reste une prochaine étape. Le gain de durée de la CI doit être relevé sur une exécution distante qui utilise effectivement l'artefact.
