# Interface : refonte du panneau latéral et des flux O/D

Suite aux suggestions UI/UX. Six changements, tous côté frontend (aucune modification de l'API).

| # | Changement | Détail |
|---|---|---|
| 1 | **Sections repliables** | Le panneau latéral est un accordéon (`Section`) : « Couches et gares », « Flux O/D », « Charge estimée », « Légende ». Une seule section est ouverte à la fois, donc le panneau tient dans l'écran quel que soit le nombre de couches actives. Activer une couche à section propre (flux O/D, charge estimée) ouvre sa section. Les sections portent `aria-expanded` et `aria-controls`. |
| 1 | **Relecture en barre de lecture** | Elle quitte le panneau pour le pied de la carte : un bouton « Relecture » qui déploie début, durée, vitesse ; pendant la relecture, lecture/pause, vitesse, **barre d'avancement**, heure virtuelle et « Retour au direct ». |
| 2 | **Flux internes masqués par défaut** | Au niveau départements, les flux d'un département vers lui-même dominaient la liste sans être tracés. Ils sont masqués (case « Inclure les flux internes », compteur « N flux internes masqués »). La mention « observé » est portée une seule fois, par l'en-tête de section. |
| 3 | **Liste ↔ carte** | Survoler ou focaliser une ligne met en évidence son arc (plus épais, les autres s'estompent, par `feature-state`) ; cliquer cadre la carte sur les deux extrémités. Les lignes sont des boutons : tout est faisable au clavier. |
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
