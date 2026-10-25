# Serveur MCP des anomalies de gare

`mcp-anomalies/` est un serveur [MCP](https://modelcontextprotocol.io) (Spring Boot 4.1, Spring AI 2.0, HTTP « streamable » sur `/mcp`). Il permet à un agent de déclarer les anomalies d'équipement d'une gare.

Chaque déclaration devient un événement **`ANOMALY_REPORT`** publié sur le topic `toll-events`. Le backend l'applique comme tout autre rapport d'anomalies, avec déduplication, retard, reprise et quarantaine, mais **sans compter de passage de véhicule**. Contrat détaillé : [anomalies-gares.md](anomalies-gares.md), section « Rapport seul ».

```
agent (client MCP) ──HTTP /mcp + jeton──▶ mcp-anomalies ──Kafka toll-events──▶ backend ──SSE──▶ carte et fiche de gare
```

## Outils

| Outil | Effet | Indications MCP |
|---|---|---|
| `rechercher_gares(texte)` | Au plus 20 gares du référentiel par identifiant (`GL-…`), libellé, alias ou autoroute (`A0007`). Accents, casse et ponctuation sont ignorés, et la correspondance exacte vient en premier | lecture seule |
| `declarer_anomalies(gare, anomalies)` | Publie l'**état complet** de la gare, qui **remplace** les anomalies précédentes | destructif, idempotent |
| `lever_anomalies(gare)` | Publie un rapport vide, ce qui efface toutes les anomalies de la gare | destructif, idempotent |

`gare` accepte un identifiant de gare logique ou un nom d'alias. Le nom publié est toujours un alias reconnu par le backend.

Chaque élément de `anomalies` est `{type_ano, cardinalite, criticite}` :

- `type_ano` : texte non vide de 256 caractères au plus, chaque type une seule fois ;
- `cardinalite` : entier ≥ 0, où 0 = inactif ;
- `criticite` : `Faible`, `Moyenne`, `Haute` ou `Critique`, sans tenir compte de la casse.

Un rapport compte au plus 100 éléments. Le serveur refuse avant publication, avec un message destiné à l'agent :
- une gare inconnue (il renvoie vers `rechercher_gares`) ;
- une criticité hors liste, un type en double ou une cardinalité négative.

Il ne répond « succès » qu'après l'accusé de Kafka (`acks=all`, producteur idempotent). L'agent reçoit alors l'`eventId` et la date du rapport.

**Remplacement, pas ajout.** Pour signaler un nouvel incident sur une gare qui en a déjà, l'agent renvoie la liste complète. Les descriptions des outils, lues par le modèle, le rappellent. Le serveur n'expose pas l'état courant (voir « Limites »).

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

Chaque publication est journalisée pour l'audit : identifiant du rapport, gare, nombre de types et d'occurrences, et auteur (`preferred_username` du jeton, par exemple `service-account-agent-anomalies`). L'auteur n'est jamais publié sur Kafka.

## Variables

| Variable | Défaut | Rôle |
|---|---|---|
| `MCP_PORT` | `8090` | Port HTTP |
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:29092` | Kafka |
| `KAFKA_TOPIC` | `toll-events` | Topic lu par le backend |
| `MCP_SECURITY_ENABLED` | `false` | Jeton et rôle exigés |
| `OIDC_JWK_SET_URI`, `OIDC_ISSUER` | (vide) | Clés et émetteur du royaume (obligatoires si sécurité active) |
| `REFERENTIEL_ALIASES_FILE`, `REFERENTIEL_STATIONS_FILE` | `../referentiel/…` | Gares et alias reconnus |

## Limites

- **Pas de lecture de l'état courant.** L'API du backend est protégée par une session de navigateur, pas par un jeton porteur, donc le serveur ne peut pas la relayer. Un agent qui veut compléter l'état d'une gare doit connaître ses incidents actifs, par exemple parce qu'il est la seule source pour cette gare.
- **Référentiel embarqué.** Le serveur valide les noms avec la table d'alias de son image. Après un import d'alias à chaud dans le backend (`/api/v1/admin/aliases`), il faut reconstruire ou redémarrer le serveur avec la nouvelle table.
- **Ordre de déploiement.** Un ancien backend rejette le type `ANOMALY_REPORT`. Il faut déployer le backend en premier.

## Vérifications

- `mcp-anomalies`, `mvn verify` : **17 tests**. Le client MCP du SDK (HTTP streamable) liste et appelle les outils contre le serveur réel, et le message publié est relu dans un Kafka embarqué. Sont aussi couverts : les refus sans publication, 401, 403 et 200 selon le jeton, la correspondance des rôles Keycloak et le catalogue des gares sur le vrai référentiel.
- Backend : rapport seul de bout en bout dans `SupervisionIT` (Kafka et PostgreSQL réels). La gare affiche l'anomalie et zéro passage.
- Vérification manuelle avec un Keycloak 26.4 réel et le royaume versionné :
  - le jeton client credentials d'`agent-anomalies` porte `roles: [ANOMALY_REPORTER]` ;
  - `/mcp` répond 401 sans jeton et 200 avec ;
  - `declarer_anomalies` puis `lever_anomalies` produisent les messages attendus sur Kafka.
