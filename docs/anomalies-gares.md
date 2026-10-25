# Incidents et anomalies par gare

## Contrat JSON

Le champ retenu est **`anomalies`**, conformément à l'exemple fourni. Chaque entrée porte exactement `type_ano`, `cardinalite` et `criticite`.

Exemple d'événement entrant, complétant le contrat de péage existant :

```json
{
  "eventId": "evt-123",
  "stationName": "La Boisse",
  "type": "ENTRY",
  "eventTime": "2026-10-25T15:00:00Z",
  "anomalies": [
    {
      "type_ano": "Panne de lecteur de badge télépéage (setBadge)",
      "cardinalite": 2,
      "criticite": "Moyenne"
    },
    {
      "type_ano": "Défaut d'imprimante de ticket (voie manuelle)",
      "cardinalite": 1,
      "criticite": "Faible"
    },
    {
      "type_ano": "Barrière de péage bloquée en position ouverte",
      "cardinalite": 1,
      "criticite": "Haute"
    },
    {
      "type_ano": "Erreur de communication avec le serveur central de paiement",
      "cardinalite": 4,
      "criticite": "Critique"
    }
  ]
}
```

Le tableau représente **l'état complet déclaré pour la gare**, à remplacer à chaque rapport, sans cumul. Cette règle est l'hypothèse retenue pour l'implémentation, le producteur n'ayant pas spécifié de sémantique incrémentale. Si le producteur transmet des incréments, le contrat devra être adapté avant utilisation.

| Valeur sur un événement entrant | Effet |
| --- | --- |
| Champ absent ou `null` | Aucun nouveau rapport ; conserver le dernier état connu. Une ancienne source ne déclare pas implicitement la résolution d'un incident. |
| `[]` | Rapport explicite sans anomalie : effacer les anomalies précédentes. |
| Tableau renseigné | Remplacer l'état si `eventTime` n'est pas antérieur au dernier rapport d'anomalies. À date égale, le dernier événement appliqué prévaut. |
| Tableau mal formé | Rejet explicite par le parseur (`INVALID_FIELD`, champ `anomalies`), selon le circuit de rejet existant. |

La cardinalité est un entier de 0 à 2 147 483 647, distinct du nombre de véhicules. Une cardinalité nulle ne produit pas d'incident actif à l'écran. Les textes sont non vides, bornés à 256 caractères et débarrassés des espaces en début et fin ; un rapport contient au plus 100 éléments. Le parseur ne conserve que les trois champs autorisés, pas le JSON brut ni les champs annexes éventuels.

Criticités reconnues, par gravité croissante : **Faible, Moyenne, Haute, Critique**. Une valeur future inconnue est conservée et affichée avec un traitement neutre et une mention « Criticité non reconnue » ; elle n'est pas convertie en faible criticité.

## Diffusion et conservation

Le rapport validé traverse `TollEventParser` → `TollEvent` → `EventProcessor` → `AggregationState` → `StationMetrics`. L'identification de la gare, la déduplication et la politique de retard existantes restent applicables. Le rapport ne modifie ni les compteurs de véhicules ni les calculs de flux origine–destination.

Les snapshots et deltas SSE, ainsi que le détail REST d'une gare, exposent les mêmes champs `anomalies` et **`anomaliesUpdatedAt`**. Ce dernier est l'`eventTime` du dernier rapport appliqué, distinct du dernier passage de véhicule. Un passage ultérieur sans rapport ne rafraîchit pas artificiellement la date des incidents.

À cette frontière, un objet `StationMetrics` est un état complet : `null` ou l'absence du champ signifie que l'information n'est pas disponible. Le frontend ne conserve donc pas des anomalies anciennes lorsqu'il reçoit un nouvel état de supervision sans cette information. Les anciens messages restent acceptés.

Le rapport est conservé dans les points de reprise et dans les événements mis en quarantaine. Un événement ancien ne peut pas réactiver une anomalie effacée par un rapport plus récent, y compris après redémarrage. Les rapports restent déclaratifs : aucune résolution automatique ni durée de validité n'est inventée. Leur date et les états de fraîcheur du flux permettent de juger leur actualité.

## Affichage

- **Carte** : contour extérieur statique, indépendant du type de gare, du halo d'activité et de la sélection ; couleur selon la criticité reconnue la plus élevée. Le contour reste affiché en qualité de rendu dégradée, sans animation supplémentaire. La palette daltonisme s'applique aussi aux anomalies.
- **Survol** : somme des cardinalités actives et criticité. L'exemple fourni représente quatre types et **8 occurrences**, dont quatre critiques.
- **Fiche** : section « Incidents et anomalies », libellés complets, cardinalités exactes et criticités textuelles ; ordre Critique → Haute → Moyenne → Faible. Les informations ne reposent pas uniquement sur la couleur.
- **Absence d'information** : « État des anomalies non communiqué » ; tableau vide : « Aucune anomalie signalée par la source ». Un rapport mal formé reçu par le navigateur reste inconnu et ne bloque pas la lecture des mesures de trafic.
- **Relecture** : anomalies et contour du direct masqués dès l'entrée en relecture, même pendant son chargement. La fiche explique qu'aucun historique d'incidents n'est fourni. Le dataset historique actuel ne contient que des passages.
- **Démonstration** : La Boisse (`GL-BPV-0054`) présente les quatre anomalies de l'exemple, dans le contexte explicitement simulé. Les autres gares de démonstration déclarent un tableau vide. Aucun incident fictif n'est introduit dans le flux réel.

## Simulateur

Le simulateur Kafka (`simulator/`, événements `simulated: true`) génère des rapports d'anomalies pour exercer toute la chaîne en mode direct (`StationIncidents`) :

- **Incidents persistants par gare logique.** À chaque rapport, chaque type actif perd une occurrence avec la probabilité `anomaly-resolve-rate` (0,25). Une nouvelle occurrence s'ouvre ensuite avec la probabilité `anomaly-open-rate` (0,05). Le rapport déclare l'état complet de la gare, trié de Critique à Faible. Il vaut `[]` quand tout est résolu, ce qui exerce l'effacement.
- **Catalogue.** Il comprend les quatre types de l'exemple et cinq autres, chacun avec une criticité fixe. Les pannes graves sont plus rares (poids de 8 pour « Défaut d'imprimante de ticket » à 1 pour « Erreur de communication avec le serveur central de paiement »).
- **Événements porteurs.** Une part `anomaly-report-rate` (0,1, variable `SIMULATOR_ANOMALY_REPORT_RATE`, 0 = désactivé) des événements porte le rapport. Seuls les événements à l'heure et de gare connue sont concernés : un événement en retard daterait mal l'état courant, une gare inconnue part en quarantaine. Les doublons rejouent le même rapport.
- **Ordres de grandeur.** À 80 évt/s sur 667 gares, chaque gare rend compte environ toutes les 80 s. Vérification avec le vrai `TollEventParser` : sur 10 minutes simulées, les 48 000 événements sont acceptés, dont 4 847 rapports, et 78 gares ont un incident actif. En régime établi, un test borne la part de gares concernées entre 10 et 30 %.
- **Journalisation.** Le journal du simulateur indique chaque minute le nombre de gares avec incidents simulés.

## Déploiement et compatibilité

- Migration Flyway **V4** : colonne JSONB nullable `quarantined_event.anomalies`, avec contrainte de tableau. Les anciennes lignes restent à `NULL`.
- Point de reprise **version 3**, avec rapports et dates ; le nouveau lecteur accepte toujours les versions 1 et 2 et considère alors les anomalies comme inconnues. Un ancien binaire ne sait pas lire un point de reprise v3 : en cas de retour à une ancienne version, utiliser une stratégie de reprise compatible, sans supposer cette rétrocompatibilité.
- Aucun nouvel endpoint, aucune dépendance supplémentaire. Le contrat existant des événements reste obligatoire (`eventId`, gare, type de passage, date). Ce changement n'ajoute pas un canal d'incidents autonome sans événement de péage.
- L'historisation des ouvertures/résolutions d'incidents et leur relecture ne font pas partie de cette évolution.

## Vérifications

Les tests portent sur le format exact, la cardinalité, les niveaux inconnus, les rapports absents/vides/invalides, le remplacement sans cumul, les événements désordonnés, la reprise des anciens points de contrôle, la résolution conservée après redémarrage, la déduplication et la publication du rapport.

Les tests d'intégration utilisent Kafka et PostgreSQL réels : migration V4, conservation en quarantaine (y compris `NULL` / `[]`), JSON Kafka → détail REST et snapshot SSE, puis résolution par tableau vide. Les tests navigateur vérifient la fiche sur desktop et mobile, l'accessibilité axe-core hors canvas et la régression visuelle de la liste des anomalies.

### Résultats locaux

- Backend, JDK 25, `mvn verify` : **105 tests unitaires et 10 tests d'intégration réussis**, aucun échec ni test ignoré. La reprise conserve la précision des dates des rapports jusqu'aux nanosecondes ; un test vérifie qu'une troncature ne peut pas rétablir un incident résolu.
- Frontend : `npm run lint`, `npm run build`, `npm run build:demo` réussis ; **247 tests unitaires et composants réussis**.
- Navigateur sur la démonstration compilée : **44 scénarios réussis** (démonstration, responsive, visite, anomalies et régression visuelle), sans régénération des références pendant la passe finale. Une nouvelle référence inspectée couvre les quatre types d'anomalies ; axe-core ne détecte aucune violation critique ou grave sur les vues testées hors canvas WebGL.
- La CI frontend inclut désormais `e2e/anomalies.spec.ts` en plus des scénarios de démonstration existants. Aucun contrôle CI n'est supprimé.

[Capture desktop](img/anomalies-gare-desktop.png) · [Capture mobile](img/anomalies-gare-mobile.png).
