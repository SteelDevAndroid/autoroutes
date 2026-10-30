# Carte du trafic : itinéraires, animation et fraîcheur

Ce guide décrit le comportement actuel des flux origine → destination et des charges de tronçons.
Le volume conserve la provenance de sa source : simulée, observée, mixte ou non vérifiée. Un itinéraire reconstitué
reste **estimé**, même lorsque le volume est observé.

## Lire la carte

1. Activer **Flux origine → destination** dans **Couches et gares**.
2. Choisir une autoroute par la recherche, par son nom sur la carte ou dans le filtre **Axe**.
3. Zoomer pour révéler les marques animées. Le survol seul met les gares en évidence ; il ne choisit pas l'axe animé.
4. Survoler ou focaliser un flux dans la liste pour le mettre en évidence ; cliquer pour cadrer tout son itinéraire,
   y compris les détours au-delà du rectangle de ses gares.

La liste distingue **Itinéraire estimé** et **Liaison schématique**. Un tracé routier suit la géométrie OSM du chemin
le plus rapide calculé par le backend. Sans géométrie complète, sans chemin ou sans rattachement des gares au graphe,
un arc courbe relie les gares : aucun raccord routier n'est inventé.

Les tirets avancent dans le sens **origine → destination**. Leur densité comporte trois classes relatives au volume
des flux tracés ; elle ne représente pas un nombre exact de véhicules à l'écran. Leur vitesse visuelle est constante :
elle ne mesure ni une vitesse de circulation, ni une congestion.

## Détail selon le zoom

| Niveau MapLibre | Vue | Marques des flux de l'axe sélectionné |
|---|---|---|
| `z < 6` | Nationale | Statiques ; les tracés sont plus fins et plus discrets. |
| `6 ≤ z < 8` | Régionale | Animation des flux moyens et forts. Les petits flux restent tracés sans marques animées. |
| `z ≥ 8` | Locale | Animation des trois classes de volume. |

Sans axe sélectionné, les tracés restent statiques. Le zoom ne supprime pas les volumes de la liste et ne change pas
les règles de sélection : jusqu'à 60 flux principaux sans gare sélectionnée, ou les flux de la gare sélectionnée
présents dans la réponse chargée. Le réglage **Réduire les animations**, un onglet masqué ou une qualité de rendu
dégradée arrêtent également le mouvement.

## Suspension et reprise en direct

| Situation | Comportement |
|---|---|
| Démarrage ou fraîcheur pas encore confirmée | Tirets immobiles en attendant une confirmation. |
| Connexion interrompue ou en reconnexion | Mouvement suspendu ; dernières valeurs, géométries et heure conservées. |
| Fraîcheur `CATCHING_UP` | Suspension pendant le rattrapage. |
| Fraîcheur `STALE` | Suspension tant que les données sont signalées périmées. |
| Erreur de lecture REST des flux O/D | Suspension jusqu'à une lecture réussie et un état du direct à jour. |
| Connexion ouverte et nouvelle confirmation `LIVE` | Reprise si les autres conditions d'affichage sont remplies. |

Après une coupure, une simple réouverture de connexion ne suffit pas : la dernière confirmation de fraîcheur reste
consultable, mais une nouvelle est requise. La reprise conserve la phase des tirets ; le temps passé en suspension
n'est pas ajouté à leur déplacement.

La barre du haut conserve **Données à · Paris**. La légende explique les suspensions liées aux données ; les statuts
et alertes d'exploitation indiquent la coupure, le rattrapage ou la péremption. Une connexion silencieuse est détectée
par le client SSE après **45 secondes sans message** : ce délai n'est pas un seuil universel d'âge des données.

Les signaux du direct ne qualifient pas les données historiques. La relecture conserve les arcs schématiques ;
la synchronisation du déplacement des tirets avec la pause et la vitesse de l'horloge historique reste une évolution
distincte.

## Couleurs des charges de tronçons

La charge des tronçons reste une **estimation sur une heure**, signalée par des tirets. La carte et la légende
partagent une référence fixée au 95ᵉ centile des charges positives de la première estimation de la session,
arrondie à deux chiffres significatifs.

Cette référence est conservée entre les mises à jour, même si une estimation devient vide. Un tronçon dont le volume
ne change pas garde donc sa couleur lorsque les autres évoluent. Une nouvelle version de graphe, un autre algorithme
ou une nouvelle session réétablit la référence. Au-delà du plafond, la couleur reste saturée et la légende affiche `≥`.

## Activer les itinéraires routiers

Le graphe produit par [la chaîne cartographique](../cartographie/prepare_motorways.py) contient `coordinates` pour chaque
arête : tous les sommets intermédiaires sont conservés dans le sens de circulation, y compris le sens inverse des
voies bidirectionnelles. Les anciens graphes restent utilisables pour calculer les charges, mais leurs seules
extrémités ne suffisent pas à dessiner le réseau.

Régénérer le graphe, configurer `ASSIGNMENT_GRAPH_FILE=/app/graph/graph-AAAAMMJJ.json`, puis reconstruire et redémarrer
le backend et le frontend modifiés. La [procédure Docker](docker.md#flux-suivant-les-routes) décrit cette activation.
Les réglages de zoom et de densité sont définis dans [flowMotion.ts](../frontend/src/animation/flowMotion.ts) ;
ils ne nécessitent pas de variable d'environnement supplémentaire.

Le frontend demande `GET /api/v1/od?includeRoutes=true` au niveau **Gares**. Le champ facultatif `flows[].route` contient :

```json
{
  "nature": "ESTIMATED",
  "graphVersion": "graph-exemple",
  "algorithm": "all-or-nothing-fastest-v1",
  "coordinates": [[4.8, 45.7], [4.9, 44.4], [5.4, 43.3]]
}
```

Les positions sont en WGS84 `[longitude, latitude]`, ordonnées de l'origine vers la destination. Seuls les flux
déjà filtrés et diffusables sont enrichis : le seuil d'au moins trois véhicules reste imposé. La lecture enrichie
est limitée à 500 flux et conserve l'indicateur `truncated`. Sans `includeRoutes`, le contrat JSON précédent est conservé.
Les vues par département, la démonstration sans backend et les réponses dépourvues de géométrie restent schématiques.

## Vérifier les changements

Depuis `frontend`, après installation des dépendances et de Chromium Playwright :

```bash
npm run typecheck
npm run lint
npm test -- --maxWorkers=2
npx playwright test e2e/demo.spec.ts e2e/anomalies.spec.ts --workers=1
npm run e2e:routes -- --workers=1
npm run e2e:visual:docker -- --grep légende
```

`e2e:routes` construit le frontend de production et utilise une API contrôlée et un vrai flux HTTP SSE local,
sans Kafka ni PostgreSQL. Il vérifie les tracés, les niveaux de zoom, le gel des flux périmés, les horodatages
conservés, la confirmation après reconnexion et le repli schématique. Ce scénario ne remplace pas les tests
de la chaîne complète avec le backend.

Les tests unitaires vérifient aussi la reprise au même point après une longue suspension et la stabilité de la
référence de couleur. Les comparaisons visuelles Docker portent sur l'interface HTML ; la carte WebGL est vérifiée
par ses données, son style et ses états, sans comparaison pixel par pixel.

Validation du lot le **30 octobre 2026** : **285 tests Vitest**, **17 scénarios démonstration/anomalies**,
**1 scénario itinéraires/zoom/fraîcheur** et **2 contrôles visuels ciblés sur les légendes** réussis, avec typage,
lint et build réussis. Les commandes et les jobs associés sont détaillés dans le [guide CI](ci.md).
