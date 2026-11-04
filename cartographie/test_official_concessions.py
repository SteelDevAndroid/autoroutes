"""Checks for spatial concession matching, including mixed-concession autoroutes."""
import json
import tempfile
import unittest
from pathlib import Path

from official_concessions import OfficialConcessions, manager


def feature(code, route, coordinates, conceded="C"):
    return {"type": "Feature", "properties": {"gestionnaire": code, "route": route, "concession": conceded},
            "geometry": {"type": "LineString", "coordinates": coordinates}}


class OfficialConcessionsTests(unittest.TestCase):
    def test_normalization(self):
        self.assertEqual(manager("Autoroutes Paris-Rhin-Rhône"), "APRR")
        self.assertEqual(manager("Société des Autoroutes Paris Normandie"), "SAPN")
        self.assertEqual(manager("inconnu"), "")

    def test_spatial_join_does_not_assign_entire_axis(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "official.geojson"
            path.write_text(json.dumps({"type": "FeatureCollection", "features": [
                feature("ASF", "A0007", [[4.80, 45.70], [4.81, 45.70]]),
                feature("APRR", "A0007", [[4.80, 45.75], [4.81, 45.75]]),
                feature("SANEF", "A0006", [[4.80, 45.70], [4.81, 45.70]]),
                feature("SAPN", "A0007", [[4.80, 45.80], [4.81, 45.80]], "N"),
            ]}), encoding="utf-8")
            official = OfficialConcessions(path)
            self.assertEqual(official.identify({"A7"}, [[4.8001, 45.70], [4.8099, 45.70]]), "ASF")
            self.assertEqual(official.identify({"A7"}, [[4.8001, 45.75], [4.8099, 45.75]]), "APRR")
            self.assertEqual(official.identify({"A7"}, [[4.8001, 45.80], [4.8099, 45.80]]), "")
            self.assertEqual(official.identify({"A8"}, [[4.8001, 45.70], [4.8099, 45.70]]), "")


if __name__ == "__main__":
    unittest.main()
