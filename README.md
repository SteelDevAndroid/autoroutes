# Autoroutes

Supervision des gares de péage sur une carte : flux Kafka, historique PostgreSQL, API/SSE, simulation de trafic, anomalies via MCP et tableaux de bord Grafana. Le simulateur fourni génère des **données simulées**, identifiées dans l’interface.

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

Les tuiles et le graphe sont à installer séparément : voir le [guide Docker](docs/docker.md). Les données persistent dans des volumes nommés ; `down -v` les supprime.

## Construire les sources

```powershell
.\start.ps1 -Monitoring -Build
```

Ou : `docker compose --profile full --profile monitoring up -d --build`.

## Documentation

- [Docker : lancement, profils, secrets, cartographie et diagnostic](docs/docker.md)
- [Serveur MCP des anomalies](docs/mcp-anomalies.md)
- [Présentation Docker Hub](docs/dockerhub.md)
- [Images publiées](https://hub.docker.com/r/compagnonsdudev/autoroutes)
