# Certificats d'autorité supplémentaires (réseau d'entreprise)

Derrière un proxy qui **intercepte le TLS** (réseau d'entreprise), la construction de l'image échoue avec
`tls: failed to verify certificate: x509: certificate signed by unknown authority` (téléchargement des modules Go de `pmtiles`).

Déposer ici le certificat racine du proxy, au format PEM, avec l'extension **`.crt`** (par exemple `entreprise.crt`) :
`docker compose --profile tiles build tiles` l'installe dans les deux étapes de l'image (compilation Go, puis outils).
Les fichiers `*.crt` et `*.pem` de ce dossier ne sont **jamais versionnés** (`.gitignore`).

Obtenir le certificat : export depuis le navigateur (cadenas → certificat → racine), ou auprès du service informatique.
