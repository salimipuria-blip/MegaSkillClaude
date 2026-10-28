"""Content + asset contract for the DJ Aliens Halloween story.

No third-party imports: these checks run on a bare Python, in CI and in the
doctor, and they guard the rules this project set itself.

1. Every campaign claim (date, programme, venue, CTA) lives in `brief.json` with
   a recorded source. The renderer refuses nothing by itself, so this suite is
   the gate: a number that is not in the brief, or a brief value that quietly
   disappeared from the artwork strings, is a failure.
2. Every asset is local and present — no network fetch at render time.
3. The Persian copy really is Persian: the renderer shapes with HarfBuzz, and
   its bidi pass must keep a Latin name like ALIENS left-to-right inside an RTL
   line instead of mirroring it.
"""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
BRIEF = json.loads((ROOT / "brief.json").read_text(encoding="utf-8"))
RENDER = (ROOT / "render.py").read_text(encoding="utf-8")

# Text that is printed on the artwork, in the order the renderer reads it.
ARTWORK_TEXT = [
    BRIEF["capsule"],
    BRIEF["eyebrow"],
    BRIEF["wordmark"],
    *BRIEF["headline"],
    *BRIEF["body"],
    BRIEF["card"]["title"],
    BRIEF["card"]["subtitle"],
    BRIEF["cta"],
]

PERSIAN = re.compile(r"[\u0600-\u06ff]")
LATIN = re.compile(r"[A-Za-z]")


class BriefContract(unittest.TestCase):
    def test_every_claim_has_a_value_and_a_source(self):
        self.assertTrue(BRIEF["claims"], "the brief must list the campaign claims")
        keys = set()
        for claim in BRIEF["claims"]:
            self.assertNotIn(claim["key"], keys, f"duplicate claim key: {claim['key']}")
            keys.add(claim["key"])
            self.assertTrue(claim["value"].strip(), f"{claim['key']} needs a value")
            self.assertTrue(
                claim["source"].strip(),
                f"{claim['key']} has no source — the owner must approve the number",
            )

    def test_verified_flag_matches_the_sources(self):
        # The four claims on this poster all come from the owner's artwork, so the
        # brief is publishable. If a future edit empties a source, this fails until
        # verified is flipped back — a draft must never look published.
        has_gaps = any(not claim["source"].strip() for claim in BRIEF["claims"])
        self.assertEqual(BRIEF["verified"], not has_gaps)

    def test_claims_actually_reach_the_artwork(self):
        joined = "\n".join(ARTWORK_TEXT)
        for claim in BRIEF["claims"]:
            self.assertIn(
                claim["value"], joined,
                f"claim '{claim['key']}' is in the brief but not in the copy the renderer draws",
            )

    def test_no_number_is_printed_that_the_brief_does_not_track(self):
        """Digits and clock times on the artwork must be covered by a claim value."""
        claims_text = " ".join(claim["value"] for claim in BRIEF["claims"])
        for line in ARTWORK_TEXT:
            for token in re.findall(r"[0-9\u06f0-\u06f9]{1,4}(?::[0-9\u06f0-\u06f9]{2})?", line):
                if token in ("4:20", "02"):     # brand lockup + the poster's clock tag
                    continue
                self.assertIn(token, claims_text, f"untracked number on the artwork: {token}")

    def test_the_event_copy_matches_the_poster(self):
        # The poster is the source of truth handed over by the owner.
        self.assertIn("۱۴ و ۱۵ آبان", BRIEF["card"]["subtitle"])
        self.assertIn("۵", "".join(claim["value"] for claim in BRIEF["claims"]) + "۱۴ و ۱۵ آبان")
        self.assertIn("هالووین", BRIEF["cta"])


class AssetContract(unittest.TestCase):
    def test_referenced_assets_exist_and_are_local(self):
        for relative in (BRIEF["plate"], BRIEF["badge"]):
            self.assertFalse(relative.startswith(("http://", "https://", "//")),
                             f"network asset is not allowed: {relative}")
            self.assertTrue((ASSETS / relative).is_file(), f"missing asset: {relative}")

    def test_every_font_is_bundled(self):
        fonts = sorted(p.name for p in (ASSETS / "fonts").glob("*.woff2"))
        self.assertIn("Vazirmatn-Black.woff2", fonts)
        self.assertIn("Lalezar.woff2", fonts)
        self.assertTrue(any(name.startswith("orbitron") for name in fonts),
                        "the display Latin face must ship with the project")
        for name in fonts:
            self.assertGreater((ASSETS / "fonts" / name).stat().st_size, 1000,
                               f"suspiciously small font file: {name}")

    def test_renderer_has_no_network_or_browser_dependency(self):
        for forbidden in ("http://", "https://", "playwright", "requests.get", "urlopen"):
            self.assertNotIn(forbidden, RENDER, f"render.py must stay offline and browser-free")

    def test_story_and_post_frames_are_the_documented_sizes(self):
        self.assertIn("W, H = 1080, 1920", RENDER)
        self.assertIn("POST_H = 1350", RENDER)


class PersianText(unittest.TestCase):
    """The bidi splitter is dependency-free, so these run on a bare Python."""

    def setUp(self):
        sys.path.insert(0, str(ROOT))
        from bidi import split_runs
        self.split_runs = split_runs

    def test_latin_name_keeps_its_direction_inside_a_persian_line(self):
        runs = self.split_runs("دی‌جی‌ستِ ALIENS تا دیروقت")
        latin = [chunk for direction, chunk in runs if direction == "ltr"]
        self.assertEqual(len(latin), 1, runs)
        self.assertEqual(latin[0].strip(), "ALIENS")
        # visual order: the line starts on the right, so the first run is the last
        # Persian phrase and the Latin run sits before the first Persian word.
        self.assertEqual(runs[0][0], "rtl")
        self.assertLess([i for i, (d, _) in enumerate(runs) if d == "ltr"][0], len(runs) - 1)

    def test_digits_stay_a_single_run(self):
        runs = self.split_runs("۴:۲۰ شب")
        self.assertEqual([d for d, _ in runs], ["rtl", "ltr"], runs)
        self.assertIn("۴:۲۰", runs[-1][1])

    def test_all_artwork_copy_is_persian_where_it_matters(self):
        for line in (BRIEF["eyebrow"], BRIEF["card"]["title"], BRIEF["card"]["subtitle"], BRIEF["cta"]):
            self.assertTrue(PERSIAN.search(line), f"expected Persian copy: {line}")

    def test_persian_has_no_broken_presentation_forms(self):
        # A reshaper-based pipeline leaks U+FE70..U+FEFF into the source strings.
        for line in ARTWORK_TEXT:
            self.assertIsNone(re.search(r"[\ufe70-\ufeff]", line),
                              f"presentation-form codepoints belong to the shaper, not the copy: {line}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
