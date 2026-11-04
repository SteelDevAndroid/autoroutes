"""Spatial attribution of OSM motorway segments from official RRN GeoJSON (EPSG:4326)."""
import json
import math
import re
import unicodedata
from collections import defaultdict
from pathlib import Path
from pyproj import Transformer

MAX_DISTANCE_M = 100
CELL_M = 2000

def clean(value):
    s = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]+", " ", s).strip()

def manager(value):
    s = clean(value)
    aliases = {"AUTOROUTES PARIS RHIN RHONE": "APRR", "AUTOROUTES DU SUD DE LA FRANCE": "ASF",
               "SOCIETE DES AUTOROUTES PARIS NORMANDIE": "SAPN", "SOCIETE DES AUTOROUTES DU NORD": "SANEF",
               "SOCIETE FRANCAISE DU TUNNEL ROUTIER DU FREJUS": "SFTRF", "AUTOROUTES ET TUNNEL DU MONT BLANC": "ATMB",
               "A LIENOR": "ALIENOR"}
    for label, code in aliases.items():
        if label in s:
            return code
    codes = ("COFIROUTE", "ESCOTA", "ATLANDES", "ALIENOR", "ALICORNE", "ADELAC", "ALBEA",
             "APRR", "AREA", "ASF", "SANEF", "SAPN", "ATMB", "SFTRF", "ALIS",
             "ARCOUR", "ARCOS", "ALIAE", "ATOSCA", "AMEDEA")
    return next((c for c in codes if re.search(r"(?<![A-Z0-9])"+c+r"(?![A-Z0-9])", s)), "")

def field(props, *names):
    values = {clean(k).replace(" ", ""): v for k, v in props.items()}
    return next((values[clean(n).replace(" ", "")] for n in names if clean(n).replace(" ", "") in values), None)

def distance(point, line):
    px, py = point
    best = float("inf")
    for (ax, ay), (bx, by) in zip(line, line[1:]):
        dx, dy = bx-ax, by-ay
        t = max(0, min(1, ((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy))) if dx or dy else 0
        best = min(best, math.hypot(px-ax-t*dx, py-ay-t*dy))
    return best

class OfficialConcessions:
    def __init__(self, path):
        from prepare_motorways import normalize_ref
        self.transform = Transformer.from_crs(4326, 2154, always_xy=True)
        self.grid = defaultdict(list)
        features = json.loads(Path(path).read_text(encoding="utf-8"))["features"]
        self.count = 0
        for f in features:
            props = f.get("properties") or {}
            code = manager(field(props, "gestionnaire", "gestionnai", "societe", "operateur"))
            if not code or clean(field(props, "concession", "concede")) in ("N", "NON"):
                continue
            refs = normalize_ref(str(field(props, "route", "axe", "nomroute") or ""))
            geom = f.get("geometry") or {}
            lines = [geom["coordinates"]] if geom.get("type") == "LineString" else geom.get("coordinates", []) if geom.get("type") == "MultiLineString" else []
            for coords in lines:
                if not refs or len(coords) < 2:
                    continue
                projected = [self.transform.transform(p[0], p[1]) for p in coords]
                xs, ys = zip(*projected)
                xmin, xmax = math.floor((min(xs)-MAX_DISTANCE_M)/CELL_M), math.floor((max(xs)+MAX_DISTANCE_M)/CELL_M)
                ymin, ymax = math.floor((min(ys)-MAX_DISTANCE_M)/CELL_M), math.floor((max(ys)+MAX_DISTANCE_M)/CELL_M)
                for x in range(xmin, xmax+1):
                    for y in range(ymin, ymax+1):
                        self.grid[x, y].append((refs, code, projected))
                self.count += 1

    def identify(self, refs, coords):
        if not refs or not coords:
            return ""
        p = self.transform.transform(*coords[len(coords)//2][:2])
        candidates = [(distance(p, line), code) for r, code, line in self.grid.get((math.floor(p[0]/CELL_M), math.floor(p[1]/CELL_M)), ()) if not refs.isdisjoint(r)]
        matches = sorted((d, c) for d, c in candidates if d <= MAX_DISTANCE_M)
        if not matches:
            return ""
        d, c = matches[0]
        return "" if any(other != c and dist <= d+30 for dist, other in matches) else c
