"""Contrôle les images finales sans monter de données cartographiques locales."""

import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time
from urllib.error import URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True, encoding="utf-8").strip()


def sha256(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify(frontend, backend, out):
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    expected = sha256(out / "graph.json")
    actual = docker("run", "--rm", "--network", "none", "--entrypoint", "sha256sum",
                    backend, "/app/bundled-graph/graph.json").split()[0]
    assert actual == expected, "graphe embarqué différent du graphe généré"
    actual_manifest = docker("run", "--rm", "--network", "none", "--entrypoint", "cat",
                             backend, "/app/bundled-graph/manifest.json")
    assert json.loads(actual_manifest) == manifest, "manifeste backend différent"
    env = json.loads(docker("image", "inspect", backend))[0]["Config"]["Env"]
    assert "ASSIGNMENT_GRAPH_FILE=/app/bundled-graph/graph.json" in env

    container = docker("run", "-d", "--read-only", "--tmpfs", "/tmp", "--tmpfs",
                       "/var/cache/nginx", "-p", "127.0.0.1::8080", frontend)
    try:
        port = docker("port", container, "8080/tcp").rsplit(":", 1)[1]
        base = f"http://127.0.0.1:{port}"
        for attempt in range(60):
            try:
                with urlopen(base + "/healthz", timeout=2) as response:
                    assert response.status == 204
                break
            except (URLError, TimeoutError):
                if attempt == 59:
                    raise
                time.sleep(0.5)
        with urlopen(base + "/cartography-manifest.json", timeout=10) as response:
            assert json.load(response) == manifest, "manifeste frontend différent"
        for name in ("france.pmtiles", "motorways.pmtiles"):
            local = out / "tiles" / name
            request = Request(base + "/tiles/" + name, headers={"Range": "bytes=0-126"})
            with urlopen(request, timeout=10) as response, local.open("rb") as stream:
                assert response.status == 206, f"{name} : HTTP Range absent"
                assert response.headers["Content-Range"] == f"bytes 0-126/{local.stat().st_size}"
                assert response.read() == stream.read(127), f"{name} : en-tête différent"
        assets = out / "basemaps-assets"
        paths = list(assets.glob("fonts/*/0-255.pbf")) + list(assets.glob("sprites/v4/*"))
        assert len(paths) >= 11, "polices ou sprites de contrôle absents"
        for path in paths:
            url = base + "/basemaps-assets/" + quote(path.relative_to(assets).as_posix())
            with urlopen(url, timeout=10) as response:
                assert hashlib.sha256(response.read()).hexdigest() == sha256(path), str(path)
        print("Carte embarquée saine : HTTP 206, polices, sprites, manifestes et graphe identiques aux sorties.")
    finally:
        docker("rm", "-f", container)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frontend", required=True)
    parser.add_argument("--backend", required=True)
    parser.add_argument("--out", type=Path, default=Path("cartographie/out"))
    args = parser.parse_args()
    verify(args.frontend, args.backend, args.out)
