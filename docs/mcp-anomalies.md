# Serveur MCP des anomalies de gare

`mcp-anomalies/` est un serveur [MCP](https://modelcontextprotocol.io) (Spring Boot 4.1, Spring AI 2.0, HTTP « streamable » sur `/mcp`). Il permet à un agent de déclarer les anomalies d'équipement d'une gare.

Chaque déclaration devient un événement **`ANOMALY_REPORT`** publié sur le topic `toll-events`. Le backend l'applique comme tout autre rapport d'anomalies, avec déduplication, retard, reprise et quarantaine, mais **sans compter de passage de véhicule**.

Chaque agent écrit sous **sa propre source**, `mcp:<compte>` (le `preferred_username` du jeton, ou `anonymousUser` sans authentification). Une déclaration ne remplace donc que les incidents de cet agent, jamais ceux des équipements de péage (`peage`) ni ceux d'un autre agent. Contrat détaillé : [anomalies-gares.md](anomalies-gares.md), sections « Rapport seul » et « Sources ».

```
agent (client MCP) ──HTTP /mcp + jeton──▶ mcp-anomalies ──Kafka toll-events──▶ backend ──SSE──▶ carte et fiche de gare
                                            └──GET /api/v1/stations/{id} + même jeton──▶ backend (lecture)
```

## Outils

| Outil | Effet | Indications MCP |
|---|---|---|
| `rechercher_gares(texte)` | Au plus 20 gares du référentiel par identifiant (`GL-…`), libellé, alias ou autoroute (`A0007`). Accents, casse et ponctuation sont ignorés, et la correspondance exacte vient en premier | lecture seule |
| `consulter_anomalies(gare)` | État courant publié par le backend, détaillé par source. Renvoie aussi `maSource` et `versionAttendue` (date du dernier rapport de `maSource`, ou `aucune`) | lecture seule |
| `declarer_anomalies(gare, anomalies, version_attendue?)` | Publie l'**état complet de votre source**, qui **remplace** ce qu'elle avait déclaré | destructif, idempotent |
| `lever_anomalies(gare, version_attendue?)` | Publie un rapport vide pour votre source et efface ses incidents | destructif, idempotent |

`gare` accepte un identifiant de gare logique ou un nom d'alias. Le nom publié est toujours un alias reconnu par le backend.

Chaque élément de `anomalies` est `{type_ano, cardinalite, criticite}` :

- `type_ano` : texte non vide de 256 caractères au plus, chaque type une seule fois ;
- `cardinalite` : entier ≥ 0, où 0 = inactif ;
- `criticite` : `Faible`, `Moyenne`, `Haute` ou `Critique`, sans tenir compte de la casse.

Un rapport compte au plus 100 éléments. Le serveur refuse avant publication, avec un message destiné à l'agent :
- une gare inconnue (il renvoie vers `rechercher_gares`) ;
- une criticité hors liste, un type en double ou une cardinalité négative.

Il ne répond « succès » qu'après l'accusé de Kafka (`acks=all`, producteur idempotent). L'agent reçoit alors l'`eventId`, sa `source` et `eventTime`, qui est la nouvelle version de son état.

**Remplacement, pas ajout.** Pour signaler un nouvel incident alors que sa source en a déjà, l'agent lit son état avec `consulter_anomalies` puis renvoie la liste complète de sa source. Les descriptions des outils, lues par le modèle, le rappellent.

**Garde de version (facultative).** Avec `version_attendue`, la déclaration est refusée si l'état de la source de l'agent a changé depuis sa lecture : une autre session du même agent peut l'avoir modifié entre-temps. Deux formes sont possibles :
- la `versionAttendue` de `consulter_anomalies` ;
- l'`eventTime` de la déclaration précédente.

`aucune` signifie que l'agent n'a encore rien déclaré. La vérification lit le backend puis publie, sans atomicité : elle protège d'un écrasement entre deux lectures, pas d'une course à la milliseconde. Juste après une déclaration, le backend peut mettre une ou deux secondes à l'appliquer ; un refus invite alors à relire.

## Démarrer

```bash
# Pile complète + serveur MCP (sans authentification : poste de développement)
docker compose --profile full --profile mcp up -d --build
# → http://localhost:8090/mcp  (santé : /actuator/health)

# Hors conteneur, avec le profil infra (Kafka sur localhost:29092)
cd mcp-anomalies && mvn spring-boot:run
```

Connecter un client, par exemple Claude Code :

```bash
claude mcp add --transport http autoroutes-anomalies http://localhost:8090/mcp
```

## Sécurité

Par défaut, comme le backend en développement, aucun jeton n'est exigé. Le port n'est publié que sur `127.0.0.1` et le serveur l'annonce au démarrage par un avertissement.

En dehors d'un poste de développement, activer le profil `auth` et définir `MCP_SECURITY_ENABLED=true` dans `.env`. Chaque requête doit alors porter un jeton OIDC Keycloak signé par le royaume (`OIDC_JWK_SET_URI`) et émis par lui (`OIDC_ISSUER`), avec le rôle **`ANOMALY_REPORTER`**. Sans jeton : 401. Sans le rôle : 403. La sonde `/actuator/health` reste ouverte.

Le royaume importé (`auth/realm-supervision.json`) déclare le client confidentiel **`agent-anomalies`** :
- flux client credentials uniquement ;
- secret `MCP_AGENT_CLIENT_SECRET` ;
- son compte de service porte le rôle `ANOMALY_REPORTER`.

```bash
TOKEN=$(curl -s -d grant_type=client_credentials -d client_id=agent-anomalies -d client_secret="$MCP_AGENT_CLIENT_SECRET" \
  http://localhost:8180/realms/supervision/protocol/openid-connect/token | jq -r .access_token)
claude mcp add --transport http autoroutes-anomalies http://localhost:8090/mcp --header "Authorization: Bearer $TOKEN"
```

Le jeton dure 5 minutes (`accessTokenLifespan` du royaume). Un agent de longue durée le renouvelle par le même appel.

**Lecture.** `consulter_anomalies` et la garde relaient **le jeton de l'agent** au backend ; le serveur MCP ne détient aucun droit propre. En profil `auth`, le backend accepte les jetons porteurs sur une chaîne dédiée, sans session ni CSRF :
- seul `GET /api/v1/stations/{id}` est ouvert, aux rôles `ANOMALY_REPORTER`, `VIEWER` et `ADMIN` ;
- tout le reste est refusé (403), et un jeton invalide reçoit 401 ;
- le backend vérifie les clés du royaume (`OIDC_JWK_SET_URI`) et l'émetteur (`OIDC_ISSUER`).

Chaque publication est journalisée pour l'audit : identifiant du rapport, gare, nombre de types et d'occurrences, et auteur (`preferred_username` du jeton, par exemple `service-account-agent-anomalies`). L'auteur n'est jamais publié sur Kafka.

## Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `MCP_PORT` | `8090` | Port HTTP |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` | Kafka |
| `KAFKA_TOPIC` | `toll-events` | Topic lu par le backend |
| `BACKEND_URL` | `http://localhost:8081` (Compose : `http://backend:8080`) | Backend lu par `consulter_anomalies` et la garde |
| `MCP_SECURITY_ENABLED` | `false` | Jeton et rôle exigés |
| `OIDC_JWK_SET_URI`, `OIDC_ISSUER` | (vide) | Clés et émetteur du royaume (obligatoires si sécurité active) |
| `REFERENTIEL_ALIASES_FILE`, `REFERENTIEL_STATIONS_FILE` | `../referentiel/…` | Gares et alias reconnus |

## Limites

- **Même compte, même source.** Deux agents qui partagent un compte Keycloak partagent une source et peuvent s'écraser. La garde de version les protège ; un compte par agent les sépare.
- **Pas de levée croisée.** Un agent ne lève que les incidents de sa propre source. Effacer ceux d'une autre source demande un rapport de cette source.
- **Référentiel embarqué.** Le serveur valide les noms avec la table d'alias de son image. Après un import d'alias à chaud dans le backend (`/api/v1/admin/aliases`), il faut reconstruire ou redémarrer le serveur avec la nouvelle table.
- **Ordre de déploiement.** Un ancien backend rejette le type `ANOMALY_REPORT`. Il faut déployer le backend en premier.

## Vérifications

- `mcp-anomalies`, `mvn verify` : **25 tests**. Le client MCP du SDK (HTTP streamable) liste et appelle les outils contre le serveur réel, avec un Kafka embarqué et un backend factice. Sont couverts :
  - la lecture par source et la garde (version périmée refusée sans publication, `aucune` pour une première déclaration) ;
  - le relais du jeton et les refus sans publication ;
  - les réponses 401, 403 et 200 selon le jeton, et la correspondance des rôles Keycloak.
- Backend : sources indépendantes, point de reprise v4 (et relecture de la v3), chaîne de jetons porteurs (lecture d'une gare seulement). `SupervisionIT` (Kafka et PostgreSQL réels) : le rapport seul d'un agent atteint la gare avec sa source et zéro passage.
- **E2E `e2e/agent.spec.ts`**, dans les jobs CI « E2E chaîne complète » et « E2E authentification ». Un client MCP lit, déclare avec garde, attend que le backend applique le rapport, voit l'incident dans la fiche de La Boisse avec « Agent <compte> », vérifie qu'une version périmée est refusée, puis lève l'incident. En profil `auth`, il obtient un jeton client credentials, ce qui exerce le relais vers la chaîne Bearer du backend, et l'interface est ouverte avec le compte `viewer`.
- Vérification manuelle avec un Keycloak 26.4 réel et le royaume versionné :
  - le jeton client credentials d'`agent-anomalies` porte `roles: [ANOMALY_REPORTER]` ;
  - `/mcp` répond 401 sans jeton et 200 avec ;
  - `declarer_anomalies` puis `lever_anomalies` produisent les messages attendus sur Kafka ;
  - backend en profil `auth` : le jeton de l'agent lit une gare (200), le snapshot est refusé (403), un jeton invalide ou absent reçoit 401 ;
  - parcours MCP complet : `consulter` → `declarer` (version `aucune`) → version propagée à la nanoseconde → `lever` périmé refusé → `lever` à jour accepté.
