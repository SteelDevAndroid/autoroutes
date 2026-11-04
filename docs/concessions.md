# Filtre par concession autoroutière

Le panneau « Explorer le réseau » permet de sélectionner une société concessionnaire et de mettre en évidence les tronçons de cette société sur la carte.

## Source et limites

La génération `cartographie/prepare_motorways.py` ajoute la propriété `concession` aux tuiles vectorielles à partir des tags explicites `operator` / `concessionnaire` / `concessionaire` d'OpenStreetMap. Le filtre ne déduit **jamais** la société d'un simple numéro d'autoroute : plusieurs concessionnaires peuvent exploiter différentes sections d'une même autoroute.

**Important : ce premier raccordement n'est pas un référentiel exhaustif.** Les voies qui ne portent pas ces tags OSM ne sont pas mises en valeur, même si elles sont concédées. Le jeu officiel « Gares de péage du réseau routier national concédé » identifie les gestionnaires **des gares** et ne constitue pas à lui seul la géométrie contractuelle des concessions : https://www.data.gouv.fr/datasets/gares-de-peage-du-reseau-routier-national-concede

Pour une couverture exhaustive, intégrer le découpage géographique officiel des sections de concession, faire une jointure spatiale avec les segments OSM et contrôler les limites de concession, y compris sur les axes à gestionnaires multiples. Une jointure par seul numéro d'autoroute serait incorrecte.

## Production

La mise à jour de `prepare_motorways.py` n'affecte les données que **lors de la régénération des tuiles** `motorways.pmtiles`. Les anciennes tuiles ne comportent pas la propriété `concession` et le sélecteur ne peut donc rien mettre en évidence avec celles-ci. Une fois les nouvelles tuiles produites, les tronçons sans valeur connue demeurent neutres.
