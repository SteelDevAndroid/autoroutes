# Corrections de l'audit de performances

## Persistance et contre-pression

Les gares inconnues sont écrites par lots idempotents d'au plus 256 événements, au remplissage du lot ou au prochain tic (1 s par défaut). Le même worker traite les lots et les checkpoints dans l'ordre FIFO. Sa file est limitée à 16 tâches, plus la tâche active ; la file d'ingestion reste limitée à 50 000 événements par défaut.

Lorsque la persistance est saturée, l'écrivain attend une place : aucune politique de rejet silencieux ni exécution concurrente sur le thread appelant. Un lot SQL en échec est réessayé après une seconde, en conservant le lot et en empêchant les checkpoints suivants de le dépasser. L'upsert `ON CONFLICT DO NOTHING` permet de reprendre un lot partiellement écrit. Une base durablement indisponible freine donc volontairement l'ingestion ; le redémarrage repart du dernier checkpoint durable.

Métriques ajoutées : `toll.persistence.queue` (tâches en attente) et `toll.quarantine.write.failed` (tentatives de lot échouées). L'occupation de la file d'ingestion et la fraîcheur restent visibles via les métriques existantes. Si l'écrivain ne s'arrête pas dans les 30 secondes, l'arrêt ne capture pas d'état concurrent.

## SSE et itinéraires

La fermeture, le timeout ou l'erreur d'un canal SSE interrompt son worker, y compris lorsqu'il attend une file vide. Le retrait du client est idempotent ; une fermeture avant démarrage ne lance aucun thread.

L'affectation des tronçons et les lectures REST ne verrouillent plus l'ensemble du service. Le LRU garde un verrou court sur ses accès ; Dijkstra et l'assemblage des géométries restent hors verrou. Les recherches simultanées d'un même couple partagent leur résultat en cours, puis l'entrée temporaire est retirée. La capacité du cache existante reste appliquée.

## Lectures invisibles

Les courbes du classement ne sont chargées et rafraîchies que si la section Activité est ouverte, le document visible et le mode direct actif. La fermeture ou le masquage annule la requête en cours et son intervalle. La réouverture relance immédiatement la lecture. Les réponses tardives annulées ne remplacent pas les valeurs courantes. L'état des sections reste conservé.

## Banc SSE

Exécuter contre une instance de test alimentée en continu, avec des horloges synchronisées :

```sh
python3 scripts/bench_sse.py --url http://localhost:8080 --clients 400 --duration 60 --min-deltas 30 --max-p95-seconds 3
```

Chaque client mesure la durée complète après réception des en-têtes, avec une horloge monotone. La connexion et les en-têtes ont un timeout séparé (`--connect-timeout`, 10 s par défaut). Le banc exige pour chaque client assez de deltas valides et un p95 sous le seuil ; une coupure prématurée, un refus, un message `resync`, un watermark invalide ou l'absence de données produit un code retour non nul. Les champs SSE multiligne sont assemblés avant décodage JSON.

Le banc utilise HTTP et ne gère pas de session OIDC : employer une instance de test dont l'accès est déjà autorisé. Il ne modifie pas la sécurité du serveur. Une mesure fiable doit préciser machine, nombre de gares, débit Kafka, graphe et état du cache. Ce correctif n'établit pas à lui seul la capacité à 500 clients ni les FPS WebGL.

## Vérifications

- Frontend : `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run build:demo`.
- Backend : `mvn verify` (JDK 25 en CI ; JDK 21 supporté avec `-Djava.version=21`, Docker nécessaire aux tests d'intégration).
- Banc et scripts : `python3 -m unittest discover -s scripts -p 'test_*.py' -v`.
- Régressions ciblées : fermeture SSE en attente, saturation FIFO et ordre des tâches, appels concurrents d'affectation et de lecture, lots SQL avec champs optionnels/doublons, annulation et reprise des courbes, flux SSE muets/coupés/invalides/lents.
