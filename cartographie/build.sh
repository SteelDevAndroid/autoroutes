#!/usr/bin/env bash
# Chaîne cartographique reproductible : fond PMTiles, polices et sprites, couche autoroutes et graphe routier.
# Usage (depuis la racine du dépôt) :
#   docker build -t autoroutes-cartographie cartographie
#   docker run --rm -v "$PWD:/repo" -e PROTOMAPS_BUILD=AAAAMMJJ autoroutes-cartographie
set -euo pipefail

REPO=${REPO:-/repo}
OUT=${OUT:-$REPO/cartographie/out}
WORK=${WORK:-$REPO/cartographie/work}
BBOX=${BBOX:--5.5,41.2,10.0,51.3}
BASEMAP_MAXZOOM=${BASEMAP_MAXZOOM:-14}
PROTOMAPS_BUILD=${PROTOMAPS_BUILD:?PROTOMAPS_BUILD requis : date AAAAMMJJ d’un build listé sur https://maps.protomaps.com/builds}
GEOFABRIK_URL=${GEOFABRIK_URL:-https://download.geofabrik.de/europe/france-latest.osm.pbf}
ASSETS_URL=${ASSETS_URL:-https://github.com/protomaps/basemaps-assets/archive/refs/heads/main.tar.gz}

mkdir -p "$OUT/tiles" "$OUT/basemaps-assets" "$OUT/graph" "$WORK"

echo "== 1/4 Fond de carte : extrait France du build Protomaps $PROTOMAPS_BUILD (z0–$BASEMAP_MAXZOOM)"
pmtiles extract "https://build.protomaps.com/$PROTOMAPS_BUILD.pmtiles" "$OUT/tiles/france.pmtiles" \
  --bbox="$BBOX" --maxzoom="$BASEMAP_MAXZOOM"

echo "== 2/4 Polices et sprites auto-hébergés"
curl -fsSL "$ASSETS_URL" | tar -xz -C "$WORK"
rm -rf "$OUT/basemaps-assets/fonts" "$OUT/basemaps-assets/sprites"
mkdir -p "$OUT/basemaps-assets/fonts"
FONTS="$WORK/basemaps-assets-main/fonts"
cp -r "$FONTS/Noto Sans Regular" "$FONTS/Noto Sans Medium" "$OUT/basemaps-assets/fonts/"
cp -r "$WORK"/basemaps-assets-main/sprites "$OUT/basemaps-assets/"

echo "== 3/4 Autoroutes OSM (motorway + motorway_link)"
curl -fsSL -z "$WORK/france.osm.pbf" -o "$WORK/france.osm.pbf" "$GEOFABRIK_URL"
osmium tags-filter "$WORK/france.osm.pbf" w/highway=motorway,motorway_link -o "$WORK/motorways.osm.pbf" --overwrite
osmium export "$WORK/motorways.osm.pbf" -f geojsonseq -a type,id --geometry-types=linestring \
  -o "$WORK/motorways.geojsonseq" --overwrite
python3 "$REPO/cartographie/prepare_motorways.py" "$WORK/motorways.geojsonseq" \
  "$REPO/referentiel/gares-logiques-proposition.csv" "$REPO/echangeurs-rrnc-2025.csv" "$WORK"
cp "$WORK/graph.json" "$OUT/graph/graph-$(date +%Y%m%d).json"

echo "== 4/4 Tuiles vectorielles des tronçons"
tippecanoe -o "$OUT/tiles/motorways.pmtiles" -l motorways --force \
  --minimum-zoom=4 --maximum-zoom=14 --simplification=4 \
  --no-feature-limit --no-tile-size-limit --attribution="© OpenStreetMap contributors (ODbL)" \
  "$WORK/segments.geojsonseq"

ls -lh "$OUT/tiles" "$OUT/graph"
