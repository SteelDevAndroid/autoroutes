# Interface : refonte du panneau latéral et des flux O/D

Ce document conserve les étapes successives de l'interface ; les décomptes de tests de chaque étape sont historiques.
Le [guide de la carte du trafic](animation-trafic.md) décrit le comportement actuel des itinéraires, du zoom,
de la densité, de la fraîcheur et de la reprise des animations.

Suite aux suggestions UI/UX. Six changements, tous côté frontend (aucune modification de l'API).

| # | Changement | Détail |
|---|---|---|
| 1 | **Sections repliables** | Le panneau latéral est un accordéon (`Section`) : « Couches et gares », « Flux O/D », « Charge estimée », « Légende ». Une seule section est ouverte à la fois, donc le panneau tient dans l'écran quel que soit le nombre de couches actives. Activer une couche à section propre (flux O/D, charge estimée) ouvre sa section. Les sections portent `aria-expanded` et `aria-controls`. |
| 1 | **Relecture en barre de lecture** | Elle quitte le panneau pour le pied de la carte : un bouton « Relecture » qui déploie début, durée, vitesse ; pendant la relecture, lecture/pause, vitesse, **barre d'avancement**, heure virtuelle et « Retour au direct ». |
| 2 | **Flux internes masqués par défaut** | Au niveau départements, les flux d'un département vers lui-même dominaient la liste sans être tracés. Ils sont masqués (case « Inclure les flux internes », compteur « N flux internes masqués »). La mention « observé » est portée une seule fois, par l'en-tête de section. |
| 3 | **Liste ↔ carte** | Survoler ou focaliser une ligne met en évidence son tracé (plus épais, les autres s'estompent, par `feature-state`) ; cliquer cadre tout l'itinéraire, détours compris. Les lignes sont des boutons : tout est faisable au clavier. |
| 4 | **États vides et erreurs utiles** | Chaque vide propose l'issue adaptée : afficher les flux internes, retirer les filtres, ou passer par départements. L'erreur O/D propose « Réessayer ». L'absence d'estimation de charge explique ses deux causes possibles et renvoie à la procédure. |
| 6 | **Légende contextuelle** | Une ligne par couche affichée, avec sa nature (observé ou estimé) ; l'avertissement sur le trafic non mesuré n'apparaît qu'avec les flux ou la charge. |
| 8 | **Info-bulle au survol d'une gare** | Nom, type et axe, passages sur 15 min, dernier passage ou « données périmées », sans cliquer. Un seul événement par image d'animation ; positionnée pour ne pas sortir de la carte. |

## Vérifications

- 97 tests Vitest (dont des tests de composants : accordéon, listes, états vides, relecture, info-bulle ; et les calculs purs : légende, avancement, position de l'info-bulle, filtrage des flux internes).
- E2E de démonstration (5 scénarios, dont l'info-bulle, la légende contextuelle, l'axe-core sans violation grave) et E2E réels (5 scénarios, dont le masquage des flux internes) verts.
- Vérifié visuellement sur la pile réelle (captures) : panneau dans l'écran à 1 440 × 900, barre de relecture, mise en évidence puis cadrage d'un flux.

## Limites

- Le comportement « une section à la fois » ferme « Couches et gares » quand on ouvre les flux O/D : il faut rouvrir la section pour décocher une couche. Choix assumé en échange de la tenue en hauteur.
- Rendu jugé sans fond de carte (tuiles OSM non disponibles ici) : le contraste des arcs mis en évidence reste à revoir sur le vrai fond.
- Écrans étroits : la barre de relecture passe à la ligne ; le panneau latéral en tiroir (suggestion 11) n'est pas fait.

---

# Suite : tiroir sur petit écran, visite guidée et aide

| # | Changement | Détail |
|---|---|---|
| 11 | **Panneau en tiroir** | Sous 900 px, le panneau latéral devient un tiroir ouvert par un bouton « ☰ » de la barre du haut (`aria-expanded`, `aria-controls`). Fermé, il est retiré de l'ordre de tabulation (`visibility`). Ouverture : le focus va à la recherche ; Échap ou un clic sur le fond le ferme et rend le focus au bouton ; choisir une gare ou un flux le ferme pour montrer la carte. Retour en grand écran : il se referme. Le détail d'une gare devient une feuille bornée à 55 % de la hauteur ; les indicateurs secondaires de la barre du haut sont masqués ; `prefers-reduced-motion` supprime la glissière. |
| 12 | **Page « À propos des données »** | Bouton « ? Aide » : une boîte de dialogue native (focus piégé, Échap) qui rassemble ce qui était dispersé en notes : ce que l'on voit, observé ou estimé, le seuil de 3 véhicules, ce qui n'est pas mesuré, la fraîcheur, la relecture, les sources. Elle a une adresse partageable, **`#a-propos`**, et le bouton « précédent » la referme. |
| 12 | **Visite guidée** | Proposée à la première visite (cinq étapes : carte, fraîcheur, panneau, relecture, aide ; les étapes dont la cible n'existe pas, comme la relecture en démonstration, sont sautées). Chaque étape met en évidence son élément et place sa carte près de lui sans sortir de l'écran ; sur téléphone, l'étape du panneau ouvre le tiroir. Passer, Échap ou Terminer la mémorisent (`localStorage`, avec repli si le stockage est refusé) ; elle se relance depuis l'aide. Jamais proposée quand l'aide est ouverte par son adresse. |

## Vérifications

- 112 tests Vitest (placement de la carte de visite, mémorisation et repli du stockage, parcours, saut des cibles absentes, ouverture du tiroir par la visite, aide, bouton du tiroir).
- E2E de démonstration, réels et d'authentification verts ; nouveaux scénarios `tour.spec.ts` (parcours, mémorisation, Échap, `#a-propos`, téléphone) et `responsive.spec.ts` (tiroir : fermé par défaut, focus, Échap, fond, choix d'une gare ; pas de défilement horizontal ; axe-core ; grand écran sans bouton).
- Les scénarios existants partent d'un navigateur où la visite est déjà faite (`e2e/fixtures.ts`) ; seul `tour.spec.ts` teste la visite.
- Vérifié visuellement (captures à 1 440 × 900 et 390 × 844).

## Limites

- La visite et l'aide sont en français uniquement, comme le reste de l'interface.
- Les textes de l'aide décrivent l'état actuel du produit (seuil, fenêtres de retard, relecture sur 7 jours) : à tenir à jour avec lui.
- Tablette en paysage entre 900 et 1 100 px : le panneau reste fixe à 300 px ; non revu.

---

# Noms des autoroutes sur la carte

Étiquettes « A7 », « A6 »… posées sur la carte, qui mettent l'axe en évidence et s'accordent avec le filtre « Axe » des flux O/D.

| Élément | Choix |
|---|---|
| Source | Le référentiel des gares porte l'axe de chaque gare (`A0007`, `A0007N`, `N0159`). Les codes d'une même autoroute sont **regroupés** (A0007 et A0007N → « A7 »). Aucune tuile ni police n'est nécessaire : les étiquettes sont des éléments HTML posés sur de vraies gares de l'axe. |
| Placement | Une étiquette par axe à l'échelle du pays, davantage en zoomant (1, 2, 3, 5 puis 8 par axe), réparties le long de l'axe ; évitement des collisions en gardant les axes les mieux fournis en gares. Recalcul à chaque fin de déplacement, marqueurs conservés (pas de clignotement). |
| Survol | Les gares de l'axe reçoivent un anneau, les autres s'estompent ; l'étiquette s'illumine. |
| Clic | Applique le filtre **Axe** des flux O/D (la valeur regroupe tous les codes de l'axe), active la couche des flux et ouvre sa section ; un second clic retire le filtre. Choisir un axe dans la liste du panneau produit la même mise en évidence : liste et carte sont liées dans les deux sens. |
| Panneau | Case « Noms des autoroutes » (affichés par défaut), ligne dédiée dans la légende ; la liste « Axe » affiche « A7 » au lieu de « A0007 » ; les gares (info-bulle, détail) affichent aussi les noms usuels. |
| Accessibilité | Étiquettes `aria-hidden` (aide à la souris et au toucher) ; le clavier et les lecteurs d'écran passent par la liste « Axe » du panneau. |
| Couche native | Quand les tuiles OSM seront produites, la couche native de références (`motorways-ref`) est masquée tant que ces étiquettes sont affichées, pour éviter les doublons. |

## Vérifications

- 131 tests Vitest (regroupement des codes, libellés, répartition le long de l'axe, évitement de collision et priorité, nombre d'étiquettes selon le zoom, sélection par clic et second clic, liste « Axe » regroupée).
- E2E de démonstration (étiquettes posées, survol, sélection, masquage, légende) et E2E réel : le clic sur un nom émet bien la requête `/api/v1/od?…axis=…` et la liste « Axe » prend la valeur.
- Vérifié visuellement (captures) : étiquettes lisibles à l'échelle du pays ; survol de l'A7 : gares de l'axe cerclées, autres estompées.

## Limites

- Les étiquettes sont placées **sur des gares** et non sur le tracé : sur un axe peu pourvu en gares, le nom est approximatif. Elles seront remplacées par la couche native quand le tracé OSM existera.
- En démonstration, le clic met l'axe en évidence mais ne filtre pas les flux (le filtre est appliqué par le serveur ; le flux simulé du navigateur n'en tient pas compte).
- Les routes nationales du référentiel (N159, N523…) sont étiquetées comme les autoroutes.

---

# Recherche, fiche de gare, légende chiffrée et gares les plus actives

| Élément | Choix |
|---|---|
| Recherche | Un seul champ pour les **gares** (nom, sans accents ni casse) et les **autoroutes** (« A7 », « a 07 », « A0007 »). Axes d'abord quand le texte en désigne un, puis noms commençant par le texte, puis noms le contenant ou gares de l'axe ; 12 résultats au plus, chacun avec son axe et son département. Gare : cadrage et fiche. Autoroute : filtre « Axe » posé (jamais retiré par une seconde recherche), couche des flux activée, carte cadrée sur les gares de l'axe. |
| Clavier | `/` met le focus sur le champ (ouvre le tiroir sur petit écran), sauf pendant une saisie ou devant une fenêtre ; ↓ descend dans les résultats, ↑ remonte, Entrée ouvre le premier, Échap vide. |
| Retour | Après la recherche d'une autoroute, une **puce** en haut de la carte (« Revenir à la vue d'ensemble », ou Échap) défait tout : filtre « Axe » retiré, couche des flux rétablie dans son état d'avant (éteinte si la recherche l'avait allumée), carte recadrée sur la France. Une seconde recherche garde l'état d'origine ; si le filtre est changé à la main entre-temps, la puce disparaît sans rien défaire. |
| Fiche de gare | La fiche (fenêtres 5 min à aujourd'hui, courbe J / J-7) gagne les **principaux flux** de la gare (5 au plus, « Vers » / « Depuis »), lus dans la liste déjà chargée : mêmes filtres et même seuil de 3 véhicules que la section « Flux O/D », survol = arc mis en évidence, clic = carte cadrée. Sans la couche des flux, un bouton l'affiche ; au niveau départements, la fiche l'explique. |
| Légende | La charge estimée a une **échelle continue** (dégradé de la carte, repères 0 / moitié / maximum, « ≥ » pour le plafond). La référence commune à la carte et à la légende est fixée au 95ᵉ centile arrondi de la première estimation positive de la session, puis conservée tant que le graphe et l'algorithme restent identiques. L'estimation reste signalée par ses tirets. |
| Gares les plus actives | Section « Gares les plus actives » (observé) : 8 gares au plus, classées sur 1 h, rafraîchies toutes les 10 s, avec une **courbe** des 3 dernières heures par quart d'heure (historique du serveur, rechargée toutes les minutes) ; chiffre sans courbe en démonstration et en relecture. Texte accessible : maximum et sens (hausse, baisse, stable à ±10 %). |

## Vérifications

- 167 tests Vitest dont le retour à la vue d'ensemble, la recherche (accents, graphies d'axe, classement, plafond), le clavier, les courbes, le classement, les flux de gare, l'échelle de légende.
- E2E de démonstration : `/` puis « a7 » + Entrée, et la section des gares les plus actives jusqu'à la fiche.

## Limites

- **Pas de répartition par classe de véhicule** dans la fiche : le flux temps réel ne la porte pas. Les principaux flux dépendent de la couche et des filtres de la section « Flux O/D » (au plus 500 flux lus par l'API).
- Pas de courbe par flux ni par autoroute : l'historique est par gare ; les « autoroutes les plus actives » avec courbe demanderaient un endpoint d'agrégation.
- En démonstration, l'historique n'existe pas : le classement n'a pas de courbes.

---

# Liens partageables, alertes d'exploitation, palette daltonisme, régression visuelle

| Élément | Choix |
|---|---|
| Liens partageables | L'adresse reflète ce que l'on regarde : `?gare=<id>`, `axe=<codes>`, `flux=1`, `troncons=1`, `niveau=DEPARTMENT`, `dept=`, `role=`. L'ouvrir reproduit l'affichage (gare ouverte et cadrée, autoroute filtrée avec sa puce de retour). La gare et l'autoroute ajoutent une entrée d'historique (« précédent » revient à l'état d'avant) ; les autres réglages remplacent l'entrée courante. Lecture tolérante : paramètre inconnu, mal formé ou gare absente du référentiel = ignoré (un vieux lien s'ouvre toujours), valeurs validées avant d'atteindre l'API. Ne se partagent pas : la relecture, les sections ouvertes, la vue de la carte. Implémentation : `state/urlState.ts` (pur), `state/urlSync.ts`. |
| Alertes d'exploitation | Bandeau sous la barre du haut, déduit de ce que l'interface reçoit déjà (fraîcheur et couverture O/D du flux SSE), sans appel supplémentaire : connexion perdue (après 5 s de grâce), données périmées, rattrapage, ≥ 5 % de gares sans données, origine connue < 90 % des sorties (seuil des règles Prometheus, au moins 100 sorties). Critique = `role="alert"` ; avertissement = région `aria-live="polite"`. Muet en relecture. Icône et texte doublent la couleur ; bouton « Diagnostic ». Les alertes Prometheus restent la référence (Alertmanager) : le bandeau est le rappel visible. |
| Palette daltonisme | Case « Couleurs adaptées au daltonisme » (mémorisée dans le navigateur) : bleu ciel (échangeurs) contre vermillon (pleine voie, qui garde son contour épais), violet rougeâtre pour les flux, états en bleu / orange / orange vif au lieu de vert / ambre / rouge (couleurs de Okabe et Ito). Appliquée à chaud à la carte (`setPaintProperty`) et à la légende ; la rampe des tronçons (bleu → jaune, ordonnée en luminosité) est déjà sûre. « Réduire les animations » suit désormais le réglage du système au départ. |
| Contrastes | Un test lit les variables de `styles.css` et vérifie le contraste WCAG AA (4,5:1) du texte et des états sur le fond et les panneaux, dans les deux palettes ; il vérifie aussi que les deux types de gares restent distincts par la luminosité et visibles sur le fond. |
| Régression visuelle | `e2e/visual.spec.ts` compare des captures de l'interface HTML aux références de `e2e/visual.spec.ts-snapshots/` : panneau par défaut, légende (flux et tronçons), résultats de recherche, puce d'autoroute, en-tête de fiche, panneau en palette daltonisme, tiroir sur petit écran. **La carte WebGL n'est jamais comparée** (rendu logiciel variable) et la police est forcée (Liberation Sans) ; tolérance de 1,5 % de pixels. Job CI « Régression visuelle », exécuté dans l'image Playwright officielle ; `npm run e2e:visual:docker` reproduit la comparaison à l'identique en local. |

## Mettre à jour les références visuelles

Un changement d'interface voulu fait échouer ce job : c'est son rôle. Les images attendue, obtenue et la différence sont dans l'artefact `visuel-ecarts`. Pour accepter le nouvel aspect : `npm run e2e:visual:update` dans `frontend/` (Node et Docker requis, quel que soit le système : les captures sont produites dans l'image `mcr.microsoft.com/playwright` du job CI, à la version de `@playwright/test`), ou lancer le workflow CI à la demande avec **update_snapshots** et télécharger l'artefact `visuel-references` ; puis relire les images dans la PR avant de committer.

## Vérifications

- 200 tests Vitest (URL : lecture, écriture, historique, retour ; alertes ; palette, contrastes, stockage ; bandeau ; légende).
- E2E de démonstration : lien de gare rouvert dans un autre onglet et « précédent », lien d'autoroute, palette mémorisée au rechargement.
- Régression visuelle : 7 captures, exécutées 5 fois de suite sans écart en local.

## Limites

- Les références sont produites sous Linux avec le Chromium de ce poste ; si la CI (navigateur Playwright) en diffère, les régénérer par le workflow à la demande.
- Les captures n'incluent ni les chiffres simulés ni la carte : un défaut propre à la carte (couleur d'une couche, étiquettes) n'est pas couvert, seulement le HTML.
- Le bandeau ne lit pas le diagnostic du serveur (quarantaine, rejets) : ces indicateurs restent dans Prometheus et le panneau « Diagnostic ».

---

# Animations

Rien ne bougeait hors des cercles des gares (changement de taille en 800 ms, halo à chaque nouveau passage) et du tiroir mobile. Sept animations s'y ajoutent ; **toutes** sont coupées par « Réduire les animations » (réglage du système pris en compte au départ), et les transitions de l'interface passent par l'attribut `data-reduced-motion` de la racine (feuille de style).

| # | Animation | Choix |
|---|---|---|
| 1 | Flux O/D animés | Des tirets de largeur constante avancent **dans le sens origine → destination**, sur les itinéraires estimés ou les arcs schématiques. Trois couches `od-flows-motion-low/medium/high` représentent la densité de volume ; les motifs avancent au même rythme, avec des pas de 40 ms (`animation/flowMotion.ts`). Seul l'axe sélectionné est animé : flux moyens et forts dès le zoom 6, petits flux dès le zoom 8. Les données périmées, le rattrapage et les coupures figent les tirets ; la reprise attend une nouvelle confirmation de fraîcheur et conserve la phase. Mouvement réduit, onglet masqué et qualité dégradée restent pris en compte. Voir le [guide actuel](animation-trafic.md). |
| 2 | Fondu des flux et des tronçons | Un flux qui apparaît monte de 0 à 1 en 300 ms ; un flux qui disparaît garde sa géométrie le temps de son fondu (`animation/presence.ts`). Les charges de tronçons passent de l'estimation précédente à la suivante en 500 ms (`animation/loadTween.ts`) ; au-delà de 2 500 tronçons modifiés, application directe (animer autant d'états par image coûterait plus que le fondu n'apporte). |
| 3 | Cadrage adaptatif | Durée du déplacement de caméra selon la distance (500 ms pour un voisin, logarithmique, 2,2 s au plus, `animation/flight.ts`) pour la fiche, l'autoroute, le flux et « Vue France entière » ; instantané en mouvement réduit. |
| 4 | Compteurs | Les trois chiffres de la barre du haut glissent de l'ancienne à la nouvelle valeur en 400 ms. Le premier affichage et le départ de zéro sont immédiats (compter depuis 0 n'apprend rien). Le texte animé est `aria-hidden` ; un texte caché donne la valeur finale aux lecteurs d'écran. |
| 5 | Entrées et sorties | Fiche de gare, puce d'autoroute et bandeau d'alertes entrent en glissant (180 ms) et sortent en fondu (150 ms) : `usePresenceValue` garde la dernière valeur le temps de la sortie ; le bouton de la puce est désactivé pendant la sortie. |
| 6 | Accordéon fluide | Les sections du panneau se replient par la hauteur (`grid-template-rows`, 200 ms). Le contenu reste monté (état conservé) et `inert` quand la section est fermée : retiré du clavier et des lecteurs d'écran. |
| 7 | Changement signalé | Un fond qui s'estompe une fois (1,6 s) sur un flux qui entre dans une liste (« Flux O/D », fiche de gare) ou une gare qui entre dans « Gares les plus actives ». Rien au premier affichage ni à partir d'une liste vide. |

## Vérifications

- 224 tests Vitest : motifs de tirets (longueur constante, avance vers l'aval), fondus (entrée, sortie, retour pendant la sortie, durée nulle), fondu des tronçons (montée, descente puis retrait, reprise sans saut), durée de déplacement, compteurs (premier affichage, depuis zéro, mouvement réduit), présence, signalement des nouveautés, accordéon.
- E2E de démonstration : tirets actifs avec les flux puis coupés et rétablis par « Réduire les animations », sections repliées hors d'atteinte, sortie de la fiche. Les 7 captures de régression visuelle sont inchangées (animations figées, panneau identique).
- Vérifié à l'écran : arcs de flux avec leur motif de tirets sur la démonstration.

## Limites

- Le mouvement des tirets est une animation du navigateur, non rejouable dans les captures ; le contrôle automatique porte sur l'état (`data-flow-motion`) et la séquence de motifs, pas sur l'aspect image par image.
- Les motifs des couches visibles sont mis à jour au plus 25 fois par seconde, uniquement lorsque le mouvement est autorisé. Les tirets s'éteignent d'abord quand la qualité de rendu se dégrade.
- Les tronçons du fond OSM ne font pas l'objet d'un fondu à l'apparition des tuiles (comportement de MapLibre).
