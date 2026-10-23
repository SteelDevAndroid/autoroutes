#!/usr/bin/env python3
"""Contrôle de la production cartographique (cartographie/out) : le fond, les tronçons, le graphe et les ressources auto-hébergées.

Échoue (code 1) si un jeu de données est vide, tronqué ou sans rapport avec le référentiel des gares : la CI ne publie jamais
un fond de carte ou un graphe que l'application ne saurait pas utiliser.

Usage : python3 cartographie/verify_tiles.py [--out cartographie/out] [--stations referentiel/gares-logiques-proposition.csv]
                                             [--maxzoom 12] [--max-size-gib 1.9]
"""
import argparse
import csv
import glob
import json
import math
import os
import struct
import sys

MIN_BASEMAP_BYTES = 200 * 1024 ** 2
MIN_NODES = 30_000
MIN_EDGES = 30_000
MIN_ATTACHED_RATIO = 0.90
ATTACH_RADIUS_M = 500
FONTS = ("Noto Sans Regular", "Noto Sans Medium", "Noto Sans Italic")
SPRITES = ("dark", "dark@2x", "light", "light@2x")


def pmtiles_zooms(path):
    """(zoom minimal, zoom maximal) lus dans l'en-tête PMTiles v3 (127 octets : magie « PMTiles », version, puis zooms aux octets 100 et 101)."""
    with open(path, "rb") as stream:
        header = stream.read(127)
    if len(header) < 127 or header[:7] != b"PMTiles" or header[7] != 3:
        raise ValueError("en-tête PMTiles v3 invalide")
    return struct.unpack_from("BB", header, 100)


def haversine_m(a, b):
    rad = math.pi / 180
    d_lat, d_lon = (b[1] - a[1]) * rad, (b[0] - a[0]) * rad
    h = math.sin(d_lat / 2) ** 2 + math.cos(a[1] * rad) * math.cos(b[1] * rad) * math.sin(d_lon / 2) ** 2
    return 12_742_000 * math.asin(min(1.0, math.sqrt(h)))


def attached_ratio(nodes, stations, radius_m=ATTACH_RADIUS_M):
    """Part des gares (lon, lat) qui ont un nœud du graphe à moins de `radius_m` mètres (index en grille de 0,01°)."""
    cell = 0.01
    grid = {}
    for node in nodes:
        grid.setdefault((int(node[0] / cell), int(node[1] / cell)), []).append(node)
    attached = 0
    for station in stations:
        cx, cy = int(station[0] / cell), int(station[1] / cell)
        near = (n for dx in (-1, 0, 1) for dy in (-1, 0, 1) for n in grid.get((cx + dx, cy + dy), ()))
        if any(haversine_m(station, n) <= radius_m for n in near):
            attached += 1
    return attached / len(stations) if stations else 0.0


def read_stations(path):
    with open(path, encoding="utf-8") as stream:
        return [(float(r["lon"]), float(r["lat"])) for r in csv.DictReader(stream, delimiter=";")]


def check(out, stations_csv, maxzoom, max_size_gib):
    """Liste des problèmes (vide = production saine) et des constats chiffrés."""
    problems, facts = [], []
    basemap = os.path.join(out, "tiles", "france.pmtiles")
    motorways = os.path.join(out, "tiles", "motorways.pmtiles")
    for path, expected_max in ((basemap, maxzoom), (motorways, None)):
        if not os.path.isfile(path):
            problems.append(f"{os.path.relpath(path, out)} absent")
            continue
        try:
            low, high = pmtiles_zooms(path)
        except ValueError as error:
            problems.append(f"{os.path.relpath(path, out)} : {error}")
            continue
        facts.append(f"{os.path.basename(path)} : {os.path.getsize(path) / 1024 ** 2:.0f} Mo, zooms {low}–{high}")
        if expected_max is not None and high != expected_max:
            problems.append(f"france.pmtiles : zoom maximal {high} au lieu de {expected_max}")
    if os.path.isfile(basemap):
        size = os.path.getsize(basemap)
        if size < MIN_BASEMAP_BYTES:
            problems.append(f"france.pmtiles : {size / 1024 ** 2:.0f} Mo, probablement tronqué (minimum {MIN_BASEMAP_BYTES // 1024 ** 2} Mo)")
        if size > max_size_gib * 1024 ** 3:
            problems.append(f"france.pmtiles : {size / 1024 ** 3:.2f} Gio dépasse la limite d'un fichier de release ({max_size_gib} Gio) : baisser le zoom maximal")
    graphs = sorted(glob.glob(os.path.join(out, "graph", "graph-*.json")))
    if not graphs:
        problems.append("graph/graph-*.json absent")
    else:
        with open(graphs[-1], encoding="utf-8") as stream:
            graph = json.load(stream)
        nodes, edges = graph.get("nodes", []), graph.get("edges", [])
        facts.append(f"{os.path.basename(graphs[-1])} : {len(nodes)} nœuds, {len(edges)} arêtes")
        if len(nodes) < MIN_NODES or len(edges) < MIN_EDGES:
            problems.append(f"graphe trop petit ({len(nodes)} nœuds, {len(edges)} arêtes ; minimum {MIN_NODES} / {MIN_EDGES})")
        if stations_csv and os.path.isfile(stations_csv):
            ratio = attached_ratio(nodes, read_stations(stations_csv))
            facts.append(f"gares à moins de {ATTACH_RADIUS_M} m d'un nœud : {ratio:.1%}")
            if ratio < MIN_ATTACHED_RATIO:
                problems.append(f"seulement {ratio:.1%} des gares sont rattachées au graphe (minimum {MIN_ATTACHED_RATIO:.0%}) : extrait OSM incomplet ?")
    assets = os.path.join(out, "basemaps-assets")
    for font in FONTS:
        count = len(glob.glob(os.path.join(assets, "fonts", font, "*.pbf")))
        if count != 256:
            problems.append(f"police « {font} » : {count} plages sur 256")
    for sprite in SPRITES:
        for ext in ("json", "png"):
            if not os.path.isfile(os.path.join(assets, "sprites", "v4", f"{sprite}.{ext}")):
                problems.append(f"sprite {sprite}.{ext} absent")
    return problems, facts


def main(argv):
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="cartographie/out")
    parser.add_argument("--stations", default="referentiel/gares-logiques-proposition.csv")
    parser.add_argument("--maxzoom", type=int, default=12)
    parser.add_argument("--max-size-gib", type=float, default=1.9)
    args = parser.parse_args(argv)
    problems, facts = check(args.out, args.stations, args.maxzoom, args.max_size_gib)
    for fact in facts:
        print(f"  {fact}")
    for problem in problems:
        print(f"ÉCHEC : {problem}", file=sys.stderr)
    print("production cartographique saine" if not problems else f"{len(problems)} problème(s)")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
