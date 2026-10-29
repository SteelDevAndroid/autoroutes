# Autoroutes — supervision des gares de péage

Carte de supervision avec flux Kafka, historique PostgreSQL, API/SSE, simulation de trafic et tableaux de bord. Le simulateur fourni produit des **données simulées** ; leur provenance est affichée dans l’interface.

Ce dépôt Docker Hub contient six familles d’images. Pour démarrer l’application complète avec Kafka et PostgreSQL, utiliser Docker Compose depuis le [dépôt GitHub](https://github.com/SteelDevAndroid/autoroutes).

## Démarrage rapide avec les images publiées

Prérequis : Docker Engine ou Docker Desktop démarré, Docker Compose **2.24.4 ou supérieur**, Git et les ports locaux disponibles. Conserver le dépôt entier : `compose.hub.yaml` réutilise `compose.yaml` et monte des configurations de `observability/` et `auth/`.

### Windows — PowerShell

```powershell
git clone https://github.com/SteelDevAndroid/autoroutes.git
cd autoroutes
Copy-Item .env.example .env
# Adapter les mots de passe dans .env avant le lancement.
docker compose -f compose.hub.yaml --profile full --profile monitoring pull
docker compose -f compose.hub.yaml --profile full --profile monitoring up -d --wait
```

### Linux / macOS

```bash
git clone https://github.com/SteelDevAndroid/autoroutes.git
cd autoroutes
cp .env.example .env
# Adapter les mots de passe dans .env avant le lancement.
docker compose -f compose.hub.yaml --profile full --profile monitoring pull
docker compose -f compose.hub.yaml --profile full --profile monitoring up -d --wait
```

Aucune compilation locale n’est nécessaire. Le profil `full` démarre le frontend nginx, le backend, le simulateur, Kafka, l’initialisation des topics et PostgreSQL. Les sondes de santé et les dépendances ordonnent le démarrage. `monitoring` ajoute Prometheus, Alertmanager et Grafana.

## Accès locaux

| Service | URL / adresse par défaut |
|---|---|
| Application | http://localhost:8080 |
| Santé du backend | http://localhost:8081/actuator/health |
| Grafana | http://localhost:3000 — `admin`, mot de passe `GRAFANA_PASSWORD` de `.env` |
| Prometheus | http://localhost:9090 |
| Alertmanager | http://localhost:9093 |
| Kafka depuis l’hôte | `localhost:29092` |
| PostgreSQL depuis l’hôte | `localhost:5432` — base et utilisateur `supervision`, mot de passe `POSTGRES_PASSWORD` |

Les ports sont liés à `127.0.0.1` par défaut. Les mots de passe fournis sont des valeurs de développement à changer. Les données Kafka, PostgreSQL et de supervision persistent dans des volumes nommés. Modifier `.env` ne change pas un mot de passe déjà enregistré dans un volume.

## Profils facultatifs

| Profil | Services / usage |
|---|---|
| `full` | Application complète, Kafka et PostgreSQL |
| `monitoring` | Prometheus, Alertmanager et Grafana ; avec `full` |
| `mcp` | Serveur MCP des anomalies, port 8090 ; avec `full` |
| `auth` | Keycloak, http://localhost:8180 ; avec `full` et `SUPERVISION_PROFILE=auth` dans `.env` |
| `demo` | Frontend seul, simulation dans le navigateur ; exclusif avec `full` sur le port 8080 |
| `infra` | Kafka, initialisation des topics et PostgreSQL seuls |
| `tiles` | Tâche ponctuelle de génération des tuiles et du graphe |

Pour inclure MCP :

```bash
docker compose -f compose.hub.yaml --profile full --profile monitoring --profile mcp up -d --wait
```

L’authentification du serveur MCP se configure séparément avec `MCP_SECURITY_ENABLED=true` et le profil `auth` : voir la [documentation MCP](https://github.com/SteelDevAndroid/autoroutes/blob/main/docs/mcp-anomalies.md).

## Cartographie

Les tuiles et le graphe ne sont pas inclus dans les images frontend. Télécharger les données des [releases de tuiles](https://github.com/SteelDevAndroid/autoroutes/releases), ou les produire avec la tâche ci-dessous (réseau et espace disque nécessaires) :

```bash
docker compose -f compose.hub.yaml --profile tiles run --rm tiles
```

L’image cartographique embarque ses scripts et référentiels. Elle écrit dans `cartographie/out` et utilise `cartographie/work` pour les fichiers intermédiaires. Le frontend monte les sorties en lecture seule. Pour activer les tronçons estimés, renseigner dans `.env` le chemin du graphe, par exemple `ASSIGNMENT_GRAPH_FILE=/app/graph/graph-AAAAMMJJ.json`, puis relancer le backend.

### Fond absent ou génération arrêtée

`tiles` est une tâche ponctuelle, pas un serveur permanent. `up -d --build` démarre la génération en arrière-plan sans attendre sa fin. Préférer `run --rm tiles` pour voir la progression et les erreurs ; une sortie 0 signifie que la production est terminée.

```bash
docker compose -f compose.hub.yaml --profile tiles ps -a
docker compose -f compose.hub.yaml --profile tiles logs --tail=100 tiles
```

Sous Windows, si les journaux indiquent `mkdir ... File exists` alors que les dossiers sont absents dans l’Explorateur, les créer depuis PowerShell avant de relancer la tâche :

```powershell
New-Item -ItemType Directory -Force -Path cartographie/out/tiles,cartographie/out/basemaps-assets,cartographie/out/graph,cartographie/work
docker compose -f compose.hub.yaml --profile tiles run --rm tiles
```

Pour construire le générateur depuis les sources, utiliser `docker compose --profile tiles build tiles`, puis `docker compose --profile tiles run --rm tiles`.

### Installer les données publiées sans les régénérer

La [release `tuiles-20261023`](https://github.com/SteelDevAndroid/autoroutes/releases/tag/tuiles-20261023) contient le fond France (environ 1,2 Go), les autoroutes, le graphe et les polices/sprites. Sous Linux ou Git Bash, `scripts/fetch_tiles.sh` installe le dernier jeu publié et vérifie ses empreintes SHA-256.

Sous Windows avec GitHub CLI (`gh`) et `tar` disponibles, depuis la racine du dépôt :

```powershell
$tilesRelease = 'tuiles-20261023'
$tilesDownload = "build/$tilesRelease"
New-Item -ItemType Directory -Force -Path $tilesDownload,cartographie/out/tiles,cartographie/out/basemaps-assets,cartographie/out/graph | Out-Null
gh release download $tilesRelease --repo SteelDevAndroid/autoroutes --dir $tilesDownload --skip-existing
if ($LASTEXITCODE -ne 0) { throw 'Téléchargement incomplet' }
Get-Content "$tilesDownload/SHA256SUMS" | ForEach-Object {
    $expected, $name = $_ -split '\s+', 2
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath "$tilesDownload/$name").Hash
    if ($actual -ne $expected) { throw "Empreinte invalide : $name" }
}
Copy-Item "$tilesDownload/france.pmtiles","$tilesDownload/motorways.pmtiles" cartographie/out/tiles/
Copy-Item "$tilesDownload/graph-*.json" cartographie/out/graph/
Copy-Item "$tilesDownload/manifest.json" cartographie/out/
tar -xzf "$tilesDownload/basemaps-assets.tar.gz" -C cartographie/out
if ($LASTEXITCODE -ne 0) { throw 'Extraction incomplète' }
```

Un téléchargement incomplet déjà présent sera détecté par SHA-256 : retirer ce fichier du dossier de téléchargement avant de réessayer. Les fichiers du fond sont servis par nginx dès leur installation dans les dossiers montés. Recharger la page du navigateur.

Pour contrôler le service HTTP sous PowerShell :

```powershell
(Invoke-WebRequest http://localhost:8080/tiles/france.pmtiles -Headers @{ Range = 'bytes=0-126' }).StatusCode
```

Le résultat attendu est **206** (contenu partiel), pas 404. Les sprites et polices sous `/basemaps-assets/` doivent aussi être disponibles. Si le frontend local a été construit avec les quatre `VITE_*` vides, retirer ces valeurs puis reconstruire `frontend-live` avec le profil `full` pour activer le fond.

Les paramètres `VITE_*` sont intégrés au frontend à la construction : les modifier dans `.env` ne reconfigure pas une image publiée. Pour personnaliser ces paramètres, construire avec `compose.yaml` ; voir le [guide Docker](https://github.com/SteelDevAndroid/autoroutes/blob/main/docs/docker.md).

## Images et versions

| Image | Exemple de tag | Architectures |
|---|---|---|
| Backend | `compagnonsdudev/autoroutes:backend-latest` | amd64, arm64 |
| Simulateur | `compagnonsdudev/autoroutes:simulator-latest` | amd64, arm64 |
| Serveur MCP | `compagnonsdudev/autoroutes:mcp-anomalies-latest` | amd64, arm64 |
| Frontend de production | `compagnonsdudev/autoroutes:frontend-latest` | amd64, arm64 |
| Frontend de démonstration | `compagnonsdudev/autoroutes:frontend-demo-latest` | amd64, arm64 |
| Outils cartographiques | `compagnonsdudev/autoroutes:cartographie-latest` | amd64 |

`latest` suit les versions stables ; `edge` suit les publications de `main` après validation CI. Pour figer toutes les images applicatives sur une version, ajouter par exemple `AUTOROUTES_TAG=0.3.0` dans `.env`. Les versions des images d’infrastructure sont définies dans `compose.yaml`.

## Mise à jour et diagnostic

```bash
docker compose -f compose.hub.yaml --profile full --profile monitoring pull
docker compose -f compose.hub.yaml --profile full --profile monitoring up -d --wait
docker compose -f compose.hub.yaml --profile full --profile monitoring ps -a
docker compose -f compose.hub.yaml --profile full --profile monitoring logs --tail=100 backend kafka postgres
```

Répéter les profils facultatifs utilisés, par exemple `--profile mcp`. `docker compose ... down` arrête la pile et conserve les volumes ; **`down -v` supprime les volumes et leurs données**.

Sous Windows, `start.ps1` diagnostique aussi les secrets persistés, mais lance actuellement les images locales de `compose.yaml` : utiliser les commandes ci-dessus pour Docker Hub.

[Code source](https://github.com/SteelDevAndroid/autoroutes) · [Guide Docker complet](https://github.com/SteelDevAndroid/autoroutes/blob/main/docs/docker.md) · [Releases](https://github.com/SteelDevAndroid/autoroutes/releases)
