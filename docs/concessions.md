# Filtrage des concessions autoroutières

Le sélecteur « Concession autoroutière » du panneau « Explorer le réseau » met en évidence les sections portant le code de gestionnaire choisi. Un numéro d'autoroute n'est **jamais** utilisé pour attribuer automatiquement la totalité de l'axe à une concession.

## Référentiel officiel

Source prioritaire : [Gestionnaires du réseau routier national](https://www.data.gouv.fr/datasets/gestionnaires-du-reseau-routier-national), Ministère de la Transition écologique, Licence Ouverte.

`cartographie/build.sh` récupère le SHP métropolitain le plus récent disponible via l'API data.gouv.fr, le convertit en GeoJSON WGS84 avec `ogr2ogr`, puis `official_concessions.py` rapproche géographiquement chaque tronçon OSM du gestionnaire officiel en vérifiant le numéro d'autoroute.

- Correspondance géographique à 100 m maximum du milieu du tronçon, en Lambert-93.
- Ambiguïtés entre sociétés à distance comparable : aucune attribution automatique.
- En cas d'indisponibilité de la source officielle, les tags d'opérateur OSM sont utilisés lorsque leur valeur est identifiable ; les autres tronçons restent sans concession.
- Variables : `RRN_MANAGERS_URL` pour figer la version de référence ; `RRN_MANAGERS=none` pour désactiver le téléchargement.

**Limites à vérifier en production :** concordance des noms de champs dans le SHP réel, exactitude aux frontières de concession, passages parallèles de voies et couverture globale. L'algorithme utilise le milieu des tronçons, et ne les scinde pas à une frontière contractuelle qui les traverse. L'étape de régénération des tuiles est obligatoire pour exposer le champ `concession`. La CI de référence ne permet pas à elle seule de certifier l'exhaustivité du périmètre.

## Référentiel des gares

Le jeu [Gares de péage du réseau routier national concédé](https://www.data.gouv.fr/datasets/gares-de-peage-du-reseau-routier-national-concede) contient le gestionnaire de chaque gare. Il constitue une source de validation croisée, mais **ne doit pas** servir à attribuer tous les tronçons d'une autoroute sur la base de leur seul nom.

## Interface

Le choix « Toutes les concessions » retire la surbrillance. Le filtre est indépendant du survol d'axe et des flux O/D ; il ne masque pas les autres routes. Les tuiles anciennes, sans propriété `concession`, n'affichent pas de surbrillance.
