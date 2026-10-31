# Espace cartographique contextuel

Cette itération traite les suggestions 3, 2, 5 et 6.

- Les filtres actifs quittent le panneau latéral pour une surface de lecture au-dessus de la carte. Chaque capsule précise sa portée (carte, axe, flux ou liste). La remise à zéro retire les filtres actuellement représentés ; elle conserve l'apparence, la sélection et les données.
- La fiche présente l'état de réception puis les chiffres clés. Les périodes détaillées et l'historique sont dépliables. Aucune tendance n'est inventée lorsque la source ne fournit pas d'historique.
- Sur petit écran, recherche et couches/filtres sont accessibles directement sur la carte. La légende conserve son contrôle existant. L'ouverture du panneau ferme la sélection et le diagnostic. La fiche devient un panneau inférieur avec deux hauteurs, réglables par bouton au clavier ou au toucher.
- Le statut distingue la connexion initiale d'une reconnexion après réception de données. L'heure de dernière mise à jour reste visible, avec une mention de conservation des données en cas de coupure. Les états périmé/rattrapage/relecture restent ceux du protocole existant.

Les nouvelles surfaces utilisent les tokens existants, sans ajouter de filtre de flou ni de dépendance. Les traitements serveur, les mesures et la politique de reconnexion restent inchangés. La remise à zéro concerne les capsules visibles et ne réinitialise pas les préférences de couches.

Vérification : types, lint, tests de composants (réinitialisation, état de connexion, exclusivité des panneaux), parcours navigateur desktop/mobile et comparaison visuelle. Safari/iOS et le profilage GPU sur appareil physique restent à vérifier séparément.
