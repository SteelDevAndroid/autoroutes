# Incrément 4 — Charge estimée des tronçons

> Graphe OSM → module `assignment`, couche `segments-load`, mention « estimé ».
> Critère de la roadmap : validation métier sur 3 axes. **Non atteint : voir section 4.**

## 1. Ce qui est livré

| Brique | Contenu |
|---|---|
| Graphe (`cartographie/prepare_motorways.py`) | Chaque arête porte désormais `refs` (axes normalisés, `A0007`/`A 7;E 15` → `A7`) et `link` (bretelle), en plus de l'identifiant, des nœuds, de la longueur et de la vitesse. |
| Module `assignment` | `GraphLoader` (version = empreinte SHA-256 du fichier), `RoadGraph` (grille spatiale), `StationAttachment`, `ShortestPaths` (Dijkstra multi-sources en **temps**, cache LRU de 100 000 couples), `AssignmentService` (tout-ou-rien), `AssignmentRunner` (toutes les 10 s, hors de l'écrivain unique). |
| Diffusion et API | Message SSE `segments` (`nature: ESTIMATED`, version du graphe, algorithme `all-or-nothing-fastest-v1`), rejoué aux nouveaux clients ; `GET /api/v1/segments/load` ; `graph` dans `/api/v1/diagnostic` ; jauge `toll_segments_routed_ratio`. |
| Frontend | Le message `segments` alimente le `feature-state` `load` (0 à 1, 95ᵉ centile) de la couche `segments-load` (tirets : estimation) ; seuls les tronçons dont l'intensité change sont réécrits. Panneau « Charge estimée » avec l'avertissement permanent « estimation, pas une mesure ». |
| Compose | `ASSIGNMENT_GRAPH_FILE` (chemin dans le conteneur) et montage de `cartographie/out/graph`. **Sans fichier, la fonction est inactive** : aucun message `segments`, le panneau l'indique. |

## 2. Choix et écarts avec la phase 2

- **Pas de JGraphT** : un Dijkstra de 60 lignes sur tableaux évite une dépendance (et une licence LGPL/EPL) pour un seul algorithme. L'algorithme est versionné (`all-or-nothing-fastest-v1`) ; en changer incrémente la version.
- **Rattachement multi-nœuds** : une gare est reliée à **tous** les nœuds du graphe à moins de 500 m (de son axe si possible), donc aux deux chaussées. Le chemin part du nœud le plus favorable, sans devoir deviner le sens de circulation de la gare.
- **Seuil de diffusion** : un tronçon n'est publié qu'à partir de 3 véhicules ; un tronçon emprunté par un seul flux isolé révélerait ce flux (même règle que les flux O/D).
- **Couverture** : `routedVehicles` / `unroutedVehicles` (gare non rattachée ou sans chemin) sont publiés ; `toll_segments_routed_ratio` la suit.
- Biais documentés (phase 2, 5.4) : un seul itinéraire par flux (approximatif en zone maillée), trajets sans péage invisibles, flux daté de la sortie. Ils sont rappelés dans l'interface.

## 3. Vérifications

| Vérification | Résultat |
|---|---|
| Chemin le plus **rapide** (et non le plus court) choisi ; sommes par tronçon ; seuil de 3 ; sens de chaussée respecté ; gares non rattachées comptées ; axes `A0007` = `A7` ; lecture du graphe et version par contenu | ✅ 6 tests unitaires |
| Frontières entre modules (Spring Modulith) avec le nouveau module | ✅ |
| Intégration (Kafka et PostgreSQL réels, graphe de test) : le flux Montabon → Mont-Choisy est affecté au tronçon du graphe, diagnostic de rattachement | ✅ SupervisionIT |
| Pile complète avec un graphe **de jouet** (une chaîne par axe, sans jonctions, généré pour le test et non conservé) : 662 gares rattachées, 5 sans rattachement, message `segments` reçu, panneau alimenté, aucune erreur console | ✅ (ratio d'affectation de 17 % : attendu sans jonctions entre axes) |
| `prepare_motorways.py` : axes et bretelle exportés | ✅ test unitaire |
| Frontend : écarts d'intensité, normalisation | ✅ 3 tests |

## 4. Non atteint, à faire sur un poste avec accès réseau

- **Le graphe OSM réel n'a pas pu être produit** (Geofabrik injoignable depuis l'environnement de développement, Q21). Aucune charge réelle n'a donc été calculée, et **le tracé coloré des tronçons n'a pas été vérifié visuellement** (il exige les tuiles `motorways.pmtiles`, issues de la même chaîne). Seuls le calcul, le transport et l'état de la carte (`feature-state`) sont testés.
- **Critère de la roadmap (validation métier sur 3 axes) : non évalué.** Procédure : `docker compose --profile tiles run --rm tiles`, renseigner `ASSIGNMENT_GRAPH_FILE=/app/graph/graph-AAAAMMJJ.json`, comparer les charges estimées de trois axes à des comptages connus.
- À contrôler sur le vrai graphe : rattachement des gares (< 500 m, liste dans `/api/v1/diagnostic`), `segmentId` identiques entre le graphe et les tuiles (ils viennent du même script, donc de la même version), temps de calcul d'un cycle de 10 s sur environ 20 000 couples, mémoire du cache de chemins.
- Q10 (ODbL) : le graphe dérivé d'OSM est une base dérivée ; sa diffusion hors de l'organisation l'oblige sous ODbL.
- H21 (drapeau `concede` approximatif) reste à valider visuellement.
- L'historique des charges n'est pas conservé : la charge se recalcule à partir de `od_hour` (D18). La relecture n'affiche donc pas la charge des tronçons.
