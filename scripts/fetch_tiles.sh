#!/usr/bin/env bash
# Récupère la dernière release « tuiles-AAAAMMJJ » produite par la CI et l'installe dans cartographie/out
# (fond et tronçons PMTiles, graphe routier, polices et sprites) : équivaut à « docker compose --profile tiles run --rm tiles », sans la production.
# Usage : scripts/fetch_tiles.sh [tuiles-AAAAMMJJ]        (sans argument : la plus récente)
# Variables : REPOSITORY (défaut SteelDevAndroid/autoroutes), GITHUB_TOKEN (dépôt privé ou limite de débit de l'API), OUT.
set -euo pipefail

REPOSITORY=${REPOSITORY:-SteelDevAndroid/autoroutes}
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
OUT=${OUT:-$ROOT/cartographie/out}
WANTED=${1:-}

auth=()
[ -n "${GITHUB_TOKEN:-}" ] && auth=(-H "Authorization: Bearer $GITHUB_TOKEN")

releases=$(curl -fsS "${auth[@]}" -H "Accept: application/vnd.github+json" "https://api.github.com/repos/$REPOSITORY/releases?per_page=50")
# Une ligne « tag<TAB>nom<TAB>url » par fichier de la release choisie (la plus récente dont le tag commence par « tuiles- »).
assets=$(WANTED=$WANTED python3 -c '
import json, os, sys
wanted = os.environ["WANTED"]
for release in json.load(sys.stdin):
    tag = release["tag_name"]
    if tag.startswith("tuiles-") and (wanted == "" or tag == wanted):
        for asset in release["assets"]:
            print(tag, asset["name"], asset["browser_download_url"], sep="\t")
        break
' <<< "$releases")
[ -n "$assets" ] || { echo "Aucune release « ${WANTED:-tuiles-*} » dans $REPOSITORY" >&2; exit 1; }

tag=$(head -1 <<< "$assets" | cut -f1)
download=$(mktemp -d)
trap 'rm -rf "$download"' EXIT
echo "== $tag"
while IFS=$'\t' read -r _ name url; do
  echo "  $name"
  curl -fSL --retry 3 "${auth[@]}" -o "$download/$name" "$url"
done <<< "$assets"

(cd "$download" && sha256sum --check --quiet SHA256SUMS)
mkdir -p "$OUT/tiles" "$OUT/graph"
mv "$download/france.pmtiles" "$download/motorways.pmtiles" "$OUT/tiles/"
rm -f "$OUT"/graph/graph-*.json
mv "$download"/graph-*.json "$OUT/graph/"
mv "$download/manifest.json" "$OUT/manifest.json"
rm -rf "$OUT/basemaps-assets"
tar -C "$OUT" -xzf "$download/basemaps-assets.tar.gz"
echo "Installé dans $OUT :"
ls -lh "$OUT/tiles" "$OUT/graph"
graph=$(basename "$(find "$OUT/graph" -name 'graph-*.json' | sort | tail -1)")
echo "Charge estimée des tronçons : ASSIGNMENT_GRAPH_FILE=/app/graph/$graph dans .env"
