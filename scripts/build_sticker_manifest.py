#!/usr/bin/env python3
"""Build (or verify) the deterministic sticker manifest.

The 360 PNGs under brands/viking-offroad/stickers/packs are generated art: the human-owned source is
src/packs.js (the copy), and the rendered pixels are the artefact. This script pins the two together
so a re-render can be reviewed byte-for-byte instead of "it still looks fine".

    python3 scripts/build_sticker_manifest.py            # write brands/.../stickers/MANIFEST.json
    python3 scripts/build_sticker_manifest.py --check    # exit 1 if the manifest is stale

Exit codes: 0 ok, 1 stale/missing (--check), 2 unusable input. No network, no dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STICKERS = ROOT / "brands/viking-offroad/stickers"
MANIFEST = STICKERS / "MANIFEST.json"
SOURCE = STICKERS / "src/packs.js"
DUOS = STICKERS / "src/duos.js"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SCHEMA = 1

PACK_RE = re.compile(
    r"\{\s*id:\s*'(?P<id>[^']+)',\s*name:\s*'(?P<name>[^']*)',\s*color:\s*'(?P<color>[^']*)'",
)
ITEM_RE = re.compile(r"^\s{4}\['", re.MULTILINE)


class ManifestError(Exception):
    """Raised when the source of truth and the rendered assets disagree."""


def png_info(path: Path) -> dict:
    data = path.read_bytes()
    if data[:8] != PNG_SIGNATURE:
        raise ManifestError(f"not a PNG: {path.relative_to(ROOT)}")
    length = struct.unpack(">I", data[8:12])[0]
    if length != 13 or data[12:16] != b"IHDR":
        raise ManifestError(f"missing IHDR: {path.relative_to(ROOT)}")
    width, height = struct.unpack(">II", data[16:24])
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "width": width,
        "height": height,
        "colorType": data[25],  # 6 = RGBA (transparent), as required by the contract
    }


def count_duos() -> list[int]:
    """Two-character scenes per pack (src/duos.js). One block per pack, one entry per line."""
    text = DUOS.read_text(encoding="utf-8")
    blocks = re.split(r"\n  \[ // ", text)[1:]
    if len(blocks) != 12:
        raise ManifestError(f"expected 12 duo blocks in src/duos.js, found {len(blocks)}")
    return [len(re.findall(r"^\s{4}\['", b, re.MULTILINE)) for b in blocks]


def read_source() -> list[dict]:
    """Parse the human-owned sticker copy. Layout is fixed by src/stickers.html's expectations.

    A pack is not just packs.js: src/stickers.html composes `pack.items` (single-character captions)
    with DUOS[pack] (two-character scenes), and render.js writes them in that order.
    """
    text = SOURCE.read_text(encoding="utf-8")
    packs = []
    matches = list(PACK_RE.finditer(text))
    if not matches:
        raise ManifestError(f"no pack definitions found in {SOURCE.relative_to(ROOT)}")
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        body = text[match.start():end]
        packs.append(
            {
                "id": match.group("id"),
                "name": match.group("name"),
                "color": match.group("color"),
                "declaredItems": len(ITEM_RE.findall(body)),
            }
        )
    duos = count_duos()
    if len(duos) != len(packs):
        raise ManifestError(f"{len(packs)} packs but {len(duos)} duo blocks")
    for pack, duo_count in zip(packs, duos):
        pack["declaredDuos"] = duo_count
        pack["declaredTotal"] = pack["declaredItems"] + duo_count
    return packs


def build() -> dict:
    packs = []
    for order, source_pack in enumerate(read_source(), start=1):
        folder = STICKERS / "packs" / f"pack-{source_pack['id']}"
        if not folder.is_dir():
            raise ManifestError(f"missing {folder.relative_to(ROOT)}")
        files = sorted(folder.glob("*.png"))
        expected = {f"{n:02d}.png" for n in range(1, 31)}
        found = {f.name for f in files}
        if found != expected:
            raise ManifestError(
                f"{folder.name}: expected 01..30.png, got {sorted(found - expected) or sorted(expected - found)}"
            )
        if len(files) != source_pack["declaredTotal"]:
            raise ManifestError(
                f"{folder.name}: source declares {source_pack['declaredItems']} captions + "
                f"{source_pack['declaredDuos']} duos = {source_pack['declaredTotal']}, "
                f"{len(files)} PNGs on disk"
            )
        preview = STICKERS / "packs" / f"preview-{source_pack['id']}.png"
        if not preview.is_file():
            raise ManifestError(f"missing {preview.relative_to(ROOT)}")
        packs.append(
            {
                "order": order,
                "id": source_pack["id"],
                "name": source_pack["name"],
                "color": source_pack["color"],
                "count": len(files),
                "captions": source_pack["declaredItems"],
                "duos": source_pack["declaredDuos"],
                "preview": {"file": preview.name, **png_info(preview)},
                "files": [{"file": f.name, **png_info(f)} for f in files],
            }
        )

    cover = STICKERS / "cover/viking-cover-sticker.png"
    if not cover.is_file():
        raise ManifestError("missing cover/viking-cover-sticker.png")

    return {
        "schema": SCHEMA,
        "generatedBy": "scripts/build_sticker_manifest.py",
        "source": {
            "copy": "brands/viking-offroad/stickers/src/packs.js",
            "dialogues": "brands/viking-offroad/stickers/src/duos.js",
            "renderer": "brands/viking-offroad/stickers/src/render.js",
        },
        "contract": {"width": 512, "height": 512, "colorType": 6},
        "totals": {
            "packs": len(packs),
            "stickers": sum(p["count"] for p in packs),
            "bytes": sum(f["bytes"] for p in packs for f in p["files"]),
        },
        "cover": {"file": "cover/viking-cover-sticker.png", **png_info(cover)},
        "packs": packs,
    }


def check(manifest: dict) -> list[str]:
    if not MANIFEST.is_file():
        return [f"missing {MANIFEST.relative_to(ROOT)} - run scripts/build_sticker_manifest.py"]
    current = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if current.get("schema") != SCHEMA:
        return [f"manifest schema {current.get('schema')} != {SCHEMA}; regenerate"]
    return [] if current == manifest else ["manifest is stale; run scripts/build_sticker_manifest.py"]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="verify instead of write")
    args = parser.parse_args()
    try:
        manifest = build()
    except (ManifestError, OSError) as error:
        print(f"sticker manifest: FAIL {error}", file=sys.stderr)
        return 2

    if args.check:
        problems = check(manifest)
        if problems:
            for problem in problems:
                print(f"sticker manifest: {problem}", file=sys.stderr)
            return 1
        t = manifest["totals"]
        print(f"sticker manifest: OK - {t['packs']} packs, {t['stickers']} stickers, {t['bytes']:,} bytes")
        return 0

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=1, sort_keys=False) + "\n", encoding="utf-8")
    t = manifest["totals"]
    print(f"wrote {MANIFEST.relative_to(ROOT)} - {t['packs']} packs, {t['stickers']} stickers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
