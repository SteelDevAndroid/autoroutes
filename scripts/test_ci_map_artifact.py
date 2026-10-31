"""Trust and invalidation checks for CI cartography reuse (no network)."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from datetime import datetime, timezone

from ci_map_artifact import fingerprint, prepare, select_artifact


class ReuseTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.git("init", "-q")
        (self.root / "cartographie").mkdir()
        (self.root / "cartographie/build.sh").write_text("producer v1\n")
        (self.root / "frontend").mkdir()
        (self.root / "frontend/ui.css").write_text("initial UI\n")
        self.commit()
        self.sha = self.git("rev-parse", "HEAD").strip()
        self.now = datetime(2026, 10, 31, 12, tzinfo=timezone.utc)
        self.run = {"id": 90, "head_sha": self.sha, "head_branch": "main", "event": "push",
                    "status": "completed", "conclusion": "success", "repository": {"full_name": "owner/repo"}}
        self.artifact = {"id": 35, "name": "carte-images", "expired": False, "created_at": "2026-10-31T10:00:00Z"}

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True)

    def commit(self):
        self.git("add", ".")
        self.git("-c", "user.name=CI", "-c", "user.email=ci@example.invalid", "commit", "-qm", "fixture")

    def select(self):
        def api(endpoint):
            if "/artifacts" in endpoint:
                return {"artifacts": [self.artifact]}
            return {"workflow_runs": [self.run]}
        return select_artifact("owner/repo", "main", root=self.root, api=api, now=self.now)

    def test_ui_change_reuses_a_successful_default_branch_artifact(self):
        (self.root / "frontend/ui.css").write_text("light map controls\n")
        self.commit()
        self.assertEqual(self.select(), {"run-id": "90", "artifact-id": "35", "source-sha": self.sha})

    def test_producer_change_requires_fresh_generation(self):
        (self.root / "cartographie/build.sh").write_text("producer v2\n")
        self.commit()
        self.assertIsNone(self.select())

    def test_new_producer_dependency_also_invalidates_the_fingerprint(self):
        before = fingerprint(self.root, "HEAD")
        (self.root / "cartographie/new-input.json").write_text("{}")
        self.commit()
        self.assertNotEqual(fingerprint(self.root, "HEAD"), before)

    def test_untrusted_or_unsuccessful_runs_are_never_reused(self):
        for changes in ({"event": "pull_request"}, {"head_branch": "feature"}, {"conclusion": "failure"},
                        {"status": "in_progress"}, {"repository": {"full_name": "fork/repo"}},
                        {"head_sha": "missing-commit"}):
            with self.subTest(changes=changes):
                original = self.run.copy()
                self.run.update(changes)
                self.assertIsNone(self.select())
                self.run = original

    def test_expired_stale_or_wrong_artifacts_require_generation(self):
        for changes in ({"expired": True}, {"name": "other"}, {"created_at": "2026-10-25T10:00:00Z"},
                        {"created_at": "invalid"}, {"id": 0}):
            with self.subTest(changes=changes):
                original = self.artifact.copy()
                self.artifact.update(changes)
                self.assertIsNone(self.select())
                self.artifact = original


class PrepareTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name)
        self.manifest = {"zoomMax": 12, "sourceOsm": "single", "bbox": "-5.5,41.2,10.0,51.3",
                         "protomapsBuild": "20261030", "graphe": "graph-20261030.json",
                         "commit": "a" * 40}
        (self.out / "graph.json").write_text('{"nodes": [], "edges": []}')

    def write_manifest(self):
        (self.out / "manifest.json").write_text(json.dumps(self.manifest))

    def test_restores_the_dated_graph_for_the_existing_strict_validator(self):
        self.write_manifest()
        prepare(self.out)
        self.assertEqual((self.out / "graph/graph-20261030.json").read_bytes(), (self.out / "graph.json").read_bytes())
        self.assertEqual(json.loads((self.out / "manifest.json").read_text()), self.manifest)

    def test_wrong_recipe_and_path_traversal_fail_closed(self):
        for key, value in (("zoomMax", 14), ("sourceOsm", "regions"), ("bbox", "0,0,1,1"),
                           ("graphe", "../outside.json"), ("protomapsBuild", "latest")):
            with self.subTest(key=key):
                original = self.manifest.copy()
                self.manifest[key] = value
                self.write_manifest()
                with self.assertRaises(ValueError):
                    prepare(self.out)
                self.manifest = original

    def test_missing_graph_is_not_a_cache_hit(self):
        self.write_manifest()
        (self.out / "graph.json").unlink()
        with self.assertRaises(ValueError):
            prepare(self.out)

    def test_wrong_producer_commit_is_rejected(self):
        self.write_manifest()
        with self.assertRaises(ValueError):
            prepare(self.out, "b" * 40)
        prepare(self.out, "a" * 40)


if __name__ == "__main__":
    unittest.main()
