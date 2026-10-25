# Modernisation du poste de supervision

## Périmètre et parcours

L'application React / TypeScript est un espace cartographique unique, pas un ensemble de pages CRUD. `App.tsx` compose un bandeau de provenance, `TopBar`, les alertes d'exploitation, `SidePanel` et `MapView`. Les vues contextuelles sont `StationDetail`, `DiagnosticPanel`, `ReplayBar`, `AboutDialog` (adressable par `#a-propos`) et `Tour`. Zustand conserve la sélection et les réglages ; `StationStore` et le contrôleur MapLibre gèrent les données et la carte.

Le parcours principal est : vérifier la provenance et la fraîcheur → rechercher une gare ou un axe → cadrer la carte → lire les passages ou les flux → revenir à la vue nationale. Le second parcours consiste à activer une couche, préciser ses filtres et explorer ses résultats. Le diagnostic et la relecture sont des outils d'investigation. Lecteurs et administrateurs utilisent la même supervision ; les rôles et la connexion OIDC restent ceux du serveur.

## Audit du code initial

| Zone | Constat concret | Décision |
| --- | --- | --- |
| En-tête (`TopBar`) | Titre, cinq métriques, état, aide et compte utilisateur sur une même ligne. Tailles de 11 à 18 px, faible distinction entre identité, activité et fraîcheur. | Deux niveaux compacts : identité et service, puis ruban de mesures ouvertes avec périodes et heure de Paris. |
| Navigation (`SidePanel`, `Section`) | Liste uniforme ; réglages de carte et préférences d'accessibilité mélangés. Titres tout en capitales, composants de 20–26 px de haut. | Conserver la navigation contextuelle ; groupes métier explicites, préférences séparées, titres en casse naturelle et cibles plus grandes. |
| Défilement | Le panneau entier défile : recherche et actions peuvent disparaître. Une seule section est ouverte à la fois. | Recherche et outils stables ; contenu de la section ouverte défilant ; en-têtes des autres sections accessibles. Défilement du panneau en repli si très faible hauteur. |
| Recherche (`SearchBox`) | Raccourci inclus dans le placeholder ; aucun résultat donne seulement une phrase. Le clavier est déjà bien pris en charge. | Label persistant, icône et touche dédiée ; expliquer le format attendu et proposer d'effacer ; conserver `/`, flèches, Entrée et Échap. |
| Formulaires (`OdPanel`, `ReplayBar`) | Sélecteurs étroits, faible espacement, pas de regroupement explicite des cases. | Champ de hauteur cohérente, filtres sur deux colonnes, `fieldset` / `legend` pour les couches. Conserver validations et filtres serveur. |
| Fiche de gare | Trois badges pour des métadonnées ordinaires, tableau sans séparation, contraste hiérarchique faible, ombre à 40 %. | Métadonnées textuelles, titre distinct, tableau sémantique avec valeurs à droite et période 1 h mise en avant. Panneau latéral desktop et feuille basse mobile. |
| Tableaux et listes | Le seul tableau métier est le récapitulatif des périodes d'une gare. Les flux et classements sont des listes limitées à 5, 8 ou 10 éléments. | Ne pas ajouter pagination, sélection, colonnes configurables ou virtualisation à ces petits ensembles. Lignes lisibles, survol utile, nombres tabulaires. |
| Graphiques | Courbe J / J-7 à largeur fixe ; sparklines déjà légères et textuellement décrites. | SVG historique responsive via `viewBox`, skeleton de même volume au chargement. Conserver les séries et leurs indications de disponibilité/provenance. |
| Surfaces et cartes | Peu de cartes imbriquées : structure pertinente, mais panneaux et fond presque indifférenciés ; bordures omniprésentes sur les badges et petits boutons. | Garder les sections ouvertes ; quatre niveaux de surface et ombre unique modérée. Éviter toute nouvelle grille de KPI/cartes. |
| Dialogues | Aide en dialogue natif et visite guidée existantes ; fermeture par glyphes de polices. | Conserver le dialogue natif et la visite, revoir rythme et typographie ; icônes SVG cohérentes. |
| Mobile | Tiroir avec focus initial et Échap, mais sans bouton de fermeture interne ni confinement clavier. Fiche de gare en haut de la carte. | Tiroir modal nommé, fermeture interne, boucle Tab, carte inerte et retour du focus. Fiche basse ; focus à l'ouverture et restitution à la fermeture. |
| États et notifications | `EmptyState`, provenance, alertes, erreurs de démarrage et reconnexion existent. Chargement initial et historique uniquement textuels. | Conserver les états réels et leurs actions ; skeletons non bloquants, recherche vide actionnable, erreurs distinctes, diagnostic refermable. |
| Icônes | Mélange de caractères `☰`, `✕`, `▾` et ponctuation dans l'aide. | Petit composant `Icon` SVG interne : même trait et géométrie, sans dépendance ni chargement externe. |

L'aspect initial évoquait un outil d'administration technique par la typographie uniforme, les capitales, le bandeau violet très saturé, les cases compactes et les petites actions bordées. Ce n'est pas une application Bootstrap : aucun remplacement de framework n'est nécessaire. L'incohérence concerne surtout les niveaux d'information dans un même espace, plutôt que des divergences entre pages inexistantes.

Il n'existe pas de menu contextuel ni de moteur de notifications/toasts générique. Les alertes d'exploitation sont persistantes et reliées au diagnostic : elles restent plus adaptées qu'un toast éphémère pour une dégradation du flux.

## Direction et système de design

Sombre ardoise, accent menthe, surfaces opaques et profondeur légère. Le thème sombre existant est consolidé ; pas de second thème à maintenir. La provenance simulée reste explicite, mais le bandeau devient calme et lisible. Les couleurs cartographiques et la palette daltonisme gardent leur sens métier.

Source de vérité : `frontend/src/styles.css`, premier bloc `:root`.

| Rôle | Token | Valeur |
| --- | --- | --- |
| Fond | `--bg` | `#0e141b` |
| Surface | `--panel` | `#171f29` |
| Surface élevée | `--surface-elevated` | `#1d2834` |
| Survol | `--surface-hover` | `#253342` |
| Bordure | `--panel-border` | `#2b3948` |
| Texte | `--text` | `#edf3f8` |
| Texte secondaire | `--text-muted` | `#a5b4c4` |
| Accent | `--accent` | `#89dfc5` |
| Fond d'accent | `--accent-soft` | `#203c39` |
| Succès | `--ok` | `#89dfb2` |
| Avertissement | `--warn` | `#f1c478` |
| Danger | `--danger` | `#ff9f9a` |
| Information | `--info` | `#91c8f6` |

Espacements : `--space-1/2/3/4/6/8/12/16` = 4/8/12/16/24/32/48/64 px. Rayons : `--radius-sm`, `--radius`, `--radius-lg` = 6/10/14 px. Typographie : caption 12, small 13, body 14, section 16, title 22 et display 28 px. Les références de carte et badges de provenance conservent une taille spécialisée de 11 px. Police système avec Inter / Noto Sans si installées, sans téléchargement bloquant. Nombres tabulaires, valeurs alignées, textes secondaires contrastés.

Interactions usuelles : `--duration` = 180 ms, accordéons et tiroir 200 ms. Les animations de données existantes restent inchangées. `prefers-reduced-motion` et le réglage utilisateur neutralisent les transitions et skeletons. Focus visible de 2 px ; textes, contours, motifs et intitulés complètent la couleur.

## Priorités implémentées

| Priorité | Livraison |
| --- | --- |
| P0 | Tokens, surfaces, typographie, identité, structure d'en-tête, layout desktop/laptop/tablette/mobile, champs et boutons communs, focus visible. |
| P1 | Groupes de couches, préférences repliables, recherche et état vide, fiche et tableau de gare, listes, diagnostic refermable, aide, skeletons et graphique responsive. |
| P2 | Iconographie unifiée, transitions sobres, mouvement réduit, contrôles MapLibre accordés au thème, confinement/restauration du focus, références visuelles et vérifications multi-écrans. |

Réutilisés : `Section`, `EmptyState`, listes métier, sparklines, moteur de visite, dialogue natif, alertes et mécanismes de présence. Refondus : habillage global, `TopBar`, `SidePanel`, `SearchBox`, `StationDetail`, `DiagnosticPanel`. Ajout : `Icon`. Supprimés : badges de métadonnées ordinaires et caractères typographiques employés comme icônes. Pas de nouvelle bibliothèque, ni de changement des dépendances.

## États et invariants

- Chargement : squelette initial et historique, libellés accessibles ; volume réservé pour limiter les sauts.
- Vide : conserver les causes et actions métier des flux, du classement et des estimations ; recherche sans résultat avec aide et effacement.
- Partiel / indisponible : conserver couverture de l'historique, liste tronquée, disponibilité des tronçons et provenance inconnue.
- Succès : état de connexion textuel et retour visuel sur sélection/action, sans toast artificiel.
- Avertissement / erreur / déconnexion : conserver `AlertBanner`, état de fraîcheur, message de reconnexion et action de diagnostic ; erreur de démarrage avec Réessayer. Le transport reste responsable de la reconnexion.
- Permissions : connexion et redirection OIDC préservées ; aucun nouveau privilège ni accès administrateur introduit.
- Données : mêmes agrégations, seuil de 3 véhicules, calculs, sources, abonnements, filtres et paramètres URL. Aucune métrique, tendance ou comparaison fictive ajoutée.

## Validation

Voir [verification.md](verification.md) pour les commandes exécutées, les résultats et les limites. Les snapshots portent sur le HTML stable, pas sur les pixels de la carte WebGL ni sur les compteurs simulés aléatoires.
