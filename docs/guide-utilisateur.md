# Utiliser la supervision autoroutière

## Première ouverture

Démarrer la pile selon le [guide Docker](docker.md), puis ouvrir http://localhost:8080. Vérifier la provenance et l’état de connexion avant de lire les chiffres : la démonstration dans le navigateur et le simulateur Kafka produisent des données simulées. Une carte détaillée n’implique pas que le trafic soit issu de capteurs réels.

Avec le profil `auth`, se connecter avec `viewer` pour la consultation ou `admin` pour les opérations d’administration. Leurs mots de passe sont définis par `KEYCLOAK_VIEWER_PASSWORD` et `KEYCLOAK_ADMIN_USER_PASSWORD` dans `.env` ; les valeurs initiales de développement sont `changez-moi`. Sans ce profil, l’application locale ne présente pas d’écran de connexion. Le compte de la console Keycloak et celui de Grafana sont distincts des comptes applicatifs.

## Lire les compteurs et leurs courbes

| Indicateur | Chiffre affiché | Mini-courbe |
|---|---|---|
| Entrées 1 h | Entrées observées sur l’heure glissante | Volume d’entrées par minute sur la dernière heure |
| Sorties 1 h | Sorties observées sur l’heure glissante | Volume de sorties par minute sur la dernière heure |
| Passages aujourd’hui | Cumul des passages de la journée | Volume de passages par minute sur la dernière heure |
| Anomalies | Anomalies en cours connues | Évolution du compteur depuis l’ouverture, limitée à une heure |
| Gares actives (15 min) | Gares avec activité récente / nombre de gares | Évolution de ce nombre depuis l’ouverture, limitée à une heure |

Le chiffre et la courbe peuvent donc avoir des unités différentes : `/min` désigne le débit de trafic de la courbe. Survoler celle-ci pour lire sa description et la période couverte, en heure de Paris. Un lecteur d’écran dispose de la même information.

Le repère `Suivi` indique une période locale encore partielle. Les anomalies et les gares actives n’ont pas d’historique serveur de leur état : laisser l’application ouverte enrichit progressivement leur suivi. En démonstration, ou si l’historique de trafic manque, les courbes suivent aussi l’évolution locale du compteur ; leur description le précise. Les données absentes ne deviennent pas des zéros. Un indicateur d’anomalies partiellement connu peut afficher `≥` ; une valeur inconnue reste signalée comme indisponible.

Les mini-courbes s’actualisent pendant la consultation ; leurs lectures sont suspendues lorsque l’onglet est masqué. Les compteurs restent cliquables pour accéder aux listes associées. Le bouton « Plus d’indicateurs » déplie les passages du jour et les gares actives ; le bandeau conserve une présentation compacte sur petit écran.

## Explorer une autoroute ou une concession

1. Ouvrir le panneau « Explorer le réseau » et rechercher une gare ou sélectionner un axe.
2. Dans « Concession autoroutière », sélectionner la société à mettre en évidence.
3. Zoomer pour lire les tronçons et ouvrir une fiche de gare pour consulter son activité.

Une concession colore les sections dont le gestionnaire est identifié ; les sections sans attribution restent neutres. Ce choix aide à explorer le réseau et ne transforme pas les compteurs nationaux en compteurs de concession. Les sources et la couverture sont détaillées dans [Concessions](concessions.md).

## Comprendre les mouvements sur la carte

Les entrées et sorties sont des observations d’événements. Le chemin emprunté entre deux gares est une **estimation** à partir du graphe routier ; en l’absence de géométrie, la liaison reste schématique. Les tirets ont une vitesse visuelle constante : leur densité traduit le volume, pas la vitesse réelle des véhicules. Le détail augmente avec le zoom.

L’état de connexion et l’heure de dernière donnée expliquent la fraîcheur de l’affichage. Quand les données deviennent anciennes, les animations se figent et les dernières valeurs restent consultables. Voir [Animation et fraîcheur](animation-trafic.md).

## Relire une période

Utiliser le mode relecture et choisir la période disponible dans l’historique. Les courbes de trafic suivent l’horloge de relecture, avec une fenêtre glissante d’une heure. L’état historique des anomalies n’est pas reconstitué. Revenir au direct pour retrouver les événements courants ; le suivi local du direct est séparé de celui de la relecture.

L’absence d’historique au démarrage d’une nouvelle base est normale : il se constitue à mesure que les événements sont enregistrés. Une interruption d’acquisition ne permet pas de déduire le trafic manquant.

## Résoudre les problèmes courants

| Symptôme | Vérification utile |
|---|---|
| Carte sans fond | Vérifier le tag frontend, `/cartography-manifest.json` et le retour HTTP 206 de `/tiles/france.pmtiles` ; suivre le [diagnostic Docker](dockerhub.md#fond-absent-ou-génération-arrêtée) |
| Compteurs immobiles | Lire la connexion et l’heure des données ; contrôler le simulateur, Kafka et le backend |
| Courbe courte ou absente | Vérifier `Suivi`, la présence d’événements enregistrés et la disponibilité de l’historique |
| Concession peu visible | Zoomer, vérifier le jeu cartographique et sa couverture d’attribution |
| Connexion refusée après modification de `.env` | Un mot de passe déjà persisté n’est pas remplacé par une simple modification du fichier ; voir [secrets persistés](docker.md#secrets-déjà-persistés) |

Pour le diagnostic, utiliser `docker compose -f compose.hub.yaml --profile full ps -a` et les journaux des services concernés. Ajouter les profils employés lors du lancement. Les volumes contiennent l’historique : `down -v` les supprime.
