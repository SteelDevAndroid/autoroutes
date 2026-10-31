"""Reuse a recent, validated main-branch cartography artifact; otherwise rebuild.

Only producer inputs are compared. Frontend styling and the selection helper do
not produce tiles. Every restored dataset still passes verify_tiles.py and the
Docker image/HTTP checks. Pushes, tags and manual runs always refresh the data.
"""
import argparse
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import urlencode

INPUTS = ("cartographie", "referentiel", "echangeurs-rrnc-2025.csv", ".dockerignore")
BBOX = "-5.5,41.2,10.0,51.3"
MAXZOOM = 12
OSM_MODE = "single"
MAX_AGE = timedelta(days=3)


def fingerprint(root, revision):
    entries = subprocess.check_output(
        ["git", "ls-tree", "-r", "-z", "--full-tree", revision, "--", *INPUTS], cwd=root, stderr=subprocess.DEVNULL)
    if not entries:
        raise ValueError("cartography inputs absent")
    return hashlib.sha256(entries).hexdigest()


def github_json(endpoint):
    result = subprocess.run(["gh", "api", endpoint], check=True, capture_output=True, text=True, timeout=45)
    return json.loads(result.stdout)


def positive_id(value):
    return type(value) is int and value > 0


def select_artifact(repo, branch, *, root=Path("."), api=github_json, now=None):
    """Only successful push runs on the repository's default branch are trusted."""
    now = now or datetime.now(timezone.utc)
    current = fingerprint(root, "HEAD")
    query = urlencode({"branch": branch, "event": "push", "status": "success", "per_page": 30})
    runs = api(f"repos/{repo}/actions/workflows/ci.yml/runs?{query}")["workflow_runs"]
    for run in runs:
        if not isinstance(run, dict):
            continue
        sha = run.get("head_sha", "")
        if (run.get("event") != "push" or run.get("head_branch") != branch
                or run.get("status") != "completed" or run.get("conclusion") != "success"
                or run.get("repository", {}).get("full_name") != repo
                or not positive_id(run.get("id")) or not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{40}", sha)):
            continue
        try:
            if fingerprint(root, sha) != current:
                continue
        except (ValueError, subprocess.CalledProcessError):
            continue  # Missing history is a cache miss, never an assumption of compatibility.
        artifacts = api(f"repos/{repo}/actions/runs/{run['id']}/artifacts?per_page=100")["artifacts"]
        for artifact in artifacts:
            if not isinstance(artifact, dict) or not isinstance(artifact.get("created_at"), str):
                continue
            if artifact.get("name") != "carte-images" or artifact.get("expired") is not False or not positive_id(artifact.get("id")):
                continue
            try:
                created = datetime.fromisoformat(artifact["created_at"].replace("Z", "+00:00"))
                age = now - created
            except (KeyError, ValueError, TypeError):
                continue
            if timedelta(0) <= age <= MAX_AGE:
                return {"run-id": str(run["id"]), "artifact-id": str(artifact["id"]), "source-sha": sha}
    return None


def prepare(out, source_sha=None):
    """Restore the dated graph omitted from the shared archive, keeping provenance."""
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    if not isinstance(manifest, dict):
        raise ValueError("artifact manifest must be an object")
    if source_sha is not None and manifest.get("commit") != source_sha:
        raise ValueError("artifact provenance does not match the selected successful run")
    graph = manifest.get("graphe", "")
    build = manifest.get("protomapsBuild", "")
    if (manifest.get("zoomMax") != MAXZOOM or manifest.get("sourceOsm") != OSM_MODE
            or manifest.get("bbox") != BBOX or not isinstance(build, str) or not re.fullmatch(r"\d{8}", build)
            or not isinstance(graph, str) or not re.fullmatch(r"graph-\d{8}\.json", graph)):
        raise ValueError("manifest does not match the CI cartography recipe")
    dated = out / "graph" / graph
    stable = out / "graph.json"
    if not dated.resolve().is_relative_to(out.resolve()) or dated.is_symlink() or stable.is_symlink():
        raise ValueError("graph path outside the artifact")
    if not dated.is_file():
        if not stable.is_file():
            raise ValueError("artifact graph missing")
        dated.parent.mkdir(exist_ok=True)
        shutil.copyfile(stable, dated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare", type=Path)
    parser.add_argument("--source-sha")
    args = parser.parse_args()
    if args.prepare is not None:
        prepare(args.prepare, args.source_sha)
        return
    outputs = {"maxzoom": str(MAXZOOM), "osm-mode": OSM_MODE, "bbox": BBOX}
    if os.environ.get("GITHUB_EVENT_NAME") == "pull_request":
        repo = os.environ["GITHUB_REPOSITORY"]
        branch = os.environ["DEFAULT_BRANCH"]
        try:
            selected = select_artifact(repo, branch)
            if selected:
                outputs.update(selected)
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
            print(f"Cartography reuse unavailable ({type(error).__name__}); full generation required.", file=sys.stderr)
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as stream:
        for key, value in outputs.items():
            stream.write(f"{key}={value}\n")
    print("Compatible main artifact selected." if "artifact-id" in outputs else "Fresh cartography generation required.")


if __name__ == "__main__":
    main()
