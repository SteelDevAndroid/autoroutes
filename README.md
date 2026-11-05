# Autoroutes

Supervision des gares de péage sur une carte : flux Kafka, historique PostgreSQL, API/SSE, simulation de trafic, anomalies via MCP et tableaux de bord Grafana. Le simulateur fourni génère des **données simulées**, identifiées dans l’interface.

## Ce que permet l’application

| Besoin | Fonction disponible |
|---|---|
| Situer le trafic | Carte de France, recherche des gares, exploration par axe et mise en évidence d’une concession |
| Suivre les variations | Compteurs du bandeau avec mini-courbes sur la dernière heure, activité des gares et état de fraîcheur |
| Comprendre un événement | Fiche de gare, entrées/sorties observées, anomalies et provenance des données |
| Revenir sur une période | Historique PostgreSQL, relecture et comparaison temporelle |
| Exploiter le système | Serveur MCP des anomalies, authentification OIDC facultative, Prometheus et Grafana |

Les images de production embarquent le fond de carte et le graphe routier. Le mode démonstration fonctionne avec des données générées dans le navigateur. Le [guide utilisateur](docs/guide-utilisateur.md) explique les compteurs, leurs unités et les limites de l’estimation des itinéraires.

## Lancer avec Docker Hub

Avec Docker Desktop ou Docker Engine démarré et Docker Compose ≥ 2.24.4, depuis la racine du dépôt :

```powershell
# Windows PowerShell : première installation seulement
Copy-Item .env.example .env
# Adapter les mots de passe dans .env.
docker compose -f compose.hub.yaml --profile full --profile monitoring pull
docker compose -f compose.hub.yaml --profile full --profile monitoring up -d --wait
```

Sous Linux/macOS, remplacer `Copy-Item .env.example .env` par `cp .env.example .env`.

Le profil `full` inclut Kafka, l’initialisation des topics, PostgreSQL, le backend, le simulateur et le frontend. `monitoring` ajoute Prometheus, Alertmanager et Grafana. Ajouter `--profile mcp` pour le serveur MCP. Conserver `compose.yaml` et les configurations du dépôt : le fichier Hub réutilise leurs définitions sans construire d’images.

- Application : http://localhost:8080
- Grafana : http://localhost:3000 (`admin`, mot de passe `GRAFANA_PASSWORD` dans `.env`)
- Prometheus : http://localhost:9090
- Alertmanager : http://localhost:9093

Les nouvelles images Docker Hub embarquent la carte et le graphe générés et vérifiés par la CI.
Les constructions locales avec `compose.yaml` utilisent les fichiers de `cartographie/out` : voir le [guide Docker](docs/docker.md).
Les données applicatives persistent dans des volumes nommés ; `down -v` les supprime.

Pour une construction locale avec `compose.yaml`, installer les [tuiles publiées](docs/dockerhub.md#installer-les-données-publiées-sans-les-régénérer)
ou exécuter la tâche ponctuelle au premier plan :

```powershell
docker compose --profile tiles run --rm tiles
```

`up -d` masque sa progression. Sous Windows, le [guide de dépannage](docs/dockerhub.md#fond-absent-ou-génération-arrêtée)
explique le cas `mkdir ... File exists` et la création des dossiers de sortie.

## Construire les sources

```powershell
.\start.ps1 -Monitoring -Build
```

Ou : `docker compose --profile full --profile monitoring up -d --build`.

## Lire le trafic sur la carte

Les flux suivent les itinéraires routiers **estimés** quand le graphe contient leur géométrie ; sinon, ils restent des
liaisons schématiques. Sur l'axe sélectionné, la densité des tirets représente le volume, avec une vitesse visuelle
constante. La vue nationale reste statique, puis le détail augmente en zoomant. En direct, les tirets se figent si les
données ne sont plus à jour ; les dernières valeurs et leur heure restent affichées.

Voir le [guide des animations et de la fraîcheur du trafic](docs/animation-trafic.md) pour les niveaux de zoom,
les états de suspension, la configuration du graphe et les vérifications.


## Filtrer par société concessionnaire

Dans « Explorer le réseau », le sélecteur « Concession autoroutière » souligne les tronçons dont le gestionnaire est identifié. La génération cartographique exploite les sections officielles du [RRN](https://www.data.gouv.fr/datasets/gestionnaires-du-reseau-routier-national) quand elles sont disponibles ; les sections non identifiées restent neutres. Après mise à jour des sources, régénérer les tuiles vectorielles. Voir [source, fiabilité et configuration](docs/concessions.md).

## Documentation

- [Index de la documentation maintenue](docs/README.md)
- [Architecture et données](docs/architecture.md)

- [Guide utilisateur : carte, compteurs, courbes et relecture](docs/guide-utilisateur.md)
- [Concessions : sources et couverture](docs/concessions.md)
- [Performances : protections et protocole de mesure](docs/performance.md)
- [Docker : lancement, profils, secrets, cartographie et diagnostic](docs/docker.md)
- [Carte du trafic : itinéraires, animation, zoom et fraîcheur](docs/animation-trafic.md)
- [Intégration continue et vérifications locales](docs/ci.md)
- [Serveur MCP des anomalies](docs/mcp-anomalies.md)
- [Présentation Docker Hub](docs/dockerhub.md)
- [Images publiées](https://hub.docker.com/r/compagnonsdudev/autoroutes)
