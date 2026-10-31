# Système de surfaces spatiales

## Audit de départ

Base : `1e959d3`, interface cartographique React/MapLibre, sans `AGENTS.md` applicable. Le parcours existant est conservé : provenance et fraîcheur → recherche d'une gare ou d'un axe → lecture du trafic → retour à la vue nationale.

| Constat | Décision réalisée |
| --- | --- |
| En-tête, panneau latéral et carte jointifs | Plans séparés, gouttières de 12–16 px, panneaux de 24 px de rayon. |
| Indicateurs uniformes et bordés | Entrées/sorties prioritaires, surfaces de lecture presque opaques, indicateurs secondaires plus discrets. |
| Contours omniprésents dans les groupes | Sections fermées sans carte de fond ; seule la section ouverte reçoit une surface et une élévation légère. |
| Sélections colorées très présentes | Surface lumineuse neutre, relief intérieur ; accent menthe réservé aux actions et aux contrôles. |
| Recherche qui pousse le contenu | Capsule stable, résultats dans un popover flottant, raccourci `/` et navigation clavier conservés. |
| Un seul niveau d'ombre et de rayon | Matériaux, élévations et rayons par rôle. |
| Thème uniquement sombre | Habillage clair, sombre ou automatique, choix persistant et appliqué avant le montage. |
| Dialogues et tiroir fortement assombris | Fond atténué à 16 %, blur de 4 px, matière épaisse au premier plan. |

La carte suit désormais les apparences claire et sombre, avec des palettes métier et des sprites adaptés : voir [Fond clair et réutilisation cartographique en CI](fond-clair-et-ci.md). La préférence d'apparence reste indépendante du choix de palette daltonisme. Les chiffres, graphiques, tableaux et listes gardent une matière presque opaque.

## Tokens

Source de vérité : [`design-tokens.css`](../../frontend/src/design-tokens.css). Habillage et responsive : [`spatial.css`](../../frontend/src/spatial.css).

| Famille | Tokens et valeurs principales |
| --- | --- |
| Environnement | `--bg`, `--environment` ; base froide `#eef2f7`, halos bleus/violets faibles ; sombre `#0d1118`. |
| Matières claires | `--material-base` à 96 %, `--glass-thin-bg` à 42 %, `--glass-regular-bg` à 60 %, `--glass-thick-bg` à 92 %. |
| Matières sombres | Base à 96 %, thin à 58 %, regular à 70 %, thick à 86 % ; surfaces graphite. |
| Traitement optique | `--blur-thin/regular/thick` = 14/22/34 px ; `--saturation-thin/regular/thick` = 150/160/175 %, regular sombre 145 %. |
| Lumière | `--glass-border`, `--glass-border-strong`, `--glass-highlight`, `--glass-reflection`. Reflet haut via un dégradé de surface, sans pseudo-élément bloquant les interactions. |
| Élévation | `--depth-0/1/2/3` ; ombres diffuses de 0 à 28/80 px, adaptées au sombre. |
| Rayons | `--radius-control/card/panel/modal` = 12/20/24/28 px ; popovers 16 px, recherche en capsule. |
| Couleurs sémantiques | `--text`, `--text-muted`, `--accent`, `--accent-contrast`, `--accent-soft`, `--ok/warn/danger/info`, `--simulated/replay`. Variantes daltonisme distinctes pour chaque apparence. |
| Contrôles | `--input-bg`, `--surface-selected`, `--surface-hover`, `--focus-ring`, `--panel-border`. |
| Rythme | Espaces 4/8/12/16/20/24/32/40/48/64 px ; échelle typographique 12/13/14/16/22/28 px. |
| Mouvement | `--duration` 180 ms, `--ease-spatial` = `cubic-bezier(.2,.8,.2,1)` ; pression 100 ms, dialogue 220 ms. |

Les panneaux situés sur la carte nécessitent plus d'opacité que ceux posés sur le fond lumineux : 92 % pour le matériau épais clair, 94 % du panneau pour la légende. Ce choix préserve le texte secondaire devant un fond presque noir et des marqueurs animés.

## Primitives et composants

[`Spatial.tsx`](../../frontend/src/ui/Spatial.tsx) expose les primitives réutilisables :

- `GlassSurface`, `GlassCard`, `GlassPanel`, `GlassSidebar`, `GlassHeader`, `GlassPopover`, `GlassModal`, `FloatingToolbar`, `SpatialButton`, `SpatialInput`.
- Surfaces : `material="base|thin|regular|thick"` et `depth="flat|raised|floating"`.
- Attributs HTML, événements, noms accessibles et références natifs conservés. Le modal reste un `<dialog>` natif ; aucun nouveau moteur de focus.

| Composant | Matière / changement |
| --- | --- |
| `TopBar` | `GlassHeader` thin, hiérarchie des mesures, actions compactes. |
| `SidePanel` | `GlassSidebar` regular, navigation flottante, préférences d'apparence. |
| `Section` | `GlassCard` base/flat, groupe actif mis en lumière. |
| `SearchBox` | `SpatialInput`, `GlassPopover` thick, résultats superposés. |
| `StationDetail`, `DiagnosticPanel` | `GlassPanel` thick/floating, zones chiffrées opaques. |
| `MapLegend` | `GlassPanel` regular, opacité contextuelle renforcée. |
| `ReplayBar` | `FloatingToolbar` thin ; commandes et validation inchangées. |
| `AboutDialog` | `GlassModal` thick/floating ; focus, Échap et adresse partageable conservés. |
| `Tour` | `GlassSurface` thick/floating, atténuation légère. |
| `Appearance` | Choix clair/sombre/automatique indépendant du store métier ; persistance tolérante à un stockage refusé. |

Les styles partagés modernisent également boutons, champs, filtres, indicateurs, tableaux, états vides, infobulles, alertes et contrôles MapLibre. Pas de nouvelle dépendance.

## Décisions UX et accessibilité

- Un seul espace cartographique : pas de dashboard Bento artificiel qui réduirait la carte. La hiérarchie est portée par les mesures et les panneaux contextuels.
- Pas de défilement global : en-tête toujours visible dans la grille, recherche et outils stables, sections latérales défilantes. Un comportement sticky au scroll de page n'aurait ici aucun effet utile.
- Sur mobile, tiroir opaque détaché des bords, fond inerte, boucle Tab, Échap et restitution du focus. Les panneaux contextuels restent au premier plan.
- Pas de tilt 3D. Survol de 1 px, pression à `.985`, transitions courtes ; listes sans transformations qui déplaceraient leurs cibles.
- Focus visible, texte sémantique pour les états, palette daltonisme, mouvement réduit système et utilisateur conservés. Fallback opaque sans `backdrop-filter`, option système de transparence réduite prise en charge.

## Performance et limites

Le blur s'applique aux panneaux parents, jamais aux lignes, boutons, KPI ou cartes de données. Au repos en démonstration desktop, trois surfaces principales sont floutées : en-tête, explorateur et légende. La recherche et l'aide ajoutent une surface contextuelle. Sur mobile, blur courant réduit à 10 px et explorateur opaque sans filtre.

Les halos du fond sont statiques : pas de boucle d'animation décorative ou de suivi permanent du pointeur. Aucun changement du moteur MapLibre, du rafraîchissement temps réel, des calculs ou des flux métier.

Le bundle de démonstration passe d'environ 16,94 à 19,66 kB gzip de CSS et de 416,42 à 417,30 kB gzip de JavaScript. L'avertissement de taille MapLibre préexistant subsiste. Ces mesures de poids ne sont pas une mesure de fluidité GPU ; les fréquences d'images sur appareils physiques restent à profiler.

## Seconde itération recommandée

1. Profilage GPU sur iPhone/Safari et Android de milieu de gamme, avec les tuiles réelles et plusieurs overlays ouverts.
2. Étendre la validation du fond cartographique clair aux appareils physiques et aux conditions de forte luminosité.
3. Validation utilisateur des indicateurs prioritaires et de la densité à faible hauteur d'écran.
4. Optimisation du chargement MapLibre par découpage de bundle, indépendamment de cette refonte.

La pile backend, l'authentification OIDC, Kafka et la relecture serveur ne sont pas lancés pour cette validation de présentation. Les contrôles automatisés ne constituent pas une certification WCAG complète.

## Aperçus et preuves

- [Interface initiale](spatial/desktop-avant.png).
- [Desktop clair](spatial/desktop-clair.png) et [desktop sombre](spatial/desktop-sombre.png).
- [Fiche claire](spatial/fiche-claire.png), [explorateur mobile](spatial/mobile-clair.png) et [fiche mobile sombre](spatial/mobile-fiche-sombre.png).
- [Audit axe-core sur 20 vues et états](spatial/audit-axe.json), hors canvas WebGL : aucun débordement horizontal ni violation signalée.
- [Commandes, résultats et limites de vérification](verification-spatiale.md).
