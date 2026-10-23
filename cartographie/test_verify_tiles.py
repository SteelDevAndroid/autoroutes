import json
import os
import struct
import tempfile
import unittest

import verify_tiles


def pmtiles(path, minzoom, maxzoom, size=200 * 1024 ** 2 + 1):
    header = bytearray(127)
    header[:7] = b"PMTiles"
    header[7] = 3
    struct.pack_into("BB", header, 100, minzoom, maxzoom)
    with open(path, "wb") as stream:
        stream.write(header)
        stream.truncate(size)


def assets(out):
    for font in verify_tiles.FONTS:
        os.makedirs(os.path.join(out, "basemaps-assets", "fonts", font))
        for i in range(256):
            open(os.path.join(out, "basemaps-assets", "fonts", font, f"{i}.pbf"), "w").close()
    os.makedirs(os.path.join(out, "basemaps-assets", "sprites", "v4"))
    for sprite in verify_tiles.SPRITES:
        for ext in ("json", "png"):
            open(os.path.join(out, "basemaps-assets", "sprites", "v4", f"{sprite}.{ext}"), "w").close()


def graph(out, nodes):
    os.makedirs(os.path.join(out, "graph"), exist_ok=True)
    with open(os.path.join(out, "graph", "graph-20261023.json"), "w", encoding="utf-8") as stream:
        json.dump({"nodes": nodes, "edges": [{}] * 40_000}, stream)


class VerifyTilesTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.out = self.dir.name
        os.makedirs(os.path.join(self.out, "tiles"))
        pmtiles(os.path.join(self.out, "tiles", "france.pmtiles"), 0, 12)
        pmtiles(os.path.join(self.out, "tiles", "motorways.pmtiles"), 4, 14, size=1_000)
        assets(self.out)
        self.nodes = [[2.0 + i * 0.001, 48.0] for i in range(40_000)]
        graph(self.out, self.nodes)

    def tearDown(self):
        self.dir.cleanup()

    def test_reads_zooms_from_the_header_and_rejects_other_files(self):
        self.assertEqual(verify_tiles.pmtiles_zooms(os.path.join(self.out, "tiles", "france.pmtiles")), (0, 12))
        bogus = os.path.join(self.out, "bogus")
        with open(bogus, "wb") as stream:
            stream.write(b"<html>403</html>")
        with self.assertRaises(ValueError):
            verify_tiles.pmtiles_zooms(bogus)

    def test_accepts_a_healthy_production(self):
        problems, facts = verify_tiles.check(self.out, None, 12, 1.9)

        self.assertEqual(problems, [])
        self.assertTrue(any("france.pmtiles" in f for f in facts))

    def test_flags_a_missing_truncated_or_wrong_zoom_basemap(self):
        os.remove(os.path.join(self.out, "tiles", "motorways.pmtiles"))
        pmtiles(os.path.join(self.out, "tiles", "france.pmtiles"), 0, 10, size=1_000)

        problems, _ = verify_tiles.check(self.out, None, 12, 1.9)

        self.assertTrue(any("motorways.pmtiles absent" in p for p in problems))
        self.assertTrue(any("zoom maximal 10 au lieu de 12" in p for p in problems))
        self.assertTrue(any("tronqué" in p for p in problems))

    def test_flags_a_basemap_too_big_for_a_release_file(self):
        problems, _ = verify_tiles.check(self.out, None, 12, 0.0001)

        self.assertTrue(any("dépasse la limite" in p for p in problems))

    def test_flags_a_graph_that_is_too_small(self):
        graph(self.out, self.nodes[:10])

        problems, _ = verify_tiles.check(self.out, None, 12, 1.9)

        self.assertTrue(any("graphe trop petit" in p for p in problems))

    def test_checks_that_stations_are_attached_to_the_graph(self):
        near = (2.0005, 48.0001)
        far = (7.0, 44.0)

        self.assertEqual(verify_tiles.attached_ratio(self.nodes, [near]), 1.0)
        self.assertEqual(verify_tiles.attached_ratio(self.nodes, [near, far]), 0.5)
        self.assertEqual(verify_tiles.attached_ratio(self.nodes, []), 0.0)

    def test_flags_missing_fonts_and_sprites(self):
        os.remove(os.path.join(self.out, "basemaps-assets", "sprites", "v4", "dark.png"))
        os.remove(os.path.join(self.out, "basemaps-assets", "fonts", "Noto Sans Italic", "0.pbf"))

        problems, _ = verify_tiles.check(self.out, None, 12, 1.9)

        self.assertIn("sprite dark.png absent", problems)
        self.assertTrue(any("Noto Sans Italic" in p and "255 plages" in p for p in problems))


if __name__ == "__main__":
    unittest.main()
